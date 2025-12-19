const pool = require('../config/db');
const { notifyUser } = require('../utils/notificationHelper');

// 학생: 출결 이의신청
const createAppeal = async (req, res) => {
  const studentId = req.user.id;
  const { session_id, message } = req.body;
  
  if (!session_id || !message) {
    return res.status(400).json({ message: '세션 ID와 메시지는 필수입니다.' });
  }
  
  try {
    // 해당 세션의 출석 기록 확인
    const [attendance] = await pool.query(
      `SELECT a.*, cs.course_id, c.instructor_id, c.title as course_title
       FROM Attendances a
       JOIN ClassSessions cs ON a.session_id = cs.id
       JOIN Courses c ON cs.course_id = c.id
       WHERE a.session_id = ? AND a.student_id = ?`,
      [session_id, studentId]
    );
    
    if (!attendance[0]) {
      return res.status(404).json({ message: '해당 세션의 출석 기록을 찾을 수 없습니다.' });
    }
    
    // 이미 이의제기가 있는지 확인
    const [existing] = await pool.query(
      'SELECT * FROM Appeals WHERE attendance_session_id = ? AND attendance_student_id = ? AND student_id = ? AND status = "PENDING"',
      [session_id, studentId, studentId]
    );
    
    if (existing.length > 0) {
      return res.status(409).json({ message: '이미 대기 중인 이의제기가 있습니다.' });
    }
    
    const [result] = await pool.query(
      'INSERT INTO Appeals (attendance_session_id, attendance_student_id, student_id, course_id, message) VALUES (?, ?, ?, ?, ?)',
      [session_id, studentId, studentId, attendance[0].course_id, message]
    );
    
    // 교원에게 메시지 전송
    await pool.query(
      'INSERT INTO Messages (sender_id, receiver_id, course_id, content) VALUES (?, ?, ?, ?)',
      [studentId, attendance[0].instructor_id, attendance[0].course_id, `[이의제기] ${attendance[0].course_title} - 출결 이의신청: ${message}`]
    );
    
    // 감사 로그 기록
    await pool.query(
      'INSERT INTO AuditLogs (user_id, action_type, target_type, target_id, description) VALUES (?, ?, ?, ?, ?)',
      [studentId, 'APPEAL_CREATED', 'Appeal', result.insertId, `출결 이의제기 생성: 세션 ${session_id}`]
    );
    
    // 학생에게 이의제기 접수 알림
    await notifyUser(
      studentId,
      'APPEAL_CREATED',
      '출결 이의제기가 접수되었습니다.',
      `${attendance[0].course_title} - 세션 ${session_id}에 대한 출결 이의제기가 접수되었습니다.`,
      attendance[0].course_id
    );
    
    // 교원에게 이의제기 확인 요청 알림
    await notifyUser(
      attendance[0].instructor_id,
      'APPEAL_PENDING',
      '출결 이의제기 확인 요청',
      `${attendance[0].course_title} - 학생이 출결 이의제기를 제출했습니다. 확인이 필요합니다.`,
      attendance[0].course_id
    );

    res.status(201).json({ 
      id: result.insertId, 
      message: '이의제기가 제출되었습니다.',
      course_title: attendance[0].course_title
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '이의제기 제출 중 오류가 발생했습니다.' });
  }
};

// 학생: 내 이의제기 목록
const getMyAppeals = async (req, res) => {
  const studentId = req.user.id;
  try {
    const [rows] = await pool.query(
      `SELECT a.*, cs.week_number, cs.session_date, c.title as course_title,
              CASE 
                WHEN a.status = 'PENDING' THEN '대기 중'
                WHEN a.status = 'REVIEWED' THEN '검토 중'
                WHEN a.status = 'RESOLVED' THEN '해결됨'
                WHEN a.status = 'REJECTED' THEN '거부됨'
                ELSE '알 수 없음'
              END as status_name
       FROM Appeals a
       JOIN ClassSessions cs ON a.attendance_session_id = cs.id
       JOIN Courses c ON a.course_id = c.id
       WHERE a.student_id = ?
       ORDER BY a.created_at DESC`,
      [studentId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '이의제기 목록 조회 중 오류가 발생했습니다.' });
  }
};

// 교원: 이의제기 목록 조회
const getAppeals = async (req, res) => {
  const instructorId = req.user.id;
  const { status } = req.query;
  
  try {
    let query = `
      SELECT a.*, cs.week_number, cs.session_date, c.title as course_title,
             u.name as student_name, u.email as student_email,
             att.status as current_attendance_status,
             CASE 
               WHEN a.status = 'PENDING' THEN '대기 중'
               WHEN a.status = 'REVIEWED' THEN '검토 중'
               WHEN a.status = 'RESOLVED' THEN '해결됨'
               WHEN a.status = 'REJECTED' THEN '거부됨'
               ELSE '알 수 없음'
             END as status_name
      FROM Appeals a
      JOIN ClassSessions cs ON a.attendance_session_id = cs.id
      JOIN Courses c ON a.course_id = c.id
      JOIN Users u ON a.student_id = u.id
      LEFT JOIN Attendances att ON a.attendance_session_id = att.session_id AND a.attendance_student_id = att.student_id
      WHERE c.instructor_id = ?
    `;
    const params = [instructorId];
    
    if (status) {
      query += ' AND a.status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY a.created_at DESC';
    
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '이의제기 목록 조회 중 오류가 발생했습니다.' });
  }
};

// 교원: 출석 정정
const updateAttendance = async (req, res) => {
  const instructorId = req.user.id;
  const { attendanceId } = req.params;
  const { session_id, student_id, new_status, appeal_id, comment } = req.body;
  
  if (!session_id || !student_id || new_status === undefined) {
    return res.status(400).json({ message: '세션 ID, 학생 ID, 새로운 상태는 필수입니다.' });
  }
  
  if (![0, 1, 2, 3, 4].includes(parseInt(new_status))) {
    return res.status(400).json({ message: '유효하지 않은 출석 상태입니다.' });
  }
  
  try {
    // 해당 세션의 담당교원 확인
    const [session] = await pool.query(
      `SELECT cs.*, c.instructor_id, c.title as course_title
       FROM ClassSessions cs
       JOIN Courses c ON cs.course_id = c.id
       WHERE cs.id = ? AND c.instructor_id = ?`,
      [session_id, instructorId]
    );
    
    if (!session[0]) {
      return res.status(403).json({ message: '해당 세션의 담당교원이 아닙니다.' });
    }
    
    // 기존 출석 기록 조회
    const [oldAttendance] = await pool.query(
      'SELECT * FROM Attendances WHERE session_id = ? AND student_id = ?',
      [session_id, student_id]
    );
    
    const oldStatus = oldAttendance[0] ? oldAttendance[0].status : null;
    
    // 출석 기록 업데이트 또는 생성
    if (oldAttendance[0]) {
      await pool.query(
        'UPDATE Attendances SET status = ?, checked_at = CURRENT_TIMESTAMP WHERE session_id = ? AND student_id = ?',
        [new_status, session_id, student_id]
      );
    } else {
      await pool.query(
        'INSERT INTO Attendances (session_id, student_id, status) VALUES (?, ?, ?)',
        [session_id, student_id, new_status]
      );
    }
    
    // 이의제기 상태 업데이트
    if (appeal_id) {
      await pool.query(
        'UPDATE Appeals SET status = ?, instructor_comment = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['RESOLVED', comment || null, appeal_id]
      );
      
      // 학생에게 메시지 전송
      await pool.query(
        'INSERT INTO Messages (sender_id, receiver_id, course_id, content) VALUES (?, ?, ?, ?)',
        [instructorId, student_id, session[0].course_id, `[이의제기 결과] ${session[0].course_title} - 출석 상태가 정정되었습니다. ${comment || ''}`]
      );
    }
    
    // 감사 로그 기록
    const { logAuditEvent } = require('../utils/auditHelper');
    const statusNames = { 0: '미정', 1: '출석', 2: '지각', 3: '결석', 4: '공결' };
    const [studentInfo] = await pool.query('SELECT email, name FROM Users WHERE id = ?', [student_id]);
    const studentName = studentInfo[0]?.name || studentInfo[0]?.email || '알 수 없음';
    const description = `출석 상태 변경: 학생 ${studentName} - ${oldStatus !== null ? statusNames[oldStatus] : '없음'} → ${statusNames[new_status]}${appeal_id ? ` (이의제기 ID: ${appeal_id})` : ''} - 강의: ${session[0].course_title}`;
    
    // IP 주소 추출
    const ipAddress = req.headers['x-forwarded-for']?.split(',')[0] || 
                      req.headers['x-real-ip'] || 
                      req.connection.remoteAddress || 
                      null;

    await logAuditEvent(
      instructorId,
      'ATTENDANCE_UPDATED',
      'Attendance',
      session_id,
      description,
      ipAddress
    );

    // 이의제기 처리 감사 로그 (이의제기가 연결된 경우)
    if (appeal_id) {
      await logAuditEvent(
        instructorId,
        'APPEAL_RESOLVED',
        'Appeal',
        appeal_id,
        `이의제기 처리: 이의제기 ID ${appeal_id}, 새 출석 상태: ${statusNames[new_status]}${comment ? ` - 코멘트: ${comment}` : ''}`,
        ipAddress
      );
    }

    // 결석 경고 알림 (2회/3회 시점)
    if (parseInt(new_status) === 3) {
      const [absentRows] = await pool.query(
        `SELECT COUNT(*) AS absent_count
         FROM Attendances a
         JOIN ClassSessions cs ON a.session_id = cs.id
         WHERE a.student_id = ? AND cs.course_id = ? AND a.status = 3`,
        [student_id, session[0].course_id]
      );
      const absentCount = absentRows[0]?.absent_count || 0;
      if (absentCount === 2 || absentCount === 3) {
        const levelText = absentCount === 2 ? '경고' : '위험';
        await notifyUser(
          student_id,
          'ABSENCE_WARNING',
          `결석 ${absentCount}회 ${levelText} 알림`,
          `${session[0].course_title}에서 현재까지 결석이 ${absentCount}회입니다. 출석에 유의하세요.`,
          session[0].course_id
        );
      }
    }

    // 이의제기 결과 알림 (승인/정정된 경우)
    if (appeal_id) {
      // 해당 이의제기 조회
      const [appealRows] = await pool.query(
        'SELECT student_id, course_id FROM Appeals WHERE id = ?',
        [appeal_id]
      );
      if (appealRows[0]) {
        await notifyUser(
          appealRows[0].student_id,
          'APPEAL_RESOLVED',
          '출결 이의제기 결과가 처리되었습니다.',
          `${session[0].course_title} - 출결 이의제기가 처리되었습니다. 새 출석 상태: ${statusNames[new_status]}${comment ? `\n코멘트: ${comment}` : ''}`,
          appealRows[0].course_id
        );
      }
    }
    
    res.json({ 
      message: '출석 상태가 정정되었습니다.',
      old_status: oldStatus,
      new_status: new_status
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '출석 정정 중 오류가 발생했습니다.' });
  }
};

module.exports = {
  createAppeal,
  getMyAppeals,
  getAppeals,
  updateAttendance
};

