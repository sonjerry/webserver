const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');
const studentController = require('../controllers/studentController');
const uploadMiddleware = require('../middlewares/uploadMiddleware');

// 모든 라우트는 STUDENT 권한 필요
router.use(authenticateToken);
router.use(authorizeRoles('STUDENT'));

// 수강 강의 목록
router.get('/courses', studentController.getMyCourses);

// 출석 현황 확인
router.get('/attendance', studentController.getMyAttendance);

// 공결 신청
router.post('/sessions/:sessionId/excuses', uploadMiddleware, studentController.createExcuseRequest);

// 내 공결 신청 목록
router.get('/excuses', studentController.getMyExcuseRequests);

// 공강 투표 목록 및 응답
router.get('/votes', studentController.getOpenVotesForStudent);
router.post('/votes/:voteId/respond', studentController.respondToVote);

// 채팅방 목록
router.get('/chat-rooms', studentController.getChatRooms);
// 특정 교원과의 대화
router.get('/chat-rooms/:instructorId', studentController.getChatMessages);
// 메시지 작성
router.post('/messages', studentController.sendMessage);
// 받은 메시지 조회 (하위 호환성)
router.get('/messages', studentController.getMyMessages);

module.exports = router;

