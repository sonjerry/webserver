const API_BASE = window.location.origin;

// 토큰 가져오기 (localStorage만 사용, 시크릿 모드에서 탭 간 간섭 방지)
function getAuthToken() {
  return localStorage.getItem('token') || null;
}

let token = getAuthToken();
let currentUser = JSON.parse(localStorage.getItem('user') || '{}');

// 현재 교원이 진행 중으로 연 세션 ID (탭 이동/페이지 이탈 시 자동 마감용)
let currentOpenSessionId = null;
// 강의별 세션 캐시 (주차 → 날짜 자동 계산용)
const courseSessionsCache = {};

// 날짜를 YYYY-MM-DD 형식으로 정규화 (ISO 8601 또는 다른 형식 처리)
function normalizeDate(dateStr) {
  if (!dateStr) return null;
  // ISO 8601 형식 (2025-10-11T15:00:00.000Z) 또는 날짜만 있는 형식 처리
  const match = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : dateStr;
}

// Authorization 헤더 기반 로그인 확인
async function checkAuth() {
  // 매번 최신 토큰 사용 (localStorage)
  token = getAuthToken();
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
    });

    if (res.ok) {
      const data = await res.json();
      currentUser = data.user;
      localStorage.setItem('user', JSON.stringify(currentUser));
      if (currentUser.role !== 'INSTRUCTOR') {
        window.location.href = 'index.html';
      }
      // 헤더에 사용자 정보 표시
      updateUserInfoDisplay();
      return true;
    } else {
      // 응답 상태 코드에 따라 처리
      const status = res.status;
      
      // 401: 인증 실패 (토큰 없음/만료)
      if (status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'index.html';
        return false;
      }
      
      // 403: 권한 없음 - 현재 사용자의 토큰으로는 접근 불가
      if (status === 403) {
        const errorData = await res.json().catch(() => ({ message: '권한이 없습니다.' }));
        console.error('권한 오류:', errorData.message);
        // 권한 없음은 리다이렉트하지 않고 에러만 표시
        document.body.innerHTML = `
          <div style="padding: 20px; text-align: center;">
            <h2>권한 오류</h2>
            <p>${errorData.message || '이 페이지에 접근할 권한이 없습니다.'}</p>
            <p>올바른 계정으로 로그인해주세요.</p>
            <button onclick="window.location.href='index.html'" style="margin-top: 20px; padding: 10px 20px;">로그인 페이지로</button>
          </div>
        `;
        return false;
      }
      
      // 기타 에러 - 인증 실패로 처리
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = 'index.html';
      return false;
    }
  } catch (err) {
    console.error('인증 확인 실패:', err);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = 'index.html';
    return false;
  }
}

// 헤더에 사용자 정보 표시
function updateUserInfoDisplay() {
  const nameDisplay = document.getElementById('user-name-display');
  const deptDisplay = document.getElementById('user-department-display');
  if (nameDisplay) {
    nameDisplay.textContent = currentUser.name || currentUser.email || '사용자';
  }
  if (deptDisplay) {
    deptDisplay.textContent = currentUser.department_name ? `(${currentUser.department_name})` : '';
  }
}

// 페이지 로드 시 인증 확인
checkAuth();

// 페이지 로드 시 저장된 사용자 정보로 초기 표시
if (currentUser && currentUser.id) {
  updateUserInfoDisplay();
}

// 로그아웃
document.getElementById('logout-btn').addEventListener('click', async () => {
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch (err) {
    console.error('로그아웃 요청 실패:', err);
  }
  // localStorage 정리
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = 'index.html';
});

// API 호출 헬퍼
async function apiCall(endpoint, options = {}) {
  // 매 호출 시 최신 토큰 사용 (localStorage)
  token = getAuthToken();
  
  if (!token) {
    // 토큰이 없으면 로그인 페이지로 리다이렉트
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'index.html';
    throw new Error('인증 토큰이 없습니다.');
  }
  
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }
  });
  if (!response.ok) {
    if (response.status === 401) {
      // 인증 실패 시 localStorage 정리
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = 'index.html';
      return;
    }
    if (response.status === 403) {
      // 권한 없음 - 현재 사용자의 토큰으로는 접근 불가
      const error = await response.json().catch(() => ({ message: '권한이 없습니다.' }));
      throw new Error(error.message || '권한이 없습니다.');
    }
    const error = await response.json().catch(() => ({ message: '요청 실패' }));
    throw new Error(error.message || '요청 실패');
  }
  return response.json();
}

// 탭 전환
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    // 탭 전환 시 출석 세션은 유지 (페이지 이탈 시에만 마감)
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
    
    // 탭별 데이터 로드
    if (btn.dataset.tab === 'courses') {
      loadCourses();
    }
    else if (btn.dataset.tab === 'attendance') {
      loadCoursesForAttendance();
    }
    else if (btn.dataset.tab === 'excuses') {
      loadCoursesForSelect('excuse-course-filter');
      loadExcuses();
    }
    else if (btn.dataset.tab === 'appeals') {
      loadAppeals();
    }
    else if (btn.dataset.tab === 'announcements') loadCoursesForSelect('announcement-course');
    else if (btn.dataset.tab === 'messages') {
      loadChatRooms();
    }
    else if (btn.dataset.tab === 'votes') {
      loadCoursesForSelect('vote-course');
      loadVotes();
    }
    else if (btn.dataset.tab === 'reports') initInstructorReports();
  });
});

// 페이지 이탈 시 진행 중인 출석 세션 자동 마감
window.addEventListener('beforeunload', () => {
  // 팝업이 열려있으면 세션 마감 (인증번호/전자출결 방식)
  const modal = document.getElementById('attendance-session-modal');
  const isPopupOpen = modal && modal.classList.contains('open');
  
  if (isPopupOpen && currentAttendanceSessionId) {
    try {
      // sendBeacon은 비동기이지만 브라우저가 언로드 시점에 최대한 전송을 시도함
      navigator.sendBeacon(`${API_BASE}/sessions/${currentAttendanceSessionId}/close`);
      currentAttendanceSessionId = null;
      currentOpenSessionId = null;
    } catch (e) {
      // 실패해도 추가 처리 없음
    }
  } else if (currentOpenSessionId) {
    // 호명 방식 등 팝업이 없는 경우
    try {
      navigator.sendBeacon(`${API_BASE}/sessions/${currentOpenSessionId}/close`);
      currentOpenSessionId = null;
    } catch (e) {
      // 실패해도 추가 처리 없음
    }
  }
});

// 기존 교원 대시보드 출석 요약 기능은 제거되고, 출석 현황 탭에서 주차/학생별로 관리합니다.

let myCourses = [];

// 담당 강의 목록
async function loadCourses() {
  try {
    const courses = await apiCall('/instructor/courses');
    if (!courses || !Array.isArray(courses)) {
      console.error('강의 목록 응답 형식이 올바르지 않습니다:', courses);
      return;
    }
    myCourses = courses;
    const list = document.getElementById('courses-list');
    list.innerHTML = courses.map(course => `
      <div class="list-item course-list-item" data-course-id="${course.id}">
        <div>
          <strong>${course.title}</strong>
          ${course.section ? ` (${course.section})` : ''}
          ${course.department_name ? ` - ${course.department_name}` : ''}
          ${course.year && course.semester ? ` - ${course.year}년 ${course.semester === '1' ? '1학기' : course.semester === '2' ? '2학기' : course.semester}</div>` : ''}
        </div>
      </div>
    `).join('');

    list.onclick = (e) => {
      const item = e.target.closest('.course-list-item');
      if (!item) return;
      list.querySelectorAll('.course-list-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      const id = parseInt(item.dataset.courseId, 10);
      if (!Number.isNaN(id)) {
        renderCourseDetailPanel(id);
      }
    };

    // 첫 강의 자동 선택
    if (courses.length > 0) {
      renderCourseDetailPanel(courses[0].id);
      const firstItem = list.querySelector('.course-list-item');
      if (firstItem) firstItem.classList.add('active');
    } else {
      const panel = document.getElementById('course-detail-panel');
      if (panel) {
        panel.innerHTML = '<p>담당 강의가 없습니다.</p>';
      }
    }

    // 담당 강의 탭 하단 통합 강의 일정 달력 갱신
    loadInstructorCalendar(courses);
  } catch (err) {
    alert('강의 목록 로드 실패: ' + err.message);
  }
}

function renderCourseDetailPanel(courseId) {
  const panel = document.getElementById('course-detail-panel');
  if (!panel) return;
  const course = myCourses.find(c => c.id === courseId);
  if (!course) {
    panel.innerHTML = '<p>강의 정보를 불러올 수 없습니다.</p>';
    return;
  }

  const semesterText = course.year && course.semester
    ? `${course.year}년 ${course.semester === '1' ? '1학기' : course.semester === '2' ? '2학기' : course.semester}`
    : '학기 정보 없음';

  panel.innerHTML = `
    <div class="course-detail-meta-text">
      <p><strong>과목명</strong> ${course.title}${course.section ? ` (${course.section})` : ''}</p>
      <p><strong>학과</strong> ${course.department_name || '정보 없음'}</p>
      <p><strong>학기</strong> ${semesterText}</p>
    </div>
    <div class="form-group">
      <label>주차</label>
      <input type="number" id="course-att-week" min="1" placeholder="예: 3">
    </div>
    <div class="form-group">
      <label>수업 날짜</label>
      <input type="date" id="course-att-date">
    </div>
    <div class="attendance-method-group">
      <label>출석 방식</label>
      <div class="attendance-method-options">
        <label>
          <input type="radio" name="course-att-method" value="ROLL_CALL" checked>
          호명
        </label>
        <label>
          <input type="radio" name="course-att-method" value="AUTH_CODE">
          인증번호
        </label>
        <label>
          <input type="radio" name="course-att-method" value="ELECTRONIC">
          전자출결
        </label>
      </div>
    </div>
    <div style="margin-top: 12px; display:flex; gap:8px; justify-content:flex-end;">
      <button class="btn btn-secondary" id="course-att-to-attendance">출석 현황 보기</button>
      <button class="btn btn-primary" id="course-att-create">출석 열기</button>
    </div>
    <div id="course-att-result" class="hint-text"></div>
  `;

  document.getElementById('course-att-to-attendance').onclick = () => {
    // 출석 현황 탭으로 전환 후 이 강의 선택
    const attendanceTabBtn = document.querySelector('.tab-btn[data-tab="attendance"]');
    if (attendanceTabBtn) attendanceTabBtn.click();
    setTimeout(() => {
      const courseSelect = document.getElementById('attendance-course-select');
      if (courseSelect) {
        courseSelect.value = String(courseId);
        courseSelect.dispatchEvent(new Event('change'));
      }
    }, 200);
  };

  document.getElementById('course-att-create').onclick = async () => {
    const weekInput = document.getElementById('course-att-week');
    const dateInput = document.getElementById('course-att-date');
    const methodInput = panel.querySelector('input[name="course-att-method"]:checked');
    const resultDiv = document.getElementById('course-att-result');

    const week = parseInt(weekInput.value, 10);
    const date = dateInput.value;
    const method = methodInput ? methodInput.value : 'ROLL_CALL';

    if (!week || !date) {
      alert('주차와 날짜를 입력해주세요.');
      return;
    }

    try {
      resultDiv.textContent = '세션을 생성하는 중입니다...';
      const created = await apiCall(`/sessions/course/${course.id}`, {
        method: 'POST',
        body: JSON.stringify({
          course_id: course.id,
          week_number: week,
          session_date: date,
          start_time: null,
          end_time: null,
          attendance_method: method
        })
      });

      // 호명 방식은 팝업 없이도 세션 열기 가능
      // 인증번호/전자출결은 팝업이 열려있을 때만 세션 활성화
      if (method === 'ROLL_CALL') {
        // 호명 방식: 다른 진행 중인 세션들을 먼저 마감하지 않고 바로 열기
        await apiCall(`/sessions/${created.id}/open`, { method: 'POST' });
        currentOpenSessionId = created.id;
        resultDiv.textContent = `호명 출석 세션이 생성되었습니다. (세션 ID: ${created.id}) 출석 현황 탭에서 학생별로 상태를 조정하세요.`;
        // 출석 현황 탭으로 전환하여 방금 생성한 세션 선택
        const attendanceTabBtn = document.querySelector('.tab-btn[data-tab="attendance"]');
        if (attendanceTabBtn) attendanceTabBtn.click();
        setTimeout(async () => {
          const courseSelect = document.getElementById('attendance-course-select');
          if (courseSelect) {
            courseSelect.value = String(course.id);
            await loadSessionsForAttendance(course.id);
            const list = document.getElementById('attendance-session-list');
            const item = list?.querySelector(`.attendance-session-item[data-session-id="${created.id}"]`);
            if (item) {
              list.querySelectorAll('.attendance-session-item').forEach(el => el.classList.remove('active'));
              item.classList.add('active');
            }
            loadAttendanceForSession(created.id);
          }
        }, 300);
      } else if (method === 'AUTH_CODE' || method === 'ELECTRONIC') {
        // 인증번호 또는 전자출결일 경우: 다른 진행 중인 세션들을 먼저 마감
        try {
          const dashboard = await apiCall('/dashboard/instructor');
          if (dashboard.open_sessions && dashboard.open_sessions.length > 0) {
            // 현재 열려있는 세션들을 모두 마감 (현재 생성한 세션 제외)
            const closePromises = dashboard.open_sessions
              .filter(s => s.id !== created.id)
              .map(s => apiCall(`/sessions/${s.id}/close`, { method: 'POST' }).catch(() => {}));
            await Promise.all(closePromises);
          }
        } catch (err) {
          console.error('다른 세션 마감 실패:', err);
        }
        
        // 세션 열기
        await apiCall(`/sessions/${created.id}/open`, { method: 'POST' });
        currentOpenSessionId = created.id;
        
        // 팝업 띄우기
        openAttendanceSessionPopup(created.id, course.title, week, date, method, created.auth_code);
      }
    } catch (err) {
      console.error('출석 세션 생성 실패:', err);
      resultDiv.textContent = `세션 생성 실패: ${err.message}`;
    }
  };

  // 주차 입력 시 자동으로 수업 날짜 채우기
  const weekInput = document.getElementById('course-att-week');
  const dateInput = document.getElementById('course-att-date');
  if (weekInput && dateInput) {
    weekInput.addEventListener('input', async () => {
      const week = parseInt(weekInput.value, 10);
      if (!week) return;

      // 캐시에 없는 경우 한 번 더 로드
      if (!Array.isArray(courseSessionsCache[course.id])) {
        try {
          const sessions = await apiCall(`/sessions/course/${course.id}`);
          courseSessionsCache[course.id] = sessions || [];
        } catch (err) {
          console.error('세션 정보 로드 실패:', err);
        }
      }

      const sessions = courseSessionsCache[course.id] || [];
      const candidates = sessions
        .filter(s => Number(s.week_number) === week && s.session_date)
        .sort((a, b) => new Date(a.session_date) - new Date(b.session_date));

      if (candidates.length > 0) {
        const normalizedDate = normalizeDate(candidates[0].session_date);
        if (normalizedDate) {
          dateInput.value = normalizedDate;
        }
      }
    });
  }
}

// 교원 전용 통합 강의 일정 달력 로드
async function loadInstructorCalendar(coursesFromCaller) {
  const container = document.getElementById('instructor-calendar');
  if (!container) return;

  try {
    const courses = Array.isArray(coursesFromCaller)
      ? coursesFromCaller
      : await apiCall('/instructor/courses');

    // 1) 과목 시간표(요일) + 학기 기간을 기준으로 "계획된 강의 일정" 생성
    let allSessions = [];
    for (const course of courses) {
      const semesterStart = course.semester_start_date;
      const semesterEnd = course.semester_end_date;

      // 학기 정보가 없으면 스킵
      if (!semesterStart || !semesterEnd) continue;

      const start = new Date(semesterStart);
      const end = new Date(semesterEnd);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) continue;

      // 이 과목의 요일/시간표 조회 (월/수 같이 여러 요일 지원)
      let schedules = [];
      try {
        schedules = await apiCall(`/courses/${course.id}/schedules`).catch(() => []);
      } catch (_) {
        schedules = [];
      }
      if (!Array.isArray(schedules) || schedules.length === 0) continue;

      // 학기 전체 날짜를 돌면서, 시간표에 정의된 요일에만 표시용 세션 생성
      schedules.forEach(sched => {
        if (sched.day_of_week === undefined || sched.day_of_week === null) return;
        const targetDow = parseInt(sched.day_of_week, 10);
        if (Number.isNaN(targetDow) || targetDow < 0 || targetDow > 6) return;

        let current = new Date(start);
        while (current <= end) {
          if (current.getDay() === targetDow) {
            const year = current.getFullYear();
            const month = String(current.getMonth() + 1).padStart(2, '0');
            const day = String(current.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;

            allSessions.push({
              course_id: course.id,
              course_title: course.title,
              // 주차 정보는 화면 표시에 필수는 아니므로 생략하거나 나중에 계산 가능
              week_number: null,
              session_date: dateStr
            });
          }
          current.setDate(current.getDate() + 1);
        }
      });
    }

    // 2) 보강일 정보를 반영 (보강일 날짜에 동일 주차 수업 표시)
    try {
      const makeupDays = await apiCall('/instructor/makeup-days').catch(() => []);
      for (const makeup of makeupDays) {
        const originalSession = allSessions.find(s =>
          s.course_id === makeup.course_id && s.week_number === makeup.week_number
        );
        if (!originalSession || !makeup.makeup_date) continue;

        const normalizedMakeupDate = normalizeDate(makeup.makeup_date);
        if (!normalizedMakeupDate) continue;

        allSessions.push({
          ...originalSession,
          session_date: normalizedMakeupDate,
          is_makeup: true,
          original_date: makeup.original_date
        });
      }
    } catch (err) {
      console.error('보강일 정보 로드 실패:', err);
    }

    // 공휴일 정보 가져오기
    let holidays = [];
    try {
      holidays = await apiCall('/instructor/holidays').catch(() => []);
      // container에 공휴일 정보 저장 (월 변경 시 재사용)
      container.dataset.holidays = JSON.stringify(holidays);
    } catch (err) {
      console.error('공휴일 정보 로드 실패:', err);
    }

    renderSimpleCalendar(container, allSessions, true, holidays);
  } catch (err) {
    console.error('강의 일정 달력 로드 실패:', err);
    container.innerHTML = '<p>강의 일정을 불러올 수 없습니다.</p>';
  }
}

// 간단 달력 렌더러 (강의/학생 공용)
function renderSimpleCalendar(container, sessions = [], showCourseTitle = true, holidays = []) {
  const today = new Date();

  // 공휴일을 날짜별로 매핑
  const holidaysByDate = {};
  holidays.forEach(h => {
    if (h.date && h.is_holiday) {
      const normalized = normalizeDate(h.date);
      if (normalized) {
        holidaysByDate[normalized] = h.name || '공휴일';
      }
    }
  });

  // 세션이 존재하는 연/월 목록 계산
  const sessionMonthKeys = Array.isArray(sessions) ? Array.from(
    new Set(
      sessions
        .filter(s => s.session_date)
        .map(s => {
          const normalized = normalizeDate(s.session_date);
          return normalized ? normalized.slice(0, 7) : null; // YYYY-MM
        })
        .filter(Boolean)
    )
  ).sort() : [];

  // 공휴일이 있는 연/월 목록 계산
  const holidayMonthKeys = Array.from(
    new Set(
      Object.keys(holidaysByDate).map(date => date.slice(0, 7))
    )
  ).sort();

  // 세션과 공휴일의 월을 합쳐서 정렬
  const monthKeys = Array.from(new Set([...sessionMonthKeys, ...holidayMonthKeys])).sort();

  // monthKeys가 비어있으면 오늘 날짜를 기본으로 사용
  if (monthKeys.length === 0) {
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    monthKeys.push(todayStr);
  }

  // 표시할 월 인덱스 (container dataset에 보관)
  let monthIndex = parseInt(container.dataset.monthIndex || '0', 10);
  if (Number.isNaN(monthIndex) || monthIndex < 0 || monthIndex >= monthKeys.length) {
    monthIndex = 0;
  }
  
  if (!monthKeys[monthIndex]) {
    monthIndex = 0;
  }
  
  const [yearStr, monthStr] = monthKeys[monthIndex].split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1; // 0-based
  container.dataset.monthIndex = String(monthIndex);

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const startWeekDay = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const sessionsByDate = {};
  sessions.forEach(s => {
    if (!s.session_date) return;
    const normalized = normalizeDate(s.session_date);
    if (!normalized) return;
    const key = normalized; // YYYY-MM-DD 형식으로 정규화
    if (!sessionsByDate[key]) sessionsByDate[key] = [];
    sessionsByDate[key].push(s);
  });

  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
      <button type="button" class="cal-nav cal-prev" style="border:none;background:none;cursor:pointer;padding:4px 8px;">◀</button>
      <div style="font-weight:600;">${year}년 ${month + 1}월</div>
      <button type="button" class="cal-nav cal-next" style="border:none;background:none;cursor:pointer;padding:4px 8px;">▶</button>
    </div>
    <div style="overflow-x:auto;">
      <table style="width:100%; border-collapse:collapse; font-size:0.85rem; table-layout:fixed;">
        <thead>
          <tr>
            ${dayNames.map(d => `<th style="width:14.28%; padding:6px; border-bottom:1px solid #e5e7eb; text-align:center;">${d}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
  `;

  let currentDay = 1;
  const totalCells = Math.ceil((startWeekDay + daysInMonth) / 7) * 7;
  
  html += '<tr>';
  for (let i = 0; i < totalCells; i++) {
    if (i % 7 === 0 && i > 0) {
      html += '</tr><tr>';
    }
    
    if (i < startWeekDay || currentDay > daysInMonth) {
      html += '<td style="width:14.28%; padding:6px; border-bottom:1px solid #f3f4f6; min-height:80px; height:80px;"></td>';
    } else {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`;
      const daySessions = sessionsByDate[dateStr] || [];
      const holidayName = holidaysByDate[dateStr];
      const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === currentDay;
      const isHoliday = !!holidayName;
      // 해당 날짜의 요일 계산 (0=일요일, 6=토요일)
      const dayOfWeek = new Date(year, month, currentDay).getDay();
      const isSunday = dayOfWeek === 0;
      
      // 공휴일이거나 일요일이면 빨간색으로 표시
      const dayColor = (isHoliday || isSunday) ? '#ef4444' : '#111827';
      const cellBg = isToday ? '#eff6ff' : (isHoliday ? '#fef2f2' : '');
      
      html += `<td style="width:14.28%; vertical-align:top; padding:6px; border-bottom:1px solid #f3f4f6; min-height:80px; height:80px; ${cellBg ? `background:${cellBg};` : ''}">`;
      html += `<div style="font-weight:600; font-size:0.8rem; margin-bottom:4px; color:${dayColor};">${currentDay}</div>`;
      html += '<div style="overflow:hidden; word-break:break-word; line-height:1.3;">';
      
      // 공휴일 표시
      if (holidayName) {
        html += `<div style="margin-bottom:2px; font-size:0.75rem; color:#ef4444; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${holidayName}">${holidayName}</div>`;
      }
      
      // 세션 표시
      daySessions.forEach(s => {
        const title = showCourseTitle && s.course_title ? s.course_title : '';
        const isMakeup = s.is_makeup === true;
        const text = `${title ? `${title} ` : ''}${s.week_number ? `${s.week_number}주차` : ''}${isMakeup ? ' (보강)' : ''}`;
        const color = isMakeup ? '#991b1b' : '#4b5563';
        html += `<div style="margin-bottom:2px; font-size:0.75rem; color:${color}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; ${isMakeup ? 'font-weight:600;' : ''}" title="${text}">${text}</div>`;
      });
      html += '</div>';
      html += '</td>';
      currentDay++;
    }
  }
  html += '</tr>';

  html += `
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = html;

  // 월 변경 버튼 이벤트 바인딩
  const prevBtn = container.querySelector('.cal-prev');
  const nextBtn = container.querySelector('.cal-next');
  if (prevBtn) {
    prevBtn.onclick = () => {
      let idx = parseInt(container.dataset.monthIndex || '0', 10);
      if (Number.isNaN(idx)) idx = 0;
      if (idx > 0) {
        container.dataset.monthIndex = String(idx - 1);
        // holidays 정보는 container에 저장해두고 재사용
        const holidays = container.dataset.holidays ? JSON.parse(container.dataset.holidays) : [];
        renderSimpleCalendar(container, sessions, showCourseTitle, holidays);
      }
    };
  }
  if (nextBtn) {
    nextBtn.onclick = () => {
      let idx = parseInt(container.dataset.monthIndex || '0', 10);
      if (Number.isNaN(idx)) idx = 0;
      // monthKeys 길이는 함수 안에서만 알 수 있으므로, 세션에서 다시 계산
      const months = Array.from(
        new Set(
          sessions
            .filter(s => s.session_date)
            .map(s => {
              const normalized = normalizeDate(s.session_date);
              return normalized ? normalized.slice(0, 7) : null;
            })
            .filter(Boolean)
        )
      ).sort();
      if (idx < months.length - 1) {
        container.dataset.monthIndex = String(idx + 1);
        // holidays 정보는 container에 저장해두고 재사용
        const holidays = container.dataset.holidays ? JSON.parse(container.dataset.holidays) : [];
        renderSimpleCalendar(container, sessions, showCourseTitle, holidays);
      }
    };
  }
}

// 강의 선택용 드롭다운 로드
async function loadCoursesForSelect(selectId) {
  try {
    const courses = await apiCall('/instructor/courses');
    if (!courses || !Array.isArray(courses)) {
      console.error('강의 목록 응답 형식이 올바르지 않습니다:', courses);
      return;
    }
    const select = document.getElementById(selectId);
    select.innerHTML = '<option value="">강의 선택</option>' + 
      courses.map(course => `<option value="${course.id}">${course.title}</option>`).join('');
  } catch (err) {
    console.error('강의 목록 로드 실패:', err);
  }
}


// 보강 처리
async function handleMakeupSession(courseId, weekNumber, originalDate, sessionId) {
  const reasonOptions = [
    '공휴일',
    '교원 사정',
    '시험 일정 조정',
    '기타'
  ];
  
  let reasonChoice = prompt(`보강 사유를 선택하거나 직접 입력하세요:\n${reasonOptions.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n\n번호를 입력하거나 직접 입력하세요:`);
  
  let reason = '';
  if (reasonChoice && !isNaN(reasonChoice) && parseInt(reasonChoice) >= 1 && parseInt(reasonChoice) <= reasonOptions.length) {
    reason = reasonOptions[parseInt(reasonChoice) - 1];
    const additional = prompt('추가 사유 (선택):');
    if (additional) {
      reason += ` - ${additional}`;
    }
  } else if (reasonChoice) {
    reason = reasonChoice;
  } else {
    alert('보강 사유를 입력해주세요.');
    return;
  }

  const makeupDate = prompt('보강 날짜를 입력하세요 (YYYY-MM-DD):', '');
  if (!makeupDate) {
    alert('보강 날짜를 입력해주세요.');
    return;
  }

  try {
    await apiCall('/instructor/makeup-days', {
      method: 'POST',
      body: JSON.stringify({
        course_id: courseId,
        week_number: weekNumber,
        original_date: originalDate || null,
        makeup_date: makeupDate,
        reason: reason || null
      })
    });
    alert('보강일이 등록되었습니다.');
    // 출석 현황 다시 로드
    loadAttendanceForSession(sessionId);
    // 주차 목록도 다시 로드
    const courseSelect = document.getElementById('attendance-course-select');
    if (courseSelect && courseSelect.value) {
      loadSessionsForAttendance(parseInt(courseSelect.value, 10));
    }
  } catch (err) {
    alert('보강일 등록 실패: ' + err.message);
  }
}

// 보강 취소
async function removeMakeupSession(courseId, weekNumber, sessionId) {
  if (!confirm('보강 처리를 취소하시겠습니까?')) return;

  try {
    const makeupDays = await apiCall('/instructor/makeup-days');
    const target = makeupDays.find(m => m.course_id === courseId && m.week_number === weekNumber);
    
    if (!target) {
      alert('보강일 정보를 찾을 수 없습니다.');
      return;
    }

    await apiCall(`/instructor/makeup-days/${target.id}`, {
      method: 'DELETE'
    });
    
    alert('보강 처리가 취소되었습니다.');
    // 출석 현황 다시 로드
    loadAttendanceForSession(sessionId);
    // 주차 목록도 다시 로드
    const courseSelect = document.getElementById('attendance-course-select');
    if (courseSelect && courseSelect.value) {
      loadSessionsForAttendance(parseInt(courseSelect.value, 10));
    }
  } catch (err) {
    alert('보강 취소 실패: ' + err.message);
  }
}

// 출석 열기/일시정지/마감 (출석 현황 탭에서 사용)
async function openSession(id) {
  try {
    // 세션 정보 먼저 가져오기
    const session = await apiCall(`/sessions/${id}`);
    
    // 인증번호나 전자출결이면 팝업이 열려있을 때만 세션 활성화
    if (session.attendance_method === 'AUTH_CODE' || session.attendance_method === 'ELECTRONIC') {
      // 다른 진행 중인 출석 세션들을 먼저 마감
      try {
        const dashboard = await apiCall('/dashboard/instructor');
        if (dashboard.open_sessions && dashboard.open_sessions.length > 0) {
          // 현재 열려있는 세션들을 모두 마감 (현재 열려있는 세션 제외)
          const closePromises = dashboard.open_sessions
            .filter(s => s.id !== id)
            .map(s => apiCall(`/sessions/${s.id}/close`, { method: 'POST' }).catch(() => {}));
          await Promise.all(closePromises);
        }
      } catch (err) {
        console.error('다른 세션 마감 실패:', err);
      }
      
      // 세션 열기
      await apiCall(`/sessions/${id}/open`, { method: 'POST' });
      currentOpenSessionId = id;
      
      // 팝업 열기
      const weekNumber = session.week_number || '';
      const sessionDate = session.session_date || '';
      const courseTitle = session.course_title || '강의';
      openAttendanceSessionPopup(id, courseTitle, weekNumber, sessionDate, session.attendance_method, session.auth_code);
    } else {
      // 호명 방식은 팝업 없이도 세션 열기 가능
      await apiCall(`/sessions/${id}/open`, { method: 'POST' });
      currentOpenSessionId = id;
      alert('출석이 열렸습니다.');
    }
    
    // 출석 현황 다시 로드
    loadAttendanceForSession(id);
    // 주차 목록도 다시 로드
    const courseSelect = document.getElementById('attendance-course-select');
    if (courseSelect && courseSelect.value) {
      loadSessionsForAttendance(parseInt(courseSelect.value, 10));
    }
  } catch (err) {
    alert('출석 열기 실패: ' + err.message);
  }
}

async function pauseSession(id) {
  try {
    await apiCall(`/sessions/${id}/pause`, { method: 'POST' });
    alert('출석이 일시정지되었습니다.');
    if (currentOpenSessionId === id) {
      currentOpenSessionId = null;
    }
    // 출석 현황 다시 로드
    loadAttendanceForSession(id);
    // 주차 목록도 다시 로드
    const courseSelect = document.getElementById('attendance-course-select');
    if (courseSelect && courseSelect.value) {
      loadSessionsForAttendance(parseInt(courseSelect.value, 10));
    }
  } catch (err) {
    alert('출석 일시정지 실패: ' + err.message);
  }
}

async function closeSession(id) {
  try {
    await apiCall(`/sessions/${id}/close`, { method: 'POST' });
    alert('출석이 마감되었습니다.');
    if (currentOpenSessionId === id) {
      currentOpenSessionId = null;
    }
    // 출석 현황 다시 로드
    loadAttendanceForSession(id);
    // 주차 목록도 다시 로드
    const courseSelect = document.getElementById('attendance-course-select');
    if (courseSelect && courseSelect.value) {
      loadSessionsForAttendance(parseInt(courseSelect.value, 10));
    }
  } catch (err) {
    alert('출석 마감 실패: ' + err.message);
  }
}

// 출석 현황 탭 - 강의/주차 기반 UI
async function loadCoursesForAttendance() {
  try {
    const courses = await apiCall('/instructor/courses');
    if (!courses || !Array.isArray(courses)) {
      console.error('강의 목록 응답 형식이 올바르지 않습니다:', courses);
      return;
    }
    const select = document.getElementById('attendance-course-select');
    if (!select) return;
    select.innerHTML = '<option value="">강의 선택</option>' +
      courses.map(course => `<option value="${course.id}">${course.title}</option>`).join('');

    select.onchange = () => {
      const courseId = select.value;
      const sessionList = document.getElementById('attendance-session-list');
      const panel = document.getElementById('attendance-student-panel');
      panel.innerHTML = '<p>왼쪽에서 주차를 선택해주세요.</p>';
      if (!courseId) {
        sessionList.innerHTML = '<p style="padding: 10px;">먼저 강의를 선택하세요.</p>';
        return;
      }
      loadSessionsForAttendance(parseInt(courseId, 10));
    };

    // 기본 선택 시 자동 로드
    if (select.value) {
      loadSessionsForAttendance(parseInt(select.value, 10));
    } else {
      document.getElementById('attendance-session-list').innerHTML = '<p style="padding: 10px;">강의를 선택하면 주차 목록이 표시됩니다.</p>';
    }
  } catch (err) {
    console.error('강의 목록 로드 실패:', err);
  }
}

async function loadSessionsForAttendance(courseId) {
  try {
    const sessions = await apiCall(`/sessions/course/${courseId}`);
    const makeupDays = await apiCall('/instructor/makeup-days').catch(() => []);
    
    // 보강일을 course_id + week_number로 매핑
    const makeupMap = new Map();
    makeupDays.forEach(m => {
      const key = `${m.course_id}_${m.week_number}`;
      makeupMap.set(key, m);
    });

    const list = document.getElementById('attendance-session-list');
    if (!sessions || sessions.length === 0) {
      list.innerHTML = '<p style="padding: 10px;">등록된 세션이 없습니다.</p>';
      return;
    }

    const methodNames = {
      'ELECTRONIC': '전자출결',
      'AUTH_CODE': '인증번호',
      'ROLL_CALL': '호명'
    };

    list.innerHTML = sessions.map(session => {
      const makeupKey = `${courseId}_${session.week_number}`;
      const isMakeup = makeupMap.has(makeupKey);
      
      return `
        <div class="attendance-session-item ${isMakeup ? 'session-makeup' : ''}" data-session-id="${session.id}">
          <div class="attendance-session-item-main">
            <span class="attendance-session-item-title">${session.week_number || '-'}주차</span>
            <span class="attendance-session-item-sub">${session.session_date || ''}</span>
            ${isMakeup ? '<span style="background: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 600; margin-left: 8px;">보강</span>' : ''}
          </div>
          <div>
            ${session.is_open ? '<span style="font-size:0.8rem;color:#16a34a;">진행 중</span>' : '<span style="font-size:0.8rem;color:#6b7280;">마감</span>'}
          </div>
        </div>
      `;
    }).join('');

    list.onclick = (e) => {
      const item = e.target.closest('.attendance-session-item');
      if (!item) return;
      list.querySelectorAll('.attendance-session-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      const sessionId = parseInt(item.dataset.sessionId, 10);
      if (!Number.isNaN(sessionId)) {
        loadAttendanceForSession(sessionId);
      }
    };
  } catch (err) {
    console.error('세션 목록 로드 실패:', err);
    document.getElementById('attendance-session-list').innerHTML = '<p style="padding: 10px;">세션 목록을 불러올 수 없습니다.</p>';
  }
}

async function loadAttendanceForSession(sessionId) {
  const panel = document.getElementById('attendance-student-panel');
  try {
    panel.innerHTML = '<p>불러오는 중...</p>';
    const summary = await apiCall(`/attendance/sessions/${sessionId}/summary`);
    const makeupDays = await apiCall('/instructor/makeup-days').catch(() => []);
    
    // 현재 세션의 보강일 정보 확인
    const courseId = summary.session.course_id;
    const weekNumber = summary.session.week_number;
    const makeupKey = `${courseId}_${weekNumber}`;
    const makeupInfo = makeupDays.find(m => `${m.course_id}_${m.week_number}` === makeupKey);
    const isMakeup = !!makeupInfo;

    const statusNames = { 0: '미정', 1: '출석', 2: '지각', 3: '결석', 4: '공결' };

    const rowsHtml = summary.students.map(s => `
      <tr>
        <td>${s.name || '-'}</td>
        <td>${s.email}</td>
        <td>
          <select class="attendance-status-select" data-student-id="${s.student_id}">
            ${[0,1,2,3,4].map(v => `
              <option value="${v}" ${s.status === v ? 'selected' : (s.status == null && v === 0 ? 'selected' : '')}>${statusNames[v]}</option>
            `).join('')}
          </select>
        </td>
        <td>${s.checked_at ? new Date(s.checked_at).toLocaleString('ko-KR') : '-'}</td>
      </tr>
    `).join('');

    panel.innerHTML = `
      <div class="report-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3>${summary.session.course_title} - ${summary.session.week_number || '-'}주차 (${summary.session.session_date || ''})</h3>
          ${!isMakeup 
            ? `<button class="btn btn-small" style="background: #fee2e2; color: #991b1b; border-color: #fecaca;" id="makeup-btn">보강 처리</button>`
            : `<button class="btn btn-small" style="background: #f3f4f6; color: #6b7280;" id="remove-makeup-btn">보강 취소</button>`}
        </div>
        ${isMakeup && makeupInfo ? `
          <div style="background: #fee2e2; padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; font-size: 0.9rem;">
            <strong>보강일:</strong> ${makeupInfo.makeup_date}
            ${makeupInfo.original_date ? ` (원래: ${normalizeDate(makeupInfo.original_date)})` : ''}
            ${makeupInfo.reason ? ` | 사유: ${makeupInfo.reason}` : ''}
          </div>
        ` : ''}
        <p style="font-size:0.9rem;color:#4b5563;">
          전체 ${summary.stats.total_students}명 · 
          출석 ${summary.stats.present} · 
          지각 ${summary.stats.late} · 
          결석 ${summary.stats.absent} · 
          공결 ${summary.stats.excused} · 
          미정 ${summary.stats.pending}
        </p>
        <table class="attendance-students-table">
          <thead>
            <tr>
              <th>이름</th>
              <th>이메일</th>
              <th>출결 상태</th>
              <th>체크 시간</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <div class="attendance-save-bar">
          <button class="btn btn-primary" id="attendance-save-btn">변경 내용 저장</button>
        </div>
      </div>
    `;

    // 보강 처리 버튼 이벤트
    if (!isMakeup) {
      document.getElementById('makeup-btn').onclick = () => {
        handleMakeupSession(courseId, weekNumber, summary.session.session_date, sessionId);
      };
    } else {
      document.getElementById('remove-makeup-btn').onclick = () => {
        removeMakeupSession(courseId, weekNumber, sessionId);
      };
    }

    document.getElementById('attendance-save-btn').onclick = async () => {
      try {
        const selects = Array.from(panel.querySelectorAll('.attendance-status-select'));
        for (const sel of selects) {
          const studentId = parseInt(sel.dataset.studentId, 10);
          const newStatus = parseInt(sel.value, 10);
          const original = summary.students.find(s => s.student_id === studentId)?.status;
          if (original === newStatus || (original == null && newStatus === 0)) {
            continue;
          }
          await apiCall('/attendance/0', {
            method: 'PATCH',
            body: JSON.stringify({
              session_id: sessionId,
              student_id: studentId,
              new_status: newStatus,
              appeal_id: null,
              comment: null
            })
          });
        }
        alert('출석 상태가 저장되었습니다.');
        loadAttendanceForSession(sessionId);
      } catch (err) {
        alert('출석 상태 저장 실패: ' + err.message);
      }
    };
  } catch (err) {
    console.error('출석 현황 조회 실패:', err);
    panel.innerHTML = '<p>출석 현황을 불러올 수 없습니다.</p>';
  }
}

// 공결 목록
async function loadExcuses() {
  try {
    const filter = document.getElementById('excuse-filter').value;
    const courseFilter = document.getElementById('excuse-course-filter').value;
    let query = '/excuses?';
    const params = [];
    if (filter) {
      params.push(`status=${filter}`);
    }
    if (courseFilter) {
      params.push(`course_id=${courseFilter}`);
    }
    const excuses = await apiCall(`/excuses${params.length > 0 ? '?' + params.join('&') : ''}`);
    const list = document.getElementById('excuses-list');
    
    if (excuses.length === 0) {
      list.innerHTML = '<p>공결 신청이 없습니다.</p>';
      return;
    }
    
    list.innerHTML = excuses.map(excuse => {
      const statusNames = { 'PENDING': '대기 중', 'APPROVED': '승인됨', 'REJECTED': '반려됨' };
      const statusColors = { 'PENDING': '#f59e0b', 'APPROVED': '#10b981', 'REJECTED': '#ef4444' };
      const reasonCodeNames = {
        'ILLNESS': '질병',
        'FAMILY_EVENT': '가족 행사',
        'OFFICIAL_BUSINESS': '공무',
        'PERSONAL_EMERGENCY': '개인 긴급사항',
        'OTHER': '기타'
      };
      
      return `
        <div class="list-item" style="flex-direction: column; align-items: flex-start; gap: 8px;">
          <div style="width: 100%;">
            <strong>${excuse.course_title}</strong> - ${excuse.week_number}주차 (${excuse.session_date})
            <br>
            <small>학생: ${excuse.student_name || excuse.student_email}</small>
            <br>
            ${excuse.reason_code ? `<small><strong>사유 유형:</strong> ${reasonCodeNames[excuse.reason_code] || excuse.reason_code}</small><br>` : ''}
            <small><strong>사유:</strong> ${excuse.reason || '-'}</small>
            ${excuse.file_path ? `<br><small><strong>증빙 파일:</strong> <a href="${API_BASE}/uploads/${excuse.file_path}" target="_blank">파일 보기</a></small>` : ''}
            ${excuse.instructor_comment ? `<br><small><strong>교원 코멘트:</strong> ${excuse.instructor_comment}</small>` : ''}
            <br>
            <span style="color: ${statusColors[excuse.status]}; font-weight: bold;">${statusNames[excuse.status]}</span>
          </div>
          ${excuse.status === 'PENDING' ? `
            <div style="display: flex; gap: 8px; width: 100%;">
              <button class="btn btn-small btn-primary" onclick="approveExcuse(${excuse.id})">승인</button>
              <button class="btn btn-small btn-danger" onclick="rejectExcuse(${excuse.id})">반려</button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  } catch (err) {
    alert('공결 목록 로드 실패: ' + err.message);
  }
}

document.getElementById('excuse-refresh-btn').addEventListener('click', loadExcuses);
document.getElementById('excuse-filter').addEventListener('change', loadExcuses);
document.getElementById('excuse-course-filter').addEventListener('change', loadExcuses);

// 이의제기 새로고침 및 필터
if (document.getElementById('appeal-refresh-btn')) {
  document.getElementById('appeal-refresh-btn').addEventListener('click', loadAppeals);
}
if (document.getElementById('appeal-status-filter')) {
  document.getElementById('appeal-status-filter').addEventListener('change', loadAppeals);
}

async function approveExcuse(id) {
  const comment = prompt('승인 코멘트 (선택):');
  try {
    await apiCall(`/excuses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'APPROVED', instructor_comment: comment || null })
    });
    alert('공결이 승인되었습니다.');
    loadExcuses();
  } catch (err) {
    alert('공결 승인 실패: ' + err.message);
  }
}

async function rejectExcuse(id) {
  const templates = [
    '증빙 자료가 불충분합니다.',
    '사유가 타당하지 않습니다.',
    '신청 기한이 지났습니다.',
    '기타 사유'
  ];
  
  let templateChoice = prompt(`반려 사유 템플릿 선택:\n${templates.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\n번호를 입력하거나 직접 입력하세요:`);
  
  let comment = '';
  if (templateChoice && !isNaN(templateChoice) && parseInt(templateChoice) >= 1 && parseInt(templateChoice) <= templates.length) {
    comment = templates[parseInt(templateChoice) - 1];
    const additional = prompt('추가 코멘트 (선택):');
    if (additional) {
      comment += `\n${additional}`;
    }
  } else if (templateChoice) {
    comment = templateChoice;
  } else {
    comment = prompt('반려 사유를 입력하세요 (필수):');
  }
  
  if (!comment) {
    alert('반려 사유를 입력해주세요.');
    return;
  }
  
  try {
    await apiCall(`/excuses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'REJECTED', instructor_comment: comment })
    });
    alert('공결이 반려되었습니다.');
    loadExcuses();
  } catch (err) {
    alert('공결 반려 실패: ' + err.message);
  }
}

// 수업 알림 작성
document.getElementById('announcement-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const result = await apiCall('/instructor/announcements', {
      method: 'POST',
      body: JSON.stringify({
        course_id: parseInt(document.getElementById('announcement-course').value),
        title: document.getElementById('announcement-title').value,
        content: document.getElementById('announcement-content').value
      })
    });
    alert(`알림이 ${result.count}명에게 전송되었습니다.`);
    document.getElementById('announcement-form').reset();
  } catch (err) {
    alert('알림 전송 실패: ' + err.message);
  }
});

// 채팅방 목록 로드
let currentChatStudentId = null;
let currentChatCourseId = null;

async function loadChatRooms() {
  try {
    const rooms = await apiCall('/instructor/chat-rooms');
    const list = document.getElementById('chat-rooms-list');
    
    if (rooms.length === 0) {
      list.innerHTML = '<div style="padding: 16px; text-align: center; color: #6b7280;">채팅방이 없습니다.</div>';
      return;
    }
    
    list.innerHTML = rooms.map(room => {
      const lastMessage = room.last_message_content || '';
      const truncatedMessage = lastMessage.length > 30 ? lastMessage.substring(0, 30) + '...' : lastMessage;
      const time = room.last_message_at ? new Date(room.last_message_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      
      return `
        <div class="chat-room-item" 
             data-student-id="${room.other_user_id}" 
             data-course-id="${room.course_id || ''}"
             style="padding: 12px; cursor: pointer; border-bottom: 1px solid #f3f4f6; transition: background 0.2s;"
             onmouseover="this.style.background='#f9fafb'"
             onmouseout="this.style.background=''">
          <div style="font-weight: 500; margin-bottom: 4px;">${room.other_user_name || room.other_user_email}</div>
          ${room.course_title ? `<div style="font-size: 0.8rem; color: #6b7280; margin-bottom: 4px;">${room.course_title}</div>` : ''}
          <div style="font-size: 0.75rem; color: #9ca3af; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${truncatedMessage}</div>
          <div style="font-size: 0.7rem; color: #9ca3af; margin-top: 4px;">${time}</div>
        </div>
      `;
    }).join('');
    
    // 채팅방 클릭 이벤트
    list.querySelectorAll('.chat-room-item').forEach(item => {
      item.addEventListener('click', () => {
        list.querySelectorAll('.chat-room-item').forEach(i => i.style.background = '');
        item.style.background = '#e0ebff';
        currentChatStudentId = parseInt(item.dataset.studentId);
        currentChatCourseId = item.dataset.courseId ? parseInt(item.dataset.courseId) : null;
        loadChatMessages(currentChatStudentId, currentChatCourseId);
      });
    });
  } catch (err) {
    console.error('채팅방 목록 로드 실패:', err);
    document.getElementById('chat-rooms-list').innerHTML = '<div style="padding: 16px; color: #ef4444;">채팅방 목록을 불러올 수 없습니다.</div>';
  }
}

// 채팅 메시지 로드
async function loadChatMessages(studentId, courseId) {
  try {
    const query = courseId ? `?course_id=${courseId}` : '';
    const messages = await apiCall(`/instructor/chat-rooms/${studentId}${query}`);
    const messagesContainer = document.getElementById('chat-messages');
    const header = document.getElementById('chat-header');
    const inputArea = document.getElementById('chat-input-area');
    
    // 헤더 업데이트
    const room = await apiCall('/instructor/chat-rooms').then(rooms => 
      rooms.find(r => r.other_user_id === studentId && (r.course_id === courseId || (!r.course_id && !courseId)))
    ).catch(() => null);
    
    if (room) {
      header.innerHTML = `
        <div style="font-weight: 600;">${room.other_user_name || room.other_user_email}</div>
        ${room.course_title ? `<div style="font-size: 0.85rem; color: #6b7280; font-weight: normal;">${room.course_title}</div>` : ''}
      `;
    } else {
      header.textContent = '채팅방을 선택하세요';
    }
    
    // 메시지 표시
    if (messages.length === 0) {
      messagesContainer.innerHTML = '<div style="text-align: center; color: #6b7280; padding: 40px;">메시지가 없습니다.</div>';
      inputArea.style.display = 'none';
      return;
    }
    
    const currentUserId = currentUser.id;
    messagesContainer.innerHTML = messages.map(msg => {
      const isMine = msg.sender_id === currentUserId;
      const time = new Date(msg.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      
      return `
        <div style="display: flex; ${isMine ? 'justify-content: flex-end;' : 'justify-content: flex-start;'}">
          <div style="max-width: 70%; ${isMine ? 'background: #2563eb; color: white;' : 'background: #f3f4f6; color: #111827;'} padding: 10px 14px; border-radius: 12px; word-wrap: break-word;">
            ${!isMine ? `<div style="font-size: 0.75rem; font-weight: 600; margin-bottom: 4px; opacity: 0.8;">${msg.sender_name || msg.sender_email}</div>` : ''}
            <div style="font-size: 0.9rem; line-height: 1.4;">${msg.content}</div>
            <div style="font-size: 0.7rem; opacity: 0.7; margin-top: 4px;">${time}</div>
          </div>
        </div>
      `;
    }).join('');
    
    // 스크롤을 맨 아래로
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // 입력 영역 표시
    inputArea.style.display = 'block';
  } catch (err) {
    console.error('메시지 로드 실패:', err);
    document.getElementById('chat-messages').innerHTML = '<div style="padding: 16px; color: #ef4444;">메시지를 불러올 수 없습니다.</div>';
  }
}

// 메시지 전송
document.getElementById('message-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentChatStudentId) {
    alert('채팅방을 선택해주세요.');
    return;
  }
  
  const content = document.getElementById('message-content').value.trim();
  if (!content) return;
  
  try {
    await apiCall('/instructor/messages', {
      method: 'POST',
      body: JSON.stringify({
        receiver_id: currentChatStudentId,
        course_id: currentChatCourseId,
        content: content
      })
    });
    
    document.getElementById('message-content').value = '';
    await loadChatMessages(currentChatStudentId, currentChatCourseId);
    await loadChatRooms();
  } catch (err) {
    alert('메시지 전송 실패: ' + err.message);
  }
});

// 공강 투표 생성
document.getElementById('vote-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const courseId = parseInt(document.getElementById('vote-course').value);
    const weekNumber = parseInt(document.getElementById('vote-week').value, 10);
    const makeupDate = document.getElementById('vote-makeup-date').value || null;

    const result = await apiCall('/instructor/votes', {
      method: 'POST',
      body: JSON.stringify({
        course_id: courseId,
        title: document.getElementById('vote-title').value,
        description: document.getElementById('vote-description').value || null,
        week_number: weekNumber,
        makeup_date: makeupDate
      })
    });
    alert(`투표가 생성되었습니다. ${result.notification_count}명에게 알림이 전송되었습니다.`);
    document.getElementById('vote-form').reset();
    loadVotes();
  } catch (err) {
    alert('투표 생성 실패: ' + err.message);
  }
});

// 공강 투표 목록 및 결과 조회 (교원용)
async function loadVotes() {
  try {
    const votes = await apiCall('/instructor/votes');
    const list = document.getElementById('votes-list');
    if (!list) return;
    
    if (!votes || votes.length === 0) {
      list.innerHTML = '<p>생성된 공강 투표가 없습니다.</p>';
      return;
    }
    
    list.innerHTML = votes.map(vote => {
      const weekText = vote.week_number
        ? `${vote.week_number}주차`
        : (vote.vote_date ? vote.vote_date : '주차 정보 없음');
      
      const yesCount = vote.yes_count || 0;
      const noCount = vote.no_count || 0;
      const totalStudents = vote.total_students || 0;
      const respondedCount = vote.responded_count || 0;
      const pendingCount = totalStudents - respondedCount;
      const responseRate = totalStudents > 0 ? ((respondedCount / totalStudents) * 100).toFixed(1) : 0;
      
      const isClosed = vote.is_closed === 1 || vote.is_closed === true;
      const statusText = isClosed ? '마감됨' : '진행 중';
      const statusColor = isClosed ? '#6b7280' : '#10b981';
      
      return `
        <div class="list-item" style="flex-direction: column; align-items: flex-start; gap: 12px; margin-bottom: 16px; padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <div style="width: 100%;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
              <div>
                <strong>${vote.course_title}</strong> - ${weekText}
                <br>
                <span style="font-weight: 600; font-size: 1.1rem;">${vote.title}</span>
                ${vote.description ? `<br><small style="color: #6b7280;">${vote.description}</small>` : ''}
              </div>
              <span style="color: ${statusColor}; font-weight: 600; font-size: 0.9rem;">${statusText}</span>
            </div>
            ${vote.vote_date ? `<div style="font-size: 0.85rem; color: #6b7280; margin-bottom: 8px;">투표일: ${vote.vote_date}</div>` : ''}
          </div>
          <div style="width: 100%; padding: 12px; background: #f9fafb; border-radius: 6px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
              <div style="text-align: center; padding: 8px; background: #dcfce7; border-radius: 6px;">
                <div style="font-size: 0.85rem; color: #166534; margin-bottom: 4px;">찬성</div>
                <div style="font-size: 1.5rem; font-weight: 700; color: #16a34a;">${yesCount}</div>
              </div>
              <div style="text-align: center; padding: 8px; background: #fee2e2; border-radius: 6px;">
                <div style="font-size: 0.85rem; color: #991b1b; margin-bottom: 4px;">반대</div>
                <div style="font-size: 1.5rem; font-weight: 700; color: #ef4444;">${noCount}</div>
              </div>
            </div>
            <div style="font-size: 0.9rem; color: #4b5563; text-align: center;">
              전체 ${totalStudents}명 중 ${respondedCount}명 응답 (${responseRate}%)
              ${pendingCount > 0 ? `<br><span style="color: #6b7280;">미응답: ${pendingCount}명</span>` : ''}
            </div>
            ${yesCount + noCount > 0 ? `
              <div style="margin-top: 8px; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden;">
                <div style="display: flex; height: 100%;">
                  <div style="background: #16a34a; width: ${((yesCount / (yesCount + noCount)) * 100).toFixed(1)}%;"></div>
                  <div style="background: #ef4444; width: ${((noCount / (yesCount + noCount)) * 100).toFixed(1)}%;"></div>
                </div>
              </div>
            ` : ''}
          </div>
          <div style="font-size: 0.8rem; color: #9ca3af;">
            생성일: ${new Date(vote.created_at).toLocaleString('ko-KR')}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('투표 목록 로드 실패:', err);
    const list = document.getElementById('votes-list');
    if (list) {
      list.innerHTML = '<p>투표 목록을 불러올 수 없습니다.</p>';
    }
  }
}

document.getElementById('vote-refresh-btn').addEventListener('click', loadVotes);

// 이의제기 목록 조회
async function loadAppeals() {
  try {
    const statusFilter = document.getElementById('appeal-status-filter')?.value || '';
    const appeals = await apiCall(`/appeals${statusFilter ? `?status=${statusFilter}` : ''}`);
    const container = document.getElementById('appeals-list');
    
    if (!container) {
      console.error('appeals-list 요소를 찾을 수 없습니다.');
      return;
    }
    
    if (appeals.length === 0) {
      container.innerHTML = '<p>이의제기가 없습니다.</p>';
      return;
    }
    
    container.innerHTML = appeals.map(appeal => {
      const statusNames = { 
        'PENDING': '대기 중', 
        'REVIEWED': '검토 중', 
        'RESOLVED': '해결됨', 
        'REJECTED': '거부됨' 
      };
      const statusColors = { 
        'PENDING': '#f59e0b', 
        'REVIEWED': '#3b82f6', 
        'RESOLVED': '#10b981', 
        'REJECTED': '#ef4444' 
      };
      const currentStatusNames = { 0: '미정', 1: '출석', 2: '지각', 3: '결석', 4: '공결' };
      
      return `
        <div class="list-item" style="flex-direction: column; align-items: flex-start; gap: 8px;">
          <div style="width: 100%;">
            <strong>${appeal.course_title}</strong> - ${appeal.week_number}주차 (${appeal.session_date})
            <br>
            <small><strong>학생:</strong> ${appeal.student_name || appeal.student_email}</small>
            <br>
            <small><strong>현재 출석 상태:</strong> ${currentStatusNames[appeal.current_attendance_status] || '미정'}</small>
            <br>
            <small><strong>이의제기 내용:</strong> ${appeal.message}</small>
            ${appeal.instructor_comment ? `<br><small><strong>내 코멘트:</strong> ${appeal.instructor_comment}</small>` : ''}
            <br>
            <span style="color: ${statusColors[appeal.status]}; font-weight: bold;">${statusNames[appeal.status] || appeal.status}</span>
            <br>
            <small style="color: #6b7280;">제출일: ${new Date(appeal.created_at).toLocaleString('ko-KR')}</small>
            ${appeal.resolved_at ? `<br><small style="color: #6b7280;">처리일: ${new Date(appeal.resolved_at).toLocaleString('ko-KR')}</small>` : ''}
          </div>
          ${appeal.status === 'PENDING' || appeal.status === 'REVIEWED' ? `
            <div style="display: flex; gap: 8px; width: 100%; flex-wrap: wrap;">
              <select id="appeal-status-${appeal.id}" style="padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 4px;">
                <option value="0">미정</option>
                <option value="1">출석</option>
                <option value="2">지각</option>
                <option value="3">결석</option>
                <option value="4">공결</option>
              </select>
              <button class="btn btn-small btn-primary" onclick="updateAttendanceFromAppeal(${appeal.id}, ${appeal.attendance_session_id}, ${appeal.attendance_student_id}, ${appeal.id})">출석 정정</button>
              <button class="btn btn-small btn-danger" onclick="rejectAppeal(${appeal.id})">거부</button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('이의제기 목록 로드 실패:', err);
    const container = document.getElementById('appeals-list');
    if (container) {
      container.innerHTML = '<p>이의제기 목록을 불러올 수 없습니다.</p>';
    }
  }
}

// 출석 정정 (이의제기에서)
async function updateAttendanceFromAppeal(appealId, sessionId, studentId, appealIdForUpdate) {
  try {
    const statusSelect = document.getElementById(`appeal-status-${appealId}`);
    const newStatus = parseInt(statusSelect.value);
    const comment = prompt('정정 사유 또는 코멘트를 입력하세요 (선택):') || '';
    
    await apiCall(`/attendance/0`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        student_id: studentId,
        new_status: newStatus,
        appeal_id: appealIdForUpdate,
        comment: comment
      })
    });
    alert('출석 상태가 정정되었습니다.');
    loadAppeals();
  } catch (err) {
    alert('출석 정정 실패: ' + err.message);
  }
}

// 이의제기 거부
async function rejectAppeal(id) {
  const comment = prompt('거부 사유를 입력하세요:');
  if (!comment) {
    alert('거부 사유를 입력해주세요.');
    return;
  }
  
  try {
    await apiCall(`/appeals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'REJECTED',
        instructor_comment: comment
      })
    });
    alert('이의제기가 거부되었습니다.');
    loadAppeals();
  } catch (err) {
    alert('이의제기 거부 실패: ' + err.message);
  }
}

// 인증번호/전자출결 출석 현황 팝업
let attendanceSessionInterval = null;
let currentAttendanceSessionId = null;

function openAttendanceSessionPopup(sessionId, courseTitle, weekNumber, sessionDate, attendanceMethod, authCode) {
  currentAttendanceSessionId = sessionId;
  const modal = document.getElementById('attendance-session-modal');
  const body = document.getElementById('attendance-session-body');
  const titleEl = document.getElementById('attendance-session-title');
  const closeBtn = document.getElementById('attendance-session-close');

  if (!modal || !body || !titleEl) return;

  // 모달 제목 설정
  const methodName = attendanceMethod === 'AUTH_CODE' ? '인증번호 출석' : '전자출결 출석';
  titleEl.textContent = methodName + ' 현황';

  modal.classList.add('open');
  body.innerHTML = '<p>불러오는 중...</p>';

  // 기존 인터벌 정리
  if (attendanceSessionInterval) {
    clearInterval(attendanceSessionInterval);
  }

  // 출석 현황 로드 및 주기적 갱신
  const loadAttendance = async () => {
    try {
      const summary = await apiCall(`/attendance/sessions/${sessionId}/summary`);
      const statusNames = { 0: '미출석', 1: '출석', 2: '지각', 3: '결석', 4: '공결' };
      const statusColors = { 
        0: '#6b7280', 
        1: '#10b981', 
        2: '#f59e0b', 
        3: '#ef4444', 
        4: '#3b82f6' 
      };

      const studentsHtml = summary.students.map(s => {
        const status = s.status === null || s.status === undefined ? 0 : s.status;
        return `
          <div class="attendance-student-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #e5e7eb;">
            <div style="flex: 1;">
              <div style="font-weight: 600; margin-bottom: 4px;">${s.name || s.email}</div>
              <div style="font-size: 0.85rem; color: #6b7280;">${s.email}</div>
            </div>
            <div style="display: flex; align-items: center; gap: 12px;">
              <span style="color: ${statusColors[status]}; font-weight: 600; font-size: 0.9rem;">
                ${statusNames[status]}
              </span>
              ${s.checked_at ? `<span style="font-size: 0.8rem; color: #6b7280;">${new Date(s.checked_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>` : ''}
            </div>
          </div>
        `;
      }).join('');

      // 인증번호 PIN 표시 영역
      const authCodeHtml = attendanceMethod === 'AUTH_CODE' && authCode ? `
        <div style="margin-bottom: 24px; padding: 24px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <div style="color: white; font-size: 0.9rem; margin-bottom: 8px; opacity: 0.9;">인증번호</div>
          <div style="color: white; font-size: 3rem; font-weight: 700; letter-spacing: 8px; font-family: 'Courier New', monospace;">
            ${authCode}
          </div>
          <div style="color: white; font-size: 0.85rem; margin-top: 8px; opacity: 0.8;">학생들에게 이 번호를 안내하세요</div>
        </div>
      ` : '';

      body.innerHTML = `
        <div style="margin-bottom: 16px;">
          <h4 style="margin-bottom: 8px;">${courseTitle} - ${weekNumber}주차</h4>
          <p style="font-size: 0.9rem; color: #4b5563;">${sessionDate}</p>
        </div>
        ${authCodeHtml}
        <div style="display: flex; gap: 16px; margin-bottom: 16px; padding: 12px; background: #f9fafb; border-radius: 8px;">
          <div>
            <div style="font-size: 0.85rem; color: #6b7280;">전체</div>
            <div style="font-size: 1.2rem; font-weight: 600;">${summary.stats.total_students}명</div>
          </div>
          <div>
            <div style="font-size: 0.85rem; color: #6b7280;">출석</div>
            <div style="font-size: 1.2rem; font-weight: 600; color: #10b981;">${summary.stats.present}명</div>
          </div>
          <div>
            <div style="font-size: 0.85rem; color: #6b7280;">미출석</div>
            <div style="font-size: 1.2rem; font-weight: 600; color: #6b7280;">${summary.stats.pending}명</div>
          </div>
        </div>
        <div style="max-height: 400px; overflow-y: auto; border: 1px solid #e5e7eb; border-radius: 8px;">
          ${studentsHtml}
        </div>
      `;
    } catch (err) {
      console.error('출석 현황 로드 실패:', err);
      body.innerHTML = '<p>출석 현황을 불러올 수 없습니다.</p>';
    }
  };

  loadAttendance();
  
  // 3초마다 자동 갱신
  attendanceSessionInterval = setInterval(loadAttendance, 3000);

  // 닫기 버튼 - 팝업 닫을 때 세션 종료
  closeBtn.onclick = async () => {
    if (!confirm('팝업을 닫으면 출석 세션이 종료됩니다. 계속하시겠습니까?')) return;
    
    try {
      await apiCall(`/sessions/${sessionId}/close`, { method: 'POST' });
      if (currentOpenSessionId === sessionId) {
        currentOpenSessionId = null;
      }
      if (attendanceSessionInterval) {
        clearInterval(attendanceSessionInterval);
        attendanceSessionInterval = null;
      }
      currentAttendanceSessionId = null;
      modal.classList.remove('open');
    } catch (err) {
      alert('세션 종료 실패: ' + err.message);
      // 실패해도 팝업은 닫기
      if (attendanceSessionInterval) {
        clearInterval(attendanceSessionInterval);
        attendanceSessionInterval = null;
      }
      currentAttendanceSessionId = null;
      modal.classList.remove('open');
    }
  };

  // 모달 외부 클릭 시 닫기 (세션 종료)
  modal.onclick = (e) => {
    if (e.target === modal) {
      closeBtn.click();
    }
  };
}

// 알림 관련 함수
let notificationCheckInterval = null;

async function loadNotifications() {
  try {
    const notifications = await apiCall('/notifications');
    return notifications;
  } catch (err) {
    console.error('알림 로드 실패:', err);
    return [];
  }
}

async function loadUnreadCount() {
  try {
    const result = await apiCall('/notifications/unread-count');
    const badge = document.getElementById('notification-badge');
    if (result.count > 0) {
      badge.textContent = result.count > 99 ? '99+' : result.count;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  } catch (err) {
    console.error('알림 개수 로드 실패:', err);
  }
}

async function showNotificationModal() {
  const modal = document.getElementById('notification-modal');
  const list = document.getElementById('notification-list');
  
  try {
    list.innerHTML = '<p>불러오는 중...</p>';
    const notifications = await loadNotifications();
    
    if (notifications.length === 0) {
      list.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 40px;">알림이 없습니다.</p>';
      return;
    }
    
    const typeNames = {
      'ATTENDANCE_OPENED': '출석 오픈',
      'ATTENDANCE_CLOSED': '출석 마감',
      'EXCUSE_PENDING': '공결 신청',
      'EXCUSE_RESULT': '공결 결과',
      'APPEAL_PENDING': '이의제기 확인 요청',
      'APPEAL_CREATED': '이의제기 접수',
      'APPEAL_RESOLVED': '이의제기 결과',
      'APPEAL_REJECTED': '이의제기 거부',
      'ANNOUNCEMENT': '강의 공지',
      'VOTE': '공강 투표',
      'ABSENCE_WARNING': '결석 경고'
    };
    
    list.innerHTML = notifications.map(notif => {
      const isRead = notif.is_read;
      const time = new Date(notif.created_at).toLocaleString('ko-KR');
      
      return `
        <div class="notification-item" data-id="${notif.id}" style="padding: 12px; border-bottom: 1px solid #e5e7eb; ${!isRead ? 'background: #eff6ff;' : ''} cursor: pointer;" onclick="markNotificationAsRead(${notif.id})">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 4px;">
            <div style="font-weight: ${!isRead ? '600' : '500'}; color: ${!isRead ? '#2563eb' : '#111827'};">
              ${typeNames[notif.type] || notif.type}
            </div>
            <small style="color: #6b7280;">${time}</small>
          </div>
          <div style="font-weight: 600; margin-bottom: 4px;">${notif.title || ''}</div>
          <div style="color: #4b5563; font-size: 0.9rem; line-height: 1.5;">${notif.content || ''}</div>
          ${notif.course_title ? `<div style="color: #6b7280; font-size: 0.85rem; margin-top: 4px;">${notif.course_title}</div>` : ''}
        </div>
      `;
    }).join('');
    
    modal.classList.add('open');
    await loadUnreadCount();
  } catch (err) {
    list.innerHTML = '<p style="color: #ef4444;">알림을 불러올 수 없습니다.</p>';
  }
}

async function markNotificationAsRead(id) {
  try {
    await apiCall(`/notifications/${id}/read`, { method: 'PATCH' });
    await showNotificationModal();
    await loadUnreadCount();
  } catch (err) {
    console.error('알림 읽음 처리 실패:', err);
  }
}

async function markAllNotificationsAsRead() {
  try {
    await apiCall('/notifications/read-all', { method: 'PATCH' });
    await showNotificationModal();
    await loadUnreadCount();
  } catch (err) {
    console.error('모든 알림 읽음 처리 실패:', err);
  }
}

// 알림 버튼 이벤트
document.getElementById('notification-btn').addEventListener('click', showNotificationModal);
document.getElementById('close-notification-modal').addEventListener('click', () => {
  document.getElementById('notification-modal').classList.remove('open');
});
document.getElementById('mark-all-read-btn').addEventListener('click', markAllNotificationsAsRead);

// 모달 외부 클릭 시 닫기
document.getElementById('notification-modal').addEventListener('click', (e) => {
  if (e.target.id === 'notification-modal') {
    document.getElementById('notification-modal').classList.remove('open');
  }
});

// 주기적으로 읽지 않은 알림 개수 확인 (30초마다)
loadUnreadCount();
notificationCheckInterval = setInterval(loadUnreadCount, 30000);

// 보고서(교원) 초기화
let instructorReportsInitialized = false;

async function initInstructorReports() {
  if (instructorReportsInitialized) return;
  instructorReportsInitialized = true;

  try {
    const courses = Array.isArray(myCourses) && myCourses.length > 0
      ? myCourses
      : await apiCall('/instructor/courses');

    const select = document.getElementById('inst-report-course-select');
    if (select) {
      select.innerHTML = '<option value=\"\">강의 선택</option>' +
        courses.map(c => `<option value=\"${c.id}\">${c.title}</option>`).join('');
    }
  } catch (err) {
    console.error('교원 리포트용 강의 목록 로드 실패:', err);
  }

  const btn = document.getElementById('inst-load-report-btn');
  if (btn) {
    btn.addEventListener('click', loadInstructorAnalytics);
  }
}

async function loadInstructorAnalytics() {
  const courseId = document.getElementById('inst-report-course-select')?.value;
  const week = document.getElementById('inst-report-week')?.value;
  const from = document.getElementById('inst-report-from')?.value;
  const to = document.getElementById('inst-report-to')?.value;

  if (!courseId) {
    alert('강의를 선택하세요.');
    return;
  }

  const attendanceContainer = document.getElementById('inst-attendance-report');
  const riskContainer = document.getElementById('inst-risk-report');
  if (attendanceContainer) {
    attendanceContainer.innerHTML = '<p>출석/공결 지표를 불러오는 중입니다...</p>';
  }
  if (riskContainer) {
    riskContainer.innerHTML = '<p>위험군 지표를 불러오는 중입니다...</p>';
  }

  try {
    const params = new URLSearchParams({ course_id: courseId });
    if (week) params.append('week', week);

    const excuseParams = new URLSearchParams();
    excuseParams.append('course_id', courseId);
    if (from) excuseParams.append('from', from);
    if (to) excuseParams.append('to', to);

    const riskAbsentParams = new URLSearchParams({ course_id: courseId, limit: '10' });
    const riskLateParams = new URLSearchParams({ course_id: courseId });
    if (from) riskLateParams.append('from', from);

    const [attendanceStats, lateToAbsent, excuseStats, riskAbsent, riskLate] =
      await Promise.all([
        apiCall(`/reports/attendance?${params.toString()}`),
        apiCall('/reports/attendance/late-to-absent'),
        apiCall(`/reports/excuses?${excuseParams.toString()}`),
        apiCall(`/reports/risk/absent?${riskAbsentParams.toString()}`),
        apiCall(`/reports/risk/late?${riskLateParams.toString()}`),
      ]);

    if (attendanceContainer) {
      const rows = Array.isArray(attendanceStats) ? attendanceStats : [];
      attendanceContainer.innerHTML = `
        <div class=\"report-card\">
          <h3>과목/주차 출석률</h3>
          ${rows.length === 0 ? '<p>데이터가 없습니다.</p>' : `
            <table class=\"simple-table\">
              <thead>
                <tr>
                  <th>주차</th>
                  <th>수강생 수</th>
                  <th>출석+공결</th>
                  <th>지각</th>
                  <th>결석</th>
                  <th>출석률</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(r => `
                  <tr>
                    <td>${r.week_number}</td>
                    <td>${r.total_students}</td>
                    <td>${r.attended_or_excused}</td>
                    <td>${r.late_count}</td>
                    <td>${r.absent_count}</td>
                    <td>${(r.attendance_rate * 100).toFixed(1)}%</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
          <p style=\"margin-top:8px;\">지각 → 결석 전환 건수 (전체 시스템): <strong>${lateToAbsent?.late_to_absent_count ?? 0}</strong>건</p>
        </div>
        <div class=\"report-card\">
          <h3>공결 승인율</h3>
          ${Array.isArray(excuseStats) && excuseStats.length > 0 ? `
            <p>전체 공결 신청: ${excuseStats[0].total_requests}건</p>
            <p>승인: ${excuseStats[0].approved_count}건 / 반려: ${excuseStats[0].rejected_count}건</p>
            <p>승인율: ${(excuseStats[0].approval_rate * 100).toFixed(1)}%</p>
          ` : '<p>해당 조건의 공결 신청이 없습니다.</p>'}
        </div>
      `;
    }

    if (riskContainer) {
      const absentRows = Array.isArray(riskAbsent) ? riskAbsent : [];
      const lateRows = Array.isArray(riskLate) ? riskLate : [];
      riskContainer.innerHTML = `
        <div class=\"report-card\">
          <h3>위험군 - 누적 결석 상위</h3>
          ${absentRows.length === 0 ? '<p>데이터가 없습니다.</p>' : `
            <table class=\"simple-table\">
              <thead>
                <tr>
                  <th>학생</th>
                  <th>이메일</th>
                  <th>결석 수</th>
                </tr>
              </thead>
              <tbody>
                ${absentRows.map(r => `
                  <tr>
                    <td>${r.name || '-'}</td>
                    <td>${r.email}</td>
                    <td>${r.absent_count}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>
        <div class=\"report-card\">
          <h3>위험군 - 연속 지각</h3>
          ${lateRows.length === 0 ? '<p>연속 지각 위험군이 없습니다.</p>' : `
            <table class=\"simple-table\">
              <thead>
                <tr>
                  <th>학생</th>
                  <th>이메일</th>
                  <th>최대 연속 지각</th>
                </tr>
              </thead>
              <tbody>
                ${lateRows.map(r => `
                  <tr>
                    <td>${r.name || '-'}</td>
                    <td>${r.email}</td>
                    <td>${r.max_consecutive_late}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>
      `;
    }
  } catch (err) {
    console.error('교원 리포트 로드 실패:', err);
    if (attendanceContainer) {
      attendanceContainer.innerHTML = '<p>출석/공결 지표를 불러오는 중 오류가 발생했습니다.</p>';
    }
    if (riskContainer) {
      riskContainer.innerHTML = '<p>위험군 지표를 불러오는 중 오류가 발생했습니다.</p>';
    }
  }
}

// 초기 로드
loadCourses();

