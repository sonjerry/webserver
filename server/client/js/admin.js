const API_BASE = window.location.origin;

// 토큰 가져오기 (localStorage만 사용, 시크릿 모드에서 탭 간 간섭 방지)
function getAuthToken() {
  return localStorage.getItem('token') || null;
}

let token = getAuthToken();
let currentUser = JSON.parse(localStorage.getItem('user') || '{}');

// 날짜 문자열을 YYYY-MM-DD 형식으로 변환
function formatDateOnly(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    return value.split('T')[0];
  }
  try {
    const d = new Date(value);
    if (isNaN(d)) return '';
    return d.toISOString().split('T')[0];
  } catch (e) {
    return '';
  }
}

// 리다이렉트 중복 방지 플래그
let isRedirecting = false;

// Authorization 헤더 기반 로그인 확인
async function checkAuth() {
  // 이미 리다이렉트 중이면 중복 방지
  if (isRedirecting) return false;
  
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
      if (currentUser.role !== 'ADMIN') {
        isRedirecting = true;
        window.location.href = 'index.html';
        return false;
      }
      return true;
    } else {
      // 응답 상태 코드에 따라 처리
      const status = res.status;
      
      // 401: 인증 실패 (토큰 없음/만료) - 서버에 로그아웃 요청 후 리다이렉트
      if (status === 401) {
        // 서버에 로그아웃 요청
        try {
          await fetch(`${API_BASE}/auth/logout`, {
            method: 'POST',
          });
        } catch (err) {
          console.error('로그아웃 요청 실패:', err);
        }
        // localStorage 정리
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        isRedirecting = true;
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
      
      // 500: 서버 에러 (DB 연결 실패 등) - 에러 메시지 표시하고 리다이렉트 안 함
      if (status === 500) {
        const errorData = await res.json().catch(() => ({ message: '서버 오류가 발생했습니다.' }));
        console.error('서버 오류:', errorData.message);
        // DB 연결 실패 등 서버 오류는 리다이렉트하지 않고 에러만 표시
        document.body.innerHTML = `
          <div style="padding: 20px; text-align: center;">
            <h2>서버 연결 오류</h2>
            <p>${errorData.message || '데이터베이스 연결에 실패했습니다.'}</p>
            <p>서버 상태를 확인해주세요.</p>
            <button onclick="window.location.href='index.html'" style="margin-top: 20px; padding: 10px 20px;">로그인 페이지로</button>
          </div>
        `;
        return false;
      }
      
      // 기타 에러 (404 등) - 서버에 로그아웃 요청 후 리다이렉트
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
      isRedirecting = true;
      window.location.href = 'index.html';
      return false;
    }
  } catch (err) {
    // 네트워크 에러 등 fetch 자체가 실패한 경우
    console.error('인증 확인 실패 (네트워크 오류):', err);
    // 네트워크 오류는 리다이렉트하지 않고 에러 표시
    document.body.innerHTML = `
      <div style="padding: 20px; text-align: center;">
        <h2>연결 오류</h2>
        <p>서버에 연결할 수 없습니다.</p>
        <p>네트워크 연결과 서버 상태를 확인해주세요.</p>
        <button onclick="window.location.href='index.html'" style="margin-top: 20px; padding: 10px 20px;">로그인 페이지로</button>
      </div>
    `;
    return false;
  }
}

// 페이지 로드 시 인증 확인
checkAuth();

// 로그아웃
document.getElementById('logout-btn').addEventListener('click', async () => {
  // 리다이렉트 플래그 설정 (무한 루프 방지)
  isRedirecting = true;
  
  try {
    // 서버에 로그아웃 요청
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
    });
  } catch (err) {
    console.error('로그아웃 요청 실패:', err);
  }
  
  // localStorage 정리
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  
  // 로그인 페이지로 리다이렉트
  window.location.href = 'index.html';
});

// 탭 전환
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
    
    // 탭별 데이터 로드
    if (btn.dataset.tab === 'departments') loadDepartments();
    else if (btn.dataset.tab === 'semesters') loadSemesters();
    else if (btn.dataset.tab === 'courses') {
      loadCourses();
      loadInstructors();
      loadDepartmentsForSelect();
      loadSemestersForSelect();
      loadStudentsForCourseForm();
    }
    else if (btn.dataset.tab === 'users') {
      loadUsers();
      loadDepartmentsForUserForm();
    }
    else if (btn.dataset.tab === 'audit-logs') loadAuditLogs();
    else if (btn.dataset.tab === 'reports') {
      loadSystemReport();
      initAdminAnalytics();
    }
  });
});

// API 호출 헬퍼
async function apiCall(endpoint, options = {}) {
  // 매 호출 시 최신 토큰 사용 (localStorage)
  token = getAuthToken();
  
  if (!token) {
      if (!isRedirecting) {
        isRedirecting = true;
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'index.html';
      }
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
      // 인증 실패 시 로그인 페이지로 리다이렉트 (중복 방지)
      if (!isRedirecting) {
        isRedirecting = true;
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'index.html';
      }
      throw new Error('인증이 만료되었습니다.');
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

// 학과 관리
let isLoadingDepartments = false;
async function loadDepartments() {
  if (isLoadingDepartments) return; // 이미 로딩 중이면 중복 호출 방지
  isLoadingDepartments = true;
  
  try {
    const departments = await apiCall('/admin/departments');
    const list = document.getElementById('department-list');
    if (list) {
      list.innerHTML = departments.map(dept => `
        <div class="list-item">
          <span>${dept.name} (${dept.code})</span>
          <div>
            <button class="btn btn-small" onclick="editDepartment(${dept.id}, '${dept.name}', '${dept.code}')">수정</button>
            <button class="btn btn-small btn-danger" onclick="deleteDepartment(${dept.id})">삭제</button>
          </div>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('학과 목록 로드 실패:', err);
    // 인증 관련 에러는 리다이렉트되므로 에러 메시지 표시 안 함
    if (err.message !== '인증 토큰이 없습니다.' && err.message !== '인증이 만료되었습니다.' && !isRedirecting) {
      const list = document.getElementById('department-list');
      if (list) {
        list.innerHTML = '<div class="error-message">학과 목록을 불러올 수 없습니다: ' + err.message + '</div>';
      }
    }
  } finally {
    isLoadingDepartments = false;
  }
}

document.getElementById('department-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await apiCall('/admin/departments', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('dept-name').value,
        code: document.getElementById('dept-code').value
      })
    });
    alert('학과가 추가되었습니다.');
    document.getElementById('department-form').reset();
    loadDepartments();
  } catch (err) {
    alert('학과 추가 실패: ' + err.message);
  }
});

async function editDepartment(id, name, code) {
  const newName = prompt('학과명:', name);
  const newCode = prompt('학과 코드:', code);
  if (newName && newCode) {
    try {
      await apiCall(`/admin/departments/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: newName, code: newCode })
      });
      alert('학과가 수정되었습니다.');
      loadDepartments();
    } catch (err) {
      alert('학과 수정 실패: ' + err.message);
    }
  }
}

async function deleteDepartment(id) {
  if (confirm('정말 삭제하시겠습니까?')) {
    try {
      await apiCall(`/admin/departments/${id}`, { method: 'DELETE' });
      alert('학과가 삭제되었습니다.');
      loadDepartments();
    } catch (err) {
      alert('학과 삭제 실패: ' + err.message);
    }
  }
}

// 학기 관리
async function loadSemesters() {
  try {
    const semesters = await apiCall('/admin/semesters');
    const list = document.getElementById('semester-list');
    list.innerHTML = semesters.map(sem => `
      <div class="list-item">
        <span>${sem.year}년 ${sem.semester === '1' ? '1학기' : sem.semester === '2' ? '2학기' : sem.semester === 'SUMMER' ? '하계' : '동계'} (${formatDateOnly(sem.start_date)} ~ ${formatDateOnly(sem.end_date)})</span>
        <div>
          <button class="btn btn-small" onclick="editSemester(${sem.id}, ${sem.year}, '${sem.semester}', '${formatDateOnly(sem.start_date)}', '${formatDateOnly(sem.end_date)}')">수정</button>
          <button class="btn btn-small btn-danger" onclick="deleteSemester(${sem.id})">삭제</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    alert('학기 목록 로드 실패: ' + err.message);
  }
}

document.getElementById('semester-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await apiCall('/admin/semesters', {
      method: 'POST',
      body: JSON.stringify({
        year: parseInt(document.getElementById('sem-year').value),
        semester: document.getElementById('sem-semester').value,
        start_date: document.getElementById('sem-start').value,
        end_date: document.getElementById('sem-end').value
      })
    });
    alert('학기가 추가되었습니다.');
    document.getElementById('semester-form').reset();
    loadSemesters();
  } catch (err) {
    alert('학기 추가 실패: ' + err.message);
  }
});

async function editSemester(id, year, semester, start_date, end_date) {
  const newYear = prompt('연도:', year);
  const newSemester = prompt('학기 (1/2/SUMMER/WINTER):', semester);
  const newStart = prompt('시작일 (YYYY-MM-DD):', formatDateOnly(start_date));
  const newEnd = prompt('종료일 (YYYY-MM-DD):', formatDateOnly(end_date));
  if (newYear && newSemester && newStart && newEnd) {
    try {
      await apiCall(`/admin/semesters/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          year: parseInt(newYear),
          semester: newSemester,
          start_date: newStart,
          end_date: newEnd
        })
      });
      alert('학기가 수정되었습니다.');
      loadSemesters();
    } catch (err) {
      alert('학기 수정 실패: ' + err.message);
    }
  }
}

async function deleteSemester(id) {
  if (confirm('정말 삭제하시겠습니까?')) {
    try {
      await apiCall(`/admin/semesters/${id}`, { method: 'DELETE' });
      alert('학기가 삭제되었습니다.');
      loadSemesters();
    } catch (err) {
      alert('학기 삭제 실패: ' + err.message);
    }
  }
}

// 과목 관리
async function loadCourses() {
  try {
    const [courses, users] = await Promise.all([
      apiCall('/courses'),
      apiCall('/admin/users'),
    ]);

    if (!courses || !Array.isArray(courses)) {
      console.error('강의 목록 응답 형식이 올바르지 않습니다:', courses);
      return;
    }

    const instructors = Array.isArray(users) ? users.filter(u => u.role === 'INSTRUCTOR') : [];
    const instructorMap = new Map(
      instructors.map(inst => [inst.id, inst.name || inst.email])
    );

    const list = document.getElementById('course-list');
    list.innerHTML = courses.map(course => {
      const instructorName = instructorMap.get(course.instructor_id) || `ID ${course.instructor_id}`;
      return `
      <div class="list-item course-list-item" data-course-id="${course.id}">
        <div class="course-list-item-main">
          <span class="course-list-item-title">${course.title}</span>
          <span class="course-list-item-sub">담당교원 · ${instructorName}</span>
        </div>
        <div>
          <button class="btn btn-small" onclick="editCourse(${course.id})">수정</button>
          <button class="btn btn-small btn-danger" onclick="deleteCourse(${course.id})">삭제</button>
        </div>
      </div>
      `;
    }).join('');
  } catch (err) {
    alert('과목 목록 로드 실패: ' + err.message);
  }
}

async function loadInstructors() {
  try {
    const users = await apiCall('/admin/users');
    const instructors = users.filter(u => u.role === 'INSTRUCTOR');
    const select = document.getElementById('course-instructor');
    select.innerHTML = '<option value="">담당교원 선택</option>' + 
      instructors.map(inst => `<option value="${inst.id}">${inst.name || inst.email}</option>`).join('');
  } catch (err) {
    console.error('교원 목록 로드 실패:', err);
  }
}

async function loadStudentsForCourseForm() {
  try {
    const users = await apiCall('/admin/users');
    const students = users.filter(u => u.role === 'STUDENT');
    const container = document.getElementById('course-students-list');
    if (!container) return;
    if (students.length === 0) {
      container.innerHTML = '<p>등록된 수강생이 없습니다.</p>';
      return;
    }
    container.innerHTML = students.map(student => `
      <label style="display: block; margin-bottom: 4px;">
        <input type="checkbox" name="course-student" value="${student.id}">
        ${student.name || student.email} (${student.email})
      </label>
    `).join('');
  } catch (err) {
    console.error('수강생 목록 로드 실패:', err);
  }
}

let isLoadingDepartmentsForSelect = false;
async function loadDepartmentsForSelect() {
  if (isLoadingDepartmentsForSelect) return; // 중복 호출 방지
  isLoadingDepartmentsForSelect = true;
  
  try {
    const departments = await apiCall('/admin/departments');
    const select = document.getElementById('course-department');
    if (select) {
      select.innerHTML = '<option value="">학과 선택</option>' + 
        departments.map(dept => `<option value="${dept.id}">${dept.name}</option>`).join('');
    }
  } catch (err) {
    console.error('학과 목록 로드 실패:', err);
    // 401 에러는 apiCall에서 이미 처리
  } finally {
    isLoadingDepartmentsForSelect = false;
  }
}

async function loadSemestersForSelect() {
  try {
    const semesters = await apiCall('/admin/semesters');
    const select = document.getElementById('course-semester');
    select.innerHTML = '<option value="">학기 선택</option>' + 
      semesters.map(sem => `<option value="${sem.id}">${sem.year}년 ${sem.semester === '1' ? '1학기' : sem.semester === '2' ? '2학기' : sem.semester === 'SUMMER' ? '하계' : '동계'}</option>`).join('');
  } catch (err) {
    console.error('학기 목록 로드 실패:', err);
  }
}

document.getElementById('course-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    // 요일/시간 스케줄 수집
    const scheduleRows = Array.from(document.querySelectorAll('#course-schedule-list .schedule-row'));
    const schedules = [];

    scheduleRows.forEach(row => {
      const dayCheckbox = row.querySelector('.schedule-day');
      if (dayCheckbox && dayCheckbox.checked) {
        const startSelect = row.querySelector('.schedule-start');
        const endSelect = row.querySelector('.schedule-end');
        const start = startSelect.value;
        const end = endSelect.value;
        if (start && end) {
          schedules.push({
            day_of_week: parseInt(dayCheckbox.value),
            start_time: start,
            end_time: end,
          });
        }
      }
    });

    if (schedules.length === 0) {
      alert('최소 한 개의 요일과 시간을 선택해주세요.');
      return;
    }

    const selectedStudents = Array.from(document.querySelectorAll('#course-students-list input[name="course-student"]:checked'))
      .map(input => parseInt(input.value));

    await apiCall('/admin/courses', {
      method: 'POST',
      body: JSON.stringify({
        title: document.getElementById('course-title').value,
        instructor_id: parseInt(document.getElementById('course-instructor').value),
        department_id: parseInt(document.getElementById('course-department').value),
        semester_id: parseInt(document.getElementById('course-semester').value),
        section: document.getElementById('course-section').value || null,
        schedules,
        student_ids: selectedStudents
      })
    });
    alert('과목이 추가되었습니다.');
    document.getElementById('course-form').reset();
    loadCourses();
  } catch (err) {
    alert('과목 추가 실패: ' + err.message);
  }
});

async function editCourse(id) {
  try {
    // 과목 정보, 시간표, 수강생 정보 가져오기
    const [course, schedules, enrollments, allUsers, departments, semesters] = await Promise.all([
      apiCall(`/courses/${id}`),
      apiCall(`/courses/${id}/schedules`).catch(() => []),
      apiCall(`/courses/${id}/enrollments`).catch(() => []),
      apiCall('/admin/users'),
      apiCall('/admin/departments'),
      apiCall('/admin/semesters')
    ]);

    // 모달 열기
    const modal = document.getElementById('course-edit-modal');
    const form = document.getElementById('course-edit-form');
    
    if (!modal || !form) {
      alert('수정 모달을 찾을 수 없습니다.');
      return;
    }

    // 교원 목록 채우기
    const instructors = allUsers.filter(u => u.role === 'INSTRUCTOR');
    const instructorSelect = document.getElementById('course-edit-instructor');
    instructorSelect.innerHTML = '<option value="">담당교원 선택</option>' + 
      instructors.map(inst => `<option value="${inst.id}">${inst.name || inst.email}</option>`).join('');

    // 학과 목록 채우기
    const departmentSelect = document.getElementById('course-edit-department');
    departmentSelect.innerHTML = '<option value="">학과 선택</option>' + 
      departments.map(dept => `<option value="${dept.id}">${dept.name}</option>`).join('');

    // 학기 목록 채우기
    const semesterSelect = document.getElementById('course-edit-semester');
    semesterSelect.innerHTML = '<option value="">학기 선택</option>' + 
      semesters.map(sem => `<option value="${sem.id}">${sem.year}년 ${sem.semester === '1' ? '1학기' : sem.semester === '2' ? '2학기' : sem.semester === 'SUMMER' ? '하계' : '동계'}</option>`).join('');

    // 폼 필드 채우기
    document.getElementById('course-edit-title').value = course.title || '';
    instructorSelect.value = course.instructor_id || '';
    departmentSelect.value = course.department_id || '';
    semesterSelect.value = course.semester_id || '';
    document.getElementById('course-edit-section').value = course.section || '';

    // 시간표 채우기
    const scheduleList = document.getElementById('course-edit-schedule-list');
    scheduleList.querySelectorAll('.schedule-row').forEach(row => {
      const checkbox = row.querySelector('.schedule-day');
      const startSelect = row.querySelector('.schedule-start');
      const endSelect = row.querySelector('.schedule-end');
      const dayOfWeek = parseInt(checkbox.value);
      
      checkbox.checked = false;
      startSelect.value = '';
      endSelect.value = '';
      
      // 기존 시간표에서 해당 요일 찾기
      const schedule = schedules.find(s => s.day_of_week === dayOfWeek);
      if (schedule) {
        checkbox.checked = true;
        startSelect.value = schedule.start_time ? schedule.start_time.slice(0, 5) : '';
        endSelect.value = schedule.end_time ? schedule.end_time.slice(0, 5) : '';
      }
    });

    // 수강생 선택 상태 초기화 및 채우기
    const studentList = document.getElementById('course-students-edit-list');
    const selectedStudentIds = enrollments.map(e => e.user_id);
    
    // 수강생 목록 (이미 가져온 allUsers에서 필터링)
    const students = allUsers.filter(u => u.role === 'STUDENT');
    
    studentList.innerHTML = students.map(student => `
      <label style="display: block; margin-bottom: 4px;">
        <input type="checkbox" name="course-student-edit" value="${student.id}" ${selectedStudentIds.includes(student.id) ? 'checked' : ''}>
        ${student.name || student.email} (${student.email})
      </label>
    `).join('');

    document.getElementById('selected-students-edit-summary').textContent = 
      selectedStudentIds.length > 0 ? `${selectedStudentIds.length}명 선택됨` : '선택 안 함';

    // 모달 열기
    modal.classList.add('open');

    // 폼 제출 이벤트 (기존 핸들러 제거 후 새로 추가)
    const handleSubmit = async (e) => {
      e.preventDefault();
      
      try {
        // 요일/시간 스케줄 수집
        const scheduleRows = Array.from(document.querySelectorAll('#course-edit-schedule-list .schedule-row'));
        const schedules = [];

        scheduleRows.forEach(row => {
          const dayCheckbox = row.querySelector('.schedule-day');
          if (dayCheckbox && dayCheckbox.checked) {
            const startSelect = row.querySelector('.schedule-start');
            const endSelect = row.querySelector('.schedule-end');
            const start = startSelect.value;
            const end = endSelect.value;
            if (start && end) {
              schedules.push({
                day_of_week: parseInt(dayCheckbox.value),
                start_time: start,
                end_time: end,
              });
            }
          }
        });

        if (schedules.length === 0) {
          alert('최소 한 개의 요일과 시간을 선택해주세요.');
          return;
        }

        const selectedStudents = Array.from(document.querySelectorAll('#course-students-edit-list input[name="course-student-edit"]:checked'))
          .map(input => parseInt(input.value));

        await apiCall(`/admin/courses/${id}`, {
          method: 'PUT',
          body: JSON.stringify({
            title: document.getElementById('course-edit-title').value,
            instructor_id: parseInt(document.getElementById('course-edit-instructor').value),
            department_id: parseInt(document.getElementById('course-edit-department').value),
            semester_id: parseInt(document.getElementById('course-edit-semester').value),
            section: document.getElementById('course-edit-section').value || null,
            schedules,
            student_ids: selectedStudents
          })
        });

        alert('과목이 수정되었습니다.');
        modal.classList.remove('open');
        form.removeEventListener('submit', handleSubmit);
        loadCourses();
      } catch (err) {
        alert('과목 수정 실패: ' + err.message);
      }
    };

    form.addEventListener('submit', handleSubmit);

    // 취소 버튼
    document.getElementById('course-edit-cancel').onclick = () => {
      modal.classList.remove('open');
      form.removeEventListener('submit', handleSubmit);
    };

    // 모달 외부 클릭 시 닫기
    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.classList.remove('open');
        form.removeEventListener('submit', handleSubmit);
      }
    };
  } catch (err) {
    alert('과목 정보 로드 실패: ' + err.message);
  }
}

async function deleteCourse(id) {
  if (confirm('정말 삭제하시겠습니까?')) {
    try {
      await apiCall(`/admin/courses/${id}`, { method: 'DELETE' });
      alert('과목이 삭제되었습니다.');
      loadCourses();
    } catch (err) {
      alert('과목 삭제 실패: ' + err.message);
    }
  }
}

// 사용자 관리
async function loadUsers() {
  try {
    const users = await apiCall('/admin/users');
    
    // 역할별로 사용자 분류
    const admins = users.filter(u => u.role === 'ADMIN');
    const instructors = users.filter(u => u.role === 'INSTRUCTOR');
    const students = users.filter(u => u.role === 'STUDENT');
    
    // 관리자 목록
    const adminList = document.getElementById('user-list-admin');
    adminList.innerHTML = admins.length > 0 ? admins.map(user => `
      <div class="list-item">
        <span><strong>${user.name || user.email}</strong> (${user.email})${user.department_name ? ` - ${user.department_name}` : ''}</span>
        <div>
          <button class="btn btn-small" onclick="editUser(${user.id}, '${user.email}', '${(user.name || '').replace(/'/g, "\\'")}', '${user.role}', ${user.department_id || 'null'})">수정</button>
          <button class="btn btn-small btn-danger" onclick="deleteUser(${user.id})">삭제</button>
        </div>
      </div>
    `).join('') : '<p class="hint-text">등록된 관리자가 없습니다.</p>';
    
    // 교원 목록
    const instructorList = document.getElementById('user-list-instructor');
    instructorList.innerHTML = instructors.length > 0 ? instructors.map(user => `
      <div class="list-item">
        <span><strong>${user.name || user.email}</strong> (${user.email})${user.department_name ? ` - ${user.department_name}` : ''}</span>
        <div>
          <button class="btn btn-small" onclick="editUser(${user.id}, '${user.email}', '${(user.name || '').replace(/'/g, "\\'")}', '${user.role}', ${user.department_id || 'null'})">수정</button>
          <button class="btn btn-small btn-danger" onclick="deleteUser(${user.id})">삭제</button>
        </div>
      </div>
    `).join('') : '<p class="hint-text">등록된 교원이 없습니다.</p>';
    
    // 수강생 목록
    const studentList = document.getElementById('user-list-student');
    studentList.innerHTML = students.length > 0 ? students.map(user => `
      <div class="list-item">
        <span><strong>${user.name || user.email}</strong> (${user.email})${user.department_name ? ` - ${user.department_name}` : ''}</span>
        <div>
          <button class="btn btn-small" onclick="editUser(${user.id}, '${user.email}', '${(user.name || '').replace(/'/g, "\\'")}', '${user.role}', ${user.department_id || 'null'})">수정</button>
          <button class="btn btn-small btn-danger" onclick="deleteUser(${user.id})">삭제</button>
        </div>
      </div>
    `).join('') : '<p class="hint-text">등록된 수강생이 없습니다.</p>';
    
    // 역할별 탭에 개수 표시
    document.querySelector('.user-role-tab[data-role="ADMIN"]').textContent = `관리자 (${admins.length})`;
    document.querySelector('.user-role-tab[data-role="INSTRUCTOR"]').textContent = `교원 (${instructors.length})`;
    document.querySelector('.user-role-tab[data-role="STUDENT"]').textContent = `수강생 (${students.length})`;
    
  } catch (err) {
    alert('사용자 목록 로드 실패: ' + err.message);
  }
}

// 역할별 탭 전환
(function initUserRoleTabs() {
  const tabs = document.querySelectorAll('.user-role-tab');
  const sections = document.querySelectorAll('.user-list-section');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const role = tab.dataset.role;
      
      // 탭 활성화
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // 섹션 활성화
      sections.forEach(s => s.classList.remove('active'));
      const targetSection = document.getElementById(`user-list-${role.toLowerCase()}`);
      if (targetSection) {
        targetSection.classList.add('active');
      }
    });
  });
})();

document.getElementById('user-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const departmentId = document.getElementById('user-department').value;
    await apiCall('/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email: document.getElementById('user-email').value,
        name: document.getElementById('user-name').value || null,
        role: document.getElementById('user-role').value,
        department_id: departmentId ? parseInt(departmentId, 10) : null
      })
    });
    alert('사용자가 추가되었습니다.');
    document.getElementById('user-form').reset();
    loadUsers();
  } catch (err) {
    alert('사용자 추가 실패: ' + err.message);
  }
});

async function loadDepartmentsForUserForm() {
  try {
    const departments = await apiCall('/admin/departments');
    const select = document.getElementById('user-department');
    if (select) {
      select.innerHTML = '<option value="">학과 선택 (선택)</option>' + 
        departments.map(dept => `<option value="${dept.id}">${dept.name}</option>`).join('');
    }
  } catch (err) {
    console.error('학과 목록 로드 실패:', err);
  }
}

async function editUser(id, email, name, role, departmentId) {
  const newEmail = prompt('이메일:', email);
  if (!newEmail) return;
  const newName = prompt('이름:', name);
  const newRole = prompt('역할 (ADMIN/INSTRUCTOR/STUDENT):', role);
  if (!newRole) return;
  
  // 학과 선택을 위한 모달 또는 prompt
  const departments = await apiCall('/admin/departments').catch(() => []);
  let departmentOptions = '0. 학과 없음\n';
  departments.forEach((dept, idx) => {
    departmentOptions += `${idx + 1}. ${dept.name}\n`;
  });
  const deptChoice = prompt(`학과 선택:\n${departmentOptions}\n번호를 입력하세요:`, departmentId ? departments.findIndex(d => d.id === departmentId) + 1 : 0);
  
  let newDepartmentId = null;
  if (deptChoice && !isNaN(deptChoice)) {
    const choice = parseInt(deptChoice, 10);
    if (choice === 0) {
      newDepartmentId = null;
    } else if (choice > 0 && choice <= departments.length) {
      newDepartmentId = departments[choice - 1].id;
    }
  } else if (departmentId) {
    newDepartmentId = departmentId;
  }
  
  try {
    await apiCall(`/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        email: newEmail,
        name: newName || null,
        role: newRole,
        department_id: newDepartmentId
      })
    });
    alert('사용자가 수정되었습니다.');
    loadUsers();
  } catch (err) {
    alert('사용자 수정 실패: ' + err.message);
  }
}

async function deleteUser(id) {
  if (confirm('정말 삭제하시겠습니까?')) {
    try {
      await apiCall(`/admin/users/${id}`, { method: 'DELETE' });
      alert('사용자가 삭제되었습니다.');
      loadUsers();
    } catch (err) {
      alert('사용자 삭제 실패: ' + err.message);
    }
  }
}

// 시스템 리포트
async function loadSystemReport() {
  try {
    const report = await apiCall('/admin/reports/system');
    const content = document.getElementById('report-content');
    content.innerHTML = `
      <div class="report-card">
        <h3>사용자 통계</h3>
        <ul>
          ${report.user_stats.map(stat => `<li>${stat.role === 'ADMIN' ? '관리자' : stat.role === 'INSTRUCTOR' ? '교원' : '수강생'}: ${stat.count}명</li>`).join('')}
        </ul>
      </div>
      <div class="report-card">
        <h3>강의 통계</h3>
        <p>전체 강의: ${report.course_stats.total_courses}개</p>
        <p>담당 교원 수: ${report.course_stats.total_instructors}명</p>
      </div>
      <div class="report-card">
        <h3>세션 통계</h3>
        <p>전체 세션: ${report.session_stats.total_sessions}개</p>
        <p>진행 중인 세션: ${report.session_stats.open_sessions}개</p>
      </div>
      <div class="report-card">
        <h3>출석 통계</h3>
        <p>전체 출석 기록: ${report.attendance_stats.total_attendances}건</p>
        <p>출석: ${report.attendance_stats.present_count}건</p>
        <p>지각: ${report.attendance_stats.late_count}건</p>
        <p>결석: ${report.attendance_stats.absent_count}건</p>
      </div>
      <div class="report-card">
        <h3>최근 오류 (최대 50개)</h3>
        <ul>
          ${report.recent_errors.length > 0 
            ? report.recent_errors.map(err => `<li>${err.created_at}: ${err.description}</li>`).join('')
            : '<li>오류 없음</li>'}
        </ul>
      </div>
    `;
  } catch (err) {
    alert('리포트 로드 실패: ' + err.message);
  }
}

// 출석/위험군 리포트 (관리자용)
let adminAnalyticsInitialized = false;

async function initAdminAnalytics() {
  if (adminAnalyticsInitialized) return;
  adminAnalyticsInitialized = true;

  // 과목 선택 옵션 채우기
  try {
    const courses = await apiCall('/courses');
    const select = document.getElementById('report-course-select');
    if (select && Array.isArray(courses)) {
      select.innerHTML = '<option value=\"\">과목 선택</option>' +
        courses.map(c => `<option value=\"${c.id}\">${c.title}</option>`).join('');
    }
  } catch (err) {
    console.error('리포트용 과목 목록 로드 실패:', err);
  }

  const btn = document.getElementById('load-attendance-report-btn');
  if (btn) {
    btn.addEventListener('click', loadAdminAttendanceAnalytics);
  }
}

async function loadAdminAttendanceAnalytics() {
  const courseId = document.getElementById('report-course-select')?.value;
  const week = document.getElementById('report-week')?.value;
  const from = document.getElementById('report-from')?.value;
  const to = document.getElementById('report-to')?.value;

  if (!courseId) {
    alert('과목을 선택하세요.');
    return;
  }

  const attendanceContainer = document.getElementById('admin-attendance-report');
  const riskContainer = document.getElementById('admin-risk-report');
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
        <div class="report-card">
          <h3>과목/주차 출석률</h3>
          ${rows.length === 0 ? '<p>데이터가 없습니다.</p>' : `
            <table class="simple-table">
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
          <p style="margin-top:8px;">지각 → 결석 전환 건수 (전체 시스템): <strong>${lateToAbsent?.late_to_absent_count ?? 0}</strong>건</p>
        </div>
        <div class="report-card">
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
        <div class="report-card">
          <h3>위험군 - 누적 결석 상위</h3>
          ${absentRows.length === 0 ? '<p>데이터가 없습니다.</p>' : `
            <table class="simple-table">
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
        <div class="report-card">
          <h3>위험군 - 연속 지각</h3>
          ${lateRows.length === 0 ? '<p>연속 지각 위험군이 없습니다.</p>' : `
            <table class="simple-table">
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
    console.error('관리자 리포트 로드 실패:', err);
    if (attendanceContainer) {
      attendanceContainer.innerHTML = '<p>출석/공결 지표를 불러오는 중 오류가 발생했습니다.</p>';
    }
    if (riskContainer) {
      riskContainer.innerHTML = '<p>위험군 지표를 불러오는 중 오류가 발생했습니다.</p>';
    }
  }
}

document.getElementById('refresh-report-btn').addEventListener('click', loadSystemReport);

// 감사 로그
let currentAuditPage = 0;
const auditLogsPerPage = 50;

async function loadAuditLogs(page = 0) {
  try {
    const actionType = document.getElementById('audit-action-type').value || undefined;
    const startDate = document.getElementById('audit-start-date').value || undefined;
    const endDate = document.getElementById('audit-end-date').value || undefined;
    
    const params = new URLSearchParams({
      limit: auditLogsPerPage,
      offset: page * auditLogsPerPage
    });
    
    if (actionType) params.append('action_type', actionType);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    
    const data = await apiCall(`/admin/audit-logs?${params.toString()}`);
    
    const list = document.getElementById('audit-logs-list');
    if (!data.logs || data.logs.length === 0) {
      list.innerHTML = '<p class="hint-text">감사 로그가 없습니다.</p>';
      document.getElementById('audit-logs-pagination').innerHTML = '';
      return;
    }
    
    const actionTypeNames = {
      'DEPARTMENT_CREATED': '학과 생성',
      'DEPARTMENT_UPDATED': '학과 수정',
      'DEPARTMENT_DELETED': '학과 삭제',
      'SEMESTER_CREATED': '학기 생성',
      'SEMESTER_UPDATED': '학기 수정',
      'SEMESTER_DELETED': '학기 삭제',
      'COURSE_CREATED': '과목 생성',
      'COURSE_UPDATED': '과목 수정',
      'COURSE_DELETED': '과목 삭제',
      'USER_CREATED': '사용자 생성',
      'USER_UPDATED': '사용자 수정',
      'USER_DELETED': '사용자 삭제',
      'ATTENDANCE_UPDATED': '출석 변경',
      'EXCUSE_CREATED': '공결 신청 생성',
      'EXCUSE_APPROVED': '공결 승인',
      'EXCUSE_REJECTED': '공결 반려',
      'APPEAL_CREATED': '이의제기 생성',
      'APPEAL_RESOLVED': '이의제기 처리',
      'APPEAL_REJECTED': '이의제기 거부'
    };
    
    list.innerHTML = `
      <table class="audit-logs-table">
        <thead>
          <tr>
            <th>시간</th>
            <th>작업자</th>
            <th>작업 유형</th>
            <th>대상</th>
            <th>설명</th>
            <th>IP 주소</th>
          </tr>
        </thead>
        <tbody>
          ${data.logs.map(log => {
            const date = new Date(log.created_at);
            const dateStr = date.toLocaleString('ko-KR', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            });
            const userName = log.user_name || log.user_email || '알 수 없음';
            const userRole = log.user_role === 'ADMIN' ? '관리자' : log.user_role === 'INSTRUCTOR' ? '교원' : log.user_role === 'STUDENT' ? '수강생' : '알 수 없음';
            const actionName = actionTypeNames[log.action_type] || log.action_type;
            const targetInfo = log.target_type && log.target_id ? `${log.target_type} #${log.target_id}` : '-';
            
            return `
              <tr>
                <td>${dateStr}</td>
                <td>${userName} (${userRole})</td>
                <td><span class="audit-action-type">${actionName}</span></td>
                <td>${targetInfo}</td>
                <td class="audit-description">${log.description || '-'}</td>
                <td>${log.ip_address || '-'}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
    
    // 페이지네이션
    const totalPages = Math.ceil(data.total / auditLogsPerPage);
    const pagination = document.getElementById('audit-logs-pagination');
    if (totalPages > 1) {
      let paginationHtml = '<div class="pagination">';
      
      if (page > 0) {
        paginationHtml += `<button class="btn btn-small" onclick="loadAuditLogs(${page - 1})">이전</button>`;
      }
      
      const startPage = Math.max(0, page - 2);
      const endPage = Math.min(totalPages - 1, page + 2);
      
      for (let i = startPage; i <= endPage; i++) {
        if (i === page) {
          paginationHtml += `<span class="pagination-current">${i + 1}</span>`;
        } else {
          paginationHtml += `<button class="btn btn-small" onclick="loadAuditLogs(${i})">${i + 1}</button>`;
        }
      }
      
      if (page < totalPages - 1) {
        paginationHtml += `<button class="btn btn-small" onclick="loadAuditLogs(${page + 1})">다음</button>`;
      }
      
      paginationHtml += `</div><p class="pagination-info">총 ${data.total}건 중 ${page * auditLogsPerPage + 1}-${Math.min((page + 1) * auditLogsPerPage, data.total)}건 표시</p>`;
      pagination.innerHTML = paginationHtml;
    } else {
      pagination.innerHTML = `<p class="pagination-info">총 ${data.total}건</p>`;
    }
    
    currentAuditPage = page;
  } catch (err) {
    alert('감사 로그 로드 실패: ' + err.message);
    document.getElementById('audit-logs-list').innerHTML = '<p class="hint-text">감사 로그를 불러올 수 없습니다.</p>';
  }
}

document.getElementById('audit-filter-btn').addEventListener('click', () => {
  loadAuditLogs(0);
});

document.getElementById('audit-refresh-btn').addEventListener('click', () => {
  document.getElementById('audit-action-type').value = '';
  document.getElementById('audit-start-date').value = '';
  document.getElementById('audit-end-date').value = '';
  loadAuditLogs(0);
});

// 수강생 선택 모달 핸들러 (추가용)
(function initStudentModal() {
  const modal = document.getElementById('student-modal');
  const openBtn = document.getElementById('open-student-modal');
  const cancelBtn = document.getElementById('student-modal-cancel');
  const applyBtn = document.getElementById('student-modal-apply');
  const summary = document.getElementById('selected-students-summary');

  if (!modal || !openBtn || !cancelBtn || !applyBtn || !summary) return;

  const closeModal = () => {
    modal.classList.remove('open');
  };

  const openModal = () => {
    modal.classList.add('open');
  };

  openBtn.addEventListener('click', openModal);
  cancelBtn.addEventListener('click', closeModal);

  applyBtn.addEventListener('click', () => {
    const selected = Array.from(document.querySelectorAll('#course-students-list input[name="course-student"]:checked'));
    const count = selected.length;
    if (count === 0) {
      summary.textContent = '선택 안 함';
    } else {
      summary.textContent = `${count}명 선택됨`;
    }
    closeModal();
  });
})();

// 수강생 선택 모달 핸들러 (수정용)
(function initStudentEditModal() {
  const modal = document.getElementById('student-edit-modal');
  const openBtn = document.getElementById('open-student-edit-modal');
  const cancelBtn = document.getElementById('student-edit-modal-cancel');
  const applyBtn = document.getElementById('student-edit-modal-apply');
  const summary = document.getElementById('selected-students-edit-summary');

  if (!modal || !openBtn || !cancelBtn || !applyBtn || !summary) return;

  const closeModal = () => {
    modal.classList.remove('open');
  };

  const openModal = () => {
    modal.classList.add('open');
  };

  openBtn.addEventListener('click', openModal);
  cancelBtn.addEventListener('click', closeModal);

  applyBtn.addEventListener('click', () => {
    const selected = Array.from(document.querySelectorAll('#course-students-edit-list input[name="course-student-edit"]:checked'));
    const count = selected.length;
    if (count === 0) {
      summary.textContent = '선택 안 함';
    } else {
      summary.textContent = `${count}명 선택됨`;
    }
    closeModal();
  });
})();

// 요일별 시간 셀렉트 10분 단위 옵션 채우기
(function initScheduleTimeOptions() {
  const buildOptions = () => {
    const opts = ['<option value="">시간 선택</option>'];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 10) {
        const hh = String(h).padStart(2, '0');
        const mm = String(m).padStart(2, '0');
        const v = `${hh}:${mm}`;
        opts.push(`<option value="${v}">${v}</option>`);
      }
    }
    return opts.join('');
  };

  const optionsHtml = buildOptions();
  
  // 추가 폼용
  const startSelects = document.querySelectorAll('#course-schedule-list .schedule-start');
  const endSelects = document.querySelectorAll('#course-schedule-list .schedule-end');
  if (startSelects.length && endSelects.length) {
    startSelects.forEach(sel => { sel.innerHTML = optionsHtml; });
    endSelects.forEach(sel => { sel.innerHTML = optionsHtml; });
  }

  // 수정 폼용
  const editStartSelects = document.querySelectorAll('#course-edit-schedule-list .schedule-start');
  const editEndSelects = document.querySelectorAll('#course-edit-schedule-list .schedule-end');
  if (editStartSelects.length && editEndSelects.length) {
    editStartSelects.forEach(sel => { sel.innerHTML = optionsHtml; });
    editEndSelects.forEach(sel => { sel.innerHTML = optionsHtml; });
  }
})();

// 과목 상세 모달 핸들러 및 과목 클릭 이벤트
(function initCourseDetailModal() {
  const modal = document.getElementById('course-detail-modal');
  const body = document.getElementById('course-detail-body');
  const closeBtn = document.getElementById('course-detail-close');
  const list = document.getElementById('course-list');

  if (!modal || !body || !closeBtn || !list) return;

  const dayNames = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

  const closeModal = () => {
    modal.classList.remove('open');
  };

  const openModal = () => {
    modal.classList.add('open');
  };

  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  async function openCourseDetail(courseId) {
    try {
      body.innerHTML = '<p class="course-detail-meta">불러오는 중...</p>';
      openModal();

      const [
        course,
        schedules,
        enrollments,
        users,
        departments,
        semesters,
      ] = await Promise.all([
        apiCall(`/courses/${courseId}`),
        apiCall(`/courses/${courseId}/schedules`).catch(() => []),
        apiCall(`/courses/${courseId}/enrollments`),
        apiCall('/admin/users'),
        apiCall('/admin/departments'),
        apiCall('/admin/semesters'),
      ]);

      const instructor = users.find(u => u.id === course.instructor_id);
      const department = departments.find(d => d.id === course.department_id);
      const semester = semesters.find(s => s.id === course.semester_id);

      const scheduleHtml = (schedules && schedules.length > 0)
        ? `<ul class="course-detail-meta">
            ${schedules.map(s => `
              <li>${dayNames[s.day_of_week]} ${s.start_time?.slice(0, 5)} ~ ${s.end_time?.slice(0, 5)}</li>
            `).join('')}
          </ul>`
        : '<p class="course-detail-meta">등록된 시간표가 없습니다.</p>';

      const studentsHtml = (enrollments && enrollments.length > 0)
        ? `<ul>
            ${enrollments.map(st => `
              <li>${st.name || st.email} (${st.email})</li>
            `).join('')}
          </ul>`
        : '<p>등록된 수강생이 없습니다.</p>';

      body.innerHTML = `
        <div class="course-detail-grid">
          <div>
            <div class="course-detail-section-title">기본 정보</div>
            <div class="course-detail-meta">
              <p><strong>과목명</strong> ${course.title}</p>
              <p><strong>분반</strong> ${course.section || '-'}</p>
              <p><strong>담당교원</strong> ${instructor ? (instructor.name || instructor.email) : '정보 없음'}</p>
              <p><strong>소속 학과</strong> ${department ? department.name : '정보 없음'}</p>
              <p><strong>학기</strong> ${semester ? `${semester.year}년 ${semester.semester === '1' ? '1학기' : semester.semester === '2' ? '2학기' : semester.semester === 'SUMMER' ? '하계' : '동계'}` : '정보 없음'}</p>
            </div>
          </div>
          <div>
            <div class="course-detail-section-title">시간표</div>
            ${scheduleHtml}
          </div>
        </div>
        <div class="course-detail-students">
          <div class="course-detail-section-title">수강생 리스트</div>
          ${studentsHtml}
        </div>
      `;
    } catch (err) {
      body.innerHTML = `<p class="course-detail-meta">과목 상세 정보를 불러오는 중 오류가 발생했습니다: ${err.message}</p>`;
    }
  }

  list.addEventListener('click', (e) => {
    const item = e.target.closest('.course-list-item');
    if (!item) return;
    if (e.target.closest('button')) {
      return;
    }
    const id = parseInt(item.dataset.courseId, 10);
    if (!Number.isNaN(id)) {
      openCourseDetail(id);
    }
  });
})();

// 초기 로드 - departments 탭이 활성화되어 있을 때만
if (document.querySelector('.tab-btn[data-tab="departments"]')?.classList.contains('active')) {
  loadDepartments();
}

