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
// Railway 환경에 따라 경로가 다를 수 있으므로 여러 경로 시도
console.log('=== Client Path Debug ===');
console.log('__dirname:', __dirname);
console.log('process.cwd():', process.cwd());

// 가능한 경로들 시도
const possiblePaths = [
  path.resolve(__dirname, '../client'),  // __dirname이 /app/server인 경우
  path.resolve(__dirname, './client'),   // __dirname이 /app인 경우
  path.resolve(process.cwd(), 'client'),  // 작업 디렉토리 기준
  path.resolve(process.cwd(), '../client') // 작업 디렉토리가 server인 경우
];

let clientPath = null;
for (const testPath of possiblePaths) {
  console.log(`Testing path: ${testPath}, exists: ${fs.existsSync(testPath)}`);
  if (fs.existsSync(testPath)) {
    clientPath = testPath;
    console.log('✅ Found client path:', clientPath);
    break;
  }
}

if (clientPath) {
  app.use(express.static(clientPath, {
    index: 'index.html',
    extensions: ['html']
  }));
} else {
  console.error('❌ Client directory not found in any of these paths:', possiblePaths);
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
    const possibleIndexPaths = [
      path.resolve(__dirname, '../client/index.html'),
      path.resolve(__dirname, './client/index.html'),
      path.resolve(process.cwd(), 'client/index.html'),
      path.resolve(process.cwd(), '../client/index.html')
    ];
    
    let indexPath = null;
    for (const testPath of possibleIndexPaths) {
      if (fs.existsSync(testPath)) {
        indexPath = testPath;
        break;
      }
    }
    
    if (indexPath) {
      console.log('✅ Sending index.html from:', indexPath);
      res.sendFile(indexPath);
    } else {
      console.error('❌ index.html을 찾을 수 없습니다.');
      console.error('Tried paths:', possibleIndexPaths);
      res.status(404).json({ 
        message: '페이지를 찾을 수 없습니다.',
        debug: {
          __dirname: __dirname,
          cwd: process.cwd(),
          triedPaths: possibleIndexPaths
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


