const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middlewares/authMiddleware');
const notificationController = require('../controllers/notificationController');

// 모든 라우트는 인증 필요
router.use(authenticateToken);

// 알림 목록 조회
router.get('/', notificationController.getNotifications);

// 읽지 않은 알림 개수
router.get('/unread-count', notificationController.getUnreadCount);

// 알림 읽음 처리
router.patch('/:id/read', notificationController.markAsRead);

// 모든 알림 읽음 처리
router.patch('/read-all', notificationController.markAllAsRead);

module.exports = router;

