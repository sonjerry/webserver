const API_BASE = window.location.origin;

// 쿠키에서 토큰 가져오기
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

// 리다이렉트 중복 방지 플래그
let isRedirecting = false;

// 로그인 상태 확인 (쿠키 기반)
async function checkAuthStatus() {
  // 이미 리다이렉트 중이면 중복 방지
  if (isRedirecting) return null;
  
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (res.ok) {
      const data = await res.json();
      const { user } = data;
      
      // localStorage에도 저장 (기존 코드와 호환)
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('token', data.token || localStorage.getItem('token') || '');
      
      // 로그인 페이지에서 접근한 경우 대시보드로 리다이렉트
      if (window.location.pathname.includes('index.html') || window.location.pathname.endsWith('/')) {
        isRedirecting = true;
        if (user.role === 'STUDENT') {
          window.location.href = 'student.html';
        } else if (user.role === 'INSTRUCTOR') {
          window.location.href = 'instructor.html';
        } else if (user.role === 'ADMIN') {
          window.location.href = 'admin.html';
        }
      }
      
      return user;
    }
    return null;
  } catch (err) {
    console.error('인증 확인 실패:', err);
    return null;
  }
}

// 페이지 로드 시 로그인 상태 확인
if (window.location.pathname.includes('index.html') || window.location.pathname.endsWith('/')) {
  checkAuthStatus();
}

// 로그인 폼 처리
const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(error.message || '로그인 실패');
        return;
      }

      const data = await res.json();
      const { token, user } = data;

      // localStorage에도 저장 (기존 코드와 호환)
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));

      if (user.role === 'STUDENT') {
        window.location.href = 'student.html';
      } else if (user.role === 'INSTRUCTOR') {
        window.location.href = 'instructor.html';
      } else if (user.role === 'ADMIN') {
        window.location.href = 'admin.html';
      } else {
        alert('지원하지 않는 역할입니다.');
      }
    } catch (err) {
      console.error(err);
      alert('로그인 중 오류가 발생했습니다.');
    }
  });
}

// 로그아웃 버튼
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (err) {
      console.error('로그아웃 요청 실패:', err);
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'index.html';
  });
}


