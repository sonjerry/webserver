const pool = require('../config/db');
const { notifyCourseStudents } = require('../utils/notificationHelper');

// 담당 강의 목록 조회
// - 학기 일정 기반 달력을 그리기 위해 Semesters의 시작/종료일도 함께 내려준다.
const getMyCourses = async (req, res) => {
  const instructorId = req.user.id;
  try {
    const [rows] = await pool.query(
      `SELECT 
         c.*, 
         d.name AS department_name, 
         s.year, 
         s.semester,
         s.start_date AS semester_start_date,
         s.end_date   AS semester_end_date
       FROM Courses c 
       LEFT JOIN Departments d ON c.department_id = d.id 
       LEFT JOIN Semesters s ON c.semester_id = s.id 
       WHERE c.instructor_id = ?`,
      [instructorId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '강의 목록 조회 중 오류가 발생했습니다.' });
  }
};

function generateAuthCode() {
  const num = Math.floor(1000 + Math.random() * 9000);
  return String(num);
}

// 강의 일정 생성 (주차별) - 단일 세션
const createSession = async (req, res) => {
  const instructorId = req.user.id;
  const { course_id, week_number, session_date, start_time, end_time, attendance_method } = req.body;
  
  if (!course_id || !week_number || !session_date || !attendance_method) {
    return res.status(400).json({ message: '필수 정보가 누락되었습니다.' });
  }
  
  if (!['ELECTRONIC', 'AUTH_CODE', 'ROLL_CALL'].includes(attendance_method)) {
    return res.status(400).json({ message: '유효하지 않은 출석 방식입니다.' });
  }
  
  try {
    const [course] = await pool.query('SELECT * FROM Courses WHERE id = ? AND instructor_id = ?', [course_id, instructorId]);
    if (!course[0]) {
      return res.status(403).json({ message: '해당 강의의 담당교원이 아닙니다.' });
    }
    
    let auth_code = null;
    if (attendance_method === 'AUTH_CODE') {
      auth_code = generateAuthCode();
    }
    
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [result] = await connection.query(
        `INSERT INTO ClassSessions (course_id, week_number, session_date, start_time, end_time, attendance_method, auth_code) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [course_id, week_number, session_date, start_time || null, end_time || null, attendance_method, auth_code]
      );
      const sessionId = result.insertId;

      // 호명 방식인 경우: 기본값 출석으로 전체 수강생 출석 생성
      if (attendance_method === 'ROLL_CALL') {
        const [enrollments] = await connection.query(
          'SELECT user_id FROM Enrollment WHERE course_id = ? AND role = "STUDENT"',
          [course_id]
        );
        if (enrollments.length > 0) {
          const values = enrollments.map(e => [sessionId, e.user_id, 1]);
          await connection.query(
            'INSERT INTO Attendances (session_id, student_id, status) VALUES ?',
            [values]
          );
        }
      }

      await connection.commit();

      res.status(201).json({ 
        id: sessionId, 
        course_id, 
        week_number, 
        session_date, 
        attendance_method,
        auth_code 
      });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '세션 생성 중 오류가 발생했습니다.' });
  }
};

// 학년/학기/주차 일정 일괄 생성 (반복 규칙, 공휴일/보강일 예외 처리)
const createSessionsBatch = async (req, res) => {
  const instructorId = req.user.id;
  const { 
    course_id, 
    semester_id,
    start_date, 
    end_date,
    day_of_week, // 0=일요일, 1=월요일, ..., 6=토요일
    start_time, 
    end_time,
    attendance_methods, // 주차별 출석 방법 배열 [{week: 1, method: 'AUTH_CODE'}, ...]
    exclude_holidays = true,
    include_makeup_days = true
  } = req.body;
  
  if (!course_id || !semester_id || !start_date || !end_date || day_of_week === undefined) {
    return res.status(400).json({ message: '필수 정보가 누락되었습니다.' });
  }
  
  try {
    const [course] = await pool.query('SELECT * FROM Courses WHERE id = ? AND instructor_id = ?', [course_id, instructorId]);
    if (!course[0]) {
      return res.status(403).json({ message: '해당 강의의 담당교원이 아닙니다.' });
    }
    
    const [semester] = await pool.query('SELECT * FROM Semesters WHERE id = ?', [semester_id]);
    if (!semester[0]) {
      return res.status(404).json({ message: '학기를 찾을 수 없습니다.' });
    }
    
    // 공휴일 조회
    const [holidays] = exclude_holidays 
      ? await pool.query('SELECT date FROM Holidays WHERE is_holiday = TRUE')
      : [[], []];
    const holidayDates = new Set(holidays.map(h => h.date.toISOString().split('T')[0]));
    
    // 보강일 조회
    const [makeupDays] = include_makeup_days
      ? await pool.query('SELECT makeup_date FROM MakeupDays WHERE course_id = ?', [course_id])
      : [[], []];
    const makeupDates = new Set(makeupDays.map(m => m.makeup_date.toISOString().split('T')[0]));
    
    // 날짜 생성
    const sessions = [];
    const start = new Date(start_date);
    const end = new Date(end_date);
    
    // 학기 시작일부터 해당 요일까지의 일수 계산
    const startDayOfWeek = start.getDay();
    let daysUntilFirstClass = (day_of_week - startDayOfWeek + 7) % 7;
    if (daysUntilFirstClass === 0 && startDayOfWeek !== day_of_week) {
      daysUntilFirstClass = 7;
    }
    
    // 첫 번째 수업 날짜 찾기
    const firstClassDate = new Date(start);
    firstClassDate.setDate(firstClassDate.getDate() + daysUntilFirstClass);
    
    // 첫 번째 수업 날짜가 종료일을 넘으면 스킵
    if (firstClassDate > end) {
      return res.status(400).json({ message: '학기 기간 내에 해당 요일의 수업이 없습니다.' });
    }

    let currentDate = new Date(firstClassDate);
    let weekNumber = 1;
    
    while (currentDate <= end) {
      const dateStr = currentDate.toISOString().split('T')[0];
      
      // 공휴일이 아니거나 보강일인 경우
      if (!exclude_holidays || !holidayDates.has(dateStr) || makeupDates.has(dateStr)) {
        // 주차별 출석 방법 찾기
        let method = attendance_methods?.find(m => m.week === weekNumber)?.method || 'AUTH_CODE';
        if (!['ELECTRONIC', 'AUTH_CODE', 'ROLL_CALL'].includes(method)) {
          method = 'AUTH_CODE';
        }
        
        let auth_code = null;
        if (method === 'AUTH_CODE') {
          auth_code = generateAuthCode();
        }
        
        sessions.push({
          course_id,
          week_number: weekNumber,
          session_date: dateStr,
          start_time: start_time || null,
          end_time: end_time || null,
          attendance_method: method,
          auth_code
        });
      }
      
      // 다음 주 같은 요일로 이동
      currentDate.setDate(currentDate.getDate() + 7);
      weekNumber++;
    }
    
    // DB에 일괄 삽입
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
      const insertedSessions = [];
      for (const session of sessions) {
        const [result] = await connection.query(
          `INSERT INTO ClassSessions (course_id, week_number, session_date, start_time, end_time, attendance_method, auth_code) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [session.course_id, session.week_number, session.session_date, session.start_time, session.end_time, session.attendance_method, session.auth_code]
        );
        insertedSessions.push({ id: result.insertId, ...session });
      }
      
      await connection.commit();
      res.status(201).json({ 
        message: `${insertedSessions.length}개의 세션이 생성되었습니다.`,
        count: insertedSessions.length,
        sessions: insertedSessions
      });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '일정 생성 중 오류가 발생했습니다.' });
  }
};

// 출석 열기
const openAttendance = async (req, res) => {
  const instructorId = req.user.id;
  const { id } = req.params;
  
  try {
    const [session] = await pool.query(
      `SELECT cs.* FROM ClassSessions cs 
       JOIN Courses c ON cs.course_id = c.id 
       WHERE cs.id = ? AND c.instructor_id = ?`,
      [id, instructorId]
    );
    
    if (!session[0]) {
      return res.status(403).json({ message: '해당 세션의 담당교원이 아닙니다.' });
    }
    
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      
      await connection.query('UPDATE ClassSessions SET is_open = TRUE WHERE id = ?', [id]);

      // 호명 방식인 경우: 해당 주차의 모든 수강생을 출석(status=1)으로 자동 처리
      if (session[0].attendance_method === 'ROLL_CALL') {
        const [enrollments] = await connection.query(
          'SELECT user_id FROM Enrollment WHERE course_id = ? AND role = "STUDENT"',
          [session[0].course_id]
        );
        
        if (enrollments.length > 0) {
          // 기존 출석 기록이 있으면 업데이트, 없으면 생성
          for (const enrollment of enrollments) {
            const [existing] = await connection.query(
              'SELECT * FROM Attendances WHERE session_id = ? AND student_id = ?',
              [id, enrollment.user_id]
            );
            
            if (existing.length === 0) {
              // 출석 기록이 없으면 출석으로 생성
              await connection.query(
                'INSERT INTO Attendances (session_id, student_id, status) VALUES (?, ?, 1)',
                [id, enrollment.user_id]
              );
            } else {
              // 출석 기록이 있으면 출석으로 업데이트 (기존 상태와 관계없이)
              await connection.query(
                'UPDATE Attendances SET status = 1 WHERE session_id = ? AND student_id = ?',
                [id, enrollment.user_id]
              );
            }
          }
        }
      }

      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

    // 출석 오픈 알림 (해당 강의 수강생 전체)
    await notifyCourseStudents(
      session[0].course_id,
      'ATTENDANCE_OPENED',
      '출석 체크가 시작되었습니다',
      `${session[0].session_date} ${session[0].week_number || ''}주차 수업의 출석 체크가 시작되었습니다.`
    );
    
    res.json({ message: '출석이 열렸습니다.', session_id: id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '출석 열기 중 오류가 발생했습니다.' });
  }
};

// 출석 일시정지
const pauseAttendance = async (req, res) => {
  const instructorId = req.user.id;
  const { id } = req.params;
  
  try {
    const [session] = await pool.query(
      `SELECT cs.* FROM ClassSessions cs 
       JOIN Courses c ON cs.course_id = c.id 
       WHERE cs.id = ? AND c.instructor_id = ?`,
      [id, instructorId]
    );
    
    if (!session[0]) {
      return res.status(403).json({ message: '해당 세션의 담당교원이 아닙니다.' });
    }
    
    await pool.query('UPDATE ClassSessions SET is_open = FALSE WHERE id = ?', [id]);
    
    res.json({ message: '출석이 일시정지되었습니다.', session_id: id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '출석 일시정지 중 오류가 발생했습니다.' });
  }
};

// 출석 마감
const closeAttendance = async (req, res) => {
  const instructorId = req.user.id;
  const { id } = req.params;
  
  try {
    const [session] = await pool.query(
      `SELECT cs.* FROM ClassSessions cs 
       JOIN Courses c ON cs.course_id = c.id 
       WHERE cs.id = ? AND c.instructor_id = ?`,
      [id, instructorId]
    );
    
    if (!session[0]) {
      return res.status(403).json({ message: '해당 세션의 담당교원이 아닙니다.' });
    }
    
    await pool.query('UPDATE ClassSessions SET is_open = FALSE WHERE id = ?', [id]);

    // 출석 마감 알림 (해당 강의 수강생 전체)
    await notifyCourseStudents(
      session[0].course_id,
      'ATTENDANCE_CLOSED',
      '출석 마감 안내',
      `${session[0].session_date} ${session[0].week_number || ''}주차 수업의 출석이 마감되었습니다.`
    );
    
    res.json({ message: '출석이 마감되었습니다.', session_id: id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '출석 마감 중 오류가 발생했습니다.' });
  }
};

// 출석 현황 확인 (교원용) - 학생 전체 리스트 + 상태 요약
const getAttendanceSummary = async (req, res) => {
  const instructorId = req.user.id;
  const { sessionId } = req.params;
  
  try {
    const [sessionRows] = await pool.query(
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
         c.title AS course_title 
       FROM ClassSessions cs 
       JOIN Courses c ON cs.course_id = c.id 
       WHERE cs.id = ? AND c.instructor_id = ?`,
      [sessionId, instructorId]
    );
    
    const session = sessionRows[0];
    if (!session) {
      return res.status(403).json({ message: '해당 세션의 담당교원이 아닙니다.' });
    }
    
    // 수강생 전체 + 출석 상태 (LEFT JOIN)
    const [students] = await pool.query(
      `SELECT 
         u.id AS student_id,
         u.name,
         u.email,
         a.status,
         a.checked_at
       FROM Enrollment e
       JOIN Users u ON e.user_id = u.id
       LEFT JOIN Attendances a 
         ON a.session_id = ? AND a.student_id = e.user_id
       WHERE e.course_id = ? AND e.role = 'STUDENT'
       ORDER BY u.name IS NULL, u.name, u.email`,
      [sessionId, session.course_id]
    );
    
    const stats = {
      total_students: students.length,
      present: 0,
      late: 0,
      absent: 0,
      excused: 0,
      pending: 0
    };
    
    students.forEach(s => {
      if (s.status === null || s.status === undefined) {
        stats.pending += 1;
      } else if (s.status === 1) {
        stats.present += 1;
      } else if (s.status === 2) {
        stats.late += 1;
      } else if (s.status === 3) {
        stats.absent += 1;
      } else if (s.status === 4) {
        stats.excused += 1;
      } else {
        stats.pending += 1;
      }
    });
    
    res.json({
      session,
      students,
      stats
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '출석 현황 조회 중 오류가 발생했습니다.' });
  }
};

// 공결 목록 조회
const getExcuseRequests = async (req, res) => {
  const instructorId = req.user.id;
  const { status, course_id } = req.query;
  
  try {
    let query = `
      SELECT er.*, u.name as student_name, u.email as student_email, 
             cs.week_number, cs.session_date, c.title as course_title, c.id as course_id
      FROM ExcuseRequests er
      JOIN Users u ON er.student_id = u.id
      JOIN ClassSessions cs ON er.session_id = cs.id
      JOIN Courses c ON cs.course_id = c.id
      WHERE c.instructor_id = ?
    `;
    const params = [instructorId];
    
    if (status) {
      query += ' AND er.status = ?';
      params.push(status);
    }
    
    if (course_id) {
      query += ' AND c.id = ?';
      params.push(course_id);
    }
    
    query += ' ORDER BY er.created_at DESC';
    
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '공결 목록 조회 중 오류가 발생했습니다.' });
  }
};

// 공결 사유 템플릿 조회
const getExcuseReasonTemplates = async (req, res) => {
  const templates = [
    { code: 'ILLNESS', name: '질병', description: '질병으로 인한 결석' },
    { code: 'FAMILY_EVENT', name: '가족 행사', description: '가족 행사로 인한 결석' },
    { code: 'OFFICIAL_BUSINESS', name: '공무', description: '공무로 인한 결석' },
    { code: 'PERSONAL_EMERGENCY', name: '개인 긴급사항', description: '개인 긴급사항으로 인한 결석' },
    { code: 'OTHER', name: '기타', description: '기타 사유' }
  ];
  res.json(templates);
};

// 공결 승인/반려
const { notifyUser } = require('../utils/notificationHelper');
const { logAuditEvent } = require('../utils/auditHelper');

// IP 주소 추출 헬퍼
function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0] || 
         req.headers['x-real-ip'] || 
         req.connection.remoteAddress || 
         null;
}

const updateExcuseRequest = async (req, res) => {
  const instructorId = req.user.id;
  const { id } = req.params;
  const { status, instructor_comment } = req.body;
  
  if (!status || !['APPROVED', 'REJECTED'].includes(status)) {
    return res.status(400).json({ message: '유효하지 않은 상태입니다.' });
  }
  
  try {
    const [excuse] = await pool.query(
      `SELECT er.* FROM ExcuseRequests er
       JOIN ClassSessions cs ON er.session_id = cs.id
       JOIN Courses c ON cs.course_id = c.id
       WHERE er.id = ? AND c.instructor_id = ?`,
      [id, instructorId]
    );
    
    if (!excuse[0]) {
      return res.status(403).json({ message: '해당 공결 신청의 담당교원이 아닙니다.' });
    }
    
    await pool.query(
      'UPDATE ExcuseRequests SET status = ?, instructor_comment = ? WHERE id = ?',
      [status, instructor_comment || null, id]
    );
    
    if (status === 'APPROVED') {
      await pool.query(
        'UPDATE Attendances SET status = 4 WHERE session_id = ? AND student_id = ?',
        [excuse[0].session_id, excuse[0].student_id]
      );
    }

    // 감사 로그 기록
    const [studentInfo] = await pool.query('SELECT email, name FROM Users WHERE id = ?', [excuse[0].student_id]);
    const studentName = studentInfo[0]?.name || studentInfo[0]?.email || '알 수 없음';
    await logAuditEvent(
      instructorId,
      status === 'APPROVED' ? 'EXCUSE_APPROVED' : 'EXCUSE_REJECTED',
      'ExcuseRequest',
      parseInt(id),
      `공결 ${status === 'APPROVED' ? '승인' : '반려'}: 학생 ${studentName} (세션 ID: ${excuse[0].session_id})${instructor_comment ? ` - 코멘트: ${instructor_comment}` : ''}`,
      getClientIp(req)
    );

    // 공결 결과 알림 (학생에게)
    const [sessionInfo] = await pool.query(
      `SELECT cs.week_number, cs.session_date, c.title as course_title
       FROM ClassSessions cs
       JOIN Courses c ON cs.course_id = c.id
       WHERE cs.id = ?`,
      [excuse[0].session_id]
    );
    
    const resultText = status === 'APPROVED' ? '승인' : '반려';
    const sessionText = sessionInfo[0] 
      ? `${sessionInfo[0].course_title} - ${sessionInfo[0].week_number || ''}주차 (${sessionInfo[0].session_date})`
      : `세션 ID ${excuse[0].session_id}`;
    
    await notifyUser(
      excuse[0].student_id,
      'EXCUSE_RESULT',
      `공결 신청이 ${resultText}되었습니다.`,
      `${sessionText}에 대한 공결 신청이 ${resultText}되었습니다.${instructor_comment ? `\n코멘트: ${instructor_comment}` : ''}`,
      excuse[0].session_id ? (await pool.query('SELECT course_id FROM ClassSessions WHERE id = ?', [excuse[0].session_id]))[0][0]?.course_id : null
    );
    
    res.json({ message: `공결이 ${status === 'APPROVED' ? '승인' : '반려'}되었습니다.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '공결 처리 중 오류가 발생했습니다.' });
  }
};

// 수업 알림 작성 (전체)
const createAnnouncement = async (req, res) => {
  const instructorId = req.user.id;
  const { course_id, title, content } = req.body;
  
  if (!course_id || !title || !content) {
    return res.status(400).json({ message: '필수 정보가 누락되었습니다.' });
  }
  
  try {
    const [course] = await pool.query('SELECT * FROM Courses WHERE id = ? AND instructor_id = ?', [course_id, instructorId]);
    if (!course[0]) {
      return res.status(403).json({ message: '해당 강의의 담당교원이 아닙니다.' });
    }
    
    const [students] = await pool.query(
      'SELECT user_id FROM Enrollment WHERE course_id = ? AND role = "STUDENT"',
      [course_id]
    );
    
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
      for (const student of students) {
        await connection.query(
          'INSERT INTO Notifications (course_id, user_id, type, title, content) VALUES (?, ?, ?, ?, ?)',
          [course_id, student.user_id, 'ANNOUNCEMENT', title, content]
        );
      }
      await connection.commit();
      res.status(201).json({ message: '알림이 전송되었습니다.', count: students.length });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '알림 작성 중 오류가 발생했습니다.' });
  }
};

// 채팅방 목록 조회 (교원용 - 학생별 그룹화)
const getChatRooms = async (req, res) => {
  const instructorId = req.user.id;
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
      [instructorId, instructorId, instructorId, instructorId]
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

// 특정 학생과의 대화 조회
const getChatMessages = async (req, res) => {
  const instructorId = req.user.id;
  const { studentId } = req.params;
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
    const params = [instructorId, studentId, studentId, instructorId];
    
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

// 메시지 작성 (수강생 개인)
const sendMessage = async (req, res) => {
  const instructorId = req.user.id;
  const { receiver_id, course_id, content } = req.body;
  
  if (!receiver_id || !content) {
    return res.status(400).json({ message: '필수 정보가 누락되었습니다.' });
  }
  
  try {
    if (course_id) {
      const [course] = await pool.query('SELECT * FROM Courses WHERE id = ? AND instructor_id = ?', [course_id, instructorId]);
      if (!course[0]) {
        return res.status(403).json({ message: '해당 강의의 담당교원이 아닙니다.' });
      }
      
      const [enrollment] = await pool.query(
        'SELECT * FROM Enrollment WHERE course_id = ? AND user_id = ? AND role = "STUDENT"',
        [course_id, receiver_id]
      );
      if (!enrollment[0]) {
        return res.status(403).json({ message: '해당 강의의 수강생이 아닙니다.' });
      }
    }
    
    const [result] = await pool.query(
      'INSERT INTO Messages (sender_id, receiver_id, course_id, content) VALUES (?, ?, ?, ?)',
      [instructorId, receiver_id, course_id || null, content]
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

// 공강 투표 생성
const createVote = async (req, res) => {
  const instructorId = req.user.id;
  const { course_id, title, description, week_number, makeup_date } = req.body;
  
  if (!course_id || !title || !week_number) {
    return res.status(400).json({ message: '강의, 제목, 공강 주차는 필수입니다.' });
  }
  
  try {
    const [course] = await pool.query('SELECT * FROM Courses WHERE id = ? AND instructor_id = ?', [course_id, instructorId]);
    if (!course[0]) {
      return res.status(403).json({ message: '해당 강의의 담당교원이 아닙니다.' });
    }

    // 해당 주차의 세션 날짜를 찾아 공강일 기준 날짜로 사용
    const [sessionRows] = await pool.query(
      'SELECT session_date FROM ClassSessions WHERE course_id = ? AND week_number = ? ORDER BY session_date LIMIT 1',
      [course_id, week_number]
    );
    const originalDate = sessionRows[0]?.session_date || null;
    
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
      const [voteResult] = await connection.query(
        'INSERT INTO Votes (course_id, instructor_id, title, description, vote_date) VALUES (?, ?, ?, ?, ?)',
        [course_id, instructorId, title, description || null, originalDate]
      );

      // 보강일이 지정된 경우, 보강일 테이블에도 기록
      let makeupDayId = null;
      if (makeup_date) {
        const [makeupResult] = await connection.query(
          'INSERT INTO MakeupDays (course_id, week_number, original_date, makeup_date, reason) VALUES (?, ?, ?, ?, ?)',
          [course_id, week_number, originalDate, makeup_date, '공강 투표에 따른 보강일']
        );
        makeupDayId = makeupResult.insertId;
      }
      
      const [students] = await connection.query(
        'SELECT user_id FROM Enrollment WHERE course_id = ? AND role = "STUDENT"',
        [course_id]
      );
      
      for (const student of students) {
        await connection.query(
          'INSERT INTO Notifications (course_id, user_id, type, title, content) VALUES (?, ?, ?, ?, ?)',
          [
            course_id,
            student.user_id,
            'VOTE',
            title,
            `공강 투표가 생성되었습니다: ${week_number}주차${makeup_date ? `, 보강 예정일 ${makeup_date}` : ''}`
          ]
        );
      }
      await connection.commit();
      res.status(201).json({
        id: voteResult.insertId,
        message: '투표가 생성되었습니다.',
        notification_count: students.length,
        week_number,
        vote_date: originalDate,
        makeup_date: makeup_date || null,
        makeup_day_id: makeupDayId
      });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '투표 생성 중 오류가 발생했습니다.' });
  }
};

// 공휴일 관리
const getHolidays = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM Holidays ORDER BY date');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '공휴일 조회 중 오류가 발생했습니다.' });
  }
};

const createHoliday = async (req, res) => {
  const { date, name } = req.body;
  if (!date) {
    return res.status(400).json({ message: '날짜는 필수입니다.' });
  }
  try {
    const [result] = await pool.query(
      'INSERT INTO Holidays (date, name, is_holiday) VALUES (?, ?, TRUE) ON DUPLICATE KEY UPDATE name = VALUES(name)',
      [date, name || null]
    );
    res.status(201).json({ id: result.insertId, date, name });
  } catch (err) {
    console.error(err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: '이미 존재하는 날짜입니다.' });
    }
    res.status(500).json({ message: '공휴일 생성 중 오류가 발생했습니다.' });
  }
};

// 보강일 관리
const getMakeupDays = async (req, res) => {
  const instructorId = req.user.id;
  const { course_id } = req.query;
  
  try {
    let query = `
      SELECT md.*, c.title as course_title
      FROM MakeupDays md
      JOIN Courses c ON md.course_id = c.id
      WHERE c.instructor_id = ?
    `;
    const params = [instructorId];
    
    if (course_id) {
      query += ' AND md.course_id = ?';
      params.push(course_id);
    }
    
    query += ' ORDER BY md.makeup_date DESC';
    
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '보강일 조회 중 오류가 발생했습니다.' });
  }
};

const createMakeupDay = async (req, res) => {
  const instructorId = req.user.id;
  const { course_id, week_number, original_date, makeup_date, reason } = req.body;
  
  if (!course_id || !week_number || !makeup_date) {
    return res.status(400).json({ message: '강의, 주차, 보강일은 필수입니다.' });
  }
  
  try {
    const [course] = await pool.query('SELECT * FROM Courses WHERE id = ? AND instructor_id = ?', [course_id, instructorId]);
    if (!course[0]) {
      return res.status(403).json({ message: '해당 강의의 담당교원이 아닙니다.' });
    }
    
    const [result] = await pool.query(
      'INSERT INTO MakeupDays (course_id, week_number, original_date, makeup_date, reason) VALUES (?, ?, ?, ?, ?)',
      [course_id, week_number, original_date || null, makeup_date, reason || null]
    );
    
    res.status(201).json({ id: result.insertId, course_id, week_number, original_date, makeup_date, reason });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '보강일 생성 중 오류가 발생했습니다.' });
  }
};

const deleteMakeupDay = async (req, res) => {
  const instructorId = req.user.id;
  const { id } = req.params;
  
  try {
    const [makeupDay] = await pool.query(
      `SELECT md.* FROM MakeupDays md
       JOIN Courses c ON md.course_id = c.id
       WHERE md.id = ? AND c.instructor_id = ?`,
      [id, instructorId]
    );
    
    if (!makeupDay[0]) {
      return res.status(403).json({ message: '해당 보강일의 담당교원이 아니거나 보강일을 찾을 수 없습니다.' });
    }
    
    await pool.query('DELETE FROM MakeupDays WHERE id = ?', [id]);
    
    res.json({ message: '보강일이 삭제되었습니다.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '보강일 삭제 중 오류가 발생했습니다.' });
  }
};

module.exports = {
  getMyCourses,
  createSession,
  createSessionsBatch,
  openAttendance,
  pauseAttendance,
  closeAttendance,
  getAttendanceSummary,
  getExcuseRequests,
  getExcuseReasonTemplates,
  updateExcuseRequest,
  createAnnouncement,
  getChatRooms,
  getChatMessages,
  sendMessage,
  createVote,
  getHolidays,
  createHoliday,
  getMakeupDays,
  createMakeupDay,
  deleteMakeupDay
};

