USE video_course_hosting;

CREATE TABLE IF NOT EXISTS domains (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL UNIQUE,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT IGNORE INTO domains (name,sort_order) VALUES
  ('Technology',1), ('Commerce',2), ('Design',3), ('Marketing',4), ('General',5);

UPDATE domains SET sort_order=CASE name
  WHEN 'Technology' THEN 1
  WHEN 'Commerce' THEN 2
  WHEN 'Design' THEN 3
  WHEN 'Marketing' THEN 4
  ELSE 5
END
WHERE name IN ('Technology','Commerce','Design','Marketing','General');

INSERT IGNORE INTO categories (name) VALUES ('Commerce');

SET @add_domain_id = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='courses' AND COLUMN_NAME='domain_id')=0,
  'ALTER TABLE courses ADD COLUMN domain_id BIGINT UNSIGNED NULL AFTER category_id',
  'SELECT 1'
);
PREPARE domain_id_statement FROM @add_domain_id;
EXECUTE domain_id_statement;
DEALLOCATE PREPARE domain_id_statement;

UPDATE courses c
JOIN domains d ON d.name=CASE
  WHEN c.title='Modern Web Development' AND c.youtube_video_id IS NULL THEN 'General'
  WHEN c.youtube_video_id IN ('a_iQb1lnAEQ','eWRfhZUzrAc','x4rFhThSX04')
    OR c.category IN ('Development','Web Development','Programming') THEN 'Technology'
  WHEN c.youtube_video_id IN ('BBk3DXgodmI','gvhsKtjAmgc')
    OR c.category IN ('Business','Commerce') THEN 'Commerce'
  WHEN c.youtube_video_id IN ('mT_Jjn8RJdo','Llnmf5BXLBA')
    OR c.category='Design' THEN 'Design'
  WHEN c.youtube_video_id='of4L9c2Fdoo'
    OR c.category='Marketing' THEN 'Marketing'
  ELSE 'General'
END
SET c.domain_id=d.id
WHERE c.domain_id IS NULL;

SET @add_domain_index = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='courses'
   AND INDEX_NAME='idx_courses_domain')=0,
  'CREATE INDEX idx_courses_domain ON courses (domain_id)',
  'SELECT 1'
);
PREPARE domain_index_statement FROM @add_domain_index;
EXECUTE domain_index_statement;
DEALLOCATE PREPARE domain_index_statement;

SET @make_domain_required = IF(
  (SELECT IS_NULLABLE FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='courses' AND COLUMN_NAME='domain_id')='YES',
  'ALTER TABLE courses MODIFY COLUMN domain_id BIGINT UNSIGNED NOT NULL',
  'SELECT 1'
);
PREPARE domain_required_statement FROM @make_domain_required;
EXECUTE domain_required_statement;
DEALLOCATE PREPARE domain_required_statement;

SET @add_domain_fk = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='courses'
   AND CONSTRAINT_NAME='fk_courses_domain')=0,
  'ALTER TABLE courses ADD CONSTRAINT fk_courses_domain FOREIGN KEY (domain_id) REFERENCES domains(id)',
  'SELECT 1'
);
PREPARE domain_fk_statement FROM @add_domain_fk;
EXECUTE domain_fk_statement;
DEALLOCATE PREPARE domain_fk_statement;

INSERT INTO courses
  (tutor_id,title,description,thumbnail_url,category,category_id,domain_id,price,status,display_instructor,course_level,youtube_video_id)
SELECT admin.id,
       '33 Spreadsheet Projects – Excel and Google Sheets',
       'Build practical spreadsheet skills with projects in Excel and Google Sheets.',
       'https://img.youtube.com/vi/BBk3DXgodmI/hqdefault.jpg',
       category.name,category.id,domain.id,0.00,'approved','freeCodeCamp.org','Beginner','BBk3DXgodmI'
FROM users admin
JOIN domains domain ON domain.name='Commerce'
JOIN categories category ON category.name='Commerce'
WHERE admin.role='admin'
  AND NOT EXISTS (SELECT 1 FROM courses WHERE youtube_video_id='BBk3DXgodmI')
ORDER BY admin.id
LIMIT 1;

INSERT INTO courses
  (tutor_id,title,description,thumbnail_url,category,category_id,domain_id,price,status,display_instructor,course_level,youtube_video_id)
SELECT admin.id,
       'Excel Formulas and Functions – Full Course',
       'Learn core Excel formulas and functions through a beginner-friendly full course.',
       'https://img.youtube.com/vi/gvhsKtjAmgc/hqdefault.jpg',
       category.name,category.id,domain.id,0.00,'approved','freeCodeCamp.org','Beginner','gvhsKtjAmgc'
FROM users admin
JOIN domains domain ON domain.name='Commerce'
JOIN categories category ON category.name='Commerce'
WHERE admin.role='admin'
  AND NOT EXISTS (SELECT 1 FROM courses WHERE youtube_video_id='gvhsKtjAmgc')
ORDER BY admin.id
LIMIT 1;

INSERT INTO courses
  (tutor_id,title,description,thumbnail_url,category,category_id,domain_id,price,status,display_instructor,course_level,youtube_video_id)
SELECT admin.id,
       'Learn Figma – Complete UI/UX Design Course',
       'Explore UI and UX design workflows using Figma in this beginner course.',
       'https://img.youtube.com/vi/mT_Jjn8RJdo/hqdefault.jpg',
       category.name,category.id,domain.id,0.00,'approved','freeCodeCamp.org','Beginner','mT_Jjn8RJdo'
FROM users admin
JOIN domains domain ON domain.name='Design'
JOIN categories category ON category.name='Design'
WHERE admin.role='admin'
  AND NOT EXISTS (SELECT 1 FROM courses WHERE youtube_video_id='mT_Jjn8RJdo')
ORDER BY admin.id
LIMIT 1;

INSERT INTO courses
  (tutor_id,title,description,thumbnail_url,category,category_id,domain_id,price,status,display_instructor,course_level,youtube_video_id)
SELECT admin.id,
       'Canva Design Essentials – Complete Course',
       'Create polished visual designs with the essential Canva tools and workflows.',
       'https://img.youtube.com/vi/Llnmf5BXLBA/hqdefault.jpg',
       category.name,category.id,domain.id,0.00,'approved','Bring Your Own Laptop','Beginner','Llnmf5BXLBA'
FROM users admin
JOIN domains domain ON domain.name='Design'
JOIN categories category ON category.name='Design'
WHERE admin.role='admin'
  AND NOT EXISTS (SELECT 1 FROM courses WHERE youtube_video_id='Llnmf5BXLBA')
ORDER BY admin.id
LIMIT 1;

INSERT INTO courses
  (tutor_id,title,description,thumbnail_url,category,category_id,domain_id,price,status,display_instructor,course_level,youtube_video_id)
SELECT admin.id,
       'Digital Marketing Full Course for Beginners',
       'Understand foundational digital marketing channels and strategies.',
       'https://img.youtube.com/vi/of4L9c2Fdoo/hqdefault.jpg',
       category.name,category.id,domain.id,0.00,'approved','Intellipaat','Beginner','of4L9c2Fdoo'
FROM users admin
JOIN domains domain ON domain.name='Marketing'
JOIN categories category ON category.name='Marketing'
WHERE admin.role='admin'
  AND NOT EXISTS (SELECT 1 FROM courses WHERE youtube_video_id='of4L9c2Fdoo')
ORDER BY admin.id
LIMIT 1;

INSERT INTO course_modules (course_id,title,sort_order)
SELECT course.id,'Full course video',1
FROM courses course
WHERE course.youtube_video_id IN (
  'a_iQb1lnAEQ','eWRfhZUzrAc','x4rFhThSX04',
  'BBk3DXgodmI','gvhsKtjAmgc','mT_Jjn8RJdo','Llnmf5BXLBA','of4L9c2Fdoo'
)
  AND NOT EXISTS (
    SELECT 1 FROM course_modules module
    WHERE module.course_id=course.id AND module.title='Full course video'
  );

INSERT INTO lessons (module_id,title,sort_order)
SELECT module.id,'Watch the complete course',1
FROM course_modules module
JOIN courses course ON course.id=module.course_id
WHERE course.youtube_video_id IN (
  'a_iQb1lnAEQ','eWRfhZUzrAc','x4rFhThSX04',
  'BBk3DXgodmI','gvhsKtjAmgc','mT_Jjn8RJdo','Llnmf5BXLBA','of4L9c2Fdoo'
)
  AND NOT EXISTS (
    SELECT 1 FROM lessons lesson
    WHERE lesson.module_id=module.id AND lesson.title='Watch the complete course'
  );
