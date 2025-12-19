const pool = require('../config/db');
const { logAuditEvent } = require('../utils/auditHelper');

// IP 주소 추출 헬퍼
function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0] || 
         req.headers['x-real-ip'] || 
         req.connection.remoteAddress || 
         null;
}

// 학과 관리
const getDepartments = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM Departments ORDER BY name');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '학과 목록 조회 중 오류가 발생했습니다.' });
  }
};

const createDepartment = async (req, res) => {
  const { name, code } = req.body;
  if (!name || !code) {
    return res.status(400).json({ message: '학과명과 코드는 필수입니다.' });
  }
  try {
    const [result] = await pool.query(
      'INSERT INTO Departments (name, code) VALUES (?, ?)',
      [name, code]
    );
    
    // 감사 로그 기록
    await logAuditEvent(
      req.user.id,
      'DEPARTMENT_CREATED',
      'Department',
      result.insertId,
      `학과 생성: ${name} (${code})`,
      getClientIp(req)
    );
    
    res.status(201).json({ id: result.insertId, name, code });
  } catch (err) {
    console.error(err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: '이미 존재하는 학과 코드입니다.' });
    }
    res.status(500).json({ message: '학과 생성 중 오류가 발생했습니다.' });
  }
};

const updateDepartment = async (req, res) => {
  const { id } = req.params;
  const { name, code } = req.body;
  if (!name || !code) {
    return res.status(400).json({ message: '학과명과 코드는 필수입니다.' });
  }
  try {
    // 기존 정보 조회
    const [oldDept] = await pool.query('SELECT name, code FROM Departments WHERE id = ?', [id]);
    
    const [result] = await pool.query(
      'UPDATE Departments SET name = ?, code = ? WHERE id = ?',
      [name, code, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '학과를 찾을 수 없습니다.' });
    }
    
    // 감사 로그 기록
    const oldName = oldDept[0]?.name || '';
    const oldCode = oldDept[0]?.code || '';
    await logAuditEvent(
      req.user.id,
      'DEPARTMENT_UPDATED',
      'Department',
      parseInt(id),
      `학과 수정: ${oldName} (${oldCode}) → ${name} (${code})`,
      getClientIp(req)
    );
    
    res.json({ id: parseInt(id), name, code });
  } catch (err) {
    console.error(err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: '이미 존재하는 학과 코드입니다.' });
    }
    res.status(500).json({ message: '학과 수정 중 오류가 발생했습니다.' });
  }
};

const deleteDepartment = async (req, res) => {
  const { id } = req.params;
  try {
    // 기존 정보 조회
    const [oldDept] = await pool.query('SELECT name, code FROM Departments WHERE id = ?', [id]);
    
    const [result] = await pool.query('DELETE FROM Departments WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '학과를 찾을 수 없습니다.' });
    }
    
    // 감사 로그 기록
    const deptName = oldDept[0]?.name || '알 수 없음';
    const deptCode = oldDept[0]?.code || '알 수 없음';
    await logAuditEvent(
      req.user.id,
      'DEPARTMENT_DELETED',
      'Department',
      parseInt(id),
      `학과 삭제: ${deptName} (${deptCode})`,
      getClientIp(req)
    );
    
    res.json({ message: '학과가 삭제되었습니다.' });
  } catch (err) {
    console.error(err);
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ message: '해당 학과를 사용 중인 강의가 있어 삭제할 수 없습니다.' });
    }
    res.status(500).json({ message: '학과 삭제 중 오류가 발생했습니다.' });
  }
};

// 학기 관리
const getSemesters = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM Semesters ORDER BY year DESC, semester DESC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '학기 목록 조회 중 오류가 발생했습니다.' });
  }
};

const createSemester = async (req, res) => {
  const { year, semester, start_date, end_date } = req.body;
  if (!year || !semester || !start_date || !end_date) {
    return res.status(400).json({ message: '연도, 학기, 시작일, 종료일은 필수입니다.' });
  }

  // 브라우저에서 오는 값이 'YYYY-MM-DD' 형식이므로
  // 타임존 보정을 위해 Date 객체로 변환하지 않고 그대로 사용
  const startDateStr = String(start_date).split('T')[0];
  const endDateStr = String(end_date).split('T')[0];

  try {
    const [result] = await pool.query(
      'INSERT INTO Semesters (year, semester, start_date, end_date) VALUES (?, ?, ?, ?)',
      [year, semester, startDateStr, endDateStr]
    );
    
    // 감사 로그 기록
    await logAuditEvent(
      req.user.id,
      'SEMESTER_CREATED',
      'Semester',
      result.insertId,
      `학기 생성: ${year}년 ${semester}학기 (${startDateStr} ~ ${endDateStr})`,
      getClientIp(req)
    );
    
    res.status(201).json({ id: result.insertId, year, semester, start_date: startDateStr, end_date: endDateStr });
  } catch (err) {
    console.error(err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: '이미 존재하는 학기입니다.' });
    }
    res.status(500).json({ message: '학기 생성 중 오류가 발생했습니다.' });
  }
};

const updateSemester = async (req, res) => {
  const { id } = req.params;
  const { year, semester, start_date, end_date } = req.body;
  if (!year || !semester || !start_date || !end_date) {
    return res.status(400).json({ message: '연도, 학기, 시작일, 종료일은 필수입니다.' });
  }

  // 브라우저에서 오는 값이 'YYYY-MM-DD' 형식이므로
  // 타임존 보정을 위해 Date 객체로 변환하지 않고 그대로 사용
  const startDateStr = String(start_date).split('T')[0];
  const endDateStr = String(end_date).split('T')[0];

  try {
    // 기존 정보 조회
    const [oldSem] = await pool.query('SELECT year, semester, start_date, end_date FROM Semesters WHERE id = ?', [id]);
    
    const [result] = await pool.query(
      'UPDATE Semesters SET year = ?, semester = ?, start_date = ?, end_date = ? WHERE id = ?',
      [year, semester, startDateStr, endDateStr, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '학기를 찾을 수 없습니다.' });
    }
    
    // 감사 로그 기록
    const oldYear = oldSem[0]?.year || '';
    const oldSemester = oldSem[0]?.semester || '';
    const oldStart = oldSem[0]?.start_date || '';
    const oldEnd = oldSem[0]?.end_date || '';
    await logAuditEvent(
      req.user.id,
      'SEMESTER_UPDATED',
      'Semester',
      parseInt(id),
      `학기 수정: ${oldYear}년 ${oldSemester}학기 (${oldStart} ~ ${oldEnd}) → ${year}년 ${semester}학기 (${startDateStr} ~ ${endDateStr})`,
      getClientIp(req)
    );
    
    res.json({ id: parseInt(id), year, semester, start_date: startDateStr, end_date: endDateStr });
  } catch (err) {
    console.error(err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: '이미 존재하는 학기입니다.' });
    }
    res.status(500).json({ message: '학기 수정 중 오류가 발생했습니다.' });
  }
};

const deleteSemester = async (req, res) => {
  const { id } = req.params;
  try {
    // 기존 정보 조회
    const [oldSem] = await pool.query('SELECT year, semester FROM Semesters WHERE id = ?', [id]);
    
    const [result] = await pool.query('DELETE FROM Semesters WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '학기를 찾을 수 없습니다.' });
    }
    
    // 감사 로그 기록
    const semYear = oldSem[0]?.year || '알 수 없음';
    const semSemester = oldSem[0]?.semester || '알 수 없음';
    await logAuditEvent(
      req.user.id,
      'SEMESTER_DELETED',
      'Semester',
      parseInt(id),
      `학기 삭제: ${semYear}년 ${semSemester}학기`,
      getClientIp(req)
    );
    
    res.json({ message: '학기가 삭제되었습니다.' });
  } catch (err) {
    console.error(err);
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ message: '해당 학기를 사용 중인 강의가 있어 삭제할 수 없습니다.' });
    }
    res.status(500).json({ message: '학기 삭제 중 오류가 발생했습니다.' });
  }
};

async function generateClassSessionsForCourse(courseId, semesterId, schedules) {
  if (!semesterId || !Array.isArray(schedules) || schedules.length === 0) return;
  try {
    const [semesterRows] = await pool.query('SELECT start_date, end_date FROM Semesters WHERE id = ?', [semesterId]);
    const semester = semesterRows[0];
    if (!semester) return;

    const [holidayRows] = await pool.query('SELECT date FROM Holidays WHERE is_holiday = TRUE');
    const holidayDates = new Set(holidayRows.map(h => {
      // DATE 타입을 YYYY-MM-DD 문자열로 변환 (타임존 문제 방지)
      const d = h.date;
      if (d instanceof Date) {
        return d.toISOString().split('T')[0];
      } else if (typeof d === 'string') {
        return d.split('T')[0];
      }
      return String(d).split('T')[0];
    }));

    // DATE 타입을 안전하게 Date 객체로 변환 (로컬 타임존 사용)
    const startDateStr = semester.start_date instanceof Date 
      ? semester.start_date.toISOString().split('T')[0]
      : String(semester.start_date).split('T')[0];
    const endDateStr = semester.end_date instanceof Date
      ? semester.end_date.toISOString().split('T')[0]
      : String(semester.end_date).split('T')[0];
    
    // YYYY-MM-DD 형식의 문자열을 파싱하여 로컬 타임존으로 Date 객체 생성
    const [startYear, startMonth, startDay] = startDateStr.split('-').map(Number);
    const [endYear, endMonth, endDay] = endDateStr.split('-').map(Number);
    
    const start = new Date(startYear, startMonth - 1, startDay);
    const end = new Date(endYear, endMonth - 1, endDay);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return;

    const sessions = [];

    // 1) 학기 전체 날짜를 순회하면서, 시간표에 정의된 요일에 해당하는 날만 모은다.
    const classDates = []; // [{ dateStr, day_of_week }]
    let cursor = new Date(start);
    while (cursor <= end) {
      const dow = cursor.getDay(); // 0~6

      const year = cursor.getFullYear();
      const month = String(cursor.getMonth() + 1).padStart(2, '0');
      const day = String(cursor.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      if (!holidayDates.has(dateStr)) {
        const hasSchedule = schedules.some(s => {
          if (s.day_of_week === undefined || s.start_time == null || s.end_time == null) return false;
          const targetDow = parseInt(s.day_of_week);
          return !isNaN(targetDow) && targetDow === dow;
        });
        if (hasSchedule) {
          classDates.push({ dateStr, day_of_week: dow });
        }
      }

      cursor.setDate(cursor.getDate() + 1);
    }

    if (classDates.length === 0) return;

    // 2) 첫 수업 날짜를 기준으로 7일 단위로 주차를 계산
    const firstClass = classDates[0].dateStr;
    const [fy, fm, fd] = firstClass.split('-').map(Number);
    const firstDateObj = new Date(fy, fm - 1, fd);

    classDates.forEach(({ dateStr, day_of_week }) => {
      const [y, m, d] = dateStr.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      const diffDays = Math.floor((dateObj - firstDateObj) / (1000 * 60 * 60 * 24));
      const weekNumber = diffDays >= 0 ? Math.floor(diffDays / 7) + 1 : 1;

      // 해당 요일의 시간표(첫 번째 것)를 사용
      const sched = schedules.find(s => parseInt(s.day_of_week) === day_of_week && s.start_time && s.end_time);
      if (!sched) return;

      sessions.push([
        courseId,
        weekNumber,
        dateStr,
        sched.start_time,
        sched.end_time,
        'AUTH_CODE',
        null
      ]);
    });

    if (sessions.length > 0) {
      await pool.query(
        'INSERT INTO ClassSessions (course_id, week_number, session_date, start_time, end_time, attendance_method, auth_code) VALUES ?',
        [sessions]
      );
    }
  } catch (err) {
    console.error('자동 세션 생성 중 오류:', err);
  }
}

// 과목 관리 (관리자용)
const createCourse = async (req, res) => {
  const { title, instructor_id, department_id, semester_id, section, schedules, student_ids } = req.body;
  if (!title || !instructor_id || !department_id || !semester_id) {
    return res.status(400).json({ message: '강의명, 담당교원, 학과, 학기는 필수입니다.' });
  }
  if (!Array.isArray(schedules) || schedules.length === 0) {
    return res.status(400).json({ message: '최소 한 개의 요일/시간 스케줄이 필요합니다.' });
  }
  try {
    const [instructor] = await pool.query('SELECT * FROM Users WHERE id = ? AND role = "INSTRUCTOR"', [instructor_id]);
    if (!instructor[0]) {
      return res.status(404).json({ message: '담당교원을 찾을 수 없습니다.' });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [courseResult] = await connection.query(
        'INSERT INTO Courses (title, instructor_id, department_id, semester_id, section, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [title, instructor_id, department_id, semester_id, section || null, null, null, null]
      );
      const courseId = courseResult.insertId;

      // 요일/시간 스케줄 저장
      const validSchedules = schedules
        .filter(s => s && s.day_of_week !== undefined && s.start_time && s.end_time)
        .map(s => [
          courseId,
          parseInt(s.day_of_week),
          s.start_time,
          s.end_time,
        ]);

      if (validSchedules.length === 0) {
        throw new Error('유효한 요일/시간 스케줄이 없습니다.');
      }

      await connection.query(
        'INSERT INTO CourseSchedules (course_id, day_of_week, start_time, end_time) VALUES ?',
        [validSchedules]
      );

      const students = Array.isArray(student_ids) ? student_ids.filter(id => !!id) : [];
      if (students.length > 0) {
        const values = students.map(id => [id, courseId, 'STUDENT']);
        await connection.query(
          'INSERT INTO Enrollment (user_id, course_id, role) VALUES ? ON DUPLICATE KEY UPDATE role = VALUES(role)',
          [values]
        );
      }

      await connection.commit();

      const responseBody = {
        id: courseId,
        title,
        instructor_id,
        department_id,
        semester_id,
        section,
        schedule_count: validSchedules.length,
        student_count: students.length
      };

      // 감사 로그 기록
      await logAuditEvent(
        req.user.id,
        'COURSE_CREATED',
        'Course',
        courseId,
        `과목 생성: ${title} (담당교원 ID: ${instructor_id}, 학과 ID: ${department_id}, 학기 ID: ${semester_id})`,
        getClientIp(req)
      );

      res.status(201).json(responseBody);

      // 과목 생성 후 학기/시간표 기반으로 세션 자동 생성 (비동기)
      generateClassSessionsForCourse(courseId, semester_id, schedules).catch(() => {});
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '강의 생성 중 오류가 발생했습니다.' });
  }
};

const updateCourse = async (req, res) => {
  const { id } = req.params;
  const { title, instructor_id, department_id, semester_id, section, schedules, student_ids } = req.body;

  if (!title || !instructor_id || !department_id || !semester_id) {
    return res.status(400).json({ message: '강의명, 담당교원, 학과, 학기는 필수입니다.' });
  }

  if (!Array.isArray(schedules) || schedules.length === 0) {
    return res.status(400).json({ message: '최소 한 개의 요일/시간 스케줄이 필요합니다.' });
  }

  try {
    const [instructor] = await pool.query('SELECT * FROM Users WHERE id = ? AND role = "INSTRUCTOR"', [instructor_id]);
    if (!instructor[0]) {
      return res.status(404).json({ message: '담당교원을 찾을 수 없습니다.' });
    }
    
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 기존 정보 조회
      const [oldCourse] = await connection.query('SELECT title, instructor_id, department_id, semester_id, section FROM Courses WHERE id = ?', [id]);
      if (!oldCourse[0]) {
        await connection.rollback();
        return res.status(404).json({ message: '강의를 찾을 수 없습니다.' });
      }

      // 기본 정보 업데이트
      const [result] = await connection.query(
        'UPDATE Courses SET title = ?, instructor_id = ?, department_id = ?, semester_id = ?, section = ? WHERE id = ?',
        [title, instructor_id, department_id, semester_id, section || null, id]
      );
      if (result.affectedRows === 0) {
        await connection.rollback();
        return res.status(404).json({ message: '강의를 찾을 수 없습니다.' });
      }

      // 기존 시간표 삭제 후 새로 추가
      await connection.query('DELETE FROM CourseSchedules WHERE course_id = ?', [id]);
      
      const validSchedules = schedules
        .filter(s => s && s.day_of_week !== undefined && s.start_time && s.end_time)
        .map(s => [
          parseInt(id),
          parseInt(s.day_of_week),
          s.start_time,
          s.end_time,
        ]);

      if (validSchedules.length === 0) {
        await connection.rollback();
        return res.status(400).json({ message: '유효한 요일/시간 스케줄이 없습니다.' });
      }

      await connection.query(
        'INSERT INTO CourseSchedules (course_id, day_of_week, start_time, end_time) VALUES ?',
        [validSchedules]
      );

      // 수강생 리스트 업데이트
      // 기존 수강생 삭제
      await connection.query('DELETE FROM Enrollment WHERE course_id = ? AND role = "STUDENT"', [id]);
      
      // 새 수강생 추가
      const students = Array.isArray(student_ids) ? student_ids.filter(id => !!id) : [];
      if (students.length > 0) {
        const values = students.map(studentId => [studentId, parseInt(id), 'STUDENT']);
        await connection.query(
          'INSERT INTO Enrollment (user_id, course_id, role) VALUES ?',
          [values]
        );
      }

      await connection.commit();

      // 감사 로그 기록
      const oldTitle = oldCourse[0]?.title || '알 수 없음';
      await logAuditEvent(
        req.user.id,
        'COURSE_UPDATED',
        'Course',
        parseInt(id),
        `과목 수정: ${oldTitle} → ${title} (담당교원 ID: ${instructor_id}, 학과 ID: ${department_id}, 학기 ID: ${semester_id})`,
        getClientIp(req)
      );
      
      res.json({ 
        id: parseInt(id), 
        title, 
        instructor_id, 
        department_id, 
        semester_id, 
        section,
        schedule_count: validSchedules.length,
        student_count: students.length
      });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '강의 수정 중 오류가 발생했습니다.' });
  }
};

const deleteCourse = async (req, res) => {
  const { id } = req.params;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 기존 정보 조회
    const [oldCourse] = await connection.query('SELECT title FROM Courses WHERE id = ?', [id]);

    // 이 강의에 속한 세션 ID들 조회
    const [sessionRows] = await connection.query(
      'SELECT id FROM ClassSessions WHERE course_id = ?',
      [id]
    );
    const sessionIds = sessionRows.map(s => s.id);

    if (sessionIds.length > 0) {
      const sessionIdList = sessionIds;

      // 출석 기록 삭제
      await connection.query(
        'DELETE FROM Attendances WHERE session_id IN (?)',
        [sessionIdList]
      );

      // 공결 신청 삭제
      await connection.query(
        'DELETE FROM ExcuseRequests WHERE session_id IN (?)',
        [sessionIdList]
      );

      // 이의제기 삭제 (해당 강의 및 세션 기준)
      await connection.query(
        'DELETE FROM Appeals WHERE course_id = ? OR attendance_session_id IN (?)',
        [id, sessionIdList]
      );
    }

    // 공강 투표 및 응답 삭제
    const [voteRows] = await connection.query(
      'SELECT id FROM Votes WHERE course_id = ?',
      [id]
    );
    const voteIds = voteRows.map(v => v.id);
    if (voteIds.length > 0) {
      await connection.query(
        'DELETE FROM VoteResponses WHERE vote_id IN (?)',
        [voteIds]
      );
      await connection.query(
        'DELETE FROM Votes WHERE id IN (?)',
        [voteIds]
      );
    }

    // 알림, 메시지, 수강 정보, 보강일, 과목 스케줄, 세션 삭제
    await connection.query(
      'DELETE FROM Notifications WHERE course_id = ?',
      [id]
    );
    await connection.query(
      'DELETE FROM Messages WHERE course_id = ?',
      [id]
    );
    await connection.query(
      'DELETE FROM MakeupDays WHERE course_id = ?',
      [id]
    );
    await connection.query(
      'DELETE FROM Enrollment WHERE course_id = ?',
      [id]
    );
    await connection.query(
      'DELETE FROM CourseSchedules WHERE course_id = ?',
      [id]
    );
    await connection.query(
      'DELETE FROM ClassSessions WHERE course_id = ?',
      [id]
    );

    // 마지막으로 과목 삭제
    const [result] = await connection.query(
      'DELETE FROM Courses WHERE id = ?',
      [id]
    );
    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ message: '강의를 찾을 수 없습니다.' });
    }

    // 감사 로그 기록
    const courseTitle = oldCourse[0]?.title || '알 수 없음';
    await logAuditEvent(
      req.user.id,
      'COURSE_DELETED',
      'Course',
      parseInt(id),
      `과목 삭제: ${courseTitle}`,
      getClientIp(req)
    );

    await connection.commit();
    res.json({ message: '강의가 삭제되었습니다.' });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ message: '해당 강의를 참조하는 데이터가 남아 있어 삭제할 수 없습니다.' });
    }
    res.status(500).json({ message: '강의 삭제 중 오류가 발생했습니다.' });
  } finally {
    connection.release();
  }
};

// 사용자 관리
const getUsers = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, email, name, role, created_at FROM Users ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '사용자 목록 조회 중 오류가 발생했습니다.' });
  }
};

const createUser = async (req, res) => {
  const { email, name, role } = req.body;
  if (!email || !role) {
    return res.status(400).json({ message: '이메일과 역할은 필수입니다.' });
  }
  if (!['ADMIN', 'INSTRUCTOR', 'STUDENT'].includes(role)) {
    return res.status(400).json({ message: '유효하지 않은 역할입니다.' });
  }
  try {
    const [result] = await pool.query(
      'INSERT INTO Users (email, name, role) VALUES (?, ?, ?)',
      [email, name || null, role]
    );
    
    // 감사 로그 기록
    await logAuditEvent(
      req.user.id,
      'USER_CREATED',
      'User',
      result.insertId,
      `사용자 생성: ${email} (${name || '이름 없음'}) - 역할: ${role}`,
      getClientIp(req)
    );
    
    res.status(201).json({ id: result.insertId, email, name, role });
  } catch (err) {
    console.error(err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: '이미 존재하는 이메일입니다.' });
    }
    res.status(500).json({ message: '사용자 생성 중 오류가 발생했습니다.' });
  }
};

const updateUser = async (req, res) => {
  const { id } = req.params;
  const { email, name, role } = req.body;
  if (!email || !role) {
    return res.status(400).json({ message: '이메일과 역할은 필수입니다.' });
  }
  if (!['ADMIN', 'INSTRUCTOR', 'STUDENT'].includes(role)) {
    return res.status(400).json({ message: '유효하지 않은 역할입니다.' });
  }
  try {
    // 기존 정보 조회
    const [oldUser] = await pool.query('SELECT email, name, role FROM Users WHERE id = ?', [id]);
    
    const [result] = await pool.query(
      'UPDATE Users SET email = ?, name = ?, role = ? WHERE id = ?',
      [email, name || null, role, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
    }
    
    // 감사 로그 기록
    const oldEmail = oldUser[0]?.email || '알 수 없음';
    const oldName = oldUser[0]?.name || '이름 없음';
    const oldRole = oldUser[0]?.role || '알 수 없음';
    const changes = [];
    if (oldEmail !== email) changes.push(`이메일: ${oldEmail} → ${email}`);
    if (oldName !== (name || null)) changes.push(`이름: ${oldName || '없음'} → ${name || '없음'}`);
    if (oldRole !== role) changes.push(`역할: ${oldRole} → ${role}`);
    
    await logAuditEvent(
      req.user.id,
      'USER_UPDATED',
      'User',
      parseInt(id),
      `사용자 수정: ${oldEmail} - ${changes.join(', ')}`,
      getClientIp(req)
    );
    
    res.json({ id: parseInt(id), email, name, role });
  } catch (err) {
    console.error(err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: '이미 존재하는 이메일입니다.' });
    }
    res.status(500).json({ message: '사용자 수정 중 오류가 발생했습니다.' });
  }
};

const deleteUser = async (req, res) => {
  const { id } = req.params;
  try {
    // 기존 정보 조회
    const [oldUser] = await pool.query('SELECT email, name, role FROM Users WHERE id = ?', [id]);
    
    const [result] = await pool.query('DELETE FROM Users WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
    }
    
    // 감사 로그 기록
    const userEmail = oldUser[0]?.email || '알 수 없음';
    const userName = oldUser[0]?.name || '이름 없음';
    const userRole = oldUser[0]?.role || '알 수 없음';
    await logAuditEvent(
      req.user.id,
      'USER_DELETED',
      'User',
      parseInt(id),
      `사용자 삭제: ${userEmail} (${userName}) - 역할: ${userRole}`,
      getClientIp(req)
    );
    
    res.json({ message: '사용자가 삭제되었습니다.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '사용자 삭제 중 오류가 발생했습니다.' });
  }
};

// 감사 로그 조회
const getAuditLogs = async (req, res) => {
  try {
    const { action_type, start_date, end_date, limit = 100, offset = 0 } = req.query;
    
    let query = `
      SELECT 
        al.*,
        u.email as user_email,
        u.name as user_name,
        u.role as user_role
      FROM AuditLogs al
      LEFT JOIN Users u ON al.user_id = u.id
      WHERE 1=1
    `;
    const params = [];
    
    if (action_type) {
      query += ' AND al.action_type = ?';
      params.push(action_type);
    }
    
    if (start_date) {
      query += ' AND DATE(al.created_at) >= ?';
      params.push(start_date);
    }
    
    if (end_date) {
      query += ' AND DATE(al.created_at) <= ?';
      params.push(end_date);
    }
    
    query += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const [logs] = await pool.query(query, params);
    
    // 전체 개수 조회
    let countQuery = 'SELECT COUNT(*) as total FROM AuditLogs WHERE 1=1';
    const countParams = [];
    
    if (action_type) {
      countQuery += ' AND action_type = ?';
      countParams.push(action_type);
    }
    
    if (start_date) {
      countQuery += ' AND DATE(created_at) >= ?';
      countParams.push(start_date);
    }
    
    if (end_date) {
      countQuery += ' AND DATE(created_at) <= ?';
      countParams.push(end_date);
    }
    
    const [countResult] = await pool.query(countQuery, countParams);
    const total = countResult[0]?.total || 0;
    
    res.json({
      logs,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '감사 로그 조회 중 오류가 발생했습니다.' });
  }
};

// 시스템 리포트 (상태, 오류)
const getSystemReport = async (req, res) => {
  try {
    const [userStats] = await pool.query(`
      SELECT role, COUNT(*) as count 
      FROM Users 
      GROUP BY role
    `);
    const [courseStats] = await pool.query(`
      SELECT COUNT(*) as total_courses,
             COUNT(DISTINCT instructor_id) as total_instructors
      FROM Courses
    `);
    const [sessionStats] = await pool.query(`
      SELECT COUNT(*) as total_sessions,
             SUM(CASE WHEN is_open = 1 THEN 1 ELSE 0 END) as open_sessions
      FROM ClassSessions
    `);
    const [attendanceStats] = await pool.query(`
      SELECT COUNT(*) as total_attendances,
             SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as present_count,
             SUM(CASE WHEN status = 2 THEN 1 ELSE 0 END) as late_count,
             SUM(CASE WHEN status = 3 THEN 1 ELSE 0 END) as absent_count
      FROM Attendances
    `);
    const [errorLogs] = await pool.query(`
      SELECT * FROM AuditLogs 
      WHERE action_type = 'ERROR' 
      ORDER BY created_at DESC 
      LIMIT 50
    `);
    res.json({
      user_stats: userStats,
      course_stats: courseStats[0] || { total_courses: 0, total_instructors: 0 },
      session_stats: sessionStats[0] || { total_sessions: 0, open_sessions: 0 },
      attendance_stats: attendanceStats[0] || { total_attendances: 0, present_count: 0, late_count: 0, absent_count: 0 },
      recent_errors: errorLogs
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '시스템 리포트 생성 중 오류가 발생했습니다.' });
  }
};

module.exports = {
  // 학과
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  // 학기
  getSemesters,
  createSemester,
  updateSemester,
  deleteSemester,
  // 과목
  createCourse,
  updateCourse,
  deleteCourse,
  // 사용자
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  // 감사 로그
  getAuditLogs,
  // 리포트
  getSystemReport
};

