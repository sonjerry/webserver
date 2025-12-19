const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const path = require('path');

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
app.use(express.static(path.join(__dirname, '../client')));

// 404 핸들링 (모든 라우트와 정적 파일 서빙 이후)
app.use((req, res) => {
  // API 요청인 경우 JSON 응답
  if (req.path.startsWith('/api') || req.headers.accept?.includes('application/json')) {
    res.status(404).json({ message: 'API 엔드포인트를 찾을 수 없습니다.' });
  } else {
    // 클라이언트 요청인 경우 index.html 반환 (SPA 라우팅 지원)
    res.sendFile(path.join(__dirname, '../client/index.html'));
  }
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  // 서버 시작 로그
  console.log(`Server running on port ${PORT}`);
});


