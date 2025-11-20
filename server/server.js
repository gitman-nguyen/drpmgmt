// File path: /server.js
// Nhiệm vụ: Khởi động Server, Middleware, Static files, và gọi DB/WS.
const express = require('express');
const cors = require('cors');
const path = require('path');
// const http = require('http'); // Không cần http nữa
const https = require('https'); // Thêm module https
const fs = require('fs'); // Thêm module fs để đọc file cert
const session = require('express-session');

// Import các module đã tách
const { initializeDb } = require('./db'); // (Từ file ./db.js)
const { initializeWebSocket } = require('./websocket'); // (Từ file ./websocket.js)
const mainApiRouter = require('./api'); // (Trỏ đến ./api.js)

// --- START: SỬA LỖI ---
// Import authMiddleware mà bạn đã cung cấp
const { authMiddleware } = require('./authMiddleware');
// --- END: SỬA LỖI ---

const app = express();

// --- Cấu hình Middleware ---
app.use(cors({
    origin: 'https://localhost', // Chỉ cho phép origin này
    credentials: true // CHO PHÉP GỬI COOKIE
}));
app.use(express.json({ limit: '10mb' }));

// 1. Bảo Express tin tưởng reverse proxy (như Nginx)
// Rất quan trọng khi chạy sau proxy HTTPS
app.set('trust proxy', 1); 

// --- Phục vụ Frontend (ƯU TIÊN CAO NHẤT) ---

// 1. Phục vụ tệp tĩnh (assets, static files, images, etc.)
app.use(express.static(path.join(__dirname, 'client/build')));

// --- CẤU HÌNH BẮT BUỘC HTTPS ---
// Giả định rằng nếu server chạy, nó LUÔN là HTTPS (production)
const isProd = true; 
console.log(`[Session Config] Đang cấu hình cho HTTPS (secure: true, sameSite: 'none')`);

app.use(session({
    secret: 'my-very-secret-key-for-dr-drill-app', // <-- Thay bằng key bí mật của bạn
    resave: false,
    saveUninitialized: false, // Chỉ lưu session khi đăng nhập
    cookie: { 
        secure: isProd, // Luôn là 'true'
        httpOnly: true, // Ngăn client JS truy cập cookie
        maxAge: (1000 * 60 * 60 * 24), // 1 ngày
        sameSite: isProd ? 'none' : 'lax' // Luôn là 'none'
    }
}));

// --- START: DEBUG MIDDLEWARE (MỚI THÊM) ---
// Middleware này phải được đặt SAU session() và TRƯỚC app.use('/api', ...)
app.use((req, res, next) => {
    // Chỉ log các request API, bỏ qua file tĩnh (.js, .css)
    if (req.path.startsWith('/api')) {
        console.log('--- [DEBUG MIDDLEWARE] ---');
        console.log(`[${req.method}] ${req.path}`);
        
        // 1. Kiểm tra header 'cookie' thô mà trình duyệt gửi lên
        //    Nếu cái này là 'undefined', trình duyệt đã không gửi cookie.
        console.log('Headers (Raw Cookie):', req.headers['cookie']);
        
        // 2. Kiểm tra session mà express-session đã phân tích
        //    (Nếu (1) 'undefined' thì cái này cũng sẽ rỗng)
        console.log('req.session (Parsed):', req.session);
        
        // 3. Kiểm tra req.user (mà API của bạn đang kiểm tra)
        //    (req.user thường được_gán_ BỞI một middleware xác thực,
        //     nó không tự có từ express-session)
        
        // SỬA LỖI: Đã di chuyển logic gán req.user vào authMiddleware
        // console.log('req.user (Expected by API):', req.user); // Sẽ là undefined ở đây

        // 4. Kiểm tra xem session có chứa thông tin user không
        //    (Có thể logic login của bạn đang lưu vào đây)
        console.log('req.session.user (From Login):', req.session ? req.session.user : 'No session');
        console.log('--------------------------');
    }
    next(); // Quan trọng: Chuyển tiếp request
});
// --- END: DEBUG MIDDLEWARE ---


// --- START: SỬA LỖI 401 (ĐÃ XÓA BỎ) ---
// Đã xóa bỏ đoạn middleware "cầu nối" (inline) không an toàn (non-blocking)
// vì chúng ta sẽ sử dụng authMiddleware thật.
// --- END: SỬA LỖI 401 ---


// --- API Routing ---

// --- START: SỬA LỖI (Exception cho Public Dashboard) ---
// Tạo một middleware "chọn lọc"
const selectiveAuth = (req, res, next) => {
    // req.path ở đây sẽ là phần sau /api (ví dụ: /data/public/drills)
    
    // 1. Kiểm tra nếu đây là route public HOẶC route login
    if (req.path.startsWith('/data/public/') || req.path === '/config/login') {
        // Bỏ qua authMiddleware và đi thẳng tới mainApiRouter
        console.log(`[SelectiveAuth] Bỏ qua xác thực cho: ${req.path}`);
        return next(); 
    }
    
    // 2. Đối với mọi route API khác, chạy authMiddleware
    console.log(`[SelectiveAuth] Yêu cầu xác thực cho: ${req.path}`);
    return authMiddleware(req, res, next);
};

// 2. Áp dụng middleware chọn lọc cho tất cả các route /api
// Giờ đây, selectiveAuth sẽ quyết định khi nào chạy authMiddleware
app.use('/api', selectiveAuth, mainApiRouter);
// --- END: SỬA LỖI ---

// 3. Xử lý lỗi 404 của API (ĐẶT SAU API)
app.get('/api/*', (req, res) => {
    res.status(404).json({ error: 'API route not found' });
});


// --- Phục vụ React App (CUỐI CÙNG) ---
// 4. Phục vụ 'index.html' cho BẤT KỲ route nào CÒN LẠI
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});


// --- Khởi tạo Server (CHỈ HTTPS) ---

let credentials;
try {
    // Đảm bảo file key và crt nằm cùng cấp với server.js
    const privateKey = fs.readFileSync('private.key', 'utf8');
    const certificate = fs.readFileSync('fullchain.crt', 'utf8');
    credentials = { key: privateKey, cert: certificate };
    console.log("Đã tải file SSL 'private.key' và 'fullchain.crt' thành công.");
} catch (err) {
    console.error("LỖI NGHIÊM TRỌNG: Không đọc được file SSL 'private.key' và 'fullchain.crt'.", err);
    console.error("Server không thể khởi động ở chế độ HTTPS. Vui lòng kiểm tra lại đường dẫn và quyền đọc file.");
    process.exit(1); // Thoát server nếu không có cert
}

// --- Chế độ PROD (HTTPS) ---
const httpsPort = 443;
const httpsServer = https.createServer(credentials, app);

// Khởi tạo DB
initializeDb();

// Gắn WebSocket server vào HTTPS server
initializeWebSocket(httpsServer);

httpsServer.listen(httpsPort, () => {
    console.log(`Máy chủ HTTPS (Frontend + API) đang chạy trên https://localhost:${httpsPort}`);
});

// --- ĐÃ XÓA SERVER CHUYỂN HƯỚNG HTTP (CỔNG 80) ---
// (Server giờ sẽ chỉ chạy trên cổng 443)