const pool = require('../config/db');

// 알림 목록 조회
const getNotifications = async (req, res) => {
  const userId = req.user.id;
  const { is_read } = req.query;
  
  try {
    let query = `
      SELECT n.*, c.title as course_title
      FROM Notifications n
      LEFT JOIN Courses c ON n.course_id = c.id
      WHERE n.user_id = ?
    `;
    const params = [userId];
    
    if (is_read !== undefined) {
      query += ' AND n.is_read = ?';
      params.push(is_read === 'true' ? 1 : 0);
    }
    
    query += ' ORDER BY n.created_at DESC LIMIT 100';
    
    const [notifications] = await pool.query(query, params);
    res.json(notifications);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '알림 조회 중 오류가 발생했습니다.' });
  }
};

// 읽지 않은 알림 개수 조회
const getUnreadCount = async (req, res) => {
  const userId = req.user.id;
  try {
    const [result] = await pool.query(
      'SELECT COUNT(*) as count FROM Notifications WHERE user_id = ? AND is_read = FALSE',
      [userId]
    );
    res.json({ count: result[0].count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '알림 개수 조회 중 오류가 발생했습니다.' });
  }
};

// 알림 읽음 처리
const markAsRead = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  
  try {
    await pool.query(
      'UPDATE Notifications SET is_read = TRUE WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    res.json({ message: '알림이 읽음 처리되었습니다.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '알림 읽음 처리 중 오류가 발생했습니다.' });
  }
};

// 모든 알림 읽음 처리
const markAllAsRead = async (req, res) => {
  const userId = req.user.id;
  try {
    await pool.query(
      'UPDATE Notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE',
      [userId]
    );
    res.json({ message: '모든 알림이 읽음 처리되었습니다.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '알림 읽음 처리 중 오류가 발생했습니다.' });
  }
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead
};

