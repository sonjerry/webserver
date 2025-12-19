const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');
const adminController = require('../controllers/adminController');

// 모든 관리자 라우트는 ADMIN 권한 필요
router.use(authenticateToken);
router.use(authorizeRoles('ADMIN'));

// 학과 관리
router.get('/departments', adminController.getDepartments);
router.post('/departments', adminController.createDepartment);
router.put('/departments/:id', adminController.updateDepartment);
router.delete('/departments/:id', adminController.deleteDepartment);

// 학기 관리
router.get('/semesters', adminController.getSemesters);
router.post('/semesters', adminController.createSemester);
router.put('/semesters/:id', adminController.updateSemester);
router.delete('/semesters/:id', adminController.deleteSemester);

// 과목 관리
router.post('/courses', adminController.createCourse);
router.put('/courses/:id', adminController.updateCourse);
router.delete('/courses/:id', adminController.deleteCourse);

// 사용자 관리
router.get('/users', adminController.getUsers);
router.post('/users', adminController.createUser);
router.put('/users/:id', adminController.updateUser);
router.delete('/users/:id', adminController.deleteUser);

// 감사 로그
router.get('/audit-logs', adminController.getAuditLogs);

// 시스템 리포트
router.get('/reports/system', adminController.getSystemReport);

module.exports = router;

