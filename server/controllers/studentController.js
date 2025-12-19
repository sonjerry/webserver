const pool = require('../config/db');
const fs = require('fs').promises;
const path = require('path');
const { notifyUser } = require('../utils/notificationHelper');
const { logAuditEvent } = require('../utils/auditHelper');

// IP 주소 추출 헬퍼
function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0] ||
         req.headers['x-real-ip'] ||
         req.connection.remoteAddress ||
         null;
}

// 공강 투표 응답 및 조회를 위해 사용
const getOpenVotesForStudent = async (req, res) => {
  const studentId = req.user.id;
  try {
    const [rows] = await pool.query(
      `SELECT v.*, c.title AS course_title,
              (SELECT cs.week_number FROM ClassSessions cs WHERE cs.course_id = v.course_id AND cs.session_date = v.vote_date LIMIT 1) AS week_number,
              IF(vr.response IS NULL, NULL, vr.response) AS my_response
       FROM Votes v
       JOIN Courses c ON v.course_id = c.id
       JOIN Enrollment e ON e.course_id = v.course_id AND e.user_id = ? AND e.role = 'STUDENT'
       LEFT JOIN VoteResponses vr ON vr.vote_id = v.id AND vr.student_id = ?
       WHERE v.is_closed = FALSE
       ORDER BY week_number DESC, v.created_at DESC`,
      [studentId, studentId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '공강 투표 목록 조회 중 오류가 발생했습니다.' });
  }
};

const respondToVote = async (req, res) => {
  const studentId = req.user.id;
  const { voteId } = req.params;
  const { response } = req.body; // 'YES' | 'NO'

  if (!['YES', 'NO'].includes(response)) {
    return res.status(400).json({ message: '응답은 YES 또는 NO 이어야 합니다.' });
  }

  try {
    // 해당 투표가 유효하고, 이 학생이 수강생인지 확인
    const [voteRows] = await pool.query(
      `SELECT v.*, c.title AS course_title
       FROM Votes v
       JOIN Courses c ON v.course_id = c.id
       JOIN Enrollment e ON e.course_id = v.course_id AND e.user_id = ? AND e.role = 'STUDENT'
       WHERE v.id = ? AND v.is_closed = FALSE`,
      [studentId, voteId]
    );

    if (!voteRows[0]) {
      return res.status(403).json({ message: '참여할 수 없는 투표입니다.' });
    }

    await pool.query(
      `INSERT INTO VoteResponses (vote_id, student_id, response)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE response = VALUES(response), created_at = CURRENT_TIMESTAMP`,
      [voteId, studentId, response]
    );

    res.json({ message: '투표 응답이 저장되었습니다.', response });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '투표 응답 저장 중 오류가 발생했습니다.' });
  }
};

// 수강 강의 목록 조회
const getMyCourses = async (req, res) => {
  const studentId = req.user.id;
  try {
    const [rows] = await pool.query(
      `SELECT c.*, d.name as department_name, s.year, s.semester, u.name as instructor_name
       FROM Enrollment e
       JOIN Courses c ON e.course_id = c.id
       LEFT JOIN Departments d ON c.department_id = d.id
       LEFT JOIN Semesters s ON c.semester_id = s.id
       LEFT JOIN Users u ON c.instructor_id = u.id
       WHERE e.user_id = ? AND e.role = 'STUDENT'`,
      [studentId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '강의 목록 조회 중 오류가 발생했습니다.' });
  }
};

// 출석 체크 (전자출결 / 인증번호)
const attendSession = async (req, res) => {
  const studentId = req.user.id;
  const { sessionId } = req.params;
  const { auth_code, location } = req.body;
  
  try {
    const [session] = await pool.query(
      `SELECT cs.*, c.title as course_title
       FROM ClassSessions cs
       JOIN Courses c ON cs.course_id = c.id
       JOIN Enrollment e ON c.id = e.course_id
       WHERE cs.id = ? AND e.user_id = ? AND e.role = 'STUDENT' AND cs.is_open = TRUE`,
      [sessionId, studentId]
    );
    
    if (!session[0]) {
      return res.status(403).json({ message: '출석할 수 없는 세션입니다.' });
    }
    
    const sessionData = session[0];
    let status = 1; // 기본값: 출석
    
    if (sessionData.attendance_method === 'AUTH_CODE') {
      if (!auth_code || auth_code !== sessionData.auth_code) {
        return res.status(400).json({ message: '인증번호가 올바르지 않습니다.' });
      }
    } else if (sessionData.attendance_method === 'ELECTRONIC') {
      // 위치 정보는 선택사항으로 변경 (프론트에서 별도 입력 받지 않음)
      const now = new Date();
      const sessionTime = new Date(`${sessionData.session_date} ${sessionData.start_time || '00:00:00'}`);
      const timeDiff = (now - sessionTime) / (1000 * 60);
      if (timeDiff > 15) {
        status = 2; // 지각
      }
    }
    
    await pool.query(
      'INSERT INTO Attendances (session_id, student_id, status) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE status = VALUES(status), checked_at = CURRENT_TIMESTAMP',
      [sessionId, studentId, status]
    );
    
    // 결석 경고 알림 (결석인 경우)
    if (status === 3) {
      const [courseRow] = await pool.query(
        `SELECT cs.course_id, c.title as course_title
         FROM ClassSessions cs
         JOIN Courses c ON cs.course_id = c.id
         WHERE cs.id = ?`,
        [sessionId]
      );
      if (courseRow[0]) {
        const courseId = courseRow[0].course_id;
        const [absentRows] = await pool.query(
          `SELECT COUNT(*) AS absent_count
           FROM Attendances a
           JOIN ClassSessions cs ON a.session_id = cs.id
           WHERE a.student_id = ? AND cs.course_id = ? AND a.status = 3`,
          [studentId, courseId]
        );
        const absentCount = absentRows[0]?.absent_count || 0;
        if (absentCount === 2 || absentCount === 3) {
          const levelText = absentCount === 2 ? '경고' : '위험';
          await notifyUser(
            studentId,
            'ABSENCE_WARNING',
            `결석 ${absentCount}회 ${levelText} 알림`,
            `${courseRow[0].course_title}에서 현재까지 결석이 ${absentCount}회입니다. 출석에 유의하세요.`,
            courseId
          );
        }
      }
    }
    
    res.json({ message: '출석이 기록되었습니다.', status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '출석 기록 중 오류가 발생했습니다.' });
  }
};

// 출석 현황 확인
const getMyAttendance = async (req, res) => {
  const studentId = req.user.id;
  const { course_id } = req.query;
  
  try {
    let query = `
      SELECT cs.*, c.title as course_title, a.status, a.checked_at,
             CASE 
               WHEN a.status = 0 THEN '미정'
               WHEN a.status = 1 THEN '출석'
               WHEN a.status = 2 THEN '지각'
               WHEN a.status = 3 THEN '결석'
               WHEN a.status = 4 THEN '공결'
               ELSE '알 수 없음'
             END as status_name
      FROM ClassSessions cs
      JOIN Courses c ON cs.course_id = c.id
      JOIN Enrollment e ON c.id = e.course_id
      LEFT JOIN Attendances a ON cs.id = a.session_id AND a.student_id = ?
      WHERE e.user_id = ? AND e.role = 'STUDENT'
    `;
    const params = [studentId, studentId];
    
    if (course_id) {
      query += ' AND c.id = ?';
      params.push(course_id);
    }
    
    query += ' ORDER BY cs.session_date DESC, cs.start_time DESC';
    
    const [rows] = await pool.query(query, params);
    
    const summary = {
      total: rows.length,
      present: rows.filter(r => r.status === 1).length,
      late: rows.filter(r => r.status === 2).length,
      absent: rows.filter(r => r.status === 3).length,
      excused: rows.filter(r => r.status === 4).length,
      pending: rows.filter(r => r.status === null || r.status === 0).length,
      sessions: rows
    };
    
    res.json(summary);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '출석 현황 조회 중 오류가 발생했습니다.' });
  }
};

// 공결 신청
const createExcuseRequest = async (req, res) => {
  const studentId = req.user.id;
  const { sessionId } = req.params;
  const { reason_code, reason } = req.body;
  const file = req.file;
  
  if (!reason) {
    return res.status(400).json({ message: '사유는 필수입니다.' });
  }
  
  try {
    const [session] = await pool.query(
      `SELECT cs.*, c.id as course_id, c.title as course_title
       FROM ClassSessions cs
       JOIN Courses c ON cs.course_id = c.id
       JOIN Enrollment e ON c.id = e.course_id
       WHERE cs.id = ? AND e.user_id = ? AND e.role = 'STUDENT'`,
      [sessionId, studentId]
    );
    
    if (!session[0]) {
      return res.status(403).json({ message: '해당 세션에 대한 권한이 없습니다.' });
    }
    
    // 이미 공결 신청이 있는지 확인
    const [existing] = await pool.query(
      'SELECT * FROM ExcuseRequests WHERE session_id = ? AND student_id = ?',
      [sessionId, studentId]
    );
    
    if (existing.length > 0) {
      return res.status(409).json({ message: '이미 공결 신청이 존재합니다.' });
    }
    
    let file_path = null;
    if (file) {
      const uploadDir = path.join(__dirname, '../uploads/excuses');
      await fs.mkdir(uploadDir, { recursive: true });
      const fileName = `${studentId}_${sessionId}_${Date.now()}_${file.originalname}`;
      file_path = path.join('excuses', fileName);
      await fs.writeFile(path.join(uploadDir, fileName), file.buffer);
    }
    
    const [result] = await pool.query(
      'INSERT INTO ExcuseRequests (session_id, student_id, reason_code, reason, file_path) VALUES (?, ?, ?, ?, ?)',
      [sessionId, studentId, reason_code || null, reason, file_path]
    );

    // 감사 로그 기록
    const ipAddress = getClientIp(req);
    await logAuditEvent(
      studentId,
      'EXCUSE_CREATED',
      'ExcuseRequest',
      result.insertId,
      `공결 신청 생성: 세션 ${sessionId} (사유코드: ${reason_code || '없음'})`,
      ipAddress
    );
    
    // 교원에게 공결 신청 알림
    const [course] = await pool.query('SELECT instructor_id FROM Courses WHERE id = ?', [session[0].course_id]);
    if (course[0]) {
      const { notifyUser } = require('../utils/notificationHelper');
      await notifyUser(
        course[0].instructor_id,
        'EXCUSE_PENDING',
        '공결 신청 확인 요청',
        `${session[0].course_title} - 학생이 공결 신청을 제출했습니다. 확인이 필요합니다.`,
        session[0].course_id
      );
    }
    
    res.status(201).json({ 
      id: result.insertId, 
      message: '공결 신청이 완료되었습니다.',
      course_title: session[0].course_title
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '공결 신청 중 오류가 발생했습니다.' });
  }
};

// 내 공결 신청 목록
const getMyExcuseRequests = async (req, res) => {
  const studentId = req.user.id;
  try {
    const [rows] = await pool.query(
      `SELECT er.*, cs.week_number, cs.session_date, c.title as course_title
       FROM ExcuseRequests er
       JOIN ClassSessions cs ON er.session_id = cs.id
       JOIN Courses c ON cs.course_id = c.id
       WHERE er.student_id = ?
       ORDER BY er.created_at DESC`,
      [studentId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '공결 신청 목록 조회 중 오류가 발생했습니다.' });
  }
};

// 메시지 작성 (담당교원에게)
const sendMessage = async (req, res) => {
  const studentId = req.user.id;
  const { course_id, content } = req.body;
  
  if (!course_id || !content) {
    return res.status(400).json({ message: '강의와 내용은 필수입니다.' });
  }
  
  try {
    const [enrollment] = await pool.query(
      'SELECT * FROM Enrollment WHERE course_id = ? AND user_id = ? AND role = "STUDENT"',
      [course_id, studentId]
    );
    
    if (!enrollment[0]) {
      return res.status(403).json({ message: '해당 강의의 수강생이 아닙니다.' });
    }
    
    const [course] = await pool.query('SELECT instructor_id FROM Courses WHERE id = ?', [course_id]);
    if (!course[0]) {
      return res.status(404).json({ message: '강의를 찾을 수 없습니다.' });
    }
    
    const [result] = await pool.query(
      'INSERT INTO Messages (sender_id, receiver_id, course_id, content) VALUES (?, ?, ?, ?)',
      [studentId, course[0].instructor_id, course_id, content]
    );
    
    const [newMessage] = await pool.query(
      `SELECT m.*, u.name as sender_name, u.email as sender_email, c.title as course_title
       FROM Messages m
       JOIN Users u ON m.sender_id = u.id
       LEFT JOIN Courses c ON m.course_id = c.id
       WHERE m.id = ?`,
      [result.insertId]
    );
    
    res.status(201).json(newMessage[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '메시지 전송 중 오류가 발생했습니다.' });
  }
};

// 채팅방 목록 조회 (학생용 - 교원별, 강의별 그룹화)
const getChatRooms = async (req, res) => {
  const studentId = req.user.id;
  try {
    const [allMessages] = await pool.query(
      `SELECT m.*, 
        CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END as other_user_id,
        u.name as other_user_name,
        u.email as other_user_email,
        c.id as course_id,
        c.title as course_title
       FROM Messages m
       JOIN Users u ON (CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END) = u.id
       LEFT JOIN Courses c ON m.course_id = c.id
       WHERE m.sender_id = ? OR m.receiver_id = ?
       ORDER BY m.created_at DESC`,
      [studentId, studentId, studentId, studentId]
    );
    
    // 그룹화: (other_user_id, course_id) 조합별로
    const roomMap = new Map();
    allMessages.forEach(msg => {
      const key = `${msg.other_user_id}_${msg.course_id || 'null'}`;
      if (!roomMap.has(key)) {
        roomMap.set(key, {
          other_user_id: msg.other_user_id,
          other_user_name: msg.other_user_name,
          other_user_email: msg.other_user_email,
          course_id: msg.course_id,
          course_title: msg.course_title,
          last_message_at: msg.created_at,
          last_message_content: msg.content
        });
      }
    });
    
    const rooms = Array.from(roomMap.values()).sort((a, b) => 
      new Date(b.last_message_at) - new Date(a.last_message_at)
    );
    
    res.json(rooms);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '채팅방 목록 조회 중 오류가 발생했습니다.' });
  }
};

// 특정 교원과의 대화 조회
const getChatMessages = async (req, res) => {
  const studentId = req.user.id;
  const { instructorId } = req.params;
  const { course_id } = req.query;
  
  try {
    let query = `
      SELECT m.*, 
        u_sender.name as sender_name, 
        u_sender.email as sender_email,
        u_receiver.name as receiver_name,
        u_receiver.email as receiver_email,
        c.title as course_title
      FROM Messages m
      JOIN Users u_sender ON m.sender_id = u_sender.id
      JOIN Users u_receiver ON m.receiver_id = u_receiver.id
      LEFT JOIN Courses c ON m.course_id = c.id
      WHERE ((m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?))
    `;
    const params = [studentId, instructorId, instructorId, studentId];
    
    if (course_id) {
      query += ' AND m.course_id = ?';
      params.push(course_id);
    }
    
    query += ' ORDER BY m.created_at ASC';
    
    const [messages] = await pool.query(query, params);
    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '메시지 조회 중 오류가 발생했습니다.' });
  }
};

// 받은 메시지 조회 (하위 호환성 유지)
const getMyMessages = async (req, res) => {
  const studentId = req.user.id;
  try {
    const [rows] = await pool.query(
      `SELECT m.*, u.name as sender_name, u.email as sender_email, c.title as course_title
       FROM Messages m
       JOIN Users u ON m.sender_id = u.id
       LEFT JOIN Courses c ON m.course_id = c.id
       WHERE m.receiver_id = ?
       ORDER BY m.created_at DESC`,
      [studentId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '메시지 조회 중 오류가 발생했습니다.' });
  }
};

module.exports = {
  getMyCourses,
  attendSession,
  getMyAttendance,
  createExcuseRequest,
  getMyExcuseRequests,
  getChatRooms,
  getChatMessages,
  sendMessage,
  getMyMessages,
  getOpenVotesForStudent,
  respondToVote
};

