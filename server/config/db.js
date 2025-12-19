const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'attendance_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

console.log('=== Database Config ===');
console.log('DB_HOST:', dbConfig.host);
console.log('DB_USER:', dbConfig.user);
console.log('DB_NAME:', dbConfig.database);
console.log('DB_PASSWORD:', dbConfig.password ? '***' : '(empty)');

const pool = mysql.createPool(dbConfig);

// 연결 테스트
pool.getConnection()
  .then(connection => {
    console.log('✅ Database connection successful');
    connection.release();
  })
  .catch(err => {
    console.error('❌ Database connection failed:', err.message);
    console.error('Full error:', err);
  });

module.exports = pool;


