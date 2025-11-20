// File path: /api.js
// Nhiệm vụ: Router API chính. Gộp 3 file controller với tiền tố rõ ràng.
const express = require('express');
const router = express.Router();

// Import 3 controllers
const dataApi = require('./api.data.controller');
const operationsApi = require('./api.operations.controller');
const configApi = require('./api.config.controller');

// Mount 3 controllers với các tiền tố riêng biệt
// Thay vì router.use('/', ...)

// 1. dataApi: Chịu trách nhiệm CUNG CẤP dữ liệu (lấy danh sách, lấy chi tiết)
// VD: GET /api/data/drills, GET /api/data/public/drills
router.use('/data', dataApi);

// 2. operationsApi: Chịu trách nhiệm THAO TÁC (tạo/sửa/xóa)
// VD: POST /api/ops/drills, PUT /api/ops/scenarios/:id
router.use('/ops', operationsApi);

// 3. configApi: Chịu trách nhiệm CẤU HÌNH (users, settings, servers)
// VD: GET /api/config/users, POST /api/config/login
router.use('/config', configApi);


// --- Health Check ---
router.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK' });
});

module.exports = router;