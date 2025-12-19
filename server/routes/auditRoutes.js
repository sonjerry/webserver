const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');

// GET /audits?target_type=Attendance&target_id=...
router.get('/', authenticateToken, authorizeRoles('ADMIN'), async (req, res) => {
  const { target_type, target_id, action_type, from, to } = req.query;

  try {
    let where = ' WHERE 1=1 ';
    const params = [];

    if (target_type) {
      where += ' AND target_type = ?';
      params.push(target_type);
    }
    if (target_id) {
      where += ' AND target_id = ?';
      params.push(target_id);
    }
    if (action_type) {
      where += ' AND action_type = ?';
      params.push(action_type);
    }
    if (from) {
      where += ' AND created_at >= ?';
      params.push(from);
    }
    if (to) {
      where += ' AND created_at <= ?';
      params.push(to);
    }

    const [rows] = await pool.query(
      `SELECT * FROM AuditLogs ${where} ORDER BY created_at DESC LIMIT 500`,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '감사 로그 조회 중 오류가 발생했습니다.' });
  }
});

module.exports = router;


