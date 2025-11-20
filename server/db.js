// File path: /db.js
// Nhiệm vụ: Khởi tạo và quản lý Database Pool.
const { Pool } = require('pg');

let pool;

const initializeDb = () => {
    if (pool) {
        console.log("Database pool đã được khởi tạo.");
        return;
    }
    
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });
    
    pool.on('connect', () => {
        console.log('Đã kết nối Database pool.');
    });

    pool.on('error', (err) => {
        console.error('Lỗi Database pool:', err);
    });

    console.log("Khởi tạo Database pool thành công.");
};

// Hàm query để thay thế việc dùng pool trực tiếp
const query = (text, params) => {
    if (!pool) {
        console.error("Lỗi: Database pool chưa được khởi tạo. Hãy gọi initializeDb() trước.");
        // Ghi log chi tiết lỗi thay vì throw, để client nhận lỗi 500
        return Promise.reject(new Error("Database pool not initialized."));
    }
    return pool.query(text, params);
};

// Hàm connect để sử dụng transaction
const getClient = () => {
    if (!pool) {
        console.error("Lỗi: Database pool chưa được khởi tạo.");
        return Promise.reject(new Error("Database pool not initialized."));
    }
    return pool.connect();
};

module.exports = {
    initializeDb,
    query, // <- Sửa: Chỉ export hàm này
    getClient, // <- Sửa: Chỉ export hàm này
    // KHÔNG export 'pool' trực tiếp
};