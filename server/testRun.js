// File path: /testRun.js
// Nhiệm vụ: Chứa logic nghiệp vụ cho việc Chạy thử (Test Run)
const { query } = require('./db');
// --- SỬA LỖI EIO (TRIỆT ĐỂ): Dùng 'spawn' thay vì 'node-pty' ---
// 'spawn' sử dụng STDOUT/STDERR tiêu chuẩn, không dùng TTY ảo,
// giống hệt như cách bạn chạy SSH thủ công thành công.
const { spawn } = require('child_process');

const activeTestRuns = new Map(); // Map scenarioId -> { status: 'running', timeoutTimer: ... }
const testRunClients = new Map(); // Map scenarioId -> Set of ws clients

// Timeout tổng cho toàn bộ kịch bản (ví dụ: 15 phút)
const TEST_RUN_TOTAL_TIMEOUT_MS = 15 * 60 * 1000; 



function sendTestRunWsMessage(scenarioId, message) {
    const clients = testRunClients.get(scenarioId);
    if (clients) {
        const ansiRegex = new RegExp(
            '[\\u001B\\u009B][[\\]()#;?]?[0-9]{1,4}(?:;[0-9]{0,4})*(?:;[0-9]{0,4})*[m,K,H,f,J,s,u,A,B,C,D,G]',
            'g'
        );

        // Xóa mã ANSI, nhưng giữ lại các ký tự đặc biệt (như \n, \r)
        const cleanedMessage = String(message).replace(ansiRegex, '');

        clients.forEach(client => {
            if (client.readyState === 1) { // WebSocket.OPEN
                try {
                    client.send(JSON.stringify({ type: 'log', data: cleanedMessage }));
                } catch (err) {
                    console.error(`[Test Run ${scenarioId}]: Error sending WebSocket message:`, err);
                }
            }
        });
    }
}

/**
 * Dọn dẹp một phiên chạy thử, xóa timer, xóa active run, gửi thông báo
 * và đóng kết nối WebSocket.
 */
function cleanupTestRun(scenarioId, controlMessage, logMessage) {
    const runData = activeTestRuns.get(scenarioId);
    if (!runData) return; // Đã được dọn dẹp trước đó

    console.log(`[Test Run ${scenarioId}]: Dọn dẹp (Lý do: ${controlMessage}).`);
    
    // 1. Xóa timer timeout tổng và xóa khỏi active runs
    clearTimeout(runData.timeoutTimer);
    activeTestRuns.delete(scenarioId);

    // 2. Gửi log kết thúc (nếu có)
    if (logMessage) {
        sendTestRunWsMessage(scenarioId, logMessage);
    }

    // 3. Gửi tín hiệu control và dọn dẹp clients
    const clients = testRunClients.get(scenarioId);
    if (clients) {
        clients.forEach(client => {
            if (client.readyState === 1) {
                // Gửi tín hiệu 'COMPLETE' hoặc 'FAILED'
                client.send(JSON.stringify({ type: 'control', data: controlMessage }));
            }
        });
        
        // Đợi 5s để đảm bảo tin nhắn được gửi đi trước khi đóng hẳn
        setTimeout(() => {
            const clients = testRunClients.get(scenarioId); // Lấy lại client set
             if (clients) {
                clients.forEach(client => client.close());
                testRunClients.delete(scenarioId);
             }
        }, 5000);
    }
}


async function executeTestRunStep(scenarioId, step) {
    const { command, server_user, ip_address, timeout_seconds } = step;
    // --- SỬA ĐỔI: Lấy cấu hình timeout mặc định từ DB ---
    let defaultTimeout = 120; // Fallback an toàn cho test run
    try {
         const settingRes = await query("SELECT value FROM app_settings WHERE key = 'defaultStepTimeout'");
         if (settingRes.rows.length > 0) {
             defaultTimeout = parseInt(settingRes.rows[0].value, 10) || 120;
         }
    } catch (e) {
         console.warn(`[Test Run ${scenarioId}]: Could not fetch default timeout, using 120s.`, e);
    }

    // Logic: Ưu tiên timeout của bước, nếu không có thì dùng timeout mặc định của hệ thống
    const appliedTimeout = defaultTimeout;
    const stepTimeoutMs = appliedTimeout * 1000;

    sendTestRunWsMessage(scenarioId, `\n--- Bắt đầu bước: ${step.title} ---\n`);
    sendTestRunWsMessage(scenarioId, `[INFO] Server: ${ip_address}, User: ${server_user}, Timeout: ${appliedTimeout}s\n`);
    sendTestRunWsMessage(scenarioId, `[CMD] ${command}\n`);

    if (!command || !server_user || !ip_address) {
        const errorMsg = "[ERROR] Lỗi cấu hình: Thiếu lệnh, user hoặc IP server.\n";
        sendTestRunWsMessage(scenarioId, errorMsg);
        throw new Error("Lỗi cấu hình bước");
    }

    // --- BẮT ĐẦU THAY THẾ 'node-pty' BẰNG 'spawn' ---

    let childProcess; // Khai báo childProcess ở scope ngoài
    let stepTimeoutTimer; // Timer cho bước này

    const executionPromise = new Promise((resolve, reject) => {
        // Các tham số SSH vẫn giữ nguyên từ lần sửa trước (đã chạy thành công bước 1)
        const sshArgs = [
            '-t', // Vẫn giữ -t để buộc cấp TTY (an toàn)
            `${server_user}@${ip_address}`,
            '-o', 'StrictHostKeyChecking=no',
            '-o', 'KexAlgorithms=+diffie-hellman-group1-sha1',
            '-o', 'ConnectTimeout=10',
            command // Lệnh chạy ở cuối
        ];
        
        // Sử dụng spawn (CỦA 'child_process') thay vì pty.spawn
        childProcess = spawn('ssh', sshArgs, {
            cwd: process.env.HOME,
            env: process.env,
            shell: false // Chạy 'ssh' trực tiếp, không qua shell
        });

        // --- BẮT ĐẦU SỬA LỖI (NGẮT PHIÊN) ---
        // Lưu tiến trình (process) vào Map để có thể 'kill' từ bên ngoài
        if (activeTestRuns.has(scenarioId)) {
            const runData = activeTestRuns.get(scenarioId);
            if (runData) {
                runData.childProcess = childProcess;
            }
        }
        // --- KẾT THÚC SỬA LỖI (NGẮT PHIÊN) ---

        // Lắng nghe stream STDOUT
        childProcess.stdout.on('data', (data) => {
            sendTestRunWsMessage(scenarioId, data.toString());
        });

        // Lắng nghe stream STDERR
        childProcess.stderr.on('data', (data) => {
            // Gửi lỗi (stderr) về làm log bình thường
            sendTestRunWsMessage(scenarioId, data.toString());
        });

        // Lắng nghe lỗi của chính tiến trình 'spawn' (ví dụ: không tìm thấy lệnh 'ssh')
        childProcess.on('error', (err) => {
            console.error(`[Test Run ${scenarioId}]: Lỗi Spawn:`, err);
            let errorMsg = `\n[CRITICAL FAILED] Lỗi thực thi: ${err.message}.\n`;
            sendTestRunWsMessage(scenarioId, errorMsg);
            reject(err); // Reject bằng lỗi
        });

        // Lắng nghe sự kiện 'close' (thay cho 'onExit')
        childProcess.on('close', (code) => {
            clearTimeout(stepTimeoutTimer); // Hủy timeout của bước

            // --- BẮT ĐẦU SỬA LỖI (NGẮT PHIÊN) ---
            // Xóa tiến trình khỏi Map khi nó kết thúc
            if (activeTestRuns.has(scenarioId)) {
                const runData = activeTestRuns.get(scenarioId);
                if (runData) {
                    runData.childProcess = null;
                }
            }
            // --- KẾT THÚC SỬA LỖI (NGẮT PHIÊN) ---

            if (code === 0) {
                // Thành công
                sendTestRunWsMessage(scenarioId, `\n[SUCCESS] Bước hoàn thành (Exit Code 0).\n`);
                resolve();
            } else {
                // Thất bại
                let errorMsg = `\n[FAILED] Bước thất bại (Exit Code ${code}).\n`;
                sendTestRunWsMessage(scenarioId, errorMsg);
                reject(new Error(`Bước thất bại với exit code ${code}`));
            }
        });
    });

    // --- KẾT THÚC THAY THẾ 'node-pty' ---

    const timeoutPromise = new Promise((_, reject) => {
        stepTimeoutTimer = setTimeout(() => {
            if (childProcess) {
                childProcess.kill('SIGKILL'); // Giết tiến trình
                // --- BẮT ĐẦU SỬA LỖI (NGẮT PHIÊN) ---
                if (activeTestRuns.has(scenarioId)) {
                    const runData = activeTestRuns.get(scenarioId);
                    if (runData) {
                        runData.childProcess = null;
                    }
                }
                // --- KẾT THÚC SỬA LỖI (NGẮT PHIÊN) ---
            }
            const errorMsg = `\n[FAILED] Bước thất bại (Timeout sau ${stepTimeoutMs / 1000}s).\n`;
            sendTestRunWsMessage(scenarioId, errorMsg);
            reject(new Error(`Bước bị timeout`));
        }, stepTimeoutMs);
    });

    // Chạy đua giữa thực thi và timeout
    return Promise.race([executionPromise, timeoutPromise]);
}


async function runScenarioTest(scenarioId) {
    // 1. Set up timeout tổng
    const timeoutTimer = setTimeout(() => {
        console.warn(`[Test Run ${scenarioId}]: Đã đạt timeout tổng (${TEST_RUN_TOTAL_TIMEOUT_MS}ms). Hủy bỏ...`);
        cleanupTestRun(
            scenarioId, 
            'TEST_RUN_FAILED', // Gửi tín hiệu FAILED
            '\n\x1b[1m\x1b[31m*** CHẠY THỬ THẤT BẠI (TIMEOUT TỔNG) ***\x1b[0m'
        );
    }, TEST_RUN_TOTAL_TIMEOUT_MS);

    // 2. Đăng ký active run với timer
    activeTestRuns.set(scenarioId, { 
        status: 'running', 
        timeoutTimer,
        childProcess: null // --- SỬA LỖI (NGẮT PHIÊN): Thêm 'childProcess'
    });

    let steps = [];
    try {
        const stepsRes = await query(
            `SELECT s.*, ms.ip_address, COALESCE(s.server_user, ms.ssh_user) as server_user 
             FROM steps s
             LEFT JOIN managed_servers ms ON s.server_id = ms.id
             WHERE s.scenario_id = $1 ORDER BY s.step_order`, [scenarioId]
        );
        steps = stepsRes.rows;

        sendTestRunWsMessage(scenarioId, `\x1b[1m*** BẮT ĐẦU CHẠY THỬ (ID: ${scenarioId}) ***\x1b[0m`);
        sendTestRunWsMessage(scenarioId, `\x1b[1m*** Tổng số bước: ${steps.length} ***\x1b[0m`);

        for (const step of steps) {
            // Kiểm tra xem test có bị hủy (do timeout) giữa các bước không
            if (!activeTestRuns.has(scenarioId)) {
                sendTestRunWsMessage(scenarioId, "\x1b[33m[INFO]\x1b[0m Chạy thử đã bị hủy (do timeout hoặc ngắt kết nối).");
                throw new Error("Test run cancelled"); // Nhảy vào catch
            }
            await executeTestRunStep(scenarioId, step);
        }

        // Nếu chạy xong (không lỗi, không timeout)
        if (activeTestRuns.has(scenarioId)) {
             cleanupTestRun(
                scenarioId, 
                'TEST_RUN_COMPLETE', 
                '\n\x1b[1m\x1b[32m*** HOÀN THÀNH CHẠY THỬ ***\x1b[0m'
            );
        }

    } catch (error) {
        console.error(`[Test Run ${scenarioId}]: Thất bại:`, error.message);
        
        // Chỉ dọn dẹp nếu nó chưa bị dọn dẹp bởi timeout
        if (activeTestRuns.has(scenarioId)) {
            cleanupTestRun(
                scenarioId, 
                'TEST_RUN_FAILED', 
                '\n\x1b[1m\x1b[31m*** CHẠY THỬ THẤT BẠI (Lỗi) ***\x1b[0m'
            );
        }
    } 
}


module.exports = {
    activeTestRuns,
    testRunClients,
    sendTestRunWsMessage,
    executeTestRunStep,
    runScenarioTest,
    // Xuất khẩu hàm cleanup để có thể gọi từ bên ngoài nếu cần (ví dụ: api.js)
    cleanupTestRun 
};