// File path: /api.config.controller.js
// SỬA LỖI 500: Thay thế 'pool' bằng 'query' và 'getClient'
const express = require('express');
const { exec } = require('child_process');
// SỬA LỖI 500: Import 'query' và 'getClient' thay vì 'pool'
const { query, getClient } = require('./db'); 
const { activeExecutions, startOrResumeExecution } = require('./execution');
const router = express.Router();

//==============================================================================
// LOGIC CONTROLLER (từ api.setup.controller.js)
//==============================================================================

// --- Logic cho server.controller.js ---
const serverController = {
    getAllServers: async (req, res) => {
        try {
            // SỬA LỖI 500: pool.query -> query
            const result = await query(`
                SELECT s.id, s.hostname, s.ip_address, s.ssh_user, s.technologies as technology,
                       s.application_name, s.connection_status as status, a.id as application_id, s.last_checked_at
                FROM managed_servers s LEFT JOIN applications a ON s.application_name = a.app_name
                ORDER BY s.hostname
            `);
            res.json(result.rows);
        } catch (err) {
            console.error('Error fetching servers:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    createServer: async (req, res) => {
        const { hostname, ip_address, application_name, ssh_user, technologies, ssh_password, skip_key_registration } = req.body;
        
        // Logic đăng ký key (chỉ chạy khi tạo server đơn lẻ và có mật khẩu)
        if (ssh_password && !skip_key_registration) {
            try {
                await new Promise((resolve, reject) => {
                    const escapedPassword = ssh_password.replace(/'/g, "'\\''");
                    const registerKeyCommand = `sshpass -p '${escapedPassword}' ssh-copy-id -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${ssh_user}@${ip_address}`;
                    
                    exec(registerKeyCommand, { timeout: 20000 }, (error, stdout, stderr) => {
                        if (error) {
                            console.error(`ssh-copy-id failed for ${ssh_user}@${ip_address}: ${stderr}`);
                            if (stderr.toLowerCase().includes('permission denied')) return reject(new Error('Sai mật khẩu hoặc xác thực thất bại.'));
                            return reject(new Error(`Không thể đăng ký public key: ${stderr || error.message}`));
                        }
                        console.log(`ssh-copy-id successful for ${ssh_user}@${ip_address}: ${stdout}`);
                        resolve(stdout);
                    });
                });
            } catch (err) {
                return res.status(400).json({ error: err.message });
            }
        }

        // Logic lưu vào DB
        try {
            const queryCmd = `INSERT INTO managed_servers (hostname, ip_address, application_name, ssh_user, technologies, connection_status) VALUES ($1, $2, $3, $4, $5, 'Not Connected') RETURNING *`;
            // SỬA LỖI 500: pool.query -> query
            const result = await query(queryCmd, [hostname, ip_address, application_name, ssh_user, technologies || [],]);
            res.status(201).json(result.rows[0]);
        } catch (err) {
            console.error('Error creating server in DB:', err);
            if (err.code === '23505') return res.status(409).json({ error: 'Hostname hoặc IP đã tồn tại.' });
            res.status(500).json({ error: 'Lỗi nội bộ khi lưu thông tin server.' });
        }
    },
    // (MỚI) Thêm chức năng tạo server hàng loạt
    createBulkServers: async (req, res) => {
        const { servers } = req.body; // servers là một array [{ hostname, ip_address, application_name, ssh_user, technologies }, ...]
        
        if (!servers || !Array.isArray(servers) || servers.length === 0) {
            return res.status(400).json({ error: 'Invalid servers list.' });
        }

        const client = await getClient();
        const createdServers = [];
        try {
            await client.query('BEGIN');

            for (const server of servers) {
                const { hostname, ip_address, application_name, ssh_user, technologies } = server;
                if (!hostname || !ip_address || !ssh_user || !application_name) {
                    // Bỏ qua các dòng không hợp lệ
                    console.warn('Skipping invalid bulk server entry:', server);
                    continue;
                }
                const queryCmd = `INSERT INTO managed_servers (hostname, ip_address, application_name, ssh_user, technologies, connection_status) VALUES ($1, $2, $3, $4, $5, 'Not Connected') RETURNING *`;
                const result = await client.query(queryCmd, [hostname, ip_address, application_name, ssh_user, technologies || []]);
                createdServers.push(result.rows[0]);
            }

            await client.query('COMMIT');
            res.status(201).json(createdServers);

        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Error bulk creating servers:', err);
            if (err.code === '23505') return res.status(409).json({ error: 'Một trong các Hostname hoặc IP đã tồn tại.' });
            res.status(500).json({ error: 'Lỗi nội bộ khi lưu thông tin server.' });
        } finally {
            client.release();
        }
    },
    // (MỚI) Thêm chức năng đăng ký key cho server đã tồn tại
    registerServerKey: async (req, res) => {
        const { id } = req.params;
        const { ssh_password } = req.body;

        if (!ssh_password) {
            return res.status(400).json({ error: 'SSH password is required.' });
        }

        try {
            // Lấy thông tin server từ DB
            const serverRes = await query('SELECT ip_address, ssh_user FROM managed_servers WHERE id = $1', [id]);
            if (serverRes.rows.length === 0) {
                return res.status(404).json({ error: 'Server not found' });
            }
            const { ip_address, ssh_user } = serverRes.rows[0];

            // Chạy logic ssh-copy-id
            await new Promise((resolve, reject) => {
                const escapedPassword = ssh_password.replace(/'/g, "'\\''");
                const registerKeyCommand = `sshpass -p '${escapedPassword}' ssh-copy-id -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${ssh_user}@${ip_address}`;
                
                exec(registerKeyCommand, { timeout: 20000 }, (error, stdout, stderr) => {
                    if (error) {
                        console.error(`ssh-copy-id failed for ${ssh_user}@${ip_address}: ${stderr}`);
                        if (stderr.toLowerCase().includes('permission denied')) return reject(new Error('Sai mật khẩu hoặc xác thực thất bại.'));
                        return reject(new Error(`Không thể đăng ký public key: ${stderr || error.message}`));
                    }
                    console.log(`ssh-copy-id successful for ${ssh_user}@${ip_address}: ${stdout}`);
                    resolve(stdout);
                });
            });

            res.status(200).json({ message: 'SSH key registered successfully.' });

        } catch (err) {
            // Lỗi từ promise (ssh-copy-id)
            res.status(400).json({ error: err.message });
        }
    },
    updateServer: async (req, res) => {
        const { id } = req.params;
        const { hostname, ip_address, application_name, ssh_user, technologies } = req.body;
        try {
            const queryCmd = `UPDATE managed_servers SET hostname = $1, ip_address = $2, application_name = $3, ssh_user = $4, technologies = $5, updated_at = NOW() WHERE id = $6 RETURNING *`;
            // SỬA LỖI 500: pool.query -> query
            const result = await query(queryCmd, [hostname, ip_address, application_name, ssh_user, technologies || [], id]);
            if (result.rows.length > 0) res.json(result.rows[0]);
            else res.status(404).json({ error: 'Server not found' });
        } catch (err) {
            console.error(`Error updating server ${id}:`, err);
             if (err.code === '23505') return res.status(409).json({ error: 'Hostname đã tồn tại.' });
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    deleteServer: async (req, res) => {
        const { id } = req.params;
        try {
            // SỬA LỖI 500: pool.query -> query
            const result = await query('DELETE FROM managed_servers WHERE id = $1', [id]);
            if (result.rowCount > 0) res.status(204).send();
            else res.status(404).json({ error: 'Server not found' });
        } catch (err) {
            console.error(`Error deleting server ${id}:`, err);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    checkServerConnection: async (req, res) => {
        const { id } = req.params;
        try {
            // SỬA LỖI 500: pool.query -> query
            const serverRes = await query('SELECT ip_address, ssh_user FROM managed_servers WHERE id = $1', [id]);
            if (serverRes.rows.length === 0) return res.status(404).json({ error: 'Server not found' });
            
            const { ip_address, ssh_user } = serverRes.rows[0];
            if (!ssh_user || !ip_address) return res.status(400).json({ error: "SSH User and IP Address are required for testing."});

            // SỬA LỖI 500: pool.query -> query
            await query("UPDATE managed_servers SET connection_status = 'Checking' WHERE id = $1", [id]);
            res.status(202).json({ message: 'Connection check initiated' });

            const sshCommand = `ssh -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=10 ${ssh_user}@${ip_address} 'echo "OK"'`;
            exec(sshCommand, { timeout: 15000 }, async (error, stdout, stderr) => {
                let newStatus = 'Not Connected';
                if (error) console.error(`SSH check failed for ${ssh_user}@${ip_address}: ${error.message}`);
                else if (stderr && !stderr.toLowerCase().includes('warning')) console.error(`SSH check failed with stderr for ${ssh_user}@${ip_address}: ${stderr}`);
                else if (stdout && stdout.trim() === "OK") newStatus = 'Connected';
                else console.log(`SSH check had unexpected output for ${ssh_user}@${ip_address}. stdout: ${stdout}, stderr: ${stderr}`);
                
                try {
                    // SỬA LỖI 500: pool.query -> query
                    await query("UPDATE managed_servers SET connection_status = $1, last_checked_at = NOW() WHERE id = $2", [newStatus, id]);
                    console.log(`Test for server ${id} completed with status: ${newStatus}.`);
                } catch (dbError) {
                    console.error(`Database error updating server ${id}:`, dbError);
                }
            });
        } catch (err) {
            console.error(`Error initiating connection test for server ${id}:`, err);
            if (!res.headersSent) {
                // SỬA LỖI 500: pool.query -> query
                try { await query("UPDATE managed_servers SET connection_status = 'Not Connected' WHERE id = $1", [id]); } catch (dbError) {}
                res.status(500).json({ error: 'Internal server error during check initiation.' });
            }
        }
    }
};

// --- Logic cho application.controller.js ---
const appController = {
    getAllApplications: async (req, res) => {
        try {
            // SỬA LỖI 500: pool.query -> query
            const result = await query('SELECT * FROM applications ORDER BY app_name ASC');
            res.json(result.rows);
        } catch (err) {
            console.error('Error fetching applications:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    createApplication: async (req, res) => {
        const { app_code, app_name, description } = req.body;
        try {
            const queryCmd = 'INSERT INTO applications (app_code, app_name, description) VALUES ($1, $2, $3) RETURNING *';
            // SỬA LỖI 500: pool.query -> query
            const result = await query(queryCmd, [app_code, app_name, description]);
            res.status(201).json(result.rows[0]);
        } catch (err) {
            console.error('Error creating application:', err);
            if (err.code === '23505') return res.status(409).json({ error: 'Mã ứng dụng đã tồn tại.' });
            res.status(500).json({ error: 'Could not create application' });
        }
    },
    updateApplication: async (req, res) => {
        const { id } = req.params;
        const { app_code, app_name, description } = req.body;
        try {
            const queryCmd = 'UPDATE applications SET app_code = $1, app_name = $2, description = $3, updated_at = NOW() WHERE id = $4 RETURNING *';
            // SỬA LỖI 500: pool.query -> query
            const result = await query(queryCmd, [app_code, app_name, description, id]);
            if (result.rows.length > 0) res.json(result.rows[0]);
            else res.status(404).json({ error: 'Application not found' });
        } catch (err) {
            console.error('Error updating application:', err);
            if (err.code === '23505') return res.status(409).json({ error: 'Mã ứng dụng đã tồn tại.' });
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    deleteApplication: async (req, res) => {
        const { id } = req.params;
        try {
            // SỬA LỖI 500: pool.query -> query
            const result = await query('DELETE FROM applications WHERE id = $1', [id]);
            if (result.rowCount > 0) res.status(200).json({ message: 'Application deleted successfully' });
            else res.status(404).json({ error: 'Application not found' });
        } catch (err) {
            console.error('Error deleting application:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
};

// --- Logic cho user.controller.js ---
const userController = {
    login: async (req, res) => {
        const { username, password } = req.body;
        try {
            // SỬA LỖI 500: pool.query -> query
            const result = await query("SELECT *, first_name || ' ' || last_name AS fullname FROM users WHERE username = $1 AND password = $2", [username, password]);
            if (result.rows.length > 0) {
                const user = result.rows[0];
                // Xóa mật khẩu khỏi đối tượng user
                delete user.password; 
                
                // Lưu user vào session
                req.session.user = user; 
                console.log(`[Login Success] Session created for user: ${user.username}`);
                
                // Trả về thông tin user (client sẽ dùng nó để set state)
                res.json(user);
            } else {
                res.status(401).json({ error: 'Invalid credentials' });
            }
        } catch (err) {
            console.error('Login error:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    
     getMe: async (req, res) => {
        // Kiểm tra xem session có tồn tại không
        if (req.session && req.session.user) {
            // Nếu có, trả về thông tin user
            res.json(req.session.user);
        } else {
            // Nếu không, trả về 401 (chưa đăng nhập)
            res.status(401).json({ error: 'Not authenticated' });
        }
    },
    logout: async (req, res) => {
        req.session.destroy((err) => {
            if (err) {
                return res.status(500).json({ error: 'Could not log out.' });
            }
            res.clearCookie('connect.sid'); // Tên cookie mặc định của express-session
            res.status(200).json({ message: 'Logged out successfully' });
        });
    },

    // *** PHIÊN BẢN CẬP NHẬT ***
    getSettings: async (req, res) => {
        try {
            // SỬA ĐỔI: Lấy tất cả cài đặt, không chỉ 'sessionTimeout'
            const result = await query("SELECT * FROM app_settings");
            
            // THÊM MỚI: Đặt giá trị mặc định
            const settings = {
                sessionTimeout: 30,
                environment: 'TEST',
                defaultStepTimeout: 120
            };

            // THÊM MỚI: Ghi đè giá trị mặc định bằng giá trị từ CSDL
            for (const row of result.rows) {
                if (row.key === 'sessionTimeout') {
                    settings.sessionTimeout = parseInt(row.value, 10);
                } else if (row.key === 'environment') {
                    settings.environment = row.value;
                } else if (row.key === 'defaultStepTimeout') { // THÊM MỚI
                    settings.defaultStepTimeout = parseInt(row.value, 10);
                }
            }
            
            res.json(settings);
        } catch (err) {
            console.error('Error fetching settings:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    
    // *** PHIÊN BẢN CẬP NHẬT ***
    saveSettings: async (req, res) => {
        // SỬA ĐỔI: Lấy cả sessionTimeout, environment và defaultStepTimeout
        const { sessionTimeout, environment, defaultStepTimeout } = req.body;
        
        // Kiểm tra sessionTimeout
        if (!sessionTimeout || isNaN(parseInt(sessionTimeout, 10)) || parseInt(sessionTimeout, 10) <= 0) {
            return res.status(400).json({ error: 'Session timeout không hợp lệ.' });
        }
        // Kiểm tra environment
        if (!environment || !['TEST', 'PRODUCTION'].includes(environment)) {
            return res.status(400).json({ error: 'Môi trường không hợp lệ.' });
        }
        // THÊM MỚI: Kiểm tra defaultStepTimeout
        if (!defaultStepTimeout || isNaN(parseInt(defaultStepTimeout, 10)) || parseInt(defaultStepTimeout, 10) < 10) {
            return res.status(400).json({ error: 'Timeout mặc định cho bước không hợp lệ.' });
        }
        try {
            // SỬA ĐỔI: Dùng một câu lệnh SQL để cập nhật nhiều khóa
            // Lệnh này sẽ chèn hoặc cập nhật (ON CONFLICT) cả hai giá trị
            const queryCmd = `
                INSERT INTO app_settings (key, value) VALUES
                ('sessionTimeout', $1),
                ('environment', $2),
                ('defaultStepTimeout', $3)
                ON CONFLICT (key) DO UPDATE SET value = excluded.value;
            `;
            
            // SỬA ĐỔI: Truyền cả hai giá trị vào câu lệnh
            await query(queryCmd, [sessionTimeout.toString(), environment, defaultStepTimeout.toString()]);
            
            res.status(200).json({ message: 'Settings saved successfully' });
        } catch (err) {
            console.error('Save settings error:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    
    // SỬA LỖI 404: Thêm hàm getAllUsers
    getAllUsers: async (req, res) => {
        try {
            const queryCmd = "SELECT id, username, role, first_name, last_name, description, first_name || ' ' || last_name AS fullname FROM users ORDER BY first_name, last_name";
            // SỬA LỖI 500: pool.query -> query
            const result = await query(queryCmd);
            res.json(result.rows);
        } catch (err) {
            console.error('Error fetching all users:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    createUser: async (req, res) => {
        const { username, role, first_name, last_name, description, password } = req.body;
        try {
            // SỬA LỖI 500: pool.query -> query
            const newUser = await query(
                'INSERT INTO users (id, username, password, role, first_name, last_name, description) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, username, role, first_name, last_name, description',
                [`user-${Date.now()}`, username, password || 'password', role, first_name, last_name, description]
            );
            res.status(201).json(newUser.rows[0]);
        } catch (err) {
            console.error('Create user error:', err);
            res.status(500).json({ error: 'Could not create user' });
        }
    },
    updateUser: async (req, res) => {
        const { id } = req.params;
        const { username, role, first_name, last_name, description } = req.body;
        try {
            // SỬA LỖI 500: pool.query -> query
            const result = await query(
                'UPDATE users SET username = $1, role = $2, first_name = $3, last_name = $4, description = $5 WHERE id = $6 RETURNING id, username, role, first_name, last_name, description',
                [username, role, first_name, last_name, description, id]
            );
            if (result.rows.length > 0) res.json(result.rows[0]);
            else res.status(404).json({ error: 'User not found' });
        } catch (err) {
            console.error('Update user error:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    adminResetPassword: async (req, res) => {
        const { id } = req.params;
        const { new_password } = req.body;
        if (!new_password) return res.status(400).json({ error: 'New password is required' });
        try {
            // SỬA LỖI 500: pool.query -> query
            await query('UPDATE users SET password = $1 WHERE id = $2', [new_password, id]);
            res.status(200).json({ message: 'Password updated successfully' });
        } catch (err) {
            console.error('Admin password reset error:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    userChangePassword: async (req, res) => {
        const { userId, oldPassword, newPassword } = req.body;
        try {
            // SỬA LỖI 500: pool.query -> query
            const userResult = await query('SELECT password FROM users WHERE id = $1', [userId]);
            if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
            if (userResult.rows[0].password !== oldPassword) return res.status(403).json({ error: 'Incorrect old password' });
            
            // SỬA LỖI 500: pool.query -> query
            await query('UPDATE users SET password = $1 WHERE id = $2', [newPassword, userId]);
            res.status(200).json({ message: 'Password changed successfully' });
        } catch (err) {
            console.error('User change password error:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
};


//==============================================================================
// LOGIC CONTROLLER (từ api.admin.controller.js)
//==============================================================================

// --- Logic cho execution.controller.js ---
const executionController = {
    upsertExecutionStep: async (req, res) => {
        const { drill_id, step_id, status, started_at, completed_at, assignee, result_text } = req.body;
        try {
            const queryCmd = `
                INSERT INTO execution_steps (drill_id, step_id, status, started_at, completed_at, assignee, result_text)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (drill_id, step_id) DO UPDATE SET
                    status = EXCLUDED.status, started_at = COALESCE(execution_steps.started_at, EXCLUDED.started_at),
                    completed_at = EXCLUDED.completed_at, assignee = COALESCE(execution_steps.assignee, EXCLUDED.assignee),
                    result_text = EXCLUDED.result_text
                RETURNING *;`;
            // SỬA LỖI 500: pool.query -> query
            const result = await query(queryCmd, [drill_id, step_id, status, started_at, completed_at, assignee, result_text]);
            res.status(201).json(result.rows[0]);
        } catch (err) {
            console.error('Upsert execution step error:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    upsertExecutionScenario: async (req, res) => {
        const { drill_id, scenario_id, final_status, final_reason } = req.body;
        try {
            const queryCmd = `
                INSERT INTO execution_scenarios (drill_id, scenario_id, final_status, final_reason) VALUES ($1, $2, $3, $4)
                ON CONFLICT (drill_id, scenario_id) DO UPDATE SET final_status = EXCLUDED.final_status, final_reason = EXCLUDED.final_reason
                RETURNING *;`;
            // SỬA LỖI 500: pool.query -> query
            const result = await query(queryCmd, [drill_id, scenario_id, final_status, final_reason]);
            res.status(201).json(result.rows[0]);
        } catch (err) {
            console.error('Upsert execution scenario error:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    upsertExecutionCheckpoint: async (req, res) => {
        const { drill_id, criterion_id, status, checked_by } = req.body;
        try {
            const queryCmd = `
                INSERT INTO execution_checkpoint_criteria (drill_id, criterion_id, status, checked_by, checked_at) VALUES ($1, $2, $3, $4, NOW())
                ON CONFLICT (drill_id, criterion_id) DO UPDATE SET status = EXCLUDED.status, checked_by = EXCLUDED.checked_by, checked_at = NOW()
                RETURNING *;`;
            // SỬA LỖI 500: pool.query -> query
            const result = await query(queryCmd, [drill_id, criterion_id, status, checked_by]);
            res.status(201).json(result.rows[0]);
        } catch (err) {
            console.error('Upsert execution checkpoint error:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    startAutomaticExecution: async (req, res) => {
        const { id: scenarioId } = req.params;
        const { drill_id: drillId } = req.body;
         if (activeExecutions.has(drillId)) {
            const execInfo = activeExecutions.get(drillId);
            if (!execInfo.failed) return res.status(409).json({ message: 'Execution already in progress for this drill.' });
            console.log(`[Execution ${drillId}]: Previous run failed. Resetting and starting fresh.`);
            activeExecutions.delete(drillId);
         }
        try {
            // SỬA LỖI 500: pool.query -> query
            const stepsToReset = await query('SELECT id FROM steps WHERE scenario_id = $1', [scenarioId]);
            const stepIdsToReset = stepsToReset.rows.map(r => r.id);
            if (stepIdsToReset.length > 0) {
                // SỬA LỖI 500: pool.query -> query
                await query(
                    "UPDATE execution_steps SET status = 'Pending', started_at = NULL, completed_at = NULL, result_text = NULL WHERE drill_id = $1 AND step_id = ANY($2::text[])",
                    [drillId, stepIdsToReset]
                );
            }
            res.status(202).json({ message: 'Execution started' });
            startOrResumeExecution(drillId, stepIdsToReset, scenarioId);
        } catch (err) {
            console.error(`Error starting automatic execution for scenario ${scenarioId}:`, err);
            if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
             activeExecutions.delete(drillId);
        }
    },
    rerunSteps: async (req, res) => {
        const { id: scenarioId } = req.params;
        const { drill_id: drillId, steps_to_run: stepsToRun } = req.body;
        if (!stepsToRun || stepsToRun.length === 0) return res.status(400).json({ error: 'No steps provided to rerun.' });
         if (activeExecutions.has(drillId)) {
            const execInfo = activeExecutions.get(drillId);
            if (!execInfo.failed) return res.status(409).json({ message: 'Execution already in progress for this drill. Cannot rerun yet.' });
             console.log(`[Execution ${drillId}]: Previous run failed. Allowing rerun.`);
         }
        try {
             // SỬA LỖI 500: pool.query -> query
             await query(
                 "UPDATE execution_steps SET status = 'Pending', started_at = NULL, completed_at = NULL, result_text = NULL WHERE drill_id = $1 AND step_id = ANY($2::text[])",
                 [drillId, stepsToRun]
             );
            res.status(202).json({ message: 'Rerun execution started' });
            startOrResumeExecution(drillId, stepsToRun, scenarioId);
        } catch (err) {
            console.error(`Error starting rerun for scenario ${scenarioId}:`, err);
            if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
             if (!activeExecutions.has(drillId)) activeExecutions.delete(drillId);
        }
    }
};

// --- Logic cho admin.controller.js ---
const adminController = {
    cleanupHistory: async (req, res) => {
        const { months } = req.body;
        if (![3, 6, 12].includes(parseInt(months))) return res.status(400).json({ error: 'Invalid time period.' });
        
        // SỬA LỖI 500: Dùng getClient()
        const client = await getClient();
        try {
            await client.query('BEGIN');
            const cutoffDate = new Date();
            cutoffDate.setMonth(cutoffDate.getMonth() - parseInt(months));
            const drillsToDeleteQuery = `SELECT id FROM drills WHERE (execution_status = 'Closed' OR execution_status = 'Failed') AND closed_at < $1`;
            const drillsResult = await client.query(drillsToDeleteQuery, [cutoffDate]);
            const drillIdsToDelete = drillsResult.rows.map(r => r.id);
            if (drillIdsToDelete.length > 0) {
                await client.query('DELETE FROM execution_steps WHERE drill_id = ANY($1::text[])', [drillIdsToDelete]);
                await client.query('DELETE FROM execution_scenarios WHERE drill_id = ANY($1::text[])', [drillIdsToDelete]);
                await client.query('DELETE FROM execution_checkpoint_criteria WHERE drill_id = ANY($1::text[])', [drillIdsToDelete]);
            }
            await client.query('COMMIT');
            res.status(200).json({ message: `Successfully cleaned up execution data for ${drillIdsToDelete.length} drills.` });
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Cleanup history error:', err);
            res.status(500).json({ error: 'Internal server error' });
        } finally {
            client.release();
        }
    },
    resetSystem: async (req, res) => {
        // SỬA LỖI 500: Dùng getClient()
        const client = await getClient();
        try {
            await client.query('BEGIN');
            await client.query('TRUNCATE drills, drill_scenarios, drill_scenario_dependencies, execution_steps, execution_scenarios, drill_step_assignments, drill_checkpoints, drill_checkpoint_criteria, execution_checkpoint_criteria RESTART IDENTITY');
            await client.query('COMMIT');
            res.status(200).json({ message: 'System has been reset successfully.' });
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('System reset error:', err);
            res.status(500).json({ error: 'Internal server error' });
        } finally {
            client.release();
        }
    },
    seedDemoData: async (req, res) => {
        // SỬA LỖI 500: Dùng getClient()
        const client = await getClient();
        try {
            await client.query('BEGIN');
            await client.query(`
                INSERT INTO users (id, username, password, role, first_name, last_name, description) VALUES
                ('user-1', 'admin', 'password', 'ADMIN', 'Admin', 'User', 'System Administrator'),
                ('user-2', 'tech_user', 'password', 'TECHNICAL', 'Tech', 'User', 'Database Specialist'),
                ('user-3', 'biz_user', 'password', 'BUSINESS', 'User', 'Communications Lead')
                ON CONFLICT (id) DO UPDATE SET
                    username = EXCLUDED.username, password = EXCLUDED.password, role = EXCLUDED.role,
                    first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, description = EXCLUDED.description;
            `);
            // ... (Phần seed data còn lại được giữ nguyên) ...
            await client.query(`
                INSERT INTO scenarios (id, name, role, created_by, created_at, last_updated_at, status, basis, application_name) VALUES
                ('scen-1', 'Chuyển đổi dự phòng Database', 'TECHNICAL', 'user-2', '2025-08-10T10:00:00Z', '2025-08-11T14:30:00Z', 'Active', 'Kế hoạch DR năm 2025', 'Core Banking'),
                ('scen-2', 'Truyền thông Khách hàng', 'BUSINESS', 'user-3', '2025-08-10T11:00:00Z', '2025-08-10T11:00:00Z', 'Active', 'Kế hoạch DR năm 2025', 'Website'),
                ('scen-3', 'Kiểm tra hiệu năng hệ thống', 'TECHNICAL', 'user-2', '2025-08-11T09:00:00Z', '2025-08-12T11:00:00Z', 'Draft', '', 'Mobile App')
                ON CONFLICT (id) DO NOTHING;
            `);
            await client.query(`
                INSERT INTO steps (id, scenario_id, title, description, estimated_time, step_order) VALUES
                ('step-101', 'scen-1', 'Khởi tạo nâng cấp Read Replica của RDS', 'Promote the standby RDS instance in us-west-2 to become the new primary.', '00:15:00', 1),
                ('step-102', 'scen-1', 'Cập nhật bản ghi DNS', 'Point the primary DB CNAME record to the new primary instance endpoint.', '00:05:00', 2),
                ('step-103', 'scen-1', 'Xác minh kết nối ứng dụng', 'Run health checks on all critical applications to ensure they can connect to the new database.', '00:10:00', 3),
                ('step-201', 'scen-2', 'Soạn thảo cập nhật trạng thái nội bộ', 'Prepare an internal communication for all staff about the ongoing DR drill.', '00:20:00', 1),
                ('step-202', 'scen-2', 'Đăng lên trang trạng thái công khai', 'Update the public status page to inform customers about scheduled maintenance (simulated).', '00:05:00', 2),
                ('step-301', 'scen-3', 'Chạy bài test tải', 'Use JMeter to run a load test against the new primary application servers.', '01:00:00', 1)
                ON CONFLICT (id) DO NOTHING;
            `);
            await client.query(`
                INSERT INTO step_dependencies (step_id, depends_on_step_id) VALUES
                ('step-102', 'step-101'), ('step-103', 'step-102'), ('step-202', 'step-201')
                ON CONFLICT (step_id, depends_on_step_id) DO NOTHING;
            `);
            await client.query(`
                INSERT INTO drills (id, name, description, status, execution_status, basis, start_date, end_date, opened_at, closed_at) VALUES
                ('drill-1', 'Diễn tập chuyển đổi dự phòng AWS Quý 3', 'Mô phỏng chuyển đổi dự phòng toàn bộ khu vực cho các dịch vụ quan trọng.', 'Active', 'InProgress', 'Quyết định số 123/QĐ-NHNN ngày 01/01/2025', '2025-08-16', '2025-08-18', '2025-08-16T10:00:00Z', NULL)
                ON CONFLICT (id) DO NOTHING;
            `);
            await client.query(`
                INSERT INTO drill_scenarios (drill_id, scenario_id, scenario_order) VALUES
                ('drill-1', 'scen-1', 1), ('drill-1', 'scen-2', 2)
                ON CONFLICT (drill_id, scenario_id) DO NOTHING;
            `);
            await client.query(`
                INSERT INTO drill_scenario_dependencies (drill_id, scenario_id, depends_on_scenario_id) VALUES
                ('drill-1', 'scen-2', 'scen-1')
                ON CONFLICT (drill_id, scenario_id, depends_on_scenario_id) DO NOTHING;
            `);
            await client.query(`
                INSERT INTO drill_step_assignments (drill_id, step_id, assignee_id) VALUES
                ('drill-1', 'step-101', 'user-2'), ('drill-1', 'step-102', 'user-2'),
                ('drill-1', 'step-103', 'user-2'), ('drill-1', 'step-201', 'user-3'),
                ('drill-1', 'step-202', 'user-3')
                ON CONFLICT (drill_id, step_id) DO NOTHING;
            `);
            await client.query(`
                INSERT INTO execution_steps (drill_id, step_id, status, started_at, completed_at, assignee) VALUES
                ('drill-1', 'step-101', 'Completed-Success', '2025-08-16T10:00:00Z', '2025-08-16T10:14:00Z', 'user-2'),
                ('drill-1', 'step-102', 'InProgress', '2025-08-16T10:15:00Z', NULL, 'user-2'),
                ('drill-1', 'step-201', 'Completed-Success', '2025-08-16T10:16:00Z', '2025-08-16T10:20:00Z', 'user-3')
                ON CONFLICT (drill_id, step_id) DO UPDATE SET
                    status = EXCLUDED.status, started_at = EXCLUDED.started_at,
                    completed_at = EXCLUDED.completed_at, assignee = EXCLUDED.assignee;
            `);
            await client.query('COMMIT');
            res.status(200).json({ message: 'Demo data seeded successfully.' });
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Seed demo data error:', err);
            res.status(500).json({ error: 'Internal server error' });
        } finally {
            client.release();
        }
    }
};

//==============================================================================
// ĐỊNH NGHĨA ROUTES
//==============================================================================

// --- servers.routes.js ---
router.get('/servers', serverController.getAllServers);
router.post('/servers', serverController.createServer);
router.put('/servers/:id', serverController.updateServer);
router.delete('/servers/:id', serverController.deleteServer);
router.post('/servers/:id/check', serverController.checkServerConnection);
// (MỚI) Thêm routes cho bulk create và register key
router.post('/servers/bulk', serverController.createBulkServers);
router.post('/servers/:id/register-key', serverController.registerServerKey);


// --- applications.routes.js ---
router.get('/applications', appController.getAllApplications);
router.post('/applications', appController.createApplication);
router.put('/applications/:id', appController.updateApplication);
router.delete('/applications/:id', appController.deleteApplication);

// --- users.routes.js ---
router.post('/login', userController.login);
router.get('/settings', userController.getSettings);
router.post('/admin/settings', userController.saveSettings);
router.get('/me', userController.getMe); // Route để kiểm tra session
router.post('/logout', userController.logout); // Route để đăng xuất
// SỬA LỖI 404: Thêm route GET /users
router.get('/users', userController.getAllUsers);
router.post('/users', userController.createUser);
router.put('/users/:id', userController.updateUser);
router.put('/users/:id/password', userController.adminResetPassword);
router.post('/user/change-password', userController.userChangePassword);

// --- execution.routes.js ---
router.post('/execution/step', executionController.upsertExecutionStep);
router.post('/execution/scenario', executionController.upsertExecutionScenario);
router.post('/execution/checkpoint', executionController.upsertExecutionCheckpoint);
router.post('/execution/scenario/:id/start_automatic', executionController.startAutomaticExecution);
router.post('/execution/scenario/:id/rerun', executionController.rerunSteps);

// --- admin.routes.js ---
router.post('/admin/cleanup-history', adminController.cleanupHistory);
router.post('/admin/reset-system', adminController.resetSystem);
router.post('/admin/seed-demo-data', adminController.seedDemoData);

module.exports = router;