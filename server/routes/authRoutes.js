const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { signToken } = require('../config/jwt');

// POST /auth/login
router.post('/login', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: '이메일이 필요합니다.' });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM Users WHERE email = ?', [email]);
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ message: '존재하지 않는 사용자입니다.' });
    }

    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    const token = signToken(payload);

    // localStorage만 사용 (시크릿 모드에서 탭 간 간섭 방지)
    // HttpOnly 쿠키는 제거하고 클라이언트에서만 관리
    res.json({ token, user: payload });
  } catch (err) {
    console.error('Login error:', err);
    console.error('Error details:', {
      message: err.message,
      code: err.code,
      errno: err.errno,
      sqlState: err.sqlState
    });
    res.status(500).json({ 
      message: '로그인 처리 중 오류가 발생했습니다.',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

const { authenticateToken } = require('../middlewares/authMiddleware');

// POST /auth/refresh
// 기존 액세스 토큰이 유효한 경우 만료 시간을 연장한 새 토큰을 발급한다.
router.post('/refresh', authenticateToken, async (req, res) => {
  try {
    const payload = {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
    };

    const token = signToken(payload);

    // localStorage만 사용 (시크릿 모드에서 탭 간 간섭 방지)
    res.json({ token, user: payload });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '토큰 갱신 중 오류가 발생했습니다.' });
  }
});

// GET /auth/me (현재 로그인 상태 확인)
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.email, u.name, u.role, u.department_id, d.name as department_name 
       FROM Users u 
       LEFT JOIN Departments d ON u.department_id = d.id 
       WHERE u.id = ?`, 
      [req.user.id]
    );
    if (!rows[0]) {
      return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
    }
    res.json({ user: rows[0] });
  } catch (err) {
    console.error('DB 쿼리 오류 (/auth/me):', err);
    console.error('에러 상세:', {
      message: err.message,
      code: err.code,
      errno: err.errno,
      sqlState: err.sqlState
    });
    
    // DB 연결 관련 에러인지 확인
    const isDbConnectionError = err.code === 'ECONNREFUSED' || 
                                 err.code === 'ETIMEDOUT' ||
                                 err.code === 'PROTOCOL_CONNECTION_LOST' ||
                                 err.code === 'ER_ACCESS_DENIED_ERROR' ||
                                 err.errno === 1045 || // Access denied
                                 err.errno === 2002 || // Can't connect to server
                                 err.errno === 2003;   // Connection refused
    
    const errorMessage = isDbConnectionError 
      ? '데이터베이스 연결에 실패했습니다. 서버 관리자에게 문의하세요.'
      : '사용자 정보 조회 중 오류가 발생했습니다.';
    
    res.status(500).json({ 
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// POST /auth/logout
router.post('/logout', (req, res) => {
  // localStorage만 사용하므로 서버에서 쿠키 삭제 불필요
  res.json({ message: '로그아웃 되었습니다.' });
});

module.exports = router;


