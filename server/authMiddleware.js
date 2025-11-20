// File: authMiddleware.js
function authMiddleware(req, res, next) {
    if (req.session && req.session.user) {
        // Gán thông tin user từ session vào req.user
        // để các API controller khác có thể sử dụng
        req.user = req.session.user;
        next();
    } else {
        // Nếu không có session, trả về lỗi 401
        console.warn(`[AuthMiddleware] Unauthorized access blocked for: ${req.method} ${req.originalUrl}`);
        res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }
}

module.exports = { authMiddleware };
