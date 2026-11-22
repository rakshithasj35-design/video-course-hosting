CREATE DATABASE IF NOT EXISTS video_course_hosting
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE video_course_hosting;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('student', 'tutor', 'admin') NOT NULL DEFAULT 'student',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT IGNORE INTO categories (name) VALUES
  ('Development'), ('Design'), ('Business'), ('Marketing'), ('Photography'), ('Personal Growth'),
  ('Web Development'), ('Programming'), ('Commerce'), ('Accounting'), ('Finance'), ('E-commerce'),
  ('Entrepreneurship'), ('Investing'), ('Economics'), ('Databases'), ('Communication'), ('English'),
  ('Time Management'), ('Leadership'), ('Productivity'), ('Critical Thinking');

CREATE TABLE IF NOT EXISTS domains (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL UNIQUE,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT IGNORE INTO domains (name,sort_order) VALUES
  ('Technology',1), ('Commerce',2), ('Design',3), ('Marketing',4), ('General',5);

CREATE TABLE IF NOT EXISTS courses (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tutor_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT,
  thumbnail_url VARCHAR(500),
  category VARCHAR(80) NOT NULL DEFAULT 'Development',
  category_id BIGINT UNSIGNED NOT NULL,
  domain_id BIGINT UNSIGNED NOT NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  display_instructor VARCHAR(180),
  course_level VARCHAR(32) NOT NULL DEFAULT 'All levels',
  youtube_video_id VARCHAR(32),
  status ENUM('draft', 'pending', 'approved', 'rejected') NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_youtube_video (youtube_video_id),
  KEY idx_courses_domain (domain_id),
  FOREIGN KEY (tutor_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id),
  FOREIGN KEY (domain_id) REFERENCES domains(id)
);

CREATE TABLE IF NOT EXISTS course_modules (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  course_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lessons (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  module_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  video_url VARCHAR(500),
  duration_seconds INT UNSIGNED,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  FOREIGN KEY (module_id) REFERENCES course_modules(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS enrollments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  student_id BIGINT UNSIGNED NOT NULL,
  course_id BIGINT UNSIGNED NOT NULL,
  enrolled_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_enrollment (student_id, course_id),
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lesson_progress (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  enrollment_id BIGINT UNSIGNED NOT NULL,
  lesson_id BIGINT UNSIGNED NOT NULL,
  last_position_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMP NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_lesson_progress (enrollment_id, lesson_id),
  FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE CASCADE,
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS certificates (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  enrollment_id BIGINT UNSIGNED NOT NULL UNIQUE,
  certificate_code VARCHAR(64) NOT NULL UNIQUE,
  pdf_url VARCHAR(500),
  issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reviews (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  course_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  rating TINYINT UNSIGNED NOT NULL,
  comment TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_review (course_id, student_id),
  CONSTRAINT rating_range CHECK (rating BETWEEN 1 AND 5),
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL,
  subject VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
