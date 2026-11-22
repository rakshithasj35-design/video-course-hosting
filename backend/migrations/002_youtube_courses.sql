USE video_course_hosting;

INSERT IGNORE INTO categories (name) VALUES ('Web Development'), ('Programming');

SET @add_display_instructor = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='courses' AND COLUMN_NAME='display_instructor')=0,
  'ALTER TABLE courses ADD COLUMN display_instructor VARCHAR(180) NULL AFTER price',
  'SELECT 1'
);
PREPARE display_instructor_statement FROM @add_display_instructor;
EXECUTE display_instructor_statement;
DEALLOCATE PREPARE display_instructor_statement;

SET @add_course_level = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='courses' AND COLUMN_NAME='course_level')=0,
  'ALTER TABLE courses ADD COLUMN course_level VARCHAR(32) NOT NULL DEFAULT ''All levels'' AFTER display_instructor',
  'SELECT 1'
);
PREPARE course_level_statement FROM @add_course_level;
EXECUTE course_level_statement;
DEALLOCATE PREPARE course_level_statement;

SET @add_youtube_video_id = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='courses' AND COLUMN_NAME='youtube_video_id')=0,
  'ALTER TABLE courses ADD COLUMN youtube_video_id VARCHAR(32) NULL AFTER course_level',
  'SELECT 1'
);
PREPARE youtube_video_id_statement FROM @add_youtube_video_id;
EXECUTE youtube_video_id_statement;
DEALLOCATE PREPARE youtube_video_id_statement;

SET @add_youtube_video_index = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='courses'
   AND INDEX_NAME='unique_youtube_video')=0,
  'CREATE UNIQUE INDEX unique_youtube_video ON courses (youtube_video_id)',
  'SELECT 1'
);
PREPARE youtube_video_index_statement FROM @add_youtube_video_index;
EXECUTE youtube_video_index_statement;
DEALLOCATE PREPARE youtube_video_index_statement;

INSERT INTO courses
  (tutor_id,title,description,thumbnail_url,category,category_id,price,status,display_instructor,course_level,youtube_video_id)
SELECT admin.id,
       'HTML & CSS – Full Course for Beginners',
       'A beginner-level HTML and CSS course from freeCodeCamp.org. Watch the original YouTube video and track completion in CourseHub.',
       'https://img.youtube.com/vi/a_iQb1lnAEQ/hqdefault.jpg',
       category.name,category.id,0.00,'approved','freeCodeCamp.org','Beginner','a_iQb1lnAEQ'
FROM users admin
JOIN categories category ON category.name='Web Development'
WHERE admin.role='admin'
  AND NOT EXISTS (SELECT 1 FROM courses WHERE youtube_video_id='a_iQb1lnAEQ')
ORDER BY admin.id
LIMIT 1;

INSERT INTO courses
  (tutor_id,title,description,thumbnail_url,category,category_id,price,status,display_instructor,course_level,youtube_video_id)
SELECT admin.id,
       'Python for Beginners – Full Course',
       'A beginner-level Python course from freeCodeCamp.org. Watch the original YouTube video and track completion in CourseHub.',
       'https://img.youtube.com/vi/eWRfhZUzrAc/hqdefault.jpg',
       category.name,category.id,0.00,'approved','freeCodeCamp.org','Beginner','eWRfhZUzrAc'
FROM users admin
JOIN categories category ON category.name='Programming'
WHERE admin.role='admin'
  AND NOT EXISTS (SELECT 1 FROM courses WHERE youtube_video_id='eWRfhZUzrAc')
ORDER BY admin.id
LIMIT 1;

INSERT INTO courses
  (tutor_id,title,description,thumbnail_url,category,category_id,price,status,display_instructor,course_level,youtube_video_id)
SELECT admin.id,
       'Learn React JS – Full Beginner''s Tutorial & Practice Projects',
       'A beginner-level React course from freeCodeCamp.org. Watch the original YouTube video and track completion in CourseHub.',
       'https://img.youtube.com/vi/x4rFhThSX04/hqdefault.jpg',
       category.name,category.id,0.00,'approved','freeCodeCamp.org','Beginner','x4rFhThSX04'
FROM users admin
JOIN categories category ON category.name='Web Development'
WHERE admin.role='admin'
  AND NOT EXISTS (SELECT 1 FROM courses WHERE youtube_video_id='x4rFhThSX04')
ORDER BY admin.id
LIMIT 1;

INSERT INTO course_modules (course_id,title,sort_order)
SELECT course.id,'Full course video',1
FROM courses course
WHERE course.youtube_video_id IN ('a_iQb1lnAEQ','eWRfhZUzrAc','x4rFhThSX04')
  AND NOT EXISTS (
    SELECT 1 FROM course_modules module
    WHERE module.course_id=course.id AND module.title='Full course video'
  );

INSERT INTO lessons (module_id,title,sort_order)
SELECT module.id,'Watch the complete course',1
FROM course_modules module
JOIN courses course ON course.id=module.course_id
WHERE course.youtube_video_id IN ('a_iQb1lnAEQ','eWRfhZUzrAc','x4rFhThSX04')
  AND NOT EXISTS (
    SELECT 1 FROM lessons lesson
    WHERE lesson.module_id=module.id AND lesson.title='Watch the complete course'
  );
