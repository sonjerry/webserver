const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config();

const authRoutes = require('./routes/authRoutes');
const courseRoutes = require('./routes/courseRoutes');
const sessionRoutes = require('./routes/sessionRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const excuseRoutes = require('./routes/excuseRoutes');
const reportRoutes = require('./routes/reportRoutes');
const adminRoutes = require('./routes/adminRoutes');
const instructorRoutes = require('./routes/instructorRoutes');
const studentRoutes = require('./routes/studentRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const appealRoutes = require('./routes/appealRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const fileRoutes = require('./routes/fileRoutes');
const auditRoutes = require('./routes/auditRoutes');

const app = express();

// 미들웨어 설정
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan('dev'));

// 정적 파일 서빙 (업로드된 파일)
app.use('/uploads', express.static('uploads'));

// 기본 헬스체크
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// DB 연결 상태 확인
app.get('/health/db', async (req, res) => {
  const pool = require('./config/db');
  try {
    const [rows] = await pool.query('SELECT 1 as test');
    res.json({ 
      status: 'ok', 
      database: 'connected',
      test: rows[0] 
    });
  } catch (err) {
    console.error('DB 헬스체크 실패:', err);
    res.status(500).json({ 
      status: 'error', 
      database: 'disconnected',
      message: err.message,
      code: err.code,
      errno: err.errno
    });
  }
});

// API 라우트 (정적 파일 서빙보다 먼저 배치)
app.use('/auth', authRoutes);
app.use('/courses', courseRoutes);
app.use('/sessions', sessionRoutes);
app.use('/attendance', attendanceRoutes);
app.use('/excuses', excuseRoutes);
app.use('/reports', reportRoutes);
app.use('/admin', adminRoutes);
app.use('/instructor', instructorRoutes);
app.use('/student', studentRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/appeals', appealRoutes);
app.use('/notifications', notificationRoutes);
app.use('/files', fileRoutes);
app.use('/audits', auditRoutes);

// 클라이언트 정적 파일 서빙 (API 라우트 이후에 배치)
// client 폴더가 server 폴더 안으로 이동했으므로 __dirname 기준으로 접근
const clientPath = path.join(__dirname, 'client');
console.log('=== Client Path Debug ===');
console.log('__dirname:', __dirname);
console.log('clientPath:', clientPath);
console.log('clientPath exists:', fs.existsSync(clientPath));

if (fs.existsSync(clientPath)) {
  console.log('✅ Using client path:', clientPath);
  app.use(express.static(clientPath, {
    index: 'index.html',
    extensions: ['html']
  }));
} else {
  console.error('❌ Client directory not found at:', clientPath);
}

// 404 핸들링 (모든 라우트와 정적 파일 서빙 이후)
app.use((req, res) => {
  console.log('404 - Request path:', req.path);
  console.log('404 - Accept header:', req.headers.accept);
  
  // API 요청인 경우 JSON 응답
  if (req.path.startsWith('/api') || req.headers.accept?.includes('application/json')) {
    res.status(404).json({ message: 'API 엔드포인트를 찾을 수 없습니다.' });
  } else {
    // 클라이언트 요청인 경우 index.html 반환 (SPA 라우팅 지원)
    const indexPath = path.join(__dirname, 'client', 'index.html');
    
    if (fs.existsSync(indexPath)) {
      console.log('✅ Sending index.html from:', indexPath);
      res.sendFile(indexPath);
    } else {
      console.error('❌ index.html을 찾을 수 없습니다:', indexPath);
      res.status(404).json({ 
        message: '페이지를 찾을 수 없습니다.',
        debug: {
          __dirname: __dirname,
          indexPath: indexPath
        }
      });
    }
  }
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  // 서버 시작 로그
  console.log(`Server running on port ${PORT}`);
});


