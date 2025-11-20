// File path: /api.data.controller.js
// SỬA LỖI 500: Thay thế 'pool' bằng 'query'
const express = require('express');
// SỬA LỖI 500: Import 'query' thay vì 'pool'
const { query } = require('./db');
const { authMiddleware } = require('./authMiddleware');
const router = express.Router();


//==============================================================================
// LOGIC CONTROLLER (data.controller.js)
//==============================================================================

const dataController = {

    // --- CÁC ENDPOINT MỚI CHO fetchCoreData ---
    // ĐÃ XÓA getSettings, getUsers, getApplications vì đã có trong api.config.controller.js

    /* // --- ENDPOINT CŨ (GÂY HIỆU NĂNG KÉM - ĐÃ BỊ VÔ HIỆU HÓA) ---
    getInitialData: async (req, res) => {
        // ... (đã xóa) ...
    },
    */
    
    // --- ENDPOINT MỚI: LẤY DANH SÁCH DRILLS (CÓ PHÂN TRANG) ---
    getDrillsList: async (req, res) => {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 15;
        const offset = (page - 1) * limit;
        const status = req.query.status; // ví dụ: 'InProgress', 'Completed'

        try {
            let countQuery = 'SELECT COUNT(*) FROM drills';
            let dataQuery = 'SELECT * FROM drills';
            
            const queryParams = [];
            let whereClause = '';

            if (status) {
                whereClause = ' WHERE execution_status = $1';
                queryParams.push(status);
            }

            countQuery += whereClause;
            dataQuery += whereClause;

            // Thêm sắp xếp và phân trang
            dataQuery += ' ORDER BY start_date DESC LIMIT $' + (queryParams.length + 1) + ' OFFSET $' + (queryParams.length + 2);
            queryParams.push(limit, offset);

            // Thực thi song song
            const [countRes, dataRes] = await Promise.all([
                // SỬA LỖI 500: pool.query -> query (DÒNG 52)
                query(countQuery, queryParams.slice(0, status ? 1 : 0)), // Chỉ lấy param status
                query(dataQuery, queryParams)
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
            console.error('Error fetching paginated drills:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    
    // --- ENDPOINT MỚI: LẤY CHI TIẾT CỦA 1 DRILL ---
    getDrillDetails: async (req, res) => {
        const { id } = req.params;
        if (!id) return res.status(400).json({ error: 'Drill ID is required' });

        try {
            // 1. Lấy thông tin Drill cơ bản
            const drillQuery = query('SELECT * FROM drills WHERE id = $1', [id]);
            
            // 2. Lấy Scenarios và các Steps lồng bên trong
            // *** SỬA LỖI (Blank Screen): Xóa s.status vì cột này không tồn tại ***
            // *** SỬA LỖI (Hiển thị kịch bản): Thêm 's.id' vào SELECT list để JS có thể truy cập `scen.id` ***
            // Hoặc là sửa JS để dùng 'scen.scenario_id'
            const scenariosQuery = query(`
                SELECT 
                    ds.scenario_id, ds.group_name, ds.scenario_order,
                    s.id, s.name, s.role, s.basis, s.application_name, s.type,
                    COALESCE(
                        (SELECT json_agg(steps.* ORDER BY steps.step_order) 
                         FROM steps 
                         WHERE steps.scenario_id = s.id), 
                        '[]'::json
                    ) as steps
                FROM drill_scenarios ds
                JOIN scenarios s ON s.id = ds.scenario_id
                WHERE ds.drill_id = $1
                ORDER BY ds.scenario_order;
            `, [id]);
            
            // 3. Lấy thông tin Users (có thể cache)
            const usersQuery = query("SELECT id, username, role, first_name, last_name, first_name || ' ' || last_name AS fullname FROM users");

            // 4. Lấy dữ liệu thực thi (Execution data) cho drill này
            // *** SỬA LỖI (result_text): Thêm "null as result_text" cho execution_scenarios ***
            const executionQuery = query(`
                (SELECT 'step' as type, step_id as id, status, started_at, completed_at, assignee, result_text, 
                 null as final_status 
                 FROM execution_steps WHERE drill_id = $1)
                UNION ALL
                (SELECT 'scenario' as type, scenario_id as id, final_status as status, 
                 null as started_at, null as completed_at, null as assignee, null as result_text, 
                 final_status 
                 FROM execution_scenarios WHERE drill_id = $1)
                UNION ALL
                (SELECT 'criterion' as type, criterion_id as id, status, 
                 null as started_at, checked_at as completed_at, checked_by as assignee, null as result_text,
                 null as final_status
                 FROM execution_checkpoint_criteria WHERE drill_id = $1)
            `, [id]);
            
            // 5. Lấy các thông tin phụ khác
            const assignmentsQuery = query('SELECT step_id, assignee_id FROM drill_step_assignments WHERE drill_id = $1', [id]);
            // === SỬA LỖI: Lấy criteria từ bảng gốc, không phải bảng thực thi ===
            const checkpointsQuery = query(`
                SELECT 
                    dc.id, dc.title, dc.after_scenario_id,
                    COALESCE(
                        (SELECT json_agg(dcc.* ORDER BY dcc.criterion_order) 
                         FROM drill_checkpoint_criteria dcc 
                         WHERE dcc.checkpoint_id = dc.id), 
                        '[]'::json
                    ) as criteria
                FROM drill_checkpoints dc 
                WHERE dc.drill_id = $1;
            `, [id]);
            
            // *** SỬA LỖI (Blank Screen): Thêm query lấy dependencies ***
            const drillDepsQuery = query('SELECT scenario_id, depends_on_scenario_id FROM drill_scenario_dependencies WHERE drill_id = $1', [id]);
            
            // --- SỬA LỖI: THÊM QUERY LẤY GROUP DEPENDENCIES ---
            const groupDepsQuery = query('SELECT group_name, depends_on_group_name FROM drill_group_dependencies WHERE drill_id = $1', [id]);
            // --- KẾT THÚC SỬA LỖI ---


            // Chờ tất cả thực thi
            const [
                drillRes, scenariosRes, usersRes, executionRes, assignmentsRes, checkpointsRes, drillDepsRes,
                groupDepsRes // --- SỬA LỖI: Thêm biến mới ---
            ] = await Promise.all([
                drillQuery, scenariosQuery, usersQuery, executionQuery, assignmentsQuery, checkpointsQuery, drillDepsQuery,
                groupDepsQuery // --- SỬA LỖI: Thêm query mới vào Promise ---
            ]);

            if (drillRes.rows.length === 0) {
                return res.status(404).json({ error: 'Drill not found' });
            }

            // 6. Tổng hợp dữ liệu
            const drill = drillRes.rows[0];
            const users = usersRes.rows;
            
            const scenarios = {};
            const steps = {};
            scenariosRes.rows.forEach(scen => {
                const stepIds = [];
                if (scen.steps && scen.steps.length > 0) {
                    scen.steps.forEach(step => {
                        steps[step.id] = step;
                        stepIds.push(step.id);
                    });
                }
                
                // *** SỬA LỖI KHÔNG HIỂN THỊ KỊCH BẢN ***
                // Lỗi gốc: Code dùng `scen.id` nhưng query trả về `scen.scenario_id`.
                // Cả hai đều trỏ đến cùng một ID, nhưng tên thuộc tính phải chính xác.
                // Chúng ta sẽ dùng `scen.scenario_id` để đảm bảo map được xây dựng đúng.
                // scenarios[scen.id] = { ...scen, steps: stepIds }; // <- LỖI GỐC
                scenarios[scen.scenario_id] = { ...scen, steps: stepIds }; // <- SỬA LỖI
            });

            const executionData = {};
            executionRes.rows.forEach(exec => {
                 if (!executionData[drill.id]) executionData[drill.id] = {};
                 if (exec.id) executionData[drill.id][exec.id] = exec;
            });
            
            drill.step_assignments = assignmentsRes.rows.reduce((acc, a) => { acc[a.step_id] = a.assignee_id; return acc; }, {});
            
            // === SỬA LỖI: Chuẩn hóa Checkpoints trả về ===
            // CreateDrillScreen mong đợi { [scenario_id]: checkpoint_object }
            drill.checkpoints = checkpointsRes.rows.reduce((acc, cp) => {
                if(cp.after_scenario_id) {
                    acc[cp.after_scenario_id] = cp;
                }
                return acc; 
            }, {});
            
            // *** SỬA LỖI (Blank Screen): Xây dựng mảng drill.scenarios ***
            drill.scenarios = scenariosRes.rows.sort((a, b) => a.scenario_order - b.scenario_order).map(s => ({
                id: s.scenario_id,
                group: s.group_name,
                dependsOn: drillDepsRes.rows.filter(dep => dep.scenario_id === s.scenario_id).map(dep => dep.depends_on_scenario_id)
            }));
            
            // --- SỬA LỖI: THÊM LOGIC TỔNG HỢP GROUP DEPENDENCIES ---
            drill.group_dependencies = groupDepsRes.rows.reduce((acc, curr) => {
                let group = acc.find(g => g.group === curr.group_name);
                if (!group) {
                    group = { group: curr.group_name, dependsOn: [] };
                    acc.push(group);
                }
                group.dependsOn.push(curr.depends_on_group_name);
                return acc;
            }, []);
            // --- KẾT THÚC SỬA LỖI ---
            
            // --- DEBUG LOG START ---
            // Thêm log để kiểm tra dữ liệu assignment và users trước khi gửi đi
            console.log(`[DEBUG Execution API] Drill ${id}: Found ${usersRes.rows.length} total users.`);
            console.log(`[DEBUG Execution API] Drill ${id}: Found ${assignmentsRes.rows.length} raw step assignments.`);
            console.log(`[DEBUG Execution API] Drill ${id}: Processed step_assignments object:`, JSON.stringify(drill.step_assignments));
            // --- DEBUG LOG END ---
            
            // Trả về dữ liệu chi tiết
            res.json({ drill, scenarios, steps, users, executionData });

        } catch (err) {
            console.error(`Error fetching drill details for ${id}:`, err);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    // --- CÁC ENDPOINT PUBLIC (ĐÃ SỬA LỖI) ---
    getPublicDrills: async (req, res) => {
        try {
            const drillsQuery = `SELECT d.id, d.name, d.description, d.execution_status FROM drills d WHERE d.execution_status = 'InProgress' ORDER BY d.start_date DESC`;
            // SỬA LỖI 500: pool.query -> query (DÒNG 168)
            const drillsRes = await query(drillsQuery);
            const drills = drillsRes.rows;
            if (drills.length === 0) return res.json([]);
            
            const drillIds = drills.map(d => d.id);
            const progressDataQuery = `
                SELECT ds.drill_id, s.id as scenario_id,
                       (SELECT json_agg(st.id) FROM steps st WHERE st.scenario_id = s.id) as steps,
                       (SELECT json_agg(dcc.id) FROM drill_checkpoints dc JOIN drill_checkpoint_criteria dcc ON dc.id = dcc.checkpoint_id WHERE dc.drill_id = ds.drill_id AND dc.after_scenario_id = s.id) as criteria
                FROM drill_scenarios ds JOIN scenarios s ON ds.scenario_id = s.id
                WHERE ds.drill_id = ANY($1::text[]); -- SỬA LỖI 500: Thêm ::text[]
            `;
            const executionDataQuery = `
                SELECT drill_id, step_id, NULL as criterion_id, status FROM execution_steps WHERE drill_id = ANY($1::text[]) AND status LIKE 'Completed%'
                UNION ALL
                SELECT drill_id, NULL as step_id, criterion_id, status FROM execution_checkpoint_criteria WHERE drill_id = ANY($1::text[]) AND status IN ('Pass', 'Fail')
            `; // SỬA LỖI 500 (Bổ sung): Thêm ::text[]
            const [progressDataRes, executionDataRes] = await Promise.all([
                // SỬA LỖI 500: pool.query -> query
                query(progressDataQuery, [drillIds]),
                query(executionDataQuery, [drillIds])
            ]);

            const progressMap = {};
            progressDataRes.rows.forEach(row => {
                if (!progressMap[row.drill_id]) progressMap[row.drill_id] = { total: 0, completed: 0 };
                progressMap[row.drill_id].total += (row.steps || []).length + (row.criteria || []).length;
            });
            executionDataRes.rows.forEach(row => {
                if (progressMap[row.drill_id]) progressMap[row.drill_id].completed++;
            });

            const drillsWithProgress = drills.map(drill => {
                const progress = progressMap[drill.id];
                const percentage = (progress && progress.total > 0) ? (progress.completed / progress.total) * 100 : 100;
                return { ...drill, progress: percentage };
            });
            res.json(drillsWithProgress);
        } catch (err) {
            console.error('Error fetching public drills list:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    
    getPublicDrillDetails: async (req, res) => {
        // ... (giữ nguyên logic từ file gốc) ...
        const { id } = req.params;
        try {
            // SỬA LỖI 500: pool.query -> query
            const drillRes = await query("SELECT * FROM drills WHERE id = $1 AND execution_status = 'InProgress'", [id]);
            if (drillRes.rows.length === 0) return res.status(404).json({ error: 'Drill not found or not in progress.' });
            
            const drill = drillRes.rows[0];
            const usersQuery = "SELECT id, username, role, first_name, last_name, description, first_name || ' ' || last_name AS fullname FROM users";
            const scenariosQuery = `
                SELECT s.id, s.name, s.role, s.application_name, s.attachment, s.type,
                       COALESCE((SELECT json_agg(steps.* ORDER BY steps.step_order) FROM steps WHERE steps.scenario_id = s.id), '[]'::json) as steps
                FROM scenarios s WHERE s.id IN (SELECT scenario_id FROM drill_scenarios WHERE drill_id = $1)
            `;
            const drillScenariosQuery = 'SELECT scenario_id, group_name, scenario_order FROM drill_scenarios WHERE drill_id = $1';
            const drillDepsQuery = 'SELECT scenario_id, depends_on_scenario_id FROM drill_scenario_dependencies WHERE drill_id = $1';
            const drillGroupDepsQuery = 'SELECT group_name, depends_on_group_name FROM drill_group_dependencies WHERE drill_id = $1';
            const checkpointsQuery = `
                SELECT dc.id, dc.title, dc.after_scenario_id,
                       COALESCE((SELECT json_agg(dcc.* ORDER BY dcc.criterion_order) FROM drill_checkpoint_criteria dcc WHERE dcc.checkpoint_id = dc.id), '[]'::json) as criteria
                FROM drill_checkpoints dc WHERE dc.drill_id = $1
            `;
            const executionDataQuery = `
                (SELECT step_id as id, status, started_at, completed_at, assignee, result_text FROM execution_steps WHERE drill_id = $1)
                UNION ALL
                (SELECT criterion_id as id, status, NULL as started_at, checked_at as completed_at, checked_by as assignee, NULL as result_text FROM execution_checkpoint_criteria WHERE drill_id = $1)
            `;
            const assignmentsQuery = 'SELECT step_id, assignee_id FROM drill_step_assignments WHERE drill_id = $1';

            const [
                usersRes, scenariosRes, drillScenariosRes, drillDepsRes, groupDepsRes, checkpointsRes, executionDataRes, assignmentsRes
            ] = await Promise.all([
                // SỬA LỖI 500: pool.query -> query
                query(usersQuery), query(scenariosQuery, [id]), query(drillScenariosQuery, [id]),
                query(drillDepsQuery, [id]), query(drillGroupDepsQuery, [id]), query(checkpointsQuery, [id]),
                query(executionDataQuery, [id]), query(assignmentsQuery, [id])
            ]);

            drill.scenarios = drillScenariosRes.rows.sort((a, b) => a.scenario_order - b.scenario_order).map(s => ({
                id: s.scenario_id,
                group: s.group_name,
                dependsOn: drillDepsRes.rows.filter(dep => dep.scenario_id === s.scenario_id).map(dep => dep.depends_on_scenario_id)
            }));
            drill.group_dependencies = groupDepsRes.rows.reduce((acc, curr) => {
                let group = acc.find(g => g.group === curr.group_name);
                if (!group) {
                    group = { group: curr.group_name, dependsOn: [] };
                    acc.push(group);
                }
                group.dependsOn.push(curr.depends_on_group_name);
                return acc;
            }, []);
            drill.checkpoints = checkpointsRes.rows.reduce((acc, cp) => { acc[cp.id] = cp; return acc; }, {});
            drill.step_assignments = assignmentsRes.rows.reduce((acc, a) => { acc[a.step_id] = a.assignee_id; return acc; }, {});

            const scenariosMap = scenariosRes.rows.reduce((acc, s) => {
                s.steps.forEach(st => delete st.description);
                // *** SỬA LỖI TƯƠNG TỰ ***
                // Phải dùng s.id (vì query này đã select s.id)
                acc[s.id] = { ...s, application: s.application_name };
                return acc;
            }, {});
            const stepsMap = Object.values(scenariosMap).flatMap(s => s.steps).reduce((acc, st) => { acc[st.id] = st; return acc; }, {});
            const executionData = executionDataRes.rows.reduce((acc, exec) => { if (exec.id) acc[exec.id] = exec; return acc; }, {});

            res.json({ drill, scenarios: scenariosMap, steps: stepsMap, users: usersRes.rows, executionData });
        } catch (err) {
            console.error(`Error fetching public drill details for ${id}:`, err);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
};

//==============================================================================
// ĐỊNH NGHĨA ROUTES (data.routes.js)
//==============================================================================

// --- CÁC ENDPOINT CỐT LÕI MỚI ---
// ĐÃ XÓA router.get('/settings', ...);
// ĐÃ XÓA router.get('/users', ...);
// ĐÃ XÓA router.get('/applications', ...);

// --- ENDPOINT CHO DRILLS ---
// router.get('/data', dataController.getInitialData); // <- ĐÃ LOI BỎ
router.get('/drills', authMiddleware, dataController.getDrillsList); 
router.get('/drills/:id', authMiddleware, dataController.getDrillDetails); 

// --- ENDPOINT PUBLIC ---
router.get('/public/drills', dataController.getPublicDrills);
router.get('/public/drills/:id', dataController.getPublicDrillDetails);

module.exports = router;