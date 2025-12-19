const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');
const instructorController = require('../controllers/instructorController');

// 모든 라우트는 INSTRUCTOR 권한 필요
router.use(authenticateToken);
router.use(authorizeRoles('INSTRUCTOR'));

// 담당 강의 목록
router.get('/courses', instructorController.getMyCourses);

// 수업 알림 작성
router.post('/announcements', instructorController.createAnnouncement);

// 채팅방 목록
router.get('/chat-rooms', instructorController.getChatRooms);
// 특정 학생과의 대화
router.get('/chat-rooms/:studentId', instructorController.getChatMessages);
// 메시지 작성
router.post('/messages', instructorController.sendMessage);

// 공강 투표 생성
router.post('/votes', instructorController.createVote);

// 일정 일괄 생성
router.post('/sessions/batch', instructorController.createSessionsBatch);

// 공휴일 관리
router.get('/holidays', instructorController.getHolidays);
router.post('/holidays', instructorController.createHoliday);

// 보강일 관리
router.get('/makeup-days', instructorController.getMakeupDays);
router.post('/makeup-days', instructorController.createMakeupDay);
router.delete('/makeup-days/:id', instructorController.deleteMakeupDay);

// 공결 사유 템플릿
router.get('/excuse-templates', instructorController.getExcuseReasonTemplates);

module.exports = router;

