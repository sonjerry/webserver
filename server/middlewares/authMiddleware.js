const { verifyToken } = require('../config/jwt');

// JWT 토큰 검증 미들웨어
// Authorization 헤더의 Bearer 토큰만 사용 (localStorage 기반, 시크릿 모드에서 탭 간 간섭 방지)
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: '인증 토큰이 필요합니다.' });
  }

  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ message: '유효하지 않은 토큰입니다.' });
  }
}

// 역할 기반 권한 체크 미들웨어
function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: '권한이 없습니다.' });
    }
    next();
  };
}

module.exports = {
  authenticateToken,
  authorizeRoles,
};


