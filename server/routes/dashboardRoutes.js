const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');
const dashboardController = require('../controllers/dashboardController');

// 교원용 대시보드
router.get('/instructor', authenticateToken, authorizeRoles('INSTRUCTOR'), dashboardController.getInstructorDashboard);

// 수강생용 대시보드
router.get('/student', authenticateToken, authorizeRoles('STUDENT'), dashboardController.getStudentDashboard);

module.exports = router;



