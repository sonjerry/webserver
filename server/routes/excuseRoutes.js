const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');

// 학생 공결 신청은 /student/sessions/:sessionId/excuses로 이동

// GET /excuses?status=pending (교원/관리자 검토 목록)
const instructorController = require('../controllers/instructorController');
router.get('/', authenticateToken, authorizeRoles('INSTRUCTOR', 'ADMIN'), instructorController.getExcuseRequests);

// PATCH /excuses/:id (승인/반려)
router.patch('/:id', authenticateToken, authorizeRoles('INSTRUCTOR'), instructorController.updateExcuseRequest);

module.exports = router;


