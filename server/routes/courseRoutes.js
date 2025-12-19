const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');
const instructorController = require('../controllers/instructorController');

// GET /courses
router.get('/', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM Courses');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '강의 목록 조회 중 오류가 발생했습니다.' });
  }
});

// GET /courses/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM Courses WHERE id = ?', [req.params.id]);
    if (!rows[0]) {
      return res.status(404).json({ message: '강의를 찾을 수 없습니다.' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '강의 조회 중 오류가 발생했습니다.' });
  }
});

// GET /courses/:id/schedules
router.get('/:id/schedules', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT day_of_week, start_time, end_time FROM CourseSchedules WHERE course_id = ? ORDER BY day_of_week, start_time',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '강의 시간표 조회 중 오류가 발생했습니다.' });
  }
});

// GET /courses/:id/enrollments (수강생 목록)
router.get('/:id/enrollments', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT e.user_id, u.name, u.email 
       FROM Enrollment e 
       JOIN Users u ON e.user_id = u.id 
       WHERE e.course_id = ? AND e.role = 'STUDENT'`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '수강생 목록 조회 중 오류가 발생했습니다.' });
  }
});

// ---------------------------------------------------------------------------
// 스펙: 강의별 세션/정책/점수 관련 엔드포인트
// ---------------------------------------------------------------------------

// GET /courses/:id/sessions  (강의별 세션 목록)
router.get('/:id/sessions', authenticateToken, async (req, res) => {
  const courseId = req.params.id;
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
    res.status(500).json({ message: '강의 세션 목록 조회 중 오류가 발생했습니다.' });
  }
});

// POST /courses/:id/sessions (담당교원용 세션 생성)
router.post('/:id/sessions', authenticateToken, authorizeRoles('INSTRUCTOR'), (req, res, next) => {
  if (!req.body.course_id) {
    req.body.course_id = req.params.id;
  }
  return instructorController.createSession(req, res, next);
});

// GET /courses/:id/policy
router.get('/:id/policy', authenticateToken, authorizeRoles('INSTRUCTOR', 'ADMIN'), async (req, res) => {
  const courseId = req.params.id;

  try {
    const [courses] = await pool.query('SELECT * FROM Courses WHERE id = ?', [courseId]);
    if (!courses[0]) {
      return res.status(404).json({ message: '강의를 찾을 수 없습니다.' });
    }

    const [rows] = await pool.query('SELECT * FROM CoursePolicies WHERE course_id = ?', [courseId]);

    if (!rows[0]) {
      return res.json({
        course_id: parseInt(courseId, 10),
        attendance_weight: 20,
        lateness_penalty: 50,
        absence_penalty: 100,
        description: null,
        is_default: true,
      });
    }

    res.json({
      ...rows[0],
      is_default: false,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '강의 정책 조회 중 오류가 발생했습니다.' });
  }
});

// PUT /courses/:id/policy
router.put('/:id/policy', authenticateToken, authorizeRoles('INSTRUCTOR', 'ADMIN'), async (req, res) => {
  const courseId = req.params.id;
  const {
    attendance_weight = 20,
    lateness_penalty = 50,
    absence_penalty = 100,
    description = null,
  } = req.body;

  try {
    const [courses] = await pool.query('SELECT * FROM Courses WHERE id = ?', [courseId]);
    if (!courses[0]) {
      return res.status(404).json({ message: '강의를 찾을 수 없습니다.' });
    }

    await pool.query(
      `INSERT INTO CoursePolicies (course_id, attendance_weight, lateness_penalty, absence_penalty, description)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         attendance_weight = VALUES(attendance_weight),
         lateness_penalty = VALUES(lateness_penalty),
         absence_penalty = VALUES(absence_penalty),
         description = VALUES(description)`,
      [courseId, attendance_weight, lateness_penalty, absence_penalty, description]
    );

    const [rows] = await pool.query('SELECT * FROM CoursePolicies WHERE course_id = ?', [courseId]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '강의 정책 저장 중 오류가 발생했습니다.' });
  }
});

// GET /courses/:id/score/attendance
router.get('/:id/score/attendance', authenticateToken, async (req, res) => {
  const courseId = req.params.id;
  const { student_id } = req.query;

  let targetStudentId = null;

  if (req.user.role === 'STUDENT') {
    if (student_id && parseInt(student_id, 10) !== req.user.id) {
      return res.status(403).json({ message: '다른 학생의 점수는 조회할 수 없습니다.' });
    }
    targetStudentId = req.user.id;
  } else {
    if (!student_id) {
      return res.status(400).json({ message: 'student_id가 필요합니다.' });
    }
    targetStudentId = parseInt(student_id, 10);
  }

  try {
    const [enroll] = await pool.query(
      'SELECT * FROM Enrollment WHERE course_id = ? AND user_id = ? AND role = "STUDENT"',
      [courseId, targetStudentId]
    );
    if (!enroll[0]) {
      return res.status(404).json({ message: '해당 강의의 수강생이 아닙니다.' });
    }

    const [sessions] = await pool.query(
      `SELECT cs.id
       FROM ClassSessions cs
       WHERE cs.course_id = ?`,
      [courseId]
    );

    const sessionIds = sessions.map(s => s.id);
    if (sessionIds.length === 0) {
      return res.json({
        course_id: parseInt(courseId, 10),
        student_id: targetStudentId,
        total_sessions: 0,
        present: 0,
        late: 0,
        absent: 0,
        excused: 0,
        pending: 0,
        attendance_rate: 0,
        policy: null,
        attendance_score: 0,
      });
    }

    const [attRows] = await pool.query(
      `SELECT status FROM Attendances WHERE session_id IN (?) AND student_id = ?`,
      [sessionIds, targetStudentId]
    );

    const totalSessions = sessionIds.length;
    const present = attRows.filter(r => r.status === 1).length;
    const late = attRows.filter(r => r.status === 2).length;
    const absent = attRows.filter(r => r.status === 3).length;
    const excused = attRows.filter(r => r.status === 4).length;
    const checked = attRows.length;
    const pending = totalSessions - checked;

    const attendedOrExcused = present + excused;
    const attendanceRate = totalSessions > 0 ? attendedOrExcused / totalSessions : 0;

    const [policyRows] = await pool.query('SELECT * FROM CoursePolicies WHERE course_id = ?', [courseId]);
    const policy = policyRows[0] || {
      attendance_weight: 20,
      lateness_penalty: 50,
      absence_penalty: 100,
    };

    const baseScore = 100;
    const penalty = late * policy.lateness_penalty + absent * policy.absence_penalty;
    const rawScore = Math.max(0, baseScore - penalty);

    const attendanceScore = rawScore * (policy.attendance_weight / 100.0);

    res.json({
      course_id: parseInt(courseId, 10),
      student_id: targetStudentId,
      total_sessions: totalSessions,
      present,
      late,
      absent,
      excused,
      pending,
      attendance_rate: attendanceRate,
      policy,
      attendance_score: attendanceScore,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '출결 점수 계산 중 오류가 발생했습니다.' });
  }
});

// 관리자용 강의 생성/수정/삭제는 /admin/courses로 이동

module.exports = router;


