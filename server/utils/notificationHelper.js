const pool = require('../config/db');

// 특정 강의 수강생 전체에게 알림 생성
async function notifyCourseStudents(courseId, type, title, content) {
  const [students] = await pool.query(
    'SELECT user_id FROM Enrollment WHERE course_id = ? AND role = "STUDENT"',
    [courseId]
  );

  if (students.length === 0) return 0;

  const connection = await pool.getConnection();
  await connection.beginTransaction();

  try {
    for (const s of students) {
      await connection.query(
        'INSERT INTO Notifications (course_id, user_id, type, title, content) VALUES (?, ?, ?, ?, ?)',
        [courseId, s.user_id, type, title, content]
      );
    }
    await connection.commit();
    return students.length;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

// 특정 사용자 한 명에게 알림 생성
async function notifyUser(userId, type, title, content, courseId = null) {
  await pool.query(
    'INSERT INTO Notifications (course_id, user_id, type, title, content) VALUES (?, ?, ?, ?, ?)',
    [courseId, userId, type, title, content]
  );
}

module.exports = {
  notifyCourseStudents,
  notifyUser,
};


