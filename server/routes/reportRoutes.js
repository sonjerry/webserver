const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');

// 과목/주차 출석률 리포트
// GET /reports/attendance?course_id=...&week=...
router.get('/attendance', authenticateToken, authorizeRoles('INSTRUCTOR', 'ADMIN'), async (req, res) => {
  const { course_id, week } = req.query;

  if (!course_id) {
    return res.status(400).json({ message: 'course_id는 필수입니다.' });
  }

  try {
    const params = [course_id];
    let weekFilter = '';

    if (week) {
      weekFilter = ' AND cs.week_number = ?';
      params.push(parseInt(week, 10));
    }

    const [rows] = await pool.query(
      `SELECT 
         c.id AS course_id,
         c.title,
         cs.week_number,
         COUNT(e.user_id) AS total_students,
         SUM(CASE WHEN a.status IN (1, 4) THEN 1 ELSE 0 END) AS attended_or_excused,
         SUM(CASE WHEN a.status = 2 THEN 1 ELSE 0 END) AS late_count,
         SUM(CASE WHEN a.status = 3 THEN 1 ELSE 0 END) AS absent_count
       FROM Courses c
       JOIN ClassSessions cs ON cs.course_id = c.id
       JOIN Enrollment e ON e.course_id = c.id AND e.role = 'STUDENT'
       LEFT JOIN Attendances a 
         ON a.session_id = cs.id AND a.student_id = e.user_id
       WHERE c.id = ?${weekFilter}
       GROUP BY c.id, cs.week_number
       ORDER BY cs.week_number`,
      params
    );

    const result = rows.map(row => {
      const totalPossible = row.total_students; // 주차당 1회 출석이므로 분모는 수강생 수
      const attendanceRate =
        totalPossible > 0 ? row.attended_or_excused / totalPossible : 0;

      return {
        course_id: row.course_id,
        course_title: row.title,
        week_number: row.week_number,
        total_students: row.total_students,
        attended_or_excused: row.attended_or_excused,
        late_count: row.late_count,
        absent_count: row.absent_count,
        attendance_rate: attendanceRate,
      };
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '출석 리포트 생성 중 오류가 발생했습니다.' });
  }
});

// 지각 → 결석 전환 건수
// GET /reports/attendance/late-to-absent
router.get(
  '/attendance/late-to-absent',
  authenticateToken,
  authorizeRoles('INSTRUCTOR', 'ADMIN'),
  async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT COUNT(*) AS late_to_absent_count
         FROM AuditLogs
         WHERE action_type = 'ATTENDANCE_UPDATED'
           AND description LIKE '%지각%→%결석%'`
      );
      res.json(rows[0] || { late_to_absent_count: 0 });
    } catch (err) {
      console.error(err);
      res
        .status(500)
        .json({ message: '지각에서 결석으로 전환된 건수 집계 중 오류가 발생했습니다.' });
    }
  }
);

// 공결 승인율
// GET /reports/excuses?course_id=...&from=YYYY-MM-DD&to=YYYY-MM-DD
router.get(
  '/excuses',
  authenticateToken,
  authorizeRoles('INSTRUCTOR', 'ADMIN'),
  async (req, res) => {
    const { course_id, from, to } = req.query;

    try {
      const params = [];
      let where = ' WHERE 1=1 ';

      if (course_id) {
        where += ' AND c.id = ?';
        params.push(course_id);
      }
      if (from) {
        where += ' AND er.created_at >= ?';
        params.push(from);
      }
      if (to) {
        where += ' AND er.created_at <= ?';
        params.push(to);
      }

      const [rows] = await pool.query(
        `SELECT 
           c.id AS course_id,
           c.title,
           COUNT(*) AS total_requests,
           SUM(CASE WHEN er.status = 'APPROVED' THEN 1 ELSE 0 END) AS approved_count,
           SUM(CASE WHEN er.status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected_count
         FROM ExcuseRequests er
         JOIN ClassSessions cs ON er.session_id = cs.id
         JOIN Courses c ON cs.course_id = c.id
         ${where}
         GROUP BY c.id`,
        params
      );

      const result = rows.map(row => ({
        course_id: row.course_id,
        course_title: row.title,
        total_requests: row.total_requests,
        approved_count: row.approved_count,
        rejected_count: row.rejected_count,
        approval_rate:
          row.total_requests > 0 ? row.approved_count / row.total_requests : 0,
      }));

      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: '공결 리포트 생성 중 오류가 발생했습니다.' });
    }
  }
);

// 위험군 - 누적 결석 상위
// GET /reports/risk/absent?course_id=...&limit=10
router.get(
  '/risk/absent',
  authenticateToken,
  authorizeRoles('INSTRUCTOR', 'ADMIN'),
  async (req, res) => {
    const { course_id, limit } = req.query;

    if (!course_id) {
      return res.status(400).json({ message: 'course_id는 필수입니다.' });
    }

    const topN = parseInt(limit || '10', 10);

    try {
      const [rows] = await pool.query(
        `SELECT 
           u.id AS student_id,
           u.name,
           u.email,
           COUNT(*) AS absent_count
         FROM Attendances a
         JOIN ClassSessions cs ON a.session_id = cs.id
         JOIN Courses c ON cs.course_id = c.id
         JOIN Users u ON a.student_id = u.id
         WHERE c.id = ?
           AND a.status = 3
         GROUP BY u.id
         ORDER BY absent_count DESC
         LIMIT ?`,
        [course_id, topN]
      );

      res.json(rows);
    } catch (err) {
      console.error(err);
      res
        .status(500)
        .json({ message: '누적 결석 위험군 집계 중 오류가 발생했습니다.' });
    }
  }
);

// 위험군 - 연속 지각
// GET /reports/risk/late?course_id=...&from=YYYY-MM-DD
router.get(
  '/risk/late',
  authenticateToken,
  authorizeRoles('INSTRUCTOR', 'ADMIN'),
  async (req, res) => {
    const { course_id, from } = req.query;

    if (!course_id) {
      return res.status(400).json({ message: 'course_id는 필수입니다.' });
    }

    try {
      const params = [course_id];
      let dateFilter = '';

      if (from) {
        dateFilter = ' AND cs.session_date >= ?';
        params.push(from);
      }

      const [rows] = await pool.query(
        `SELECT 
           a.student_id,
           u.name,
           u.email,
           cs.session_date,
           cs.week_number,
           a.status
         FROM Attendances a
         JOIN ClassSessions cs ON a.session_id = cs.id
         JOIN Courses c ON cs.course_id = c.id
         JOIN Users u ON a.student_id = u.id
         WHERE c.id = ?${dateFilter}
         ORDER BY a.student_id, cs.session_date`,
        params
      );

      // 연속 지각(예: 2회 이상)을 서버에서 계산
      const resultMap = new Map();

      let currentStudentId = null;
      let streak = 0;

      for (const row of rows) {
        if (row.student_id !== currentStudentId) {
          currentStudentId = row.student_id;
          streak = 0;
        }

        if (row.status === 2) {
          streak += 1;
        } else {
          streak = 0;
        }

        if (streak >= 2) {
          if (!resultMap.has(row.student_id)) {
            resultMap.set(row.student_id, {
              student_id: row.student_id,
              name: row.name,
              email: row.email,
              max_consecutive_late: streak,
            });
          } else {
            const existing = resultMap.get(row.student_id);
            if (streak > existing.max_consecutive_late) {
              existing.max_consecutive_late = streak;
              resultMap.set(row.student_id, existing);
            }
          }
        }
      }

      res.json(Array.from(resultMap.values()));
    } catch (err) {
      console.error(err);
      res
        .status(500)
        .json({ message: '연속 지각 위험군 집계 중 오류가 발생했습니다.' });
    }
  }
);

// 감사 로그 조회 (보고용)
// GET /reports/audits?target_type=Attendance&target_id=...
router.get(
  '/audits',
  authenticateToken,
  authorizeRoles('ADMIN'),
  async (req, res) => {
    const { target_type, target_id, action_type, from, to } = req.query;

    try {
      let where = ' WHERE 1=1 ';
      const params = [];

      if (target_type) {
        where += ' AND target_type = ?';
        params.push(target_type);
      }
      if (target_id) {
        where += ' AND target_id = ?';
        params.push(target_id);
      }
      if (action_type) {
        where += ' AND action_type = ?';
        params.push(action_type);
      }
      if (from) {
        where += ' AND created_at >= ?';
        params.push(from);
      }
      if (to) {
        where += ' AND created_at <= ?';
        params.push(to);
      }

      const [rows] = await pool.query(
        `SELECT * FROM AuditLogs ${where} ORDER BY created_at DESC LIMIT 500`,
        params
      );

      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: '감사 로그 조회 중 오류가 발생했습니다.' });
    }
  }
);

module.exports = router;


