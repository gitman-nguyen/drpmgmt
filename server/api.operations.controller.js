// File path: /api.operations.controller.js
// SỬA LỖI 500: Thay thế 'pool' bằng 'query' và 'getClient'
const express = require('express');
// SỬA LỖI 500: Import 'query' và 'getClient' thay vì 'pool'
const { query, getClient } = require('./db');
const { activeTestRuns, runScenarioTest } = require('./testRun');
// --- START: SỬA LỖI API (FIX LỖI 404) ---
// Import `manuallyCompleteStep`, `sendWsMessage`, `updateManualStep`, và `confirmScenarioStatus`
const { 
    startOrResumeExecution, 
    manuallyCompleteStep, 
    sendWsMessage, 
    updateManualStep,
    confirmScenarioStatus,
    evaluateCheckpointCriterion // <-- Đã thêm import cho checkpoint
} = require('./execution');
// --- END: SỬA LỖI API (FIX LỖI 404) ---
const router = express.Router();

//==============================================================================
// LOGIC CONTROLLER (scenario.controller.js)
//==============================================================================
const scenarioController = {
    createScenario: async (req, res) => {
        console.log('\n[DEBUG] createScenario: Received request.');
        console.log('[DEBUG] createScenario: Body:', JSON.stringify(req.body, null, 2));

        // FIX 1: Ánh xạ camelCase (từ React) sang snake_case (cho DB)
        const { name, role, basis, status, created_by, steps, attachment, applicationName: application_name, type } = req.body;
        console.log(`[DEBUG] createScenario: Mapped application_name: ${application_name}`);

        // SỬA LỖI 500: Dùng getClient()
        const client = await getClient();
        try {
            console.log('[DEBUG] createScenario: Starting transaction...');
            await client.query('BEGIN');
            const scenarioId = `scen-${Date.now()}`;
            const scenarioQuery = 'INSERT INTO scenarios (id, name, role, basis, status, created_by, attachment, application_name, type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *';
            
            // FIX 1 (Sử dụng):
            await client.query(scenarioQuery, [scenarioId, name, role, basis, status, created_by, attachment ? JSON.stringify(attachment) : null, application_name, type]);
            console.log(`[DEBUG] createScenario: Inserted scenario ${scenarioId}.`);

            // --- FIX 3: SỬA LOGIC MAP ID ---
            const tempIdToDbId = {};

            if (steps && steps.length > 0) {
                console.log(`[DEBUG] createScenario: Inserting ${steps.length} steps...`);
                // Vòng lặp 1: Tạo ID và điền vào map
                for (const [index, step] of steps.entries()) {
                    const stepId = `step-${Date.now()}-${index}`; // Tạo ID mới cho DB
                    tempIdToDbId[step.id] = stepId; // Map ID tạm (từ frontend) sang ID mới (của DB)
                    step.dbId = stepId; // Gán ID mới vào object step để dùng ở vòng 2
                }

                // Vòng lặp 2: Insert steps
                for (const [index, step] of steps.entries()) {
                    // FIX 2 (MỚI): Xử lý '' (chuỗi rỗng) thành NULL
                    if (type === 'AUTOMATION') {
                        const stepQuery = 'INSERT INTO steps (id, scenario_id, title, step_order, server_id, server_user, command) VALUES ($1, $2, $3, $4, $5, $6, $7)';
                        await client.query(stepQuery, [
                            step.dbId, // Dùng ID mới đã tạo
                            scenarioId, 
                            step.title, 
                            index + 1, 
                            step.server_id || null, // '' -> NULL
                            step.server_user || null, // '' -> NULL
                            step.command
                        ]);
                    } else { // MANUAL
                        const stepQuery = 'INSERT INTO steps (id, scenario_id, title, description, estimated_time, step_order) VALUES ($1, $2, $3, $4, $5, $6)';
                        await client.query(stepQuery, [
                            step.dbId, // Dùng ID mới đã tạo
                            scenarioId, 
                            step.title, 
                            step.description, 
                            step.estimated_time || null, // '' -> NULL
                            index + 1
                        ]);
                    }
                }
                
                console.log('[DEBUG] createScenario: Inserting dependencies...');
                // Vòng lặp 3: Insert dependencies
                for (const step of steps) {
                    if (step.dependsOn && step.dependsOn.length > 0) {
                        for (const depTempId of step.dependsOn) {
                            const depDbId = tempIdToDbId[depTempId]; // Tra cứu ID (tạm) trong map
                            if (depDbId) {
                                console.log(`[DEBUG] createScenario: Inserting dependency: ${step.dbId} -> ${depDbId}`);
                                const depQuery = 'INSERT INTO step_dependencies (step_id, depends_on_step_id) VALUES ($1, $2)';
                                await client.query(depQuery, [step.dbId, depDbId]);
                            } else {
                                console.log(`[DEBUG] createScenario: WARNING - Could not find dependency ID for ${depTempId}`);
                            }
                        }
                    }
                }
            }
            // Sửa lỗi copy-paste:
            console.log('[DEBUG] createScenario: Transaction successful. Committing...');
            await client.query('COMMIT');
            res.status(201).json({ message: 'Scenario created successfully' }); // Thay đổi 200 -> 201 cho create
        } catch (err) {
            // Sửa lỗi copy-paste:
            console.log(`[DEBUG] createScenario: Transaction FAILED. Rolling back.`);
            await client.query('ROLLBACK');
            console.error('Create scenario error:', err); // Log lỗi chi tiết
            res.status(500).json({ error: 'Internal server error' });
        } finally {
            client.release();
        }
    },

    // =========================================================================
    // ==== BEGIN: THÊM PHƯƠNG THỨC updateScenario BỊ THIẾU ====
    // =========================================================================
    updateScenario: async (req, res) => {
        const { id } = req.params;
        console.log(`\n[DEBUG] updateScenario: Received request for id: ${id}.`);
        console.log('[DEBUG] updateScenario: Body:', JSON.stringify(req.body, null, 2));

        const { name, role, basis, status, steps, attachment, applicationName: application_name, type } = req.body;
        console.log(`[DEBUG] updateScenario: Mapped application_name: ${application_name}`);

        const client = await getClient();
        try {
            console.log(`[DEBUG] updateScenario: Starting transaction for id: ${id}...`);
            await client.query('BEGIN');

            // 1. Cập nhật scenario chính
            const scenarioQuery = 'UPDATE scenarios SET name = $1, role = $2, basis = $3, status = $4, attachment = $5, application_name = $6, type = $7, last_updated_at = NOW() WHERE id = $8';
            await client.query(scenarioQuery, [name, role, basis, status, attachment ? JSON.stringify(attachment) : null, application_name, type, id]);
            console.log(`[DEBUG] updateScenario: Updated main scenario ${id}.`);

            // 2. Xóa các steps và dependencies cũ
            // (Lưu ý: Xóa dependencies trước do ràng buộc foreign key)
            console.log(`[DEBUG] updateScenario: Deleting old dependencies for scenario ${id}...`);
            await client.query('DELETE FROM step_dependencies WHERE step_id IN (SELECT id FROM steps WHERE scenario_id = $1)', [id]);
            
            console.log(`[DEBUG] updateScenario: Deleting old steps for scenario ${id}...`);
            await client.query('DELETE FROM steps WHERE scenario_id = $1', [id]);
            
            // 3. Chèn steps và dependencies mới (Logic giống hệt createScenario)
            const tempIdToDbId = {};

            if (steps && steps.length > 0) {
                console.log(`[DEBUG] updateScenario: Inserting ${steps.length} new steps...`);
                // Vòng lặp 1: Tạo ID và điền vào map
                for (const [index, step] of steps.entries()) {
                    const stepId = `step-${Date.now()}-${index}`;
                    tempIdToDbId[step.id] = stepId;
                    step.dbId = stepId;
                }

                // Vòng lặp 2: Insert steps
                for (const [index, step] of steps.entries()) {
                    if (type === 'AUTOMATION') {
                        const stepQuery = 'INSERT INTO steps (id, scenario_id, title, step_order, server_id, server_user, command) VALUES ($1, $2, $3, $4, $5, $6, $7)';
                        await client.query(stepQuery, [
                            step.dbId, id, step.title, index + 1, 
                            step.server_id || null, step.server_user || null, step.command
                        ]);
                    } else { // MANUAL
                        const stepQuery = 'INSERT INTO steps (id, scenario_id, title, description, estimated_time, step_order) VALUES ($1, $2, $3, $4, $5, $6)';
                        await client.query(stepQuery, [
                            step.dbId, id, step.title, step.description, 
                            step.estimated_time || null, index + 1
                        ]);
                    }
                }
                
                console.log('[DEBUG] updateScenario: Inserting new dependencies...');
                // Vòng lặp 3: Insert dependencies
                for (const step of steps) {
                    if (step.dependsOn && step.dependsOn.length > 0) {
                        for (const depTempId of step.dependsOn) {
                            const depDbId = tempIdToDbId[depTempId];
                            if (depDbId) {
                                console.log(`[DEBUG] updateScenario: Inserting dependency: ${step.dbId} -> ${depDbId}`);
                                const depQuery = 'INSERT INTO step_dependencies (step_id, depends_on_step_id) VALUES ($1, $2)';
                                await client.query(depQuery, [step.dbId, depDbId]);
                            } else {
                                console.log(`[DEBUG] updateScenario: WARNING - Could not find dependency ID for ${depTempId}`);
                            }
                        }
                    }
                }
            }
            console.log(`[DEBUG] updateScenario: Transaction successful for id: ${id}. Committing...`);
            await client.query('COMMIT');
            res.status(200).json({ message: 'Scenario updated successfully' });
        } catch (err) {
            console.log(`[DEBUG] updateScenario: Transaction FAILED for id: ${id}. Rolling back.`);
            await client.query('ROLLBACK');
            console.error('Update scenario error:', err);
            res.status(500).json({ error: 'Internal server error' });
        } finally {
            client.release();
        }
    },
    // =========================================================================
    // ==== END: THÊM PHƯƠNG THỨC updateScenario BỊ THIẾU ====
    // =========================================================================

    updateScenarioStatus: async (req, res) => {
        const { id } = req.params;
        const { status } = req.body;
        try {
            // SỬA LỖI 500: pool.query -> query
            const result = await query('UPDATE scenarios SET status = $1, last_updated_at = NOW() WHERE id = $2 RETURNING *', [status, id]);
            if (result.rows.length > 0) res.json(result.rows[0]);
            else res.status(404).json({ error: 'Scenario not found' });
        } catch (err) {
            console.error('Update scenario status error:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    deleteScenario: async (req, res) => {
        const { id } = req.params;

        // SỬA LỖI 500: Dùng getClient()
        const client = await getClient();
        try {
            
            // --- START: SỬA LỖI BẢO MẬT/TOÀN VẸN DỮ LIỆU ---
            // Thêm logic kiểm tra trước khi xóa
            
            // 1. Kiểm tra xem kịch bản có đang được dùng trong BẤT KỲ drill NÀO ĐANG CHẠY ('InProgress') không
            const checkRunningDrillQuery = `
                SELECT 1 
                FROM drills d
                JOIN drill_scenarios ds ON d.id = ds.drill_id
                WHERE ds.scenario_id = $1 AND d.execution_status = 'InProgress'
                LIMIT 1
            `;
            const runningDrillResult = await client.query(checkRunningDrillQuery, [id]);
            
            if (runningDrillResult.rows.length > 0) {
                console.warn(`[Delete Scenario] FAILED: Scenario ${id} is part of a running drill.`);
                // Trả về lỗi 409 Conflict
                return res.status(409).json({ message: 'Không thể xóa kịch bản đang được sử dụng trong một drill đang chạy.' });
            }

            // 2. (Tùy chọn, nhưng nên làm) Kiểm tra xem nó có đang được dùng trong drill nào KHÁC (Scheduled, Closed) không
            // Điều này giúp frontend không cần tự kiểm tra
            const checkAnyDrillQuery = `
                SELECT d.name 
                FROM drills d
                JOIN drill_scenarios ds ON d.id = ds.drill_id
                WHERE ds.scenario_id = $1
                LIMIT 1
            `;
            const anyDrillResult = await client.query(checkAnyDrillQuery, [id]);
            
            if (anyDrillResult.rows.length > 0) {
                 console.warn(`[Delete Scenario] FAILED: Scenario ${id} is part of drill '${anyDrillResult.rows[0].name}'.`);
                 // Trả về lỗi 409 Conflict
                 return res.status(409).json({ message: `Không thể xóa kịch bản. Nó đang được sử dụng trong drill: ${anyDrillResult.rows[0].name}. Vui lòng gỡ kịch bản khỏi drill trước.` });
            }
            
            // --- END: SỬA LỖI BẢO MẬT/TOÀN VẸN DỮ LIỆU ---

            // Nếu vượt qua các kiểm tra, tiến hành xóa
            console.log(`[Delete Scenario] PASSED checks. Starting transaction to delete scenario ${id}.`);
            await client.query('BEGIN');
            
            // (Thứ tự xóa đã chính xác, giữ nguyên)
            await client.query('DELETE FROM drill_scenario_dependencies WHERE scenario_id = $1 OR depends_on_scenario_id = $1', [id]);
            
            const checkpointIdsQuery = 'SELECT id FROM drill_checkpoints WHERE after_scenario_id = $1';
            const checkpointIdsResult = await client.query(checkpointIdsQuery, [id]);
            const checkpointIds = checkpointIdsResult.rows.map(r => r.id);
            
            if(checkpointIds.length > 0) {
                await client.query('DELETE FROM execution_checkpoint_criteria WHERE criterion_id IN (SELECT id FROM drill_checkpoint_criteria WHERE checkpoint_id = ANY($1::text[]))', [checkpointIds]);
                await client.query('DELETE FROM drill_checkpoint_criteria WHERE checkpoint_id = ANY($1::text[])', [checkpointIds]);
                await client.query('DELETE FROM drill_checkpoints WHERE id = ANY($1::text[])', [checkpointIds]);
            }
            
            await client.query('DELETE FROM drill_scenarios WHERE scenario_id = $1', [id]);
            await client.query('DELETE FROM step_dependencies WHERE step_id IN (SELECT id FROM steps WHERE scenario_id = $1)', [id]);
            await client.query('DELETE FROM execution_steps WHERE step_id IN (SELECT id FROM steps WHERE scenario_id = $1)', [id]);
            await client.query('DELETE FROM execution_scenarios WHERE scenario_id = $1', [id]);
            await client.query('DELETE FROM steps WHERE scenario_id = $1', [id]);
            
            // Bảng cuối cùng
            const result = await client.query('DELETE FROM scenarios WHERE id = $1', [id]);
            
            await client.query('COMMIT');
            
            if (result.rowCount > 0) {
                console.log(`[Delete Scenario] SUCCESS: Deleted scenario ${id}.`);
                res.status(200).json({ message: 'Scenario deleted successfully' });
            } else {
                 console.warn(`[Delete Scenario] FAILED: Scenario ${id} not found after passing checks.`);
                res.status(404).json({ error: 'Scenario not found' });
            }
        } catch (err) {
            await client.query('ROLLBACK');
            console.error(`[Delete Scenario] FAILED: Error deleting scenario ${id}:`, err);
            res.status(500).json({ error: 'Internal server error' });
        } finally {
            client.release();
        }
    },
    getScenarioAttachment: async (req, res) => {
        const { id } = req.params;
        try {
            // SỬA LỖI 500: pool.query -> query
            const result = await query('SELECT attachment FROM scenarios WHERE id = $1', [id]);
            if (result.rows.length > 0 && result.rows[0].attachment) res.json(result.rows[0].attachment);
            else res.status(404).json({ error: 'Attachment not found' });
        } catch (err) {
            console.error('Error fetching scenario attachment:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    startScenarioTestRun: async (req, res) => {
        const { id: scenarioId } = req.params;
        if (activeTestRuns.has(scenarioId)) return res.status(409).json({ message: 'Một phiên chạy thử cho kịch bản này đã được thực hiện.' });
        try {
            // SỬA LỖI 500: pool.query -> query
            const scenarioRes = await query('SELECT type FROM scenarios WHERE id = $1', [scenarioId]);
            if (scenarioRes.rows.length === 0) return res.status(404).json({ error: 'Kịch bản không tồn tại.' });
            if (scenarioRes.rows[0].type !== 'AUTOMATION') return res.status(400).json({ error: 'Chỉ có thể chạy thử kịch bản Tự động.' });
            
            activeTestRuns.set(scenarioId, { status: 'running' });
            res.status(202).json({ message: 'Đã chấp nhận yêu cầu chạy thử. Đang kết nối...' });
            runScenarioTest(scenarioId);
        } catch (err) {
            console.error(`[Test Run ${scenarioId}]: Lỗi khi bắt đầu (API):`, err);
            activeTestRuns.delete(scenarioId);
            if (!res.headersSent) res.status(500).json({ error: 'Lỗi máy chủ nội bộ khi chuẩn bị chạy thử.' });
        }
    },

    // --- START: CẬP NHẬT LAZY LOAD ---
    // THAY THẾ getAllScenarios BẰNG getPaginatedScenarios
    getPaginatedScenarios: async (req, res) => {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 25;
        const offset = (page - 1) * limit;

        // Lấy các tham số lọc
        const searchTerm = req.query.search;
        const creatorId = req.query.creator;
        const status = req.query.status;
        const type = req.query.type;
        
        // --- START: SỬA LỖI LỌC USER (FIX BẢO MẬT) ---
        // Kiểm tra xem req.user (từ middleware auth) có tồn tại không
        const user = req.user;

        // NẾU KHÔNG CÓ USER (chưa đăng nhập), trả về lỗi 401 Unauthorized
        if (!user || !user.id) {
            console.warn('[API /scenarios] Unauthorized access detected (req.user not found). Returning 401.');
            // Trả về 401 và một mảng rỗng + pagination rỗng
            return res.status(401).json({ 
                data: [], 
                pagination: { page: 1, limit: 25, totalItems: 0, totalPages: 0 },
                error: 'Unauthorized' // Thêm thông báo lỗi
            });
        }
        
        // Nếu có user, dùng role của user đó
        const userRole = user.role; 
        const userId = user.id;
        // --- END: SỬA LỖI LỌC USER ---

        try {
            let whereClauses = [];
            let queryParams = [];

            // 1. Lọc theo quyền (Chỉ admin thấy hết, user thường chỉ thấy của mình)
            // KÍCH HOẠT LẠI LOGIC LỌC
            // Chỉ lọc theo created_by NẾU user không phải là ADMIN
            if (userRole !== 'ADMIN') {
                queryParams.push(userId);
                whereClauses.push(`s.created_by = $${queryParams.length}`);
            }
            // --- KẾT THÚC KÍCH HOẠT LẠI ---

            // 2. Lọc theo tìm kiếm (tên, ứng dụng)
            if (searchTerm) {
                queryParams.push(`%${searchTerm.toLowerCase()}%`);
                whereClauses.push(`(s.name ILIKE $${queryParams.length} OR s.application_name ILIKE $${queryParams.length})`);
            }

            // 3. Lọc theo người tạo
            if (creatorId) {
                queryParams.push(creatorId);
                whereClauses.push(`s.created_by = $${queryParams.length}`);
            }

            // 4. Lọc theo trạng thái
            if (status) {
                queryParams.push(status);
                whereClauses.push(`s.status = $${queryParams.length}`);
            }

            // 5. Lọc theo loại
            if (type) {
                queryParams.push(type);
                whereClauses.push(`s.type = $${queryParams.length}`);
            }

            const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

            // Tạo câu query
            // LOẠI BỎ JOIN VÀ steps GỐC ĐỂ TĂNG TỐC
            const dataQueryString = `
                SELECT s.* FROM scenarios s
                ${whereString}
                ORDER BY s.last_updated_at DESC
                LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
            `;
            const countQueryString = `SELECT COUNT(*) FROM scenarios s ${whereString}`;

            // Thêm params cho data query
            const dataParams = [...queryParams, limit, offset];
            // Count query chỉ dùng params lọc
            const countParams = queryParams;

            // Thực thi song song
            const [dataRes, countRes] = await Promise.all([
                query(dataQueryString, dataParams),
                query(countQueryString, countParams)
            ]);

            const totalItems = parseInt(countRes.rows[0].count, 10);
            const totalPages = Math.ceil(totalItems / limit);

            res.json({
                data: dataRes.rows,
                pagination: {
                    page,
                    limit,
                    totalItems,
                    totalPages,
                }
            });

        } catch (err) {
            console.error('Error fetching paginated scenarios:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    
    // --- START: BỔ SUNG LẠI HÀM CHO CreateDrillScreen ---
    // Hàm này lấy TẤT CẢ kịch bản, dùng cho màn hình Tạo Drill
    getAllScenarios: async (req, res) => {
        try {
            const scenariosQuery = `
                SELECT s.*, 
                       COALESCE(
                           (SELECT json_agg(st.id ORDER BY st.step_order) 
                            FROM steps st 
                            WHERE st.scenario_id = s.id), 
                           '[]'::json
                       ) as steps
                FROM scenarios s 
                ORDER BY s.last_updated_at DESC
            `;
            const result = await query(scenariosQuery);
            res.json(result.rows); 
        } catch (err) {
            console.error('Error fetching all scenarios:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    // --- END: BỔ SUNG LẠI HÀM ---

    // THAY THẾ getAllSteps BẰNG getStepsForScenario
    getStepsForScenario: async (req, res) => {
        const { id } = req.params;
        try {
            // FIX 4: Sửa câu lệnh SQL để JOIN và tổng hợp (aggregate) các dependencies
             const stepsQuery = `
                SELECT 
                    st.*, 
                    COALESCE(
                        (SELECT json_agg(sd.depends_on_step_id) 
                         FROM step_dependencies sd 
                         WHERE sd.step_id = st.id), 
                        '[]'::json
                    ) as "dependsOn"
                FROM steps st
                WHERE st.scenario_id = $1
                ORDER BY st.step_order ASC
            `;
            const result = await query(stepsQuery, [id]);
            // Trả về mảng các bước cho kịch bản này
            res.json(result.rows);
        } catch (err)
        {
            console.error(`Error fetching steps for scenario ${id}:`, err);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    
    // --- START: BỔ SUNG LẠI HÀM CHO CreateDrillScreen ---
    // Hàm này lấy TẤT CẢ các bước, dùng cho màn hình Tạo Drill
    getAllSteps: async (req, res) => {
        try {
            // SỬA LỖI: Đảm bảo API này cũng trả về "dependsOn"
            // (Câu lệnh này đã đúng, nhưng xác nhận lại)
            const stepsQuery = `
                SELECT 
                    st.*, 
                    COALESCE(
                        (SELECT json_agg(sd.depends_on_step_id) 
                         FROM step_dependencies sd 
                         WHERE sd.step_id = st.id), 
                        '[]'::json
                    ) as "dependsOn"
                FROM steps st
            `;
            const result = await query(stepsQuery);
            res.json(result.rows); 
        } catch (err) {
            console.error('Error fetching all steps:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    // --- END: BỔ SUNG LẠI HÀM ---
    
    // --- END: CẬP NHẬT LAZY LOAD ---
    // === START: HÀM MỚI CHO DRILL LAZY LOAD (PAGINATION) ===
    getPaginatedScenariosForDrill: async (req, res) => {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const offset = (page - 1) * limit;
        const exclude = req.query.exclude || '';

        // Chỉ lấy kịch bản 'Active'
        let whereClauses = ["s.status = 'Active'"];
        let queryParams = [];

        // Thêm logic 'exclude'
        const excludeIds = exclude.split(',').filter(Boolean);
        if (excludeIds.length > 0) {
            queryParams.push(excludeIds);
            // Dùng != ALL($X::text[]) là cách an toàn để truyền một mảng ID cho NOT IN
            whereClauses.push(`s.id != ALL($${queryParams.length}::text[])`);
        }

        const whereString = `WHERE ${whereClauses.join(' AND ')}`;

        try {
            // Query cho trang dữ liệu
            // Chỉ lấy các trường cần thiết cho danh sách
            const dataQuery = `
                SELECT s.id, s.name, s.role, s.type, s.application_name,
                       COALESCE(
                           (SELECT json_agg(st.id ORDER BY st.step_order) 
                            FROM steps st 
                            WHERE st.scenario_id = s.id), 
                           '[]'::json
                       ) as steps
                FROM scenarios s
                ${whereString}
                ORDER BY s.last_updated_at DESC
                LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
            `;
            const dataRes = await query(dataQuery, [...queryParams, limit, offset]);

            // Query để kiểm tra xem có trang tiếp theo không
            const nextQuery = `
                SELECT 1 FROM scenarios s
                ${whereString}
                LIMIT 1 OFFSET $${queryParams.length + 1}
            `;
            // Offset là của trang *tiếp theo* (ví dụ: trang 1, offset 10)
            const nextRes = await query(nextQuery, [...queryParams, limit * page]);

            res.json({
                scenarios: dataRes.rows,
                hasMore: nextRes.rows.length > 0 // Nếu có kết quả (rows.length > 0), nghĩa là còn trang
            });
        } catch (err) {
            console.error('Error fetching paginated scenarios for drill:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    // === END: HÀM MỚI (PAGINATION) ===

    // === START: HÀM MỚI CHO DRILL LAZY LOAD (SEARCH) ===
    searchScenariosForDrill: async (req, res) => {
        const term = req.query.term || '';
        const exclude = req.query.exclude || '';

        if (!term) {
            return res.json([]); // Trả về mảng rỗng nếu không có từ khóa
        }

        // Điều kiện: Active VÀ khớp term
        let whereClauses = [
            "s.status = 'Active'", 
            "(s.name ILIKE $1 OR s.application_name ILIKE $1)"
        ];
        let queryParams = [`%${term.toLowerCase()}%`]; // Tìm kiếm không phân biệt hoa thường

        // Thêm logic 'exclude'
        const excludeIds = exclude.split(',').filter(Boolean);
        if (excludeIds.length > 0) {
            queryParams.push(excludeIds);
            whereClauses.push(`s.id != ALL($${queryParams.length}::text[])`);
        }

        const whereString = `WHERE ${whereClauses.join(' AND ')}`;

        try {
            // Query tất cả kết quả khớp
            const searchQuery = `
                SELECT s.id, s.name, s.role, s.type, s.application_name,
                       COALESCE(
                           (SELECT json_agg(st.id ORDER BY st.step_order) 
                            FROM steps st 
                            WHERE st.scenario_id = s.id), 
                           '[]'::json
                       ) as steps
                FROM scenarios s
                ${whereString}
                ORDER BY s.last_updated_at DESC
            `;
            const searchRes = await query(searchQuery, queryParams);
            
            res.json(searchRes.rows); // Trả về một mảng kết quả
        } catch (err) {
            console.error('Error searching scenarios for drill:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
    // === END: HÀM MỚI (SEARCH) ===
};

//==============================================================================
// LOGIC CONTROLLER (drill.controller.js)
//==============================================================================
const drillController = {
    createDrill: async (req, res) => {
        const { name, description, basis, status, start_date, end_date, scenarios, step_assignments, checkpoints, group_dependencies } = req.body;
        // SỬA LỖI 500: Dùng getClient()
        const client = await getClient();
        try {
            await client.query('BEGIN');
            const drillId = `drill-${Date.now()}`;
            const drillQuery = 'INSERT INTO drills (id, name, description, basis, status, start_date, end_date, execution_status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)';
            await client.query(drillQuery, [drillId, name, description, basis, status, start_date, end_date, 'Scheduled']);

            if (scenarios && scenarios.length > 0) {
                for (const [index, scen] of scenarios.entries()) {
                    await client.query('INSERT INTO drill_scenarios (drill_id, scenario_id, scenario_order, group_name) VALUES ($1, $2, $3, $4)', [drillId, scen.id, index + 1, scen.group]);
                    if (scen.dependsOn && scen.dependsOn.length > 0) {
                        for (const depId of scen.dependsOn) {
                            await client.query('INSERT INTO drill_scenario_dependencies (drill_id, scenario_id, depends_on_scenario_id) VALUES ($1, $2, $3)', [drillId, scen.id, depId]);
                        }
                    }
                }
            }
            if (group_dependencies && group_dependencies.length > 0) {
                for (const dep of group_dependencies) {
                    if(dep.dependsOn && dep.dependsOn.length > 0) {
                        for (const depName of dep.dependsOn) {
                            await client.query('INSERT INTO drill_group_dependencies (drill_id, group_name, depends_on_group_name) VALUES ($1, $2, $3)', [drillId, dep.group, depName]);
                        }
                    }
                }
            }
            if (step_assignments) {
                for (const [stepId, assigneeId] of Object.entries(step_assignments)) {
                    if (assigneeId) await client.query('INSERT INTO drill_step_assignments (drill_id, step_id, assignee_id) VALUES ($1, $2, $3)', [drillId, stepId, assigneeId]);
                }
            }
            if (checkpoints) {
                for (const [scenarioId, cp] of Object.entries(checkpoints)) {
                     if (cp && cp.title) {
                        const checkpointId = `cp-${Date.now()}-${scenarioId}`;
                        await client.query('INSERT INTO drill_checkpoints (id, drill_id, after_scenario_id, title) VALUES ($1, $2, $3, $4)', [checkpointId, drillId, scenarioId, cp.title]);
                        if (cp.criteria && cp.criteria.length > 0) {
                            for (const [index, criterion] of cp.criteria.entries()) {
                                if (criterion.text) {
                                    const criterionId = `crit-${Date.now()}-${index}`;
                                    await client.query('INSERT INTO drill_checkpoint_criteria (id, checkpoint_id, criterion_text, criterion_order) VALUES ($1, $2, $3, $4)', [criterionId, checkpointId, criterion.text, index + 1]);
                                }
                            }
                        }
                    }
                }
            }
            await client.query('COMMIT');
            res.status(201).json({ message: 'Drill created successfully' });
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Create drill error:', err);
            res.status(500).json({ error: 'Internal server error' });
        } finally {
            client.release();
        }
    },
    updateDrill: async (req, res) => {
        const { id } = req.params;
        const { name, description, basis, status, start_date, end_date, scenarios, step_assignments, checkpoints, group_dependencies } = req.body;
        // SỬA LỖI 500: Dùng getClient()
        const client = await getClient();
        try {
            await client.query('BEGIN');
            const drillQuery = 'UPDATE drills SET name = $1, description = $2, basis = $3, status = $4, start_date = $5, end_date = $6 WHERE id = $7';
            await client.query(drillQuery, [name, description, basis, status, start_date, end_date, id]);
            
            await client.query('DELETE FROM drill_group_dependencies WHERE drill_id = $1', [id]);
            await client.query('DELETE FROM drill_scenario_dependencies WHERE drill_id = $1', [id]);
            await client.query('DELETE FROM drill_scenarios WHERE drill_id = $1', [id]);
            await client.query('DELETE FROM drill_step_assignments WHERE drill_id = $1', [id]);
            const oldCheckpointIdsQuery = 'SELECT id FROM drill_checkpoints WHERE drill_id = $1';
            const oldCheckpointIdsResult = await client.query(oldCheckpointIdsQuery, [id]);
            const oldCheckpointIds = oldCheckpointIdsResult.rows.map(r => r.id);
            if(oldCheckpointIds.length > 0) {
                await client.query('DELETE FROM drill_checkpoint_criteria WHERE checkpoint_id = ANY($1::text[])', [oldCheckpointIds]);
                await client.query('DELETE FROM drill_checkpoints WHERE drill_id = $1', [id]);
            }

            if (scenarios && scenarios.length > 0) {
                for (const [index, scen] of scenarios.entries()) {
                    await client.query('INSERT INTO drill_scenarios (drill_id, scenario_id, scenario_order, group_name) VALUES ($1, $2, $3, $4)', [id, scen.id, index + 1, scen.group]);
                    if (scen.dependsOn && scen.dependsOn.length > 0) {
                        for (const depId of scen.dependsOn) {
                            await client.query('INSERT INTO drill_scenario_dependencies (drill_id, scenario_id, depends_on_scenario_id) VALUES ($1, $2, $3)', [id, scen.id, depId]);
                        }
                    }
                }
            }
            if (group_dependencies && group_dependencies.length > 0) {
                for (const dep of group_dependencies) {
                     if(dep.dependsOn && dep.dependsOn.length > 0) {
                        for (const depName of dep.dependsOn) {
                            await client.query('INSERT INTO drill_group_dependencies (drill_id, group_name, depends_on_group_name) VALUES ($1, $2, $3)', [id, dep.group, depName]);
                        }
                    }
                }
            }
            if (step_assignments) {
                for (const [stepId, assigneeId] of Object.entries(step_assignments)) {
                    if (assigneeId) await client.query('INSERT INTO drill_step_assignments (drill_id, step_id, assignee_id) VALUES ($1, $2, $3)', [id, stepId, assigneeId]);
                }
            }
            if (checkpoints) {
                for (const [scenarioId, cp] of Object.entries(checkpoints)) {
                     if (cp && cp.title) {
                        const checkpointId = `cp-${Date.now()}-${scenarioId}`;
                        await client.query('INSERT INTO drill_checkpoints (id, drill_id, after_scenario_id, title) VALUES ($1, $2, $3, $4)', [checkpointId, id, scenarioId, cp.title]);
                        if (cp.criteria && cp.criteria.length > 0) {
                            for (const [index, criterion] of cp.criteria.entries()) {
                                if (criterion.text) {
                                    const criterionId = `crit-${Date.now()}-${index}`;
                                    await client.query('INSERT INTO drill_checkpoint_criteria (id, checkpoint_id, criterion_text, criterion_order) VALUES ($1, $2, $3, $4)', [criterionId, checkpointId, criterion.text, index + 1]);
                                }
                            }
                        }
                    }
                }
            }
            await client.query('COMMIT');
            res.status(200).json({ message: 'Drill updated successfully' });
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Update drill error:', err);
            res.status(500).json({ error: 'Internal server error' });
        } finally {
            client.release();
        }
    },
    updateDrillExecutionStatus: async (req, res) => {
        const { id } = req.params;
        const { execution_status, timestamp, reason } = req.body;
        let queryCmd;
        if (execution_status === 'InProgress') {
            queryCmd = { text: 'UPDATE drills SET execution_status = $1, opened_at = $2 WHERE id = $3 RETURNING *', values: [execution_status, timestamp, id] };
        } 
        else if (execution_status === 'Closed' || execution_status === 'Failed') {
            // Trả về lỗi 400 Bad Request nếu cố gắng đóng drill qua API không an toàn này
            console.warn(`[API] Thao tác bị chặn: /api/ops/drills/:id/status không được phép dùng cho trạng thái 'Closed'/'Failed'. Dùng /api/ops/drills/:id/close.`);
            return res.status(400).json({ error: 'Invalid operation. Use POST /api/ops/drills/:id/close to close or fail a drill.' });
        }
        else {
            return res.status(400).json({ error: 'Invalid status' });
        }
        
        try {
            // SỬA LỖI 500: pool.query -> query
            const result = await query(queryCmd);
            if (result.rows.length > 0) res.json(result.rows[0]);
            else res.status(404).json({ error: 'Drill not found' });
        } catch (err) {
            console.error('Update drill status error:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    // --- LOGIC MỚI: API ĐÓNG DRILL AN TOÀN (ĐÃ DI CHUYỂN TỪ DATA CONTROLLER) ---
    closeDrill: async (req, res) => {
        const { id } = req.params;
        // API an toàn cũng cần nhận lý do thất bại (nếu có)
        const { reason } = req.body;

        try {
            // 1. Lấy thông tin scenarios, steps, execution
            const drillScenariosQuery = query('SELECT scenario_id FROM drill_scenarios WHERE drill_id = $1', [id]);
            const scenariosQuery = query('SELECT s.id, s.name, COALESCE((SELECT json_agg(st.id) FROM steps st WHERE st.scenario_id = s.id), \'[]\'::json) as steps FROM scenarios s WHERE s.id IN (SELECT scenario_id FROM drill_scenarios WHERE drill_id = $1)', [id]);
            const executionStepsQuery = query('SELECT step_id, status FROM execution_steps WHERE drill_id = $1', [id]);
            const executionScenariosQuery = query('SELECT scenario_id, final_status FROM execution_scenarios WHERE drill_id = $1', [id]);

            const [drillScenariosRes, scenariosRes, execStepsRes, execScenariosRes] = await Promise.all([
                drillScenariosQuery, scenariosQuery, executionStepsQuery, executionScenariosQuery
            ]);

            const drillScenarios = drillScenariosRes.rows.map(r => r.scenario_id);
            const scenarios = scenariosRes.rows.reduce((acc, s) => { acc[s.id] = s; return acc; }, {});
            const execSteps = execStepsRes.rows.reduce((acc, s) => { acc[s.step_id] = s; return acc; }, {});
            const execScenarios = execScenariosRes.rows.reduce((acc, s) => { acc[s.scenario_id] = s; return acc; }, {});

            // 2. Thực hiện validation
            const incompleteScenarios = [];
            for (const scenId of drillScenarios) {
                const scenarioInfo = scenarios[scenId];
                if (!scenarioInfo) {
                    incompleteScenarios.push(`Unknown scenario ID: ${scenId}`);
                    continue;
                }

                const scenarioSteps = (scenarioInfo.steps || []).map(stepId => execSteps[stepId] || { status: 'Pending' });
                const allStepsDone = scenarioSteps.every(s => s.status && s.status.startsWith('Completed'));
                const hasFailedStep = scenarioSteps.some(s => s.status === 'Completed-Failure' || s.status === 'Completed-Blocked');
                const scenarioFinalStatus = execScenarios[scenId]?.final_status;

                if (!allStepsDone || (hasFailedStep && !scenarioFinalStatus)) {
                    incompleteScenarios.push(scenarioInfo.name);
                }
            }

            // 3. Trả về lỗi nếu chưa hoàn thành
            if (incompleteScenarios.length > 0) {
                const errorMessage = `Không thể đóng: Các kịch bản sau chưa hoàn thành hoặc chưa được xác nhận kết quả: ${incompleteScenarios.join(', ')}`;
                return res.status(400).json({ error: errorMessage });
            }

            // 4. NÂNG CẤP LOGIC: Tự động xác định trạng thái 'Closed' hay 'Failed'
            // Kiểm tra xem có bất kỳ bước nào thất bại không
            const allExecSteps = execStepsRes.rows;
            const hasAnyFailedStepOrBlocked = allExecSteps.some(s => s.status === 'Completed-Failure' || s.status === 'Completed-Blocked');
            
            // Tự động quyết định trạng thái cuối cùng
            const finalStatus = hasAnyFailedStepOrBlocked ? 'Failed' : 'Closed';
            
            const finalReason = finalStatus === 'Failed' 
                ? (reason || 'Drill failed due to one or more failed steps.') 
                : null; // Chỉ lưu lý do nếu thất bại

            // 5. Cập nhật trạng thái
            const body = { 
                execution_status: finalStatus, 
                timestamp: new Date().toISOString() 
            };
            const updateQuery = 'UPDATE drills SET execution_status = $1, closed_at = $2, failure_reason = $3 WHERE id = $4 RETURNING *';
            const updateRes = await query(updateQuery, [body.execution_status, body.timestamp, finalReason, id]);
            
            res.json(updateRes.rows[0]);

        } catch (err) {
            console.error(`Error closing drill ${id}:`, err);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
};

//==============================================================================
// ĐỊNH NGHĨA ROUTES
//==============================================================================

// --- scenarios.routes.js ---
router.post('/scenarios', scenarioController.createScenario);
router.put('/scenarios/:id', scenarioController.updateScenario); // <-- Dòng này giờ đã hợp lệ
router.delete('/scenarios/:id', scenarioController.deleteScenario);
router.put('/scenarios/:id/status', scenarioController.updateScenarioStatus);
router.get('/scenarios/:id/attachment', scenarioController.getScenarioAttachment);
router.post('/scenarios/:id/test_run', scenarioController.startScenarioTestRun);

// --- START: CẬP NHẬT LAZY LOAD ROUTES ---
// API danh sách kịch bản (đã phân trang)
router.get('/scenarios', scenarioController.getPaginatedScenarios);

// --- START: BỔ SUNG LẠI ROUTES CHO CreateDrillScreen ---
// API lấy TẤT CẢ kịch bản (cho CreateDrillScreen)
router.get('/scenarios/all', scenarioController.getAllScenarios);
// API Phân trang cho màn hình CreateDrill
router.get('/scenarios/paginated', scenarioController.getPaginatedScenariosForDrill);
// API Tìm kiếm cho màn hình CreateDrill
router.get('/scenarios/search', scenarioController.searchScenariosForDrill);
// API lấy TẤT CẢ các bước (cho CreateDrillScreen)
router.get('/steps', scenarioController.getAllSteps);
// --- END: BỔ SUNG LẠI ROUTES ---

// API lấy chi tiết các bước
router.get('/scenarios/:id/steps', scenarioController.getStepsForScenario);
// XÓA BỎ /steps (vì đã có /scenarios/:id/steps)
// router.get('/steps', scenarioController.getAllSteps);
// --- END: CẬP NHẬT LAZY LOAD ROUTES ---


// --- drills.routes.js ---
router.post('/drills', drillController.createDrill);
router.put('/drills/:id', drillController.updateDrill);
router.put('/drills/:id/status', drillController.updateDrillExecutionStatus);
router.post('/drills/:id/close', drillController.closeDrill);
router.post('/execution/scenario/:id/start_automatic', async (req, res) => {
    const { id: scenarioId } = req.params;
    const { drill_id } = req.body;
    
    try {
        // "start_automatic" có nghĩa là chạy TẤT CẢ các bước
        const stepsRes = await query('SELECT id FROM steps WHERE scenario_id = $1', [scenarioId]);
        const allStepIds = stepsRes.rows.map(s => s.id);

        if (allStepIds.length === 0) {
             return res.status(404).json({ message: 'Không tìm thấy bước nào cho kịch bản này.' });
        }

        // Gọi logic nghiệp vụ từ execution.js
        startOrResumeExecution(drill_id, allStepIds, scenarioId);
        
        res.status(202).json({ message: 'Đã chấp nhận yêu cầu bắt đầu thực thi.' });
    } catch (err) {
        console.error(`[API /start_automatic]: Lỗi khi bắt đầu thực thi cho scenario ${scenarioId}:`, err);
        res.status(500).json({ error: 'Lỗi máy chủ nội bộ khi bắt đầu thực thi.' });
    }
});

router.post('/execution/scenario/:id/rerun', async (req, res) => {
    const { id: scenarioId } = req.params;
    // Lấy cả drill_id VÀ danh sách steps_to_run từ body
    const { drill_id, steps_to_run } = req.body; 

    if (!drill_id || !steps_to_run || !Array.isArray(steps_to_run) || steps_to_run.length === 0) {
        return res.status(400).json({ message: 'Yêu cầu không hợp lệ. Cần có drill_id và mảng steps_to_run.' });
    }
    
    try {
        // Gọi logic nghiệp vụ từ execution.js
        startOrResumeExecution(drill_id, steps_to_run, scenarioId);
        
        res.status(202).json({ message: 'Đã chấp nhận yêu cầu chạy lại.' });
    } catch (err) {
        console.error(`[API /rerun]: Lỗi khi chạy lại cho scenario ${scenarioId}:`, err);
        res.status(500).json({ error: 'Lỗi máy chủ nội bộ khi chạy lại.' });
    }
});

// --- START: SỬA LỖI API (FIX LỖI 404 - execution/step) ---
// Route này (POST /api/ops/execution/step) giờ sẽ gọi logic từ execution.js
router.post('/execution/step', async (req, res) => {
    try {
        // Toàn bộ logic nghiệp vụ đã được chuyển sang execution.js
        const updatedStep = await updateManualStep(req.body);
        
        // Controller chỉ trả về kết quả
        res.status(200).json(updatedStep);

    } catch (err) {
        console.error(`[API /execution/step]: Lỗi khi cập nhật bước:`, err);
        // Trả về lỗi 400 nếu là lỗi xác thực (như thiếu ID)
        if (err.message.includes('Yêu cầu thiếu')) {
             return res.status(400).json({ message: err.message });
        }
        // Trả về 500 cho các lỗi khác
        res.status(500).json({ error: 'Lỗi máy chủ nội bộ khi cập nhật bước.' });
    }
});
// --- END: SỬA LỖI API (FIX LỖI 404 - execution/step) ---


// --- START: THÊM TÍNH NĂNG GHI ĐÈ BƯỚC ---
router.post('/execution/step/override', async (req, res) => {
    // user_id sẽ được lấy từ session/auth trong tương lai, hiện tại có thể hardcode hoặc bỏ qua
    const { drill_id, step_id, new_status, reason, user_name } = req.body; 

    if (!drill_id || !step_id || !new_status) {
        return res.status(400).json({ message: 'Yêu cầu thiếu drill_id, step_id, hoặc new_status.' });
    }

    // Chỉ cho phép các trạng thái "Completed"
    if (new_status !== 'Completed-Success' && new_status !== 'Completed-Skipped' && new_status !== 'Completed-Failure') {
         return res.status(400).json({ message: 'Trạng thái không hợp lệ. Phải là Completed-Success, Completed-Skipped, hoặc Completed-Failure.' });
    }
    
    try {
        const finalReason = `[GHI ĐÈ BẰNG TAY bởi ${user_name || 'Admin'}]: ${reason || 'Không có lý do.'}`;
        // Gọi logic nghiệp vụ mới từ execution.js
        const updatedStep = await manuallyCompleteStep(drill_id, step_id, new_status, finalReason);
        
        res.status(200).json(updatedStep);
    } catch (err) {
        console.error(`[API /step/override]: Lỗi khi ghi đè bước ${step_id}:`, err);
        res.status(500).json({ error: 'Lỗi máy chủ nội bộ khi ghi đè bước.' });
    }
});
// --- END: THÊM TÍNH NĂNG GHI ĐÈ BƯỚC ---

// --- START: SỬA LỖI API (FIX LỖI 404 - execution/scenario) ---
router.post('/execution/scenario', async (req, res) => {
    try {
        // Logic đã được chuyển sang execution.js
        const updatedScenarioExec = await confirmScenarioStatus(req.body);
        res.status(200).json(updatedScenarioExec);
    } catch (err) {
        console.error(`[API /execution/scenario]: Lỗi khi xác nhận kịch bản:`, err);
        if (err.message.includes('Yêu cầu thiếu')) {
             return res.status(400).json({ message: err.message });
        }
        res.status(500).json({ error: 'Lỗi máy chủ nội bộ khi xác nhận kịch bản.' });
    }
});
// --- END: SỬA LỖI API (FIX LỖI 404 - execution/scenario) ---

// --- START: THÊM ROUTE CHO CHECKPOINT (ĐÃ SỬA LỖI) ---
router.post('/execution/checkpoint', async (req, res) => {
    try {
        // Gọi hàm `evaluateCheckpointCriterion` đã được import trực tiếp
        const updatedCriterion = await evaluateCheckpointCriterion(req.body);
        
        // Trả về dữ liệu đã cập nhật cho client
        res.status(200).json(updatedCriterion);
    } catch (error) {
        console.error(`[API /execution/checkpoint] Error: ${error.message}`);
        // Trả về 400 nếu lỗi do thiếu dữ liệu
        if (error.message.includes('Yêu cầu thiếu')) {
             return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: error.message || 'Internal Server Error' });
    }
});
// --- END: THÊM ROUTE CHO CHECKPOINT (ĐÃ SỬA LỖI) ---

module.exports = router;