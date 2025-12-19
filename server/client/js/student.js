const API_BASE = window.location.origin;

// 토큰 가져오기 (localStorage만 사용, 시크릿 모드에서 탭 간 간섭 방지)
function getAuthToken() {
  return localStorage.getItem('token') || null;
}

let token = getAuthToken();
let currentUser = JSON.parse(localStorage.getItem('user') || '{}');

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
      if (currentUser.role !== 'STUDENT') {
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
      ...(options.headers || {})
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
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
    
    // 탭별 데이터 로드
    if (btn.dataset.tab === 'attendance') {
      loadDashboard();
    } else if (btn.dataset.tab === 'status') {
      loadCourses();
      loadAttendance();
    } else if (btn.dataset.tab === 'excuses') {
      loadSessionsForExcuse();
      loadMyExcuses();
    } else if (btn.dataset.tab === 'appeals') {
      loadSessionsForAppeal();
      loadMyAppeals();
    } else if (btn.dataset.tab === 'votes') {
      loadVotes();
    } else if (btn.dataset.tab === 'messages') {
      loadChatRooms();
    }
  });
});

// 대시보드 출석 현황 로드
async function loadDashboard() {
  try {
    const dashboard = await apiCall('/dashboard/student');
    const container = document.getElementById('dashboard-attendance');

    if (!dashboard.open_sessions || dashboard.open_sessions.length === 0) {
      container.innerHTML = `
        <p><strong>진행 중인 세션:</strong> 0개 | <strong>체크 완료:</strong> 0개 | <strong>미체크:</strong> 0개</p>
        <p style="margin-top:8px; color:#6b7280;">현재 진행 중인 출석 세션이 없습니다.</p>
      `;
      return;
    }

    container.innerHTML = `
      <p><strong>진행 중인 세션:</strong> ${dashboard.total_open}개 | <strong>체크 완료:</strong> ${dashboard.checked_count}개 | <strong>미체크:</strong> ${dashboard.pending_count}개</p>
      ${dashboard.open_sessions.map(session => `
        <div class="report-card" style="margin-top: 12px; margin-bottom: 12px;">
          <h4>${session.course_title} - ${session.week_number}주차 (${session.session_date})</h4>
          <p><strong>출석 방식:</strong> ${session.attendance_method === 'ELECTRONIC' ? '전자출결' : session.attendance_method === 'AUTH_CODE' ? '인증번호' : '호명'}</p>
          <p><strong>내 출석 상태:</strong> <span style="font-weight: bold; color: ${session.status === 1 ? '#10b981' : session.status === 2 ? '#f59e0b' : session.status === 3 ? '#ef4444' : session.status === 4 ? '#3b82f6' : '#6b7280'}">${session.status_name || '미체크'}</span></p>
          ${session.checked_at ? `<p><strong>체크 시간:</strong> ${new Date(session.checked_at).toLocaleString('ko-KR')}</p>` : ''}
          ${!session.status ? `<button class="btn btn-small btn-primary" onclick="quickAttend(${session.id}, '${session.attendance_method}')">지금 출석하기</button>` : ''}
        </div>
      `).join('')}
    `;
  } catch (err) {
    console.error('대시보드 로드 실패:', err);
    document.getElementById('dashboard-attendance').innerHTML = '<p>대시보드 데이터를 불러올 수 없습니다.</p>';
  }
}

// 대시보드에서 사용하는 빠른 출석 체크
async function quickAttend(sessionId, method) {
  try {
    let body = {};
    if (method === 'AUTH_CODE') {
      const code = prompt('인증번호(4자리)를 입력하세요:');
      if (!code) return;
      body.auth_code = code;
    }

    await apiCall(`/attendance/sessions/${sessionId}/attend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    alert('출석이 기록되었습니다.');
    loadDashboard();
  } catch (err) {
    alert('출석 체크 실패: ' + err.message);
  }
}

document.getElementById('refresh-dashboard-btn').addEventListener('click', loadDashboard);

// 강의 목록 로드
async function loadCourses() {
  try {
    const courses = await apiCall('/student/courses');
    if (!courses || !Array.isArray(courses)) {
      console.error('강의 목록 응답 형식이 올바르지 않습니다:', courses);
      return;
    }
    const select = document.getElementById('attendance-course-filter');
    select.innerHTML = '<option value="">전체 강의</option>' + 
      courses.map(course => `<option value="${course.id}">${course.title}</option>`).join('');
  } catch (err) {
    console.error('강의 목록 로드 실패:', err);
  }
}

// 출석 현황 조회
async function loadAttendance() {
  try {
    const courseId = document.getElementById('attendance-course-filter').value;
    const summary = await apiCall(`/student/attendance${courseId ? `?course_id=${courseId}` : ''}`);
    
    const summaryDiv = document.getElementById('attendance-summary');
    summaryDiv.innerHTML = `
      <div class="report-card">
        <h3>출석 통계</h3>
        <p>전체 세션: ${summary.total}개</p>
        <p>출석: ${summary.present}개</p>
        <p>지각: ${summary.late}개</p>
        <p>결석: ${summary.absent}개</p>
        <p>공결: ${summary.excused}개</p>
        <p>미체크: ${summary.pending}개</p>
      </div>
    `;
    
    const detailsDiv = document.getElementById('attendance-details');
    detailsDiv.innerHTML = `
      <div class="report-card">
        <h3>출석 상세</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <th style="padding: 8px; text-align: left;">강의</th>
              <th style="padding: 8px; text-align: left;">주차</th>
              <th style="padding: 8px; text-align: left;">날짜</th>
              <th style="padding: 8px; text-align: left;">상태</th>
              <th style="padding: 8px; text-align: left;">체크 시간</th>
              <th style="padding: 8px; text-align: left;">이의제기</th>
            </tr>
          </thead>
          <tbody>
            ${summary.sessions.map(s => `
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 8px;">${s.course_title || '-'}</td>
                <td style="padding: 8px;">${s.week_number || '-'}</td>
                <td style="padding: 8px;">${s.session_date || '-'}</td>
                <td style="padding: 8px;">${s.status_name || '미체크'}</td>
                <td style="padding: 8px;">${s.checked_at ? new Date(s.checked_at).toLocaleString('ko-KR') : '-'}</td>
                <td style="padding: 8px;">
                  ${s.status !== null && s.status !== undefined ? `<button class="btn btn-small" onclick="goToAppealTab(${s.id})">이의제기</button>` : '-'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    alert('출석 현황 조회 실패: ' + err.message);
  }
}

document.getElementById('attendance-refresh-btn').addEventListener('click', loadAttendance);
document.getElementById('attendance-course-filter').addEventListener('change', loadAttendance);

// 공결 신청용 주차 목록
async function loadSessionsForExcuse() {
  try {
    const courses = await apiCall('/student/courses');
    let allSessions = [];
    for (const course of courses) {
      try {
        const sessions = await apiCall(`/sessions/course/${course.id}`);
        allSessions = allSessions.concat(sessions.map(s => ({ ...s, course_title: course.title })));
      } catch (err) {
        console.error(`세션 로드 실패 (강의 ${course.id}):`, err);
      }
    }
    const select = document.getElementById('excuse-session');
    select.innerHTML = '<option value="">주차 선택</option>' + 
      allSessions.map(s => `<option value="${s.id}">${s.course_title} - ${s.week_number}주차 (${s.session_date})</option>`).join('');
  } catch (err) {
    console.error('세션 목록 로드 실패:', err);
  }
}

// 공결 신청
document.getElementById('excuse-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const formData = new FormData();
    const reasonCode = document.getElementById('excuse-reason-code').value;
    const reason = document.getElementById('excuse-reason').value;
    
    if (reasonCode) {
      formData.append('reason_code', reasonCode);
    }
    formData.append('reason', reason);
    
    const fileInput = document.getElementById('excuse-file');
    if (fileInput.files[0]) {
      formData.append('file', fileInput.files[0]);
    }
    
    const sessionId = document.getElementById('excuse-session').value;
    token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE}/student/sessions/${sessionId}/excuses`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: formData
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || '요청 실패');
    }
    
    const result = await response.json();
    alert(`공결 신청이 완료되었습니다. (${result.course_title || ''})`);
    document.getElementById('excuse-form').reset();
    loadMyExcuses();
  } catch (err) {
    alert('공결 신청 실패: ' + err.message);
  }
});

// 내 공결 신청 목록
async function loadMyExcuses() {
  try {
    const excuses = await apiCall('/student/excuses');
    const list = document.getElementById('excuses-list');
    if (excuses.length === 0) {
      list.innerHTML = '<p>공결 신청 내역이 없습니다.</p>';
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
        <div class="list-item">
          <div>
            <strong>${excuse.course_title}</strong> - ${excuse.week_number}주차 (${excuse.session_date})
            <br>
            ${excuse.reason_code ? `<small><strong>사유 유형:</strong> ${reasonCodeNames[excuse.reason_code] || excuse.reason_code}</small><br>` : ''}
            <small><strong>사유:</strong> ${excuse.reason || '-'}</small>
            ${excuse.file_path ? `<br><small><strong>증빙 파일:</strong> <a href="${API_BASE}/uploads/${excuse.file_path}" target="_blank">파일 보기</a></small>` : ''}
            ${excuse.instructor_comment ? `<br><small><strong>교원 코멘트:</strong> ${excuse.instructor_comment}</small>` : ''}
            <br>
            <span style="color: ${statusColors[excuse.status]}; font-weight: bold;">${statusNames[excuse.status]}</span>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    alert('공결 목록 로드 실패: ' + err.message);
  }
}

// 채팅방 목록 로드
let currentChatInstructorId = null;
let currentChatCourseId = null;

async function loadChatRooms() {
  try {
    const rooms = await apiCall('/student/chat-rooms');
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
             data-instructor-id="${room.other_user_id}" 
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
        currentChatInstructorId = parseInt(item.dataset.instructorId);
        currentChatCourseId = item.dataset.courseId ? parseInt(item.dataset.courseId) : null;
        loadChatMessages(currentChatInstructorId, currentChatCourseId);
      });
    });
  } catch (err) {
    console.error('채팅방 목록 로드 실패:', err);
    document.getElementById('chat-rooms-list').innerHTML = '<div style="padding: 16px; color: #ef4444;">채팅방 목록을 불러올 수 없습니다.</div>';
  }
}

// 채팅 메시지 로드
async function loadChatMessages(instructorId, courseId) {
  try {
    const query = courseId ? `?course_id=${courseId}` : '';
    const messages = await apiCall(`/student/chat-rooms/${instructorId}${query}`);
    const messagesContainer = document.getElementById('chat-messages');
    const header = document.getElementById('chat-header');
    const inputArea = document.getElementById('chat-input-area');
    
    // 헤더 업데이트
    const room = await apiCall('/student/chat-rooms').then(rooms => 
      rooms.find(r => r.other_user_id === instructorId && (r.course_id === courseId || (!r.course_id && !courseId)))
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
  if (!currentChatInstructorId || !currentChatCourseId) {
    alert('채팅방을 선택해주세요.');
    return;
  }
  
  const content = document.getElementById('message-content').value.trim();
  if (!content) return;
  
  try {
    await apiCall('/student/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        course_id: currentChatCourseId,
        content: content
      })
    });
    
    document.getElementById('message-content').value = '';
    await loadChatMessages(currentChatInstructorId, currentChatCourseId);
    await loadChatRooms();
  } catch (err) {
    alert('메시지 전송 실패: ' + err.message);
  }
});

// 이의제기용 주차 목록
async function loadSessionsForAppeal() {
  try {
    const courses = await apiCall('/student/courses');
    let allSessions = [];
    for (const course of courses) {
      try {
        const sessions = await apiCall(`/sessions/course/${course.id}`);
        allSessions = allSessions.concat(sessions.map(s => ({ ...s, course_title: course.title })));
      } catch (err) {
        console.error(`세션 로드 실패 (강의 ${course.id}):`, err);
      }
    }
    const select = document.getElementById('appeal-session');
    select.innerHTML = '<option value="">주차 선택</option>' + 
      allSessions.map(s => `<option value="${s.id}">${s.course_title} - ${s.week_number}주차 (${s.session_date})</option>`).join('');
  } catch (err) {
    console.error('세션 목록 로드 실패:', err);
  }
}

// 이의제기 제출
document.getElementById('appeal-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const sessionId = document.getElementById('appeal-session').value;
    const message = document.getElementById('appeal-message').value;
    
    if (!sessionId || !message) {
      alert('주차와 메시지를 모두 입력해주세요.');
      return;
    }
    
    await apiCall('/appeals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: parseInt(sessionId),
        message: message
      })
    });
    alert('이의제기가 제출되었습니다.');
    document.getElementById('appeal-form').reset();
    loadMyAppeals();
  } catch (err) {
    alert('이의제기 제출 실패: ' + err.message);
  }
});

// 이의제기 탭으로 이동하고 주차 선택
function goToAppealTab(sessionId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector('[data-tab="appeals"]').classList.add('active');
  document.getElementById('appeals').classList.add('active');
  loadSessionsForAppeal();
  setTimeout(() => {
    const select = document.getElementById('appeal-session');
    if (select) {
      select.value = sessionId;
    }
  }, 500);
}

// 내 이의제기 목록
async function loadMyAppeals() {
  try {
    const appeals = await apiCall('/appeals/my');
    const list = document.getElementById('appeals-list');
    if (appeals.length === 0) {
      list.innerHTML = '<p>이의제기 내역이 없습니다.</p>';
      return;
    }
    list.innerHTML = appeals.map(appeal => {
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
      return `
        <div class="list-item">
          <div>
            <strong>${appeal.course_title}</strong> - ${appeal.week_number}주차 (${appeal.session_date})
            <br>
            <small><strong>이의제기 내용:</strong> ${appeal.message}</small>
            ${appeal.instructor_comment ? `<br><small><strong>교원 코멘트:</strong> ${appeal.instructor_comment}</small>` : ''}
            <br>
            <span style="color: ${statusColors[appeal.status]}; font-weight: bold;">${statusNames[appeal.status] || appeal.status}</span>
            <br>
            <small style="color: #6b7280;">제출일: ${new Date(appeal.created_at).toLocaleString('ko-KR')}</small>
            ${appeal.resolved_at ? `<br><small style="color: #6b7280;">처리일: ${new Date(appeal.resolved_at).toLocaleString('ko-KR')}</small>` : ''}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    alert('이의제기 목록 로드 실패: ' + err.message);
  }
}

// 공강 투표 목록 및 응답
async function loadVotes() {
  try {
    const list = document.getElementById('votes-list');
    if (!list) return;

    const votes = await apiCall('/student/votes');
    if (!votes || votes.length === 0) {
      list.innerHTML = '<p>진행 중인 공강 투표가 없습니다.</p>';
      return;
    }

    list.innerHTML = votes.map(vote => {
      const weekText = vote.week_number
        ? `${vote.week_number}주차`
        : (vote.vote_date ? vote.vote_date : '주차 정보 없음');
      const my = vote.my_response;
      const statusText = my === 'YES' ? '찬성' : my === 'NO' ? '반대' : '미응답';
      const statusColor = my === 'YES' ? '#10b981' : my === 'NO' ? '#ef4444' : '#6b7280';

      return `
        <div class="list-item" style="flex-direction: column; align-items: flex-start; gap: 8px;">
          <div>
            <strong>${vote.course_title}</strong> - ${weekText}
            <br>
            <span style="font-weight:600;">${vote.title}</span>
            ${vote.description ? `<br><small>${vote.description}</small>` : ''}
          </div>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span style="color:${statusColor}; font-weight:600;">내 응답: ${statusText}</span>
            <button class="btn btn-small" onclick="respondToVote(${vote.id}, 'YES')">찬성</button>
            <button class="btn btn-small btn-secondary" onclick="respondToVote(${vote.id}, 'NO')">반대</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    alert('공강 투표 목록 로드 실패: ' + err.message);
  }
}

async function respondToVote(voteId, response) {
  try {
    await apiCall(`/student/votes/${voteId}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response })
    });
    alert('투표 응답이 저장되었습니다.');
    loadVotes();
  } catch (err) {
    alert('투표 응답 실패: ' + err.message);
  }
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

// 초기 로드
loadDashboard();

