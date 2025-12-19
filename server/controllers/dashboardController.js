const pool = require('../config/db');

// 교원용 현재 출석 체크 확인
const getInstructorDashboard = async (req, res) => {
  const instructorId = req.user.id;
  
  try {
    // 진행 중인 세션 목록
    const [openSessions] = await pool.query(
      `SELECT cs.*, c.title as course_title, 
              COUNT(DISTINCT a.student_id) as checked_count,
              COUNT(DISTINCT e.user_id) as total_students
       FROM ClassSessions cs
       JOIN Courses c ON cs.course_id = c.id
       LEFT JOIN Attendances a ON cs.id = a.session_id
       LEFT JOIN Enrollment e ON c.id = e.course_id AND e.role = 'STUDENT'
       WHERE c.instructor_id = ? AND cs.is_open = TRUE
       GROUP BY cs.id
       ORDER BY cs.session_date DESC, cs.start_time DESC`,
      [instructorId]
    );
    
    // 각 세션별 출석 상세
    const sessionsWithDetails = await Promise.all(
      openSessions.map(async (session) => {
        const [attendances] = await pool.query(
          `SELECT a.*, u.name, u.email,
                  CASE 
                    WHEN a.status = 0 THEN '미정'
                    WHEN a.status = 1 THEN '출석'
                    WHEN a.status = 2 THEN '지각'
                    WHEN a.status = 3 THEN '결석'
                    WHEN a.status = 4 THEN '공결'
                    ELSE '알 수 없음'
                  END as status_name
           FROM Attendances a
           JOIN Users u ON a.student_id = u.id
           WHERE a.session_id = ?
           ORDER BY a.checked_at DESC`,
          [session.id]
        );
        
        return {
          ...session,
          attendances: attendances,
          stats: {
            present: attendances.filter(a => a.status === 1).length,
            late: attendances.filter(a => a.status === 2).length,
            absent: attendances.filter(a => a.status === 3).length,
            excused: attendances.filter(a => a.status === 4).length,
            pending: session.total_students - attendances.length
          }
        };
      })
    );
    
    res.json({
      open_sessions: sessionsWithDetails,
      total_open: openSessions.length
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '대시보드 데이터 조회 중 오류가 발생했습니다.' });
  }
};

// 수강생용 현재 출석 체크 확인
const getStudentDashboard = async (req, res) => {
  const studentId = req.user.id;
  
  try {
    // 진행 중인 세션 목록
    const [openSessions] = await pool.query(
      `SELECT cs.*, c.title as course_title, a.status, a.checked_at,
              CASE 
                WHEN a.status = 0 THEN '미정'
                WHEN a.status = 1 THEN '출석'
                WHEN a.status = 2 THEN '지각'
                WHEN a.status = 3 THEN '결석'
                WHEN a.status = 4 THEN '공결'
                ELSE '미체크'
              END as status_name
       FROM ClassSessions cs
       JOIN Courses c ON cs.course_id = c.id
       JOIN Enrollment e ON c.id = e.course_id
       LEFT JOIN Attendances a ON cs.id = a.session_id AND a.student_id = ?
       WHERE e.user_id = ? AND e.role = 'STUDENT' AND cs.is_open = TRUE
       ORDER BY cs.session_date DESC, cs.start_time DESC`,
      [studentId, studentId]
    );
    
    res.json({
      open_sessions: openSessions,
      total_open: openSessions.length,
      checked_count: openSessions.filter(s => s.status !== null).length,
      pending_count: openSessions.filter(s => s.status === null).length
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '대시보드 데이터 조회 중 오류가 발생했습니다.' });
  }
};

module.exports = {
  getInstructorDashboard,
  getStudentDashboard
};




