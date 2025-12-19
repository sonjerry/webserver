const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticateToken } = require('../middlewares/authMiddleware');

const studentController = require('../controllers/studentController');
const instructorController = require('../controllers/instructorController');
const { authorizeRoles } = require('../middlewares/authMiddleware');
const appealController = require('../controllers/appealController');

// POST /attendance/sessions/:sessionId/attend (학생 출석 체크 - 기존 경로)
router.post('/sessions/:sessionId/attend', authenticateToken, studentController.attendSession);

// GET /attendance/sessions/:sessionId/summary (교원용 - 기존 경로)
router.get('/sessions/:sessionId/summary', authenticateToken, authorizeRoles('INSTRUCTOR'), instructorController.getAttendanceSummary);

// PATCH /attendance/:attendanceId (교원용 출석 정정)
router.patch('/:attendanceId', authenticateToken, authorizeRoles('INSTRUCTOR'), appealController.updateAttendance);

// POST /attendance/:id/appeals (스펙 호환용 이의제기 생성 alias)
router.post('/:id/appeals', authenticateToken, authorizeRoles('STUDENT'), (req, res, next) => {
  req.body.session_id = req.params.id;
  return appealController.createAppeal(req, res, next);
});

module.exports = router;


