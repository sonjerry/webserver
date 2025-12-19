const pool = require('../config/db');

/**
 * 감사 로그 기록 함수
 * @param {number} userId - 작업을 수행한 사용자 ID
 * @param {string} actionType - 작업 유형 (예: 'DEPARTMENT_CREATED', 'ATTENDANCE_UPDATED')
 * @param {string} targetType - 대상 타입 (예: 'Department', 'Attendance')
 * @param {number} targetId - 대상 ID
 * @param {string} description - 상세 설명
 * @param {string} ipAddress - IP 주소 (선택)
 */
async function logAuditEvent(userId, actionType, targetType, targetId, description, ipAddress = null) {
  try {
    await pool.query(
      'INSERT INTO AuditLogs (user_id, action_type, target_type, target_id, description, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, actionType, targetType, targetId, description, ipAddress]
    );
  } catch (err) {
    console.error('감사 로그 기록 중 오류:', err);
  }
}

module.exports = {
  logAuditEvent
};

