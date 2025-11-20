// File path: /websocket.js
// Nhiệm vụ: Quản lý toàn bộ logic WebSocket (Upgrade, Connection, PTY, Gửi/Nhận message)
const { WebSocketServer } = require('ws');
const pty = require('node-pty');
const url = require('url');
const { query } = require('./db');
const { executionClients, activeExecutions, sendWsMessage, startOrResumeExecution, findNextSteps, processExecutionQueue } = require('./execution');
// --- START: SỬA LỖI (NGẮT PHIÊN) ---
// Import thêm 'cleanupTestRun' từ 'testRun'
const { testRunClients, activeTestRuns, sendTestRunWsMessage, cleanupTestRun } = require('./testRun');
// --- END: SỬA LỖI (NGẮT PHIÊN) ---

function initializeWebSocket(server) {
    const wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
        const location = url.parse(request.url);
        const pathParts = (location.pathname || '').split('/').filter(p => p);

        // Logic này ĐÃ ĐÚNG (khớp với frontend /ws/execution/...)
        if (pathParts[0] === 'ws' && pathParts[1] === 'execution' && pathParts[2]) {
            // /ws/execution/:drillId
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request, location);
            });
        } 
        else if (pathParts[0] === 'ws' && pathParts[1] === 'servers' && pathParts[2] && pathParts[3] === 'shell') {
            // /ws/servers/:serverId/shell
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request, location);
            });
        } 
        else if (pathParts[0] === 'ws' && pathParts[1] === 'scenario_test' && pathParts[2]) {
            // /ws/scenario_test/:scenarioId
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request, location);
            });
        } 
        else {
            console.log(`[WSS Upgrade]: Path không hợp lệ. Hủy socket. Path: ${location.pathname}`);
            socket.destroy();
        }
    });

    wss.on('connection', async (ws, req, location) => {
        const pathParts = (location.pathname || '').split('/').filter(p => p);

        try {
            // --- SỬA LỖI MẤU CHỐT: Sửa logic 'on connection' để khớp với 'on upgrade' ---

            // --- Handler cho Automation Execution ---
            // pathParts[0] === 'ws', pathParts[1] === 'execution', pathParts[2] === drillId
            if (pathParts[0] === 'ws' && pathParts[1] === 'execution' && pathParts[2]) {
                const drillId = pathParts[2]; // Index 2 là drillId
                console.log(`Execution WebSocket client connected for drill: ${drillId}`);
                if (!executionClients.has(drillId)) {
                    executionClients.set(drillId, new Set());
                }
                executionClients.get(drillId).add(ws);

                ws.on('message', async (message) => {
                    console.log(`Received execution message from ${drillId}: ${message}`);
                    try {
                        const parsedMessage = JSON.parse(message);
                        const stepId = parsedMessage.payload?.step_id;
                        const scenarioId = parsedMessage.payload?.scenario_id;

                         if (parsedMessage.type === 'RETRY_STEP' && stepId && scenarioId) {
                             console.log(`[Execution ${drillId}]: RETRY requested for step: ${stepId}`);
                             const execInfo = activeExecutions.get(drillId);
                             if (!execInfo || !execInfo.failed) {
                                  console.warn(`[Execution ${drillId}]: Cannot retry step ${stepId}. No failed execution found or execution still running.`);
                                  return;
                             }
                             await query("UPDATE execution_steps SET status = 'Pending', started_at = NULL, completed_at = NULL, result_text = NULL WHERE drill_id = $1 AND step_id = $2", [drillId, stepId]);
                             sendWsMessage(drillId, { type: 'STEP_UPDATE', payload: { drill_id: drillId, step_id: stepId, status: 'Pending', result_text: null } });
                             startOrResumeExecution(drillId, [stepId], scenarioId);

                        } else if (parsedMessage.type === 'SKIP_STEP' && stepId) {
                             console.log(`[Execution ${drillId}]: SKIP requested for step: ${stepId}`);
                             const execInfo = activeExecutions.get(drillId);
                             if (execInfo && execInfo.failed) {
                                const skipPayload = { drill_id: drillId, step_id: stepId, status: 'Completed-Skipped', completed_at: new Date().toISOString(), result_text: 'Skipped by user.'};
                                try {
                                   const skipRes = await query('UPDATE execution_steps SET status=$1, completed_at=$2, result_text=$3 WHERE drill_id=$4 AND step_id=$5 RETURNING *', [skipPayload.status, skipPayload.completed_at, skipPayload.result_text, skipPayload.drill_id, skipPayload.step_id]);
                                   sendWsMessage(drillId, { type: 'STEP_UPDATE', payload: skipRes.rows[0] });
                                } catch(dbErr) {
                                   console.error(`[Execution ${drillId}]: Error marking step ${stepId} as skipped:`, dbErr);
                                }
                                 execInfo.running.delete(stepId);
                                 execInfo.failed = false; 
                                 const nextSteps = findNextSteps(drillId, stepId);
                                 if (nextSteps.length > 0) {
                                     nextSteps.forEach(nextStep => {
                                         if (!execInfo.currentQueue.some(s => s.id === nextStep.id)) {
                                             execInfo.currentQueue.push(nextStep);
                                         }
                                     });
                                     console.log(`[Execution ${drillId}]: Added next steps after skip:`, nextSteps.map(s=>s.id));
                                     processExecutionQueue(drillId);
                                 } else {
                                    console.log(`[Execution ${drillId}]: No next steps found after skipping ${stepId}. Checking completion...`);
                                    processExecutionQueue(drillId);
                                 }
                             } else {
                                 console.warn(`[Execution ${drillId}]: Cannot skip step ${stepId}, no active execution found or not in failed state.`);
                                 const skipPayload = { drill_id: drillId, step_id: stepId, status: 'Completed-Skipped', completed_at: new Date().toISOString(), result_text: 'Skipped by user (no active exec).'}
                                 try {
                                   const skipRes = await query('UPDATE execution_steps SET status=$1, completed_at=$2, result_text=$3 WHERE drill_id=$4 AND step_id=$5 RETURNING *', [skipPayload.status, skipPayload.completed_at, skipPayload.result_text, skipPayload.drill_id, skipPayload.step_id]);
                                   sendWsMessage(drillId, { type: 'STEP_UPDATE', payload: skipRes.rows[0] });
                                 } catch(dbErr) { console.error(`[Execution ${drillId}]: Error marking step ${stepId} as skipped (no active exec):`, dbErr); }
                             }
                        }
                    } catch (e) {
                        console.error(`[Execution ${drillId}]: Error parsing message or unknown message type:`, e);
                    }
                });

                ws.on('close', () => {
                    console.log(`Execution WebSocket client disconnected for drill: ${drillId}`);
                    const clients = executionClients.get(drillId);
                    if (clients) {
                        clients.delete(ws);
                        if (clients.size === 0) executionClients.delete(drillId);
                    }
                });
                ws.on('error', (error) => {
                     console.error(`Execution WebSocket error for drill ${drillId}:`, error);
                });

            // --- Handler cho Scenario Test Run ---
            // pathParts[0] === 'ws', pathParts[1] === 'scenario_test', pathParts[2] === scenarioId
            } else if (pathParts[0] === 'ws' && pathParts[1] === 'scenario_test' && pathParts[2]) {
                const scenarioId = pathParts[2]; // Index 2 là scenarioId
                console.log(`Test Run WebSocket client connected for scenario: ${scenarioId}`);
                if (!testRunClients.has(scenarioId)) {
                    testRunClients.set(scenarioId, new Set());
                }
                testRunClients.get(scenarioId).add(ws);

                if (activeTestRuns.has(scenarioId)) {
                    sendTestRunWsMessage(scenarioId, '\x1b[33m*** Đã tham gia vào phiên chạy thử đang diễn ra... ***\x1b[0m');
                } else {
                    sendTestRunWsMessage(scenarioId, '\x1b[33m*** Đã kết nối. Sẵn sàng nhận lệnh chạy thử từ API. ***\x1b[0m');
                }

                // --- START: SỬA LỖI (NGẮT PHIÊN) ---
                // Thay thế `ws.on('message')` cũ bằng logic xử lý 'ABORT_RUN'
                ws.on('message', (message) => {
                    try {
                        const parsed = JSON.parse(message);
                        if (parsed.type === 'ABORT_RUN') {
                            console.log(`[Test Run ${scenarioId}]: Nhận được tín hiệu ABORT_RUN từ client.`);
                            const runData = activeTestRuns.get(scenarioId);
                            if (runData) {
                                // 1. Giết tiến trình SSH (nếu đang chạy)
                                if (runData.childProcess) {
                                    console.log(`[Test Run ${scenarioId}]: Đang dừng tiến trình SSH (PID: ${runData.childProcess.pid}).`);
                                    runData.childProcess.kill('SIGKILL');
                                    runData.childProcess = null;
                                }
                                // 2. Gọi dọn dẹp ngay lập tức
                                cleanupTestRun(
                                    scenarioId,
                                    'TEST_RUN_ABORTED', // Tin nhắn control mới
                                    '\n\x1b[1m\x1b[31m*** PHIÊN CHẠY BỊ NGẮT BỞI NGƯỜI DÙNG ***\x1b[0m'
                                );
                            }
                        }
                    } catch (e) {
                        console.error(`[Test Run ${scenarioId}]: Lỗi xử lý message:`, e);
                    }
                });
                // --- END: SỬA LỖI (NGẮT PHIÊN) ---

                ws.on('close', () => {
                    console.log(`Test Run WebSocket client disconnected for scenario: ${scenarioId}`);
                    const clients = testRunClients.get(scenarioId);
                    if (clients) {
                        clients.delete(ws);
                        if (clients.size === 0) testRunClients.delete(scenarioId);
                    }
                });
                ws.on('error', (error) => {
                     console.error(`Test Run WebSocket error for scenario ${scenarioId}:`, error);
                });

            // --- Handler cho Remote Shell ---
            // pathParts[0] === 'ws', pathParts[1] === 'servers', pathParts[2] === serverId
            } else if (pathParts[0] === 'ws' && pathParts[1] === 'servers' && pathParts[2] && pathParts[3] === 'shell') {
                const serverId = pathParts[2]; // Index 2 là serverId
                console.log(`Shell WebSocket client connected for server: ${serverId}`);
                
                const serverRes = await query('SELECT ip_address, ssh_user FROM managed_servers WHERE id = $1', [serverId]);
                if (serverRes.rows.length === 0) {
                    ws.send('\r\n\x1b[31mError: Server không tồn tại trong database.\x1b[0m');
                    ws.close();
                    return;
                }
                const { ip_address, ssh_user } = serverRes.rows[0];
                const ptyProcess = pty.spawn('ssh', [`${ssh_user}@${ip_address}`, '-o', 'StrictHostKeyChecking=no', '-o', 'KexAlgorithms=+diffie-hellman-group1-sha1'], { name: 'xterm-256color', cols: 80, rows: 30, cwd: process.env.HOME, env: process.env });

                ptyProcess.onData(data => {
                    if (ws.readyState === 1) { ws.send(data); }
                });

                ws.on('message', (message) => {
                    try {
                        const msg = JSON.parse(message);
                        if (msg.type === 'input') { ptyProcess.write(msg.data); }
                        else if (msg.type === 'resize' && msg.cols && msg.rows) { ptyProcess.resize(msg.cols, msg.rows); }
                    } catch (e) {
                        ptyProcess.write(message.toString());
                    }
                });

                ptyProcess.onExit(({ exitCode }) => {
                    if (ws.readyState === 1) { ws.close(); }
                });

                ws.on('close', () => {
                    ptyProcess.kill();
                    console.log(`Shell for server ${serverId} closed.`);
                });
                ws.on('error', (error) => {
                    console.error(`Shell WebSocket error for server ${serverId}:`, error);
                    ptyProcess.kill();
                });

            } else {
                console.log(`[WSS Connection]: Invalid path post-handshake. Closing connection. URL: ${location.pathname || '(unknown)'}`);
                ws.close();
            }
        } catch (err) {
            console.error(`[WSS Connection]: Lỗi nghiêm trọng khi xử lý kết nối:`, err);
            if (ws.readyState === 1) {
                ws.send(`\r\n\x1b[31mError: Lỗi server khi thiết lập kết nối. ${err.message}\x1b[0m`);
            }
            ws.close();
        }
    });
}

module.exports = {
    initializeWebSocket
};