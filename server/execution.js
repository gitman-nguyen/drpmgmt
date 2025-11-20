// File path: /execution.js
// Nhiệm vụ: Chứa logic nghiệp vụ cho việc Thực thi Tự động (Automation Execution)
// Sửa lỗi: Import 'query' thay vì 'pool' để khớp với api.operations.controller.js
const { query } = require('./db');
const pty = require('node-pty');

const executionClients = new Map(); // Map drillId -> Set of ws clients
const activeExecutions = new Map(); // Map drillId -> { steps: [], adj: {}, inDegree: {}, currentQueue: [], running: Set<stepId>, failed: boolean }

function sendWsMessage(drillId, message) {
    const clients = executionClients.get(drillId);
    if (clients) {
        clients.forEach(client => {
            if (client.readyState === 1) { // WebSocket.OPEN = 1
                try {
                    client.send(JSON.stringify(message));
                } catch (err) {
                    console.error(`[Execution ${drillId}]: Error sending WebSocket message:`, err);
                }
            }
        });
    }
}

function findNextSteps(drillId, completedStepId) {
    const execInfo = activeExecutions.get(drillId);
    if (!execInfo) return [];

    const nextSteps = [];
    (execInfo.adj[completedStepId] || []).forEach(vId => {
        const currentInDegree = execInfo.inDegree[vId];
        if (currentInDegree !== undefined) {
             execInfo.inDegree[vId]--;
             if (execInfo.inDegree[vId] === 0) {
                 const nextStep = execInfo.steps.find(s => s.id === vId);
                 if (nextStep) {
                    nextSteps.push(nextStep);
                 }
             }
        } else {
             console.warn(`[Execution ${drillId}]: Step ${vId} not found in inDegree map.`);
        }
    });
    return nextSteps;
}

async function executeStep(drillId, step) {
     const execInfo = activeExecutions.get(drillId);
     if (!execInfo || execInfo.running.has(step.id)) return Promise.resolve(false);

     execInfo.running.add(step.id);
     console.log(`[Execution ${drillId}]: Starting step ${step.id} (${step.title})`);

     // --- PHASE 1: START STEP ---
     const startTime = new Date();
     try {
         const startPayload = {
             drill_id: drillId, step_id: step.id, status: 'InProgress',
             started_at: startTime.toISOString(), assignee: 'AUTOMATION'
         };
         const startQuery = `
             INSERT INTO execution_steps (drill_id, step_id, status, started_at, assignee, result_text) VALUES ($1, $2, $3, $4, $5, '')
             ON CONFLICT (drill_id, step_id) DO UPDATE SET status = EXCLUDED.status, started_at = EXCLUDED.started_at, assignee = EXCLUDED.assignee, completed_at = NULL, result_text = ''
             RETURNING *;`;
         // Sửa lỗi: pool.query -> query
         const startDbRes = await query(startQuery, [startPayload.drill_id, startPayload.step_id, startPayload.status, startPayload.started_at, startPayload.assignee]);
         sendWsMessage(drillId, { type: 'STEP_UPDATE', payload: startDbRes.rows[0] });
     } catch(dbError) {
         console.error(`[Execution ${drillId}]: Error updating step ${step.id} to InProgress:`, dbError);
         if (execInfo) execInfo.running.delete(step.id);
         sendWsMessage(drillId, { type: 'EXECUTION_ERROR', payload: { error: `Database error starting step ${step.id}` } });
         if (execInfo) execInfo.failed = true;
         return Promise.reject(new Error(`Database error starting step ${step.id}`));
     }

     // --- PHASE 2: EXECUTE COMMAND using node-pty ---
     const { command, server_user, ip_address } = step;
     let defaultTimeout = 300; // Fallback an toàn
     try {
         const settingRes = await query("SELECT value FROM app_settings WHERE key = 'defaultStepTimeout'");
         if (settingRes.rows.length > 0) {
             defaultTimeout = parseInt(settingRes.rows[0].value, 10) || 300;
         }
     } catch (e) {
         console.warn(`[Execution ${drillId}]: Could not fetch default timeout, using 300s.`, e);
     }

     // Logic: Ưu tiên timeout của bước, nếu không có thì dùng timeout mặc định của hệ thống
     const appliedTimeout = defaultTimeout;
     const timeout_ms = appliedTimeout * 1000;

     console.log(`[Execution ${drillId}]: Step ${step.id} timeout set to ${appliedTimeout}s`);

     let accumulatedLog = '';

     if (!command || !server_user || !ip_address) {
         accumulatedLog = "Lỗi cấu hình: Thiếu lệnh, user hoặc IP server.";
         const payload = { drill_id: drillId, step_id: step.id, status: 'Completed-Failure', completed_at: new Date().toISOString(), result_text: accumulatedLog };
         try {
            // Sửa lỗi: pool.query -> query
            const dbRes = await query(`UPDATE execution_steps SET status = $1, completed_at = $2, result_text = $3 WHERE drill_id = $4 AND step_id = $5 RETURNING *;`, [payload.status, payload.completed_at, payload.result_text, payload.drill_id, payload.step_id]);
            sendWsMessage(drillId, { type: 'STEP_UPDATE', payload: dbRes.rows[0] });
         } catch (dbError) {
             console.error(`[Execution ${drillId}]: DB Error updating failed config step ${step.id}:`, dbError);
         }
         if (execInfo) execInfo.running.delete(step.id);
         sendWsMessage(drillId, { type: 'EXECUTION_PAUSED_ON_FAILURE', payload: { step_id: step.id, error: accumulatedLog } });
         if (execInfo) execInfo.failed = true;
         return Promise.reject(new Error(accumulatedLog));
     }

     return new Promise((resolve, reject) => {
         let ptyError = null;
         let exitHandled = false;
         let errorTimeout = null;

         const ptyProcess = pty.spawn('ssh', [`${server_user}@${ip_address}`, '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=10', command], {
             name: 'xterm-color', cols: 80, rows: 30, cwd: process.env.HOME, env: process.env
         });

         ptyProcess.onData(data => {
             accumulatedLog += data;
             sendWsMessage(drillId, { type: 'STEP_LOG_UPDATE', payload: { step_id: step.id, log_chunk: data } });
         });

         ptyProcess.onExit(async ({ exitCode, signal }) => {
             if (exitHandled) return;
             exitHandled = true;
             clearTimeout(errorTimeout);

             const currentExecInfo = activeExecutions.get(drillId);
        
             if (!currentExecInfo) {
                console.log(`[Execution ${drillId}]: Execution context removed before step ${step.id} exit handler.`);
                return reject(new Error(`Execution context removed for step ${step.id}`));
             }

             console.log(`[Execution ${drillId}]: Step ${step.id} exited with code ${exitCode}, signal ${signal}`);
             const success = exitCode === 0;
             const status = success ? 'Completed-Success' : 'Completed-Failure';
             const completed_at = new Date().toISOString();
             
             if (!success && !accumulatedLog.includes('Execution failed')) {
                accumulatedLog += `\nExecution failed with exit code ${exitCode}.`;
             }
             if (!success && ptyError && !accumulatedLog.includes(ptyError.message)) {
                 accumulatedLog += `\nPty Error: ${ptyError.message} (Code: ${ptyError.code})`;
             }

             const endPayload = { drill_id: drillId, step_id: step.id, status, completed_at, result_text: accumulatedLog };

             try {
                 const endQuery = `UPDATE execution_steps SET status = $1, completed_at = $2, result_text = $3 WHERE drill_id = $4 AND step_id = $5 RETURNING *;`;
                 // Sửa lỗi: pool.query -> query
                 const endDbRes = await query(endQuery, [endPayload.status, endPayload.completed_at, endPayload.result_text, endPayload.drill_id, endPayload.step_id]);
                 sendWsMessage(drillId, { type: 'STEP_UPDATE', payload: endDbRes.rows[0] });
             } catch (dbError) {
                 console.error(`[Execution ${drillId}]: DB Error updating completed step ${step.id}:`, dbError);
             }

             currentExecInfo.running.delete(step.id);

             if (success) {
                 const nextSteps = findNextSteps(drillId, step.id);
                 if (nextSteps.length > 0) {
                     currentExecInfo.currentQueue.push(...nextSteps);
                 }
                 resolve(true);
             } else {
                 const errorMessage = `Execution failed with exit code ${exitCode}. Check logs. ${ptyError ? `(Pty Error: ${ptyError.message})`: ''}`;
                 sendWsMessage(drillId, { type: 'EXECUTION_PAUSED_ON_FAILURE', payload: { step_id: step.id, error: errorMessage, exitCode: exitCode, ptyErrorCode: ptyError?.code } });
                 currentExecInfo.failed = true;
                 reject(new Error(errorMessage));
             }
         });

         ptyProcess.on('error', async (err) => {
             const currentExecInfo = activeExecutions.get(drillId);
             console.error(`[Execution ${drillId}]: Pty process error for step ${step.id} (Command: '${command}'):`, err);
             ptyError = err;

                  if (err.code !== 'EIO' || exitHandled) {
                        if (exitHandled) {
                        console.log(`[Execution ${drillId}]: Pty error (Code: ${err.code}) occurred after exit. Ignoring.`);
                        return;
                    }
        
                    const currentExecInfo = activeExecutions.get(drillId);
                    console.error(`[Execution ${drillId}]: Pty process error for step ${step.id} (Command: '${command}'):`, err);
                    ptyError = err;
        
                    // SỬA LỖI: Nếu là EIO, chỉ ghi log và để onExit xử lý.
                    // (Vì EIO là bình thường khi process kết thúc nhanh)
                    if (err.code === 'EIO') {
                        console.warn(`[Execution ${drillId}]: Captured EIO error for step ${step.id}. Waiting for exit code or timeout.`);
                        return; // Không làm gì thêm, không reject promise
                    }
                  exitHandled = true;
                  clearTimeout(errorTimeout);

                 accumulatedLog += `\nCritical Internal Execution Error: ${err.message} (Code: ${err.code}, Syscall: ${err.syscall})`;
                 const status = 'Completed-Failure';
                 const completed_at = new Date().toISOString();
                 const endPayload = { drill_id: drillId, step_id: step.id, status, completed_at, result_text: accumulatedLog };
                 try {
                     const endQuery = `UPDATE execution_steps SET status = $1, completed_at = $2, result_text = $3 WHERE drill_id = $4 AND step_id = $5 RETURNING *;`;
                     // Sửa lỗi: pool.query -> query
                     const endDbRes = await query(endQuery, [endPayload.status, endPayload.completed_at, endPayload.result_text, endPayload.drill_id, endPayload.step_id]);
                     sendWsMessage(drillId, { type: 'STEP_UPDATE', payload: endDbRes.rows[0] });
                 } catch (dbError) {
                     console.error(`[Execution ${drillId}]: DB Error updating failed pty step ${step.id}:`, dbError);
                 }
                  if (currentExecInfo) {
                     currentExecInfo.running.delete(step.id);
                     currentExecInfo.failed = true;
                 }
                 const detailedError = `Critical internal execution error: ${err.message} (Code: ${err.code})`;
                 sendWsMessage(drillId, { type: 'EXECUTION_PAUSED_ON_FAILURE', payload: { step_id: step.id, error: detailedError, code: err.code } });
                 reject(new Error(detailedError));
             } else {
                  console.warn(`[Execution ${drillId}]: Captured EIO error for step ${step.id}. Waiting for exit code or timeout.`);
             }
        });

         errorTimeout = setTimeout(() => {
             if (exitHandled) return;
             exitHandled = true;
             const currentExecInfo = activeExecutions.get(drillId);
             const errorMessage = ptyError ? `Step ${step.id} timed out after error: ${ptyError.message}` : `Step ${step.id} timed out after ${timeout_ms / 1000}s without exiting.`;
             console.warn(`[Execution ${drillId}]: ${errorMessage}`);

             accumulatedLog += `\nError: ${errorMessage}`;
             const status = 'Completed-Failure';
             const completed_at = new Date().toISOString();
             const endPayload = { drill_id: drillId, step_id: step.id, status, completed_at, result_text: accumulatedLog };

             // Sửa lỗi: pool.query -> query
             query(`UPDATE execution_steps SET status = $1, completed_at = $2, result_text = $3 WHERE drill_id = $4 AND step_id = $5 RETURNING *;`,
                 [endPayload.status, endPayload.completed_at, endPayload.result_text, endPayload.drill_id, endPayload.step_id]
             ).then(endDbRes => {
                 sendWsMessage(drillId, { type: 'STEP_UPDATE', payload: endDbRes.rows[0] });
             }).catch(dbError => {
                 console.error(`[Execution ${drillId}]: DB Error updating timed out step ${step.id}:`, dbError);
             }).finally(() => {
                 if (currentExecInfo) {
                     currentExecInfo.running.delete(step.id);
                     currentExecInfo.failed = true;
                 }
                 sendWsMessage(drillId, { type: 'EXECUTION_PAUSED_ON_FAILURE', payload: { step_id: step.id, error: errorMessage, timedOut: true } });
                 reject(new Error(errorMessage));
             });
         }, timeout_ms); // 5 minutes timeout
     });
}

async function processExecutionQueue(drillId) {
    const execInfo = activeExecutions.get(drillId);
    if (!execInfo) {
        console.log(`[Execution ${drillId}]: Execution stopped or context removed.`);
        return;
    }
    if (execInfo.failed) {
        console.log(`[Execution ${drillId}]: Execution paused due to previous error. Halting queue processing.`);
        return;
    }

    if (execInfo.currentQueue.length === 0) {
        if(execInfo.running.size === 0 && !execInfo.failed) {
            console.log(`[Execution ${drillId}]: Queue empty and no steps running. Execution complete.`);
            sendWsMessage(drillId, { type: 'EXECUTION_COMPLETE', payload: {} });
            activeExecutions.delete(drillId);
        } else if (execInfo.running.size > 0) {
             console.log(`[Execution ${drillId}]: Queue empty but ${execInfo.running.size} steps still running.`);
        }
        return;
    }

    const stepsToRun = [...execInfo.currentQueue];
    execInfo.currentQueue = [];

    sendWsMessage(drillId, { type: 'LEVEL_START', payload: { step_ids: stepsToRun.map(s => s.id) } });

    try {
        await Promise.all(stepsToRun.map(step => executeStep(drillId, step)));

        const currentExecInfo = activeExecutions.get(drillId);
        if (currentExecInfo && !currentExecInfo.failed) {
            if (currentExecInfo.currentQueue.length === 0 && currentExecInfo.running.size === 0) {
                processExecutionQueue(drillId);
            } else if (currentExecInfo.currentQueue.length > 0) {
                processExecutionQueue(drillId);
            }
        } else if (currentExecInfo && currentExecInfo.failed) {
            console.log(`[Execution ${drillId}]: Execution paused after processing level due to failure.`);
        } else {
             console.log(`[Execution ${drillId}]: Execution stopped externally after processing level.`);
        }
    } catch (error) {
        console.error(`[Execution ${drillId}]: Error processing execution level:`, error.message || error);
        const currentExecInfo = activeExecutions.get(drillId);
        if (currentExecInfo) {
             currentExecInfo.failed = true;
             console.log(`[Execution ${drillId}]: Marked execution as failed.`);
        }
    }
}

async function startOrResumeExecution(drillId, stepsToRunIds, scenarioId) {
    try {
        const existingExec = activeExecutions.get(drillId);
        if (existingExec && !existingExec.failed) {
             console.warn(`[Execution ${drillId}]: Attempted to start execution while already active and not failed. Ignoring.`);
             return;
        }

        if (!scenarioId) {
             // Sửa lỗi: pool.query -> query (Đây là dòng 285 gây lỗi)
             const scenarioIdRes = await query('SELECT scenario_id FROM steps WHERE id = $1', [stepsToRunIds[0]]);
             if (scenarioIdRes.rows.length === 0) throw new Error(`Scenario not found for step ${stepsToRunIds[0]}`);
             scenarioId = scenarioIdRes.rows[0].scenario_id;
        }

        // Sửa lỗi: pool.query -> query
        const stepsRes = await query(`SELECT s.*, ms.ip_address FROM steps s LEFT JOIN managed_servers ms ON s.server_id = ms.id WHERE s.scenario_id = $1 ORDER BY s.step_order`, [scenarioId]);
        const allStepsInScenario = stepsRes.rows;
        const allStepIds = allStepsInScenario.map(s => s.id);
        // Sửa lỗi: pool.query -> query
        const depsRes = await query('SELECT * FROM step_dependencies WHERE step_id = ANY($1::text[]) OR depends_on_step_id = ANY($1::text[])', [allStepIds]);
        const dependencies = depsRes.rows;

        const adj = {};
        const originalInDegree = {};
        allStepsInScenario.forEach(s => {
            adj[s.id] = [];
            originalInDegree[s.id] = 0;
        });
        dependencies.forEach(dep => {
            if(adj[dep.depends_on_step_id] && allStepIds.includes(dep.step_id)) {
                adj[dep.depends_on_step_id].push(dep.step_id);
                originalInDegree[dep.step_id]++;
            }
        });

        let initialQueue = [];
        const currentInDegreeForRun = { ...originalInDegree };

        // Sửa lỗi: pool.query -> query
        const executionStepsStatusRes = await query('SELECT step_id, status from execution_steps where drill_id = $1 AND step_id = ANY($2::text[])', [drillId, allStepIds]);
        const currentStepStatuses = executionStepsStatusRes.rows.reduce((acc, row) => {
             acc[row.step_id] = row.status;
             return acc;
        }, {});

        allStepsInScenario.forEach(s => {
            if (stepsToRunIds.includes(s.id)) {
                dependencies.forEach(dep => {
                    if (dep.step_id === s.id && !stepsToRunIds.includes(dep.depends_on_step_id)) {
                         // --- START: SỬA LOGIC GHI ĐÈ BƯỚC ---
                         // Cho phép 'Completed-Skipped' giống như 'Completed-Success'
                         const depStatus = currentStepStatuses[dep.depends_on_step_id];
                         if (depStatus === 'Completed-Success' || depStatus === 'Completed-Skipped') {
                         // --- END: SỬA LOGIC GHI ĐÈ BƯỚC ---
                            if(currentInDegreeForRun[s.id] > 0) currentInDegreeForRun[s.id]--;
                         }
                    }
                });
            }
        });

         initialQueue = allStepsInScenario.filter(s =>
             stepsToRunIds.includes(s.id) && currentInDegreeForRun[s.id] <= 0
         );

         if (existingExec) {
             console.log(`[Execution ${drillId}]: Resuming/Retrying. Updating context.`);
             existingExec.currentQueue = initialQueue;
             existingExec.failed = false;
             existingExec.inDegree = { ...originalInDegree };
             
             allStepsInScenario.forEach(s => {
                if(activeExecutions.get(drillId)?.inDegree[s.id] > 0) {
                     dependencies.forEach(dep => {
                        // --- START: SỬA LOGIC GHI ĐÈ BƯỚC ---
                        const depStatus = currentStepStatuses[dep.depends_on_step_id];
                        if (dep.step_id === s.id && !stepsToRunIds.includes(dep.depends_on_step_id) && (depStatus === 'Completed-Success' || depStatus === 'Completed-Skipped')) {
                        // --- END: SỬA LOGIC GHI ĐÈ BƯỚC ---
                            activeExecutions.get(drillId).inDegree[s.id]--;
                        }
                    });
                }
             });
         } else {
             activeExecutions.set(drillId, {
                 steps: allStepsInScenario,
                 adj: adj,
                 inDegree: { ...originalInDegree },
                 currentQueue: initialQueue,
                 running: new Set(),
                 failed: false
             });
         }


        console.log(`[Execution ${drillId}]: Starting/Resuming. Initial queue:`, initialQueue.map(s => s.id));
        processExecutionQueue(drillId);

    } catch (err) {
         console.error(`[Execution ${drillId}]: Error preparing execution:`, err);
         sendWsMessage(drillId, { type: 'EXECUTION_ERROR', payload: { error: `Failed to prepare execution: ${err.message}` } });
         activeExecutions.delete(drillId);
    }
}

// --- START: THÊM TÍNH NĂNG GHI ĐÈ BƯỚC ---
/**
 * Ghi đè trạng thái của một bước bằng tay và kích hoạt các bước tiếp theo nếu cần.
 * @param {string} drillId ID của drill
 * @param {string} stepId ID của bước cần ghi đè
 * @param {string} newStatus Trạng thái mới ('Completed-Success', 'Completed-Skipped', 'Completed-Failure')
 * @param {string} reason Lý do ghi đè (sẽ được lưu vào result_text)
 */
async function manuallyCompleteStep(drillId, stepId, newStatus, reason) {
    console.log(`[Execution ${drillId}]: Manually overriding step ${stepId} to ${newStatus}. Reason: ${reason}`);
    
    const completed_at = new Date().toISOString();
    
    // 1. Cập nhật cơ sở dữ liệu
    const endQuery = `
        INSERT INTO execution_steps (drill_id, step_id, status, completed_at, result_text, assignee) 
        VALUES ($1, $2, $3, $4, $5, 'MANUAL_OVERRIDE')
        ON CONFLICT (drill_id, step_id) DO UPDATE SET 
            status = EXCLUDED.status, 
            completed_at = EXCLUDED.completed_at, 
            result_text = EXCLUDED.result_text, 
            assignee = EXCLUDED.assignee
        RETURNING *;`;
        
    const endDbRes = await query(endQuery, [drillId, stepId, newStatus, completed_at, reason]);
    const updatedStep = endDbRes.rows[0];

    // 2. Gửi cập nhật qua WebSocket
    sendWsMessage(drillId, { type: 'STEP_UPDATE', payload: updatedStep });

    // 3. Xử lý logic hàng đợi (queue) nếu thực thi đang chạy
    const execInfo = activeExecutions.get(drillId);
    if (execInfo) {
        // Xóa khỏi danh sách đang chạy (nếu lỡ có)
        execInfo.running.delete(stepId);

        // Nếu trạng thái là "thành công" (hoặc bỏ qua), hãy kích hoạt các bước tiếp theo
        if (newStatus === 'Completed-Success' || newStatus === 'Completed-Skipped') {
            
            // --- START: SỬA LỖI LOGIC (FIX-QUEUE-ON-OVERRIDE) ---
            // Nếu chúng ta ghi đè một bước bị lỗi thành công,
            // hãy đặt lại cờ 'failed' để queue có thể tiếp tục.
            if (execInfo.failed) {
                console.log(`[Execution ${drillId}]: Đặt lại cờ 'failed' do ghi đè thủ công.`);
                execInfo.failed = false;
            }
            // --- END: SỬA LỖI LOGIC (FIX-QUEUE-ON-OVERRIDE) ---

            const nextSteps = findNextSteps(drillId, stepId);
            if (nextSteps.length > 0) {
                console.log(`[Execution ${drillId}]: Queuing next steps after override:`, nextSteps.map(s => s.id));
                execInfo.currentQueue.push(...nextSteps);
            }
            
            // Kích hoạt xử lý hàng đợi để chạy các bước tiếp theo
            // Hàm này bây giờ sẽ chạy vì cờ 'failed' đã được dọn dẹp (nếu cần)
            processExecutionQueue(drillId);

        } else if (newStatus === 'Completed-Failure') {
            // Nếu ép "thất bại", đánh dấu toàn bộ execution là failed
            execInfo.failed = true;
            sendWsMessage(drillId, { type: 'EXECUTION_PAUSED_ON_FAILURE', payload: { step_id: stepId, error: reason, manualOverride: true } });
        }
    }

    return updatedStep;
}
// --- END: THÊM TÍNH NĂNG GHI ĐÈ BƯỚC ---

// --- START: SỬA LỖI API (FIX LỖI 404 - execution/step) ---
/**
 * Cập nhật trạng thái của một bước thủ công (Start, Complete-Success, Complete-Failure)
 * @param {object} body Dữ liệu từ request body
 */
async function updateManualStep(body) {
    const { drill_id, step_id, status, started_at, completed_at, result_text, assignee } = body;
    
    console.log(`[Execution Logic] Cập nhật bước ${step_id} cho drill ${drill_id} với trạng thái ${status}`);

    if (!drill_id || !step_id || !status) {
        // Ném lỗi để controller có thể bắt và trả về 400
        throw new Error('Yêu cầu thiếu drill_id, step_id, hoặc status.');
    }
    
    // 1. Kiểm tra xem bản ghi đã tồn tại chưa
    const checkQuery = 'SELECT * FROM execution_steps WHERE drill_id = $1 AND step_id = $2';
    const checkRes = await query(checkQuery, [drill_id, step_id]);
    
    let updatedStep;

    if (checkRes.rows.length > 0) {
        // 2. Tồn tại -> Cập nhật (UPDATE)
        const existing = checkRes.rows[0];
        const newStatus = status;
        const newStartedAt = started_at || existing.started_at;
        // Quan trọng: Nếu bắt đầu ('InProgress'), 'completed_at' và 'result_text' phải là null
        const newCompletedAt = (status === 'InProgress') ? null : (completed_at || existing.completed_at);
        const newResultText = (status === 'InProgress') ? null : (result_text !== undefined ? result_text : existing.result_text); // Cho phép ''
        const newAssignee = assignee || existing.assignee;

        const updateQuery = `
            UPDATE execution_steps 
            SET status = $1, started_at = $2, completed_at = $3, result_text = $4, assignee = $5
            WHERE drill_id = $6 AND step_id = $7
            RETURNING *;
        `;
        const updateRes = await query(updateQuery, [newStatus, newStartedAt, newCompletedAt, newResultText, newAssignee, drill_id, step_id]);
        updatedStep = updateRes.rows[0];
        console.log(`[Execution Logic] Đã CẬP NHẬT bước ${step_id}`);
    } else {
        // 2. Chưa tồn tại -> Chèn mới (INSERT)
        const insertQuery = `
            INSERT INTO execution_steps (drill_id, step_id, status, started_at, completed_at, result_text, assignee)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *;
        `;
        const insertRes = await query(insertQuery, [drill_id, step_id, status, started_at, completed_at, result_text, assignee]);
        updatedStep = insertRes.rows[0];
        console.log(`[Execution Logic] Đã CHÈN MỚI bước ${step_id}`);
    }

    // 3. Gửi thông báo WebSocket
    sendWsMessage(drill_id, {
        type: 'STEP_UPDATE',
        payload: updatedStep
    });

    // 4. Trả về step đã cập nhật để controller có thể gửi lại
    return updatedStep;
}
// --- END: SỬA LỖI API (FIX LỖI 404 - execution/step) ---

// --- START: SỬA LỖI API (FIX LỖI 404 - execution/scenario) ---
/**
 * Xác nhận trạng thái cuối cùng của một kịch bản (thường là thủ công)
 * @param {object} body Dữ liệu từ request body
 */
async function confirmScenarioStatus(body) {
    const { drill_id, scenario_id, final_status, final_reason } = body;

    if (!drill_id || !scenario_id || !final_status) {
        throw new Error('Yêu cầu thiếu drill_id, scenario_id, hoặc final_status.');
    }

    console.log(`[Execution Logic] Xác nhận kịch bản ${scenario_id} cho drill ${drill_id} là ${final_status}`);

    const queryCmd = `
        INSERT INTO execution_scenarios (drill_id, scenario_id, final_status, final_reason)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (drill_id, scenario_id) DO UPDATE SET
            final_status = EXCLUDED.final_status,
            final_reason = EXCLUDED.final_reason
        RETURNING *;
    `;
    
    const dbRes = await query(queryCmd, [drill_id, scenario_id, final_status, final_reason]);
    const updatedScenarioExec = dbRes.rows[0];

    // Gửi thông báo WebSocket
    sendWsMessage(drill_id, {
        type: 'SCENARIO_UPDATE',
        payload: {
            ...updatedScenarioExec, // Gửi toàn bộ object từ DB
            id: updatedScenarioExec.scenario_id, // Đảm bảo có 'id'
            type: 'scenario' // Thêm 'type' để UI biết
        }
    });

    return updatedScenarioExec;
}
// --- END: SỬA LỖI API (FIX LỖI 404 - execution/scenario) ---

// --- START: THÊM API (FIX LỖI 404 - execution/checkpoint) ---
/**
 * Đánh giá một tiêu chí (criterion) của checkpoint
 * @param {object} body Dữ liệu từ request body
 */
async function evaluateCheckpointCriterion(body) {
    const { drill_id, criterion_id, status, checked_by } = body;

    if (!drill_id || !criterion_id || !status || !checked_by) {
        throw new Error('Yêu cầu thiếu drill_id, criterion_id, status, hoặc checked_by.');
    }

    console.log(`[Execution Logic] Đánh giá tiêu chí ${criterion_id} cho drill ${drill_id} là ${status}`);

    // Giả định tên bảng là 'execution_criteria'.
    // Nếu tên bảng của bạn khác, hãy thay đổi nó ở đây.
    const queryCmd = `
        INSERT INTO execution_checkpoint_criteria (drill_id, criterion_id, status, checked_at, checked_by)
        VALUES ($1, $2, $3, NOW(), $4)
        ON CONFLICT (drill_id, criterion_id) DO UPDATE SET
            status = EXCLUDED.status,
            checked_at = EXCLUDED.checked_at,
            checked_by = EXCLUDED.checked_by
        RETURNING *;
    `;
    
    const dbRes = await query(queryCmd, [drill_id, criterion_id, status, checked_by]);
    const updatedCriterion = dbRes.rows[0];

    // Gửi thông báo WebSocket
    sendWsMessage(drill_id, {
        type: 'CRITERION_UPDATE', // Một type mới
        payload: updatedCriterion
    });

    return updatedCriterion;
}
// --- END: THÊM API (FIX LỖI 404 - execution/checkpoint) ---


module.exports = {
    executionClients,
    activeExecutions,
    sendWsMessage,
    findNextSteps,
    executeStep,
    processExecutionQueue,
    startOrResumeExecution,
    manuallyCompleteStep, 
    updateManualStep,      
    confirmScenarioStatus,
    evaluateCheckpointCriterion // <-- THÊM HÀM MỚI VÀO EXPORTS
};