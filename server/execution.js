// File path: /execution.js
// Nhiệm vụ: Chứa logic nghiệp vụ cho việc Thực thi Tự động (Automation Execution)
// Sửa lỗi: Import 'query' thay vì 'pool' để khớp với api.operations.controller.js
const { query } = require('./db');
const pty = require('node-pty');

const executionClients = new Map(); // Map drillId -> Set of ws clients

// --- THAY ĐỔI 1: Cập nhật cấu trúc để chứa 'logs' in-memory và hỗ trợ chạy song song ---
// Map "drillId_scenarioId" -> { 
//    steps: [], 
//    adj: {}, 
//    inDegree: {}, 
//    currentQueue: [], 
//    running: Set<stepId>, 
//    failed: boolean, 
//    scenarioId: string, 
//    logs: Object 
// }
const activeExecutions = new Map(); 

// Helper: Tạo key định danh duy nhất cho mỗi phiên chạy kịch bản
const getExecKey = (drillId, scenarioId) => `${drillId}_${scenarioId}`;

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

// --- NEW FUNCTION: Hàm để Controller gọi lấy log từ bộ nhớ đệm (phục vụ Frontend Lazy Loading) ---
function getLiveLogs(drillId, scenarioId) {
    const execKey = getExecKey(drillId, scenarioId);
    const execInfo = activeExecutions.get(execKey);
    if (execInfo && execInfo.logs) {
        return execInfo.logs; // Trả về object { stepId: "log content..." }
    }
    return {};
}

// --- THAY ĐỔI: Nhận scenarioId để tìm đúng hàng đợi ---
function findNextSteps(drillId, scenarioId, completedStepId) {
    const execKey = getExecKey(drillId, scenarioId);
    const execInfo = activeExecutions.get(execKey);
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
             console.warn(`[Execution ${drillId} - Scen ${scenarioId}]: Step ${vId} not found in inDegree map.`);
        }
    });
    return nextSteps;
}

// --- THAY ĐỔI: Nhận scenarioId để chạy trong context riêng biệt & Fix EIO & Periodic Save ---
async function executeStep(drillId, scenarioId, step) {
     const execKey = getExecKey(drillId, scenarioId);
     const execInfo = activeExecutions.get(execKey);
     
     // Kiểm tra context tồn tại và bước này chưa chạy
     if (!execInfo || execInfo.running.has(step.id)) return Promise.resolve(false);

     execInfo.running.add(step.id);
     
     // --- THAY ĐỔI 2: Khởi tạo log trong bộ nhớ ---
     if (!execInfo.logs) execInfo.logs = {};
     execInfo.logs[step.id] = '';

     console.log(`[Execution ${drillId}]: Starting step ${step.id} (${step.title}) in scenario ${scenarioId}`);

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

     const appliedTimeout = defaultTimeout;
     const timeout_ms = appliedTimeout * 1000;

     console.log(`[Execution ${drillId}]: Step ${step.id} timeout set to ${appliedTimeout}s`);

     let accumulatedLog = '';
     // --- BIẾN CHO PERIODIC SAVE ---
     let lastSavedLog = '';
     let logSaveInterval = null;

     if (!command || !server_user || !ip_address) {
         accumulatedLog = "Lỗi cấu hình: Thiếu lệnh, user hoặc IP server.";
         const payload = { drill_id: drillId, step_id: step.id, status: 'Completed-Failure', completed_at: new Date().toISOString(), result_text: accumulatedLog };
         try {
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

         // --- THAY ĐỔI 3: Tăng Interval lưu DB lên 20s (Giảm tải DB, tin cậy vào In-Memory Logs) ---
         logSaveInterval = setInterval(async () => {
             if (accumulatedLog !== lastSavedLog && !exitHandled) {
                 try {
                     // Chỉ update result_text
                     await query(`UPDATE execution_steps SET result_text = $1 WHERE drill_id = $2 AND step_id = $3`, 
                         [accumulatedLog, drillId, step.id]);
                     lastSavedLog = accumulatedLog;
                 } catch (e) {
                     console.error(`[Execution ${drillId}]: Error auto-saving logs for step ${step.id}`, e);
                 }
             }
         }, 20000); // 20 giây

         ptyProcess.onData(data => {
             accumulatedLog += data;
             
             // --- THAY ĐỔI 4: Cập nhật log vào bộ nhớ đệm (activeExecutions) ---
             // Điều này giúp getLiveLogs() luôn trả về dữ liệu mới nhất ngay lập tức
             const currentInfo = activeExecutions.get(execKey);
             if (currentInfo && currentInfo.logs) {
                 currentInfo.logs[step.id] = accumulatedLog;
             }

             sendWsMessage(drillId, { type: 'STEP_LOG_UPDATE', payload: { step_id: step.id, log_chunk: data } });
         });

         ptyProcess.onExit(async ({ exitCode, signal }) => {
             if (exitHandled) return;
             exitHandled = true;
             clearTimeout(errorTimeout);
             if (logSaveInterval) clearInterval(logSaveInterval); // Dọn dẹp interval

             // Lấy lại context dựa trên execKey (drillId + scenarioId)
             const currentExecInfo = activeExecutions.get(execKey);
        
             if (!currentExecInfo) {
                console.log(`[Execution ${drillId}]: Execution context removed before step ${step.id} exit handler.`);
                // Nếu context bị xóa, không reject để tránh unhandled rejection crash server
                return resolve(false); 
             }

             console.log(`[Execution ${drillId}]: Step ${step.id} exited with code ${exitCode}, signal ${signal}`);
             
             // --- SỬA LỖI EIO LOGIC ---
             const success = exitCode === 0;
             const status = success ? 'Completed-Success' : 'Completed-Failure';
             const completed_at = new Date().toISOString();
             
             if (!success && !accumulatedLog.includes('Execution failed')) {
                accumulatedLog += `\nExecution failed with exit code ${exitCode}.`;
             }
             if (!success && ptyError && !accumulatedLog.includes(ptyError.message)) {
                 accumulatedLog += `\nPty Error: ${ptyError.message} (Code: ${ptyError.code})`;
             }

             // Cập nhật lần cuối vào bộ nhớ
             if (currentExecInfo.logs) currentExecInfo.logs[step.id] = accumulatedLog;

             const endPayload = { drill_id: drillId, step_id: step.id, status, completed_at, result_text: accumulatedLog };

             try {
                 const endQuery = `UPDATE execution_steps SET status = $1, completed_at = $2, result_text = $3 WHERE drill_id = $4 AND step_id = $5 RETURNING *;`;
                 const endDbRes = await query(endQuery, [endPayload.status, endPayload.completed_at, endPayload.result_text, endPayload.drill_id, endPayload.step_id]);
                 sendWsMessage(drillId, { type: 'STEP_UPDATE', payload: endDbRes.rows[0] });
             } catch (dbError) {
                 console.error(`[Execution ${drillId}]: DB Error updating completed step ${step.id}:`, dbError);
             }

             currentExecInfo.running.delete(step.id);

             if (success) {
                 // Tìm bước tiếp theo trong cùng scenario queue
                 const nextSteps = findNextSteps(drillId, scenarioId, step.id);
                 if (nextSteps.length > 0) {
                     currentExecInfo.currentQueue.push(...nextSteps);
                 }
                 resolve(true);
             } else {
                 const errorMessage = `Execution failed with exit code ${exitCode}. Check logs. ${ptyError ? `(Pty Error: ${ptyError.message})`: ''}`;
                 sendWsMessage(drillId, { type: 'EXECUTION_PAUSED_ON_FAILURE', payload: { step_id: step.id, error: errorMessage, exitCode: exitCode, ptyErrorCode: ptyError?.code } });
                 currentExecInfo.failed = true;
                 resolve(false); 
             }
         });

         ptyProcess.on('error', async (err) => {
             console.error(`[Execution ${drillId}]: Pty process error for step ${step.id} (Command: '${command}'):`, err);
             ptyError = err;

             // --- FIX QUAN TRỌNG: Xử lý lỗi EIO ---
             // EIO (Input/output error) thường xảy ra khi process con đóng pipe trước khi node đọc xong.
             // Nếu lỗi là EIO, ta KHÔNG fail ngay lập tức mà đợi onExit quyết định dựa trên exitCode.
             if (err.code === 'EIO') {
                 console.warn(`[Execution ${drillId}]: Captured EIO error for step ${step.id}. Waiting for exit code or timeout.`);
                 return; 
             }

             if (exitHandled) return;
             exitHandled = true;
             clearTimeout(errorTimeout);
             if (logSaveInterval) clearInterval(logSaveInterval);

             const currentExecInfo = activeExecutions.get(execKey); 
             accumulatedLog += `\nCritical Internal Execution Error: ${err.message} (Code: ${err.code}, Syscall: ${err.syscall})`;
             const status = 'Completed-Failure';
             const completed_at = new Date().toISOString();
             
             const endPayload = { drill_id: drillId, step_id: step.id, status, completed_at, result_text: accumulatedLog };
             try {
                 const endQuery = `UPDATE execution_steps SET status = $1, completed_at = $2, result_text = $3 WHERE drill_id = $4 AND step_id = $5 RETURNING *;`;
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
        });

         errorTimeout = setTimeout(() => {
             if (exitHandled) return;
             exitHandled = true;
             if (logSaveInterval) clearInterval(logSaveInterval);

             const currentExecInfo = activeExecutions.get(execKey);
             const errorMessage = ptyError 
                ? `Step ${step.id} timed out after error warning: ${ptyError.message}` 
                : `Step ${step.id} timed out after ${timeout_ms / 1000}s without exiting.`;
             console.warn(`[Execution ${drillId}]: ${errorMessage}`);

             accumulatedLog += `\nError: ${errorMessage}`;
             const status = 'Completed-Failure';
             const completed_at = new Date().toISOString();
             const endPayload = { drill_id: drillId, step_id: step.id, status, completed_at, result_text: accumulatedLog };
             
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
         }, timeout_ms);
     });
}

// --- THAY ĐỔI: Nhận scenarioId ---
async function processExecutionQueue(drillId, scenarioId) {
    const execKey = getExecKey(drillId, scenarioId);
    const execInfo = activeExecutions.get(execKey);
    
    if (!execInfo) {
        // console.log(`[Execution ${drillId}]: Execution stopped or context removed for scenario ${scenarioId}.`);
        return;
    }
    if (execInfo.failed) {
        // console.log(`[Execution ${drillId}]: Execution paused due to previous error. Halting queue processing.`);
        return;
    }

    if (execInfo.currentQueue.length === 0) {
        if(execInfo.running.size === 0 && !execInfo.failed) {
            console.log(`[Execution ${drillId} - Scen ${scenarioId}]: Queue empty and no steps running. Execution complete.`);
            
            // Chỉ xóa execution của scenario này
            sendWsMessage(drillId, { type: 'EXECUTION_COMPLETE', payload: { scenario_id: scenarioId } });
            activeExecutions.delete(execKey);
        } else if (execInfo.running.size > 0) {
             // console.log(`[Execution ${drillId}]: Queue empty but ${execInfo.running.size} steps still running.`);
        }
        return;
    }

    const stepsToRun = [...execInfo.currentQueue];
    execInfo.currentQueue = [];

    // Gửi kèm scenario_id trong payload để Frontend lọc
    sendWsMessage(drillId, { type: 'LEVEL_START', payload: { step_ids: stepsToRun.map(s => s.id), scenario_id: scenarioId } });

    try {
        // Truyền scenarioId vào executeStep
        await Promise.all(stepsToRun.map(step => executeStep(drillId, scenarioId, step)));

        const currentExecInfo = activeExecutions.get(execKey);
        if (currentExecInfo && !currentExecInfo.failed) {
            if (currentExecInfo.currentQueue.length === 0 && currentExecInfo.running.size === 0) {
                processExecutionQueue(drillId, scenarioId);
            } else if (currentExecInfo.currentQueue.length > 0) {
                processExecutionQueue(drillId, scenarioId);
            }
        } else if (currentExecInfo && currentExecInfo.failed) {
            console.log(`[Execution ${drillId}]: Execution paused after processing level due to failure.`);
        } else {
             // console.log(`[Execution ${drillId}]: Execution stopped externally after processing level.`);
        }
    } catch (error) {
        console.error(`[Execution ${drillId}]: Error processing execution level:`, error.message || error);
        const currentExecInfo = activeExecutions.get(execKey);
        if (currentExecInfo) {
             currentExecInfo.failed = true;
             console.log(`[Execution ${drillId}]: Marked execution as failed.`);
        }
    }
}

// --- THAY ĐỔI 5: Logic startOrResumeExecution cho song song ---
async function startOrResumeExecution(drillId, stepsToRunIds, scenarioId) {
    try {
        if (!scenarioId) {
             const scenarioIdRes = await query('SELECT scenario_id FROM steps WHERE id = $1', [stepsToRunIds[0]]);
             if (scenarioIdRes.rows.length === 0) throw new Error(`Scenario not found for step ${stepsToRunIds[0]}`);
             scenarioId = scenarioIdRes.rows[0].scenario_id;
        }

        // Key duy nhất cho kịch bản này
        const execKey = getExecKey(drillId, scenarioId);
        const existingExec = activeExecutions.get(execKey);

        // Chỉ chặn nếu CHÍNH KỊCH BẢN NÀY đang chạy. Các kịch bản khác thoải mái.
        if (existingExec && !existingExec.failed) {
             console.warn(`[Execution ${drillId}]: Attempted to start Scenario ${scenarioId} while already active. Rejecting request.`);
             throw new Error("EXECUTION_ALREADY_ACTIVE"); 
        }

        const stepsRes = await query(`SELECT s.*, ms.ip_address FROM steps s LEFT JOIN managed_servers ms ON s.server_id = ms.id WHERE s.scenario_id = $1 ORDER BY s.step_order`, [scenarioId]);
        const allStepsInScenario = stepsRes.rows;
        const allStepIds = allStepsInScenario.map(s => s.id);
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

        const executionStepsStatusRes = await query('SELECT step_id, status from execution_steps where drill_id = $1 AND step_id = ANY($2::text[])', [drillId, allStepIds]);
        const currentStepStatuses = executionStepsStatusRes.rows.reduce((acc, row) => {
             acc[row.step_id] = row.status;
             return acc;
        }, {});

        allStepsInScenario.forEach(s => {
            if (stepsToRunIds.includes(s.id)) {
                dependencies.forEach(dep => {
                    if (dep.step_id === s.id && !stepsToRunIds.includes(dep.depends_on_step_id)) {
                         const depStatus = currentStepStatuses[dep.depends_on_step_id];
                         if (depStatus === 'Completed-Success' || depStatus === 'Completed-Skipped') {
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
             console.log(`[Execution ${drillId}]: Resuming/Retrying Scenario ${scenarioId}.`);
             existingExec.currentQueue = initialQueue;
             existingExec.failed = false;
             existingExec.inDegree = { ...originalInDegree };
             
             allStepsInScenario.forEach(s => {
                if(activeExecutions.get(execKey)?.inDegree[s.id] > 0) {
                     dependencies.forEach(dep => {
                        const depStatus = currentStepStatuses[dep.depends_on_step_id];
                        if (dep.step_id === s.id && !stepsToRunIds.includes(dep.depends_on_step_id) && (depStatus === 'Completed-Success' || depStatus === 'Completed-Skipped')) {
                            activeExecutions.get(execKey).inDegree[s.id]--;
                        }
                    });
                }
             });
         } else {
             // Tạo context mới cho kịch bản này
             activeExecutions.set(execKey, {
                 steps: allStepsInScenario,
                 adj: adj,
                 inDegree: { ...originalInDegree },
                 currentQueue: initialQueue,
                 running: new Set(),
                 failed: false,
                 scenarioId: scenarioId, // Lưu scenarioId vào context
                 logs: {} // Init logs
             });
         }

        console.log(`[Execution ${drillId}]: Starting Scenario ${scenarioId}. Initial queue:`, initialQueue.map(s => s.id));
        processExecutionQueue(drillId, scenarioId);

    } catch (err) {
         console.error(`[Execution ${drillId}]: Error preparing execution:`, err);
         if (err.message === "EXECUTION_ALREADY_ACTIVE") throw err;

         sendWsMessage(drillId, { type: 'EXECUTION_ERROR', payload: { error: `Failed to prepare execution: ${err.message}` } });
         // Xóa đúng context của kịch bản này nếu lỗi
         if (scenarioId) activeExecutions.delete(getExecKey(drillId, scenarioId));
         throw err; // Ném lỗi ra để API trả về 500
    }
}

// Helper để tìm context đang chứa bước này
function findExecutionKeyByStepId(drillId, stepId) {
    for (const [key, execInfo] of activeExecutions.entries()) {
        // Kiểm tra xem key có thuộc drill này không
        if (key.startsWith(`${drillId}_`)) {
            // Kiểm tra xem bước này có trong danh sách steps của context không
            if (execInfo.steps.some(s => s.id === stepId)) {
                return { key, execInfo };
            }
        }
    }
    return null;
}

async function manuallyCompleteStep(drillId, stepId, newStatus, reason) {
    console.log(`[Execution ${drillId}]: Manually overriding step ${stepId} to ${newStatus}. Reason: ${reason}`);
    
    const completed_at = new Date().toISOString();
    
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

    sendWsMessage(drillId, { type: 'STEP_UPDATE', payload: updatedStep });

    // TÌM ĐÚNG CONTEXT (QUEUE) ĐANG CHỨA BƯỚC NÀY
    const found = findExecutionKeyByStepId(drillId, stepId);

    if (found) {
        const { key, execInfo } = found;
        const scenarioId = execInfo.scenarioId;

        execInfo.running.delete(stepId);
        if (newStatus === 'Completed-Success' || newStatus === 'Completed-Skipped') {
            if (execInfo.failed) {
                console.log(`[Execution ${drillId} - Scen ${scenarioId}]: Resetting failed flag due to manual override.`);
                execInfo.failed = false;
            }
            const nextSteps = findNextSteps(drillId, scenarioId, stepId);
            if (nextSteps.length > 0) {
                execInfo.currentQueue.push(...nextSteps);
            }
            // Chạy tiếp queue của đúng kịch bản đó
            processExecutionQueue(drillId, scenarioId);
        } else if (newStatus === 'Completed-Failure') {
            execInfo.failed = true;
            sendWsMessage(drillId, { type: 'EXECUTION_PAUSED_ON_FAILURE', payload: { step_id: stepId, error: reason, manualOverride: true } });
        }
    }
    return updatedStep;
}

async function updateManualStep(body) {
    const { drill_id, step_id, status, started_at, completed_at, result_text, assignee } = body;
    
    console.log(`[Execution Logic] Cập nhật bước ${step_id} cho drill ${drill_id} với trạng thái ${status}`);

    if (!drill_id || !step_id || !status) {
        throw new Error('Yêu cầu thiếu drill_id, step_id, hoặc status.');
    }
    
    const checkQuery = 'SELECT * FROM execution_steps WHERE drill_id = $1 AND step_id = $2';
    const checkRes = await query(checkQuery, [drill_id, step_id]);
    
    let updatedStep;

    if (checkRes.rows.length > 0) {
        const existing = checkRes.rows[0];
        const newStatus = status;
        const newStartedAt = started_at || existing.started_at;
        const newCompletedAt = (status === 'InProgress') ? null : (completed_at || existing.completed_at);
        const newResultText = (status === 'InProgress') ? null : (result_text !== undefined ? result_text : existing.result_text);
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
        const insertQuery = `
            INSERT INTO execution_steps (drill_id, step_id, status, started_at, completed_at, result_text, assignee)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *;
        `;
        const insertRes = await query(insertQuery, [drill_id, step_id, status, started_at, completed_at, result_text, assignee]);
        updatedStep = insertRes.rows[0];
        console.log(`[Execution Logic] Đã CHÈN MỚI bước ${step_id}`);
    }

    sendWsMessage(drill_id, {
        type: 'STEP_UPDATE',
        payload: updatedStep
    });

    return updatedStep;
}

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

    sendWsMessage(drill_id, {
        type: 'SCENARIO_UPDATE',
        payload: {
            ...updatedScenarioExec,
            id: updatedScenarioExec.scenario_id,
            type: 'scenario'
        }
    });

    return updatedScenarioExec;
}

async function evaluateCheckpointCriterion(body) {
    const { drill_id, criterion_id, status, checked_by } = body;

    if (!drill_id || !criterion_id || !status || !checked_by) {
        throw new Error('Yêu cầu thiếu drill_id, criterion_id, status, hoặc checked_by.');
    }

    console.log(`[Execution Logic] Đánh giá tiêu chí ${criterion_id} cho drill ${drill_id} là ${status}`);

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

    sendWsMessage(drill_id, {
        type: 'CRITERION_UPDATE',
        payload: updatedCriterion
    });

    return updatedCriterion;
}

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
    evaluateCheckpointCriterion,
    getLiveLogs // Export thêm hàm này
};