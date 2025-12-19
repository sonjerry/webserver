const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');
const instructorController = require('../controllers/instructorController');
const studentController = require('../controllers/studentController');
const uploadMiddleware = require('../middlewares/uploadMiddleware');

// GET /sessions/course/:courseId (기존 경로 - 호환용)
router.get('/course/:courseId', authenticateToken, async (req, res) => {
  const { courseId } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT 
         id,
         course_id,
         week_number,
         DATE_FORMAT(session_date, '%Y-%m-%d') AS session_date,
         start_time,
         end_time,
         attendance_method,
         auth_code,
         is_open,
         created_at
       FROM ClassSessions 
       WHERE course_id = ?
       ORDER BY week_number ASC, session_date ASC`,
      [courseId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '수업 세션 조회 중 오류가 발생했습니다.' });
  }
});

// POST /sessions/course/:courseId (담당교원용 세션 생성 - 기존 경로)
router.post('/course/:courseId', authenticateToken, authorizeRoles('INSTRUCTOR'), (req, res, next) => {
  // body에 course_id가 없으면 path 파라미터를 사용
  if (!req.body.course_id) {
    req.body.course_id = req.params.courseId;
  }
  return instructorController.createSession(req, res, next);
});

// GET /sessions/:id (세션 정보 조회)
router.get('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT 
         cs.id,
         cs.course_id,
         cs.week_number,
         DATE_FORMAT(cs.session_date, '%Y-%m-%d') AS session_date,
         cs.start_time,
         cs.end_time,
         cs.attendance_method,
         cs.auth_code,
         cs.is_open,
         cs.created_at,
         c.title as course_title 
       FROM ClassSessions cs
       JOIN Courses c ON cs.course_id = c.id
       WHERE cs.id = ?`,
      [id]
    );
    if (!rows[0]) {
      return res.status(404).json({ message: '세션을 찾을 수 없습니다.' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '세션 조회 중 오류가 발생했습니다.' });
  }
});

// POST /sessions/:id/open|pause|close
router.post('/:id/open', authenticateToken, authorizeRoles('INSTRUCTOR'), instructorController.openAttendance);
router.post('/:id/pause', authenticateToken, authorizeRoles('INSTRUCTOR'), instructorController.pauseAttendance);
router.post('/:id/close', authenticateToken, authorizeRoles('INSTRUCTOR'), instructorController.closeAttendance);

// ---------------------------------------------------------------------------
// 스펙 호환용 세부 엔드포인트 alias
// ---------------------------------------------------------------------------

// POST /sessions/:id/attend  -> 기존 studentController.attendSession 재사용
router.post('/:id/attend', authenticateToken, (req, res, next) => {
  req.params.sessionId = req.params.id;
  return studentController.attendSession(req, res, next);
});

// GET /sessions/:id/attendance/summary -> 기존 getAttendanceSummary 재사용
router.get('/:id/attendance/summary', authenticateToken, authorizeRoles('INSTRUCTOR'), (req, res, next) => {
  req.params.sessionId = req.params.id;
  return instructorController.getAttendanceSummary(req, res, next);
});

// POST /sessions/:id/excuses -> 기존 createExcuseRequest 재사용
router.post('/:id/excuses', authenticateToken, authorizeRoles('STUDENT'), uploadMiddleware, (req, res, next) => {
  req.params.sessionId = req.params.id;
  return studentController.createExcuseRequest(req, res, next);
});

module.exports = router;


