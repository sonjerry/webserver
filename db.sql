USE railway;

CREATE TABLE Users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(100) NOT NULL UNIQUE,
  role ENUM('ADMIN', 'INSTRUCTOR', 'STUDENT') NOT NULL,
  name VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Departments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(20) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Semesters (
  id INT PRIMARY KEY AUTO_INCREMENT,
  year INT NOT NULL,
  semester ENUM('1', '2', 'SUMMER', 'WINTER') NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_semester (year, semester)
);

CREATE TABLE Courses (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(100) NOT NULL,
  instructor_id INT NOT NULL,
  department_id INT,
  semester_id INT,
  section VARCHAR(10),
  day_of_week TINYINT NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (instructor_id) REFERENCES Users(id),
  FOREIGN KEY (department_id) REFERENCES Departments(id),
  FOREIGN KEY (semester_id) REFERENCES Semesters(id)
);

CREATE TABLE CourseSchedules (
  id INT PRIMARY KEY AUTO_INCREMENT,
  course_id INT NOT NULL,
  day_of_week TINYINT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (course_id) REFERENCES Courses(id) ON DELETE CASCADE,
  INDEX idx_course_id (course_id)
);

CREATE TABLE ClassSessions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  course_id INT NOT NULL,
  week_number INT,
  session_date DATE,
  start_time TIME,
  end_time TIME,
  attendance_method ENUM('ELECTRONIC', 'AUTH_CODE', 'ROLL_CALL') DEFAULT 'AUTH_CODE',
  auth_code VARCHAR(10),
  is_open BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (course_id) REFERENCES Courses(id)
);

CREATE TABLE Attendances (
  session_id INT NOT NULL,
  student_id INT NOT NULL,
  status TINYINT NOT NULL DEFAULT 0,
  checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id, student_id),
  FOREIGN KEY (session_id) REFERENCES ClassSessions(id),
  FOREIGN KEY (student_id) REFERENCES Users(id)
);

CREATE TABLE ExcuseRequests (
  id INT PRIMARY KEY AUTO_INCREMENT,
  session_id INT NOT NULL,
  student_id INT NOT NULL,
  reason_code VARCHAR(50),
  reason TEXT,
  file_path VARCHAR(255),
  status ENUM('PENDING', 'APPROVED', 'REJECTED') DEFAULT 'PENDING',
  instructor_comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES ClassSessions(id),
  FOREIGN KEY (student_id) REFERENCES Users(id)
);

CREATE TABLE Enrollment (
  user_id INT NOT NULL,
  course_id INT NOT NULL,
  role ENUM('STUDENT', 'INSTRUCTOR') NOT NULL,
  enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, course_id),
  FOREIGN KEY (user_id) REFERENCES Users(id),
  FOREIGN KEY (course_id) REFERENCES Courses(id)
);

CREATE TABLE Notifications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  course_id INT,
  user_id INT,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(200),
  content TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (course_id) REFERENCES Courses(id),
  FOREIGN KEY (user_id) REFERENCES Users(id),
  INDEX idx_user_read (user_id, is_read)
);

CREATE TABLE Messages (
  id INT PRIMARY KEY AUTO_INCREMENT,
  sender_id INT NOT NULL,
  receiver_id INT NOT NULL,
  course_id INT,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sender_id) REFERENCES Users(id),
  FOREIGN KEY (receiver_id) REFERENCES Users(id),
  FOREIGN KEY (course_id) REFERENCES Courses(id),
  INDEX idx_receiver (receiver_id)
);

CREATE TABLE Appeals (
  id INT PRIMARY KEY AUTO_INCREMENT,
  attendance_session_id INT NOT NULL,
  attendance_student_id INT NOT NULL,
  student_id INT NOT NULL,
  course_id INT NOT NULL,
  message TEXT NOT NULL,
  status ENUM('PENDING', 'REVIEWED', 'RESOLVED', 'REJECTED') DEFAULT 'PENDING',
  instructor_comment TEXT,
  resolved_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (attendance_session_id) REFERENCES ClassSessions(id),
  FOREIGN KEY (attendance_student_id) REFERENCES Users(id),
  FOREIGN KEY (student_id) REFERENCES Users(id),
  FOREIGN KEY (course_id) REFERENCES Courses(id),
  INDEX idx_status (status),
  INDEX idx_student (student_id)
);

CREATE TABLE Votes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  course_id INT NOT NULL,
  instructor_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  vote_date DATE,
  is_closed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (course_id) REFERENCES Courses(id),
  FOREIGN KEY (instructor_id) REFERENCES Users(id)
);

CREATE TABLE VoteResponses (
  vote_id INT NOT NULL,
  student_id INT NOT NULL,
  response ENUM('YES', 'NO') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (vote_id, student_id),
  FOREIGN KEY (vote_id) REFERENCES Votes(id),
  FOREIGN KEY (student_id) REFERENCES Users(id)
);

CREATE TABLE AuditLogs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT,
  action_type VARCHAR(50) NOT NULL,
  target_type VARCHAR(50),
  target_id INT,
  description TEXT,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES Users(id),
  INDEX idx_action_type (action_type),
  INDEX idx_created_at (created_at)
);

CREATE TABLE Holidays (
  id INT PRIMARY KEY AUTO_INCREMENT,
  date DATE NOT NULL UNIQUE,
  name VARCHAR(100),
  is_holiday BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_date (date)
);

CREATE TABLE MakeupDays (
  id INT PRIMARY KEY AUTO_INCREMENT,
  course_id INT NOT NULL,
  week_number INT,
  original_date DATE,
  makeup_date DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (course_id) REFERENCES Courses(id),
  INDEX idx_course_date (course_id, makeup_date)
);

CREATE TABLE CoursePolicies (
  id INT PRIMARY KEY AUTO_INCREMENT,
  course_id INT NOT NULL UNIQUE,
  attendance_weight TINYINT DEFAULT 20,
  lateness_penalty TINYINT DEFAULT 50,
  absence_penalty TINYINT DEFAULT 100,
  description TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (course_id) REFERENCES Courses(id)
);

-- 초기 데이터 삽입
-- Admin 사용자 (로그인용)
INSERT INTO Users (email, name, role) VALUES 
('admin@example.com', '관리자', 'ADMIN')
ON DUPLICATE KEY UPDATE email = email;

-- 테스트용 Instructor 사용자
INSERT INTO Users (email, name, role) VALUES 
('instructor@example.com', '교수님', 'INSTRUCTOR')
ON DUPLICATE KEY UPDATE email = email;

-- 테스트용 Student 사용자
INSERT INTO Users (email, name, role) VALUES 
('student@example.com', '학생', 'STUDENT')
ON DUPLICATE KEY UPDATE email = email;

-- Users 테이블에 department_id 컬럼 추가
ALTER TABLE Users ADD COLUMN department_id INT NULL AFTER name;
ALTER TABLE Users ADD FOREIGN KEY (department_id) REFERENCES Departments(id);


