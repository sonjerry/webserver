const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');

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

// API 라우트
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

// 404 핸들링
app.use((req, res) => {
  res.status(404).json({ message: 'API 엔드포인트를 찾을 수 없습니다.' });
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  // 서버 시작 로그
  console.log(`Server running on port ${PORT}`);
});


