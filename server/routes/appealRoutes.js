const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');
const appealController = require('../controllers/appealController');
const { notifyUser } = require('../utils/notificationHelper');
const { logAuditEvent } = require('../utils/auditHelper');

// IP 주소 추출 헬퍼
function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0] || 
         req.headers['x-real-ip'] || 
         req.connection.remoteAddress || 
         null;
}

// 학생: 이의제기 생성
router.post('/', authenticateToken, authorizeRoles('STUDENT'), appealController.createAppeal);

// 학생: 내 이의제기 목록
router.get('/my', authenticateToken, authorizeRoles('STUDENT'), appealController.getMyAppeals);

// 교원: 이의제기 목록 조회
router.get('/', authenticateToken, authorizeRoles('INSTRUCTOR'), appealController.getAppeals);

// 교원: 이의제기 거부
router.patch('/:id', authenticateToken, authorizeRoles('INSTRUCTOR'), async (req, res) => {
  const instructorId = req.user.id;
  const { id } = req.params;
  const { status, instructor_comment } = req.body;
  
  if (!status || !['REJECTED'].includes(status)) {
    return res.status(400).json({ message: '유효하지 않은 상태입니다.' });
  }
  
  try {
    const pool = require('../config/db');
    const [appeal] = await pool.query(
      `SELECT a.* FROM Appeals a
       JOIN Courses c ON a.course_id = c.id
       WHERE a.id = ? AND c.instructor_id = ?`,
      [id, instructorId]
    );
    
    if (!appeal[0]) {
      return res.status(403).json({ message: '해당 이의제기의 담당교원이 아닙니다.' });
    }
    
    await pool.query(
      'UPDATE Appeals SET status = ?, instructor_comment = ? WHERE id = ?',
      [status, instructor_comment || null, id]
    );
    
    // 감사 로그 기록
    const [studentInfo] = await pool.query('SELECT email, name FROM Users WHERE id = ?', [appeal[0].student_id]);
    const studentName = studentInfo[0]?.name || studentInfo[0]?.email || '알 수 없음';
    await logAuditEvent(
      instructorId,
      'APPEAL_REJECTED',
      'Appeal',
      parseInt(id),
      `이의제기 거부: 학생 ${studentName} (이의제기 ID: ${id})${instructor_comment ? ` - 코멘트: ${instructor_comment}` : ''}`,
      getClientIp(req)
    );

    // 학생에게 이의제기 거부 알림
    const studentId = appeal[0].student_id;
    await notifyUser(
      studentId,
      'APPEAL_REJECTED',
      '출결 이의제기가 거부되었습니다.',
      `이의제기(ID: ${id})가 거부되었습니다.${instructor_comment ? `\n사유: ${instructor_comment}` : ''}`,
      appeal[0].course_id
    );
    
    res.json({ message: '이의제기가 거부되었습니다.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '이의제기 거부 중 오류가 발생했습니다.' });
  }
});

module.exports = router;

