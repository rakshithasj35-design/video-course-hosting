USE video_course_hosting;

INSERT IGNORE INTO categories (name) VALUES
  ('Accounting'), ('Finance'), ('E-commerce'), ('Entrepreneurship'),
  ('Investing'), ('Economics'), ('Databases'), ('Communication'),
  ('English'), ('Time Management'), ('Leadership'), ('Productivity'),
  ('Critical Thinking');

UPDATE courses
SET youtube_video_id='LzMnsfqjzkA',
    display_instructor=COALESCE(NULLIF(display_instructor,''),'freeCodeCamp.org')
WHERE id=1
  AND domain_id=(SELECT id FROM domains WHERE name='General')
  AND youtube_video_id IS NULL;

INSERT IGNORE INTO courses
  (tutor_id,title,description,thumbnail_url,category,category_id,domain_id,price,status,display_instructor,course_level,youtube_video_id)
SELECT admin.id,
       seed.title,
       seed.description,
       CONCAT('https://img.youtube.com/vi/',seed.video_id,'/hqdefault.jpg'),
       category.name,
       category.id,
       domain.id,
       0.00,
       'approved',
       seed.instructor,
       'Beginner',
       seed.video_id
FROM (
  SELECT 'JavaScript Full Course for Beginners' AS title,
         'Learn JavaScript fundamentals with this beginner-friendly full course from freeCodeCamp.org and Beau Carnes.' AS description,
         'freeCodeCamp.org and Beau Carnes' AS instructor,
         'Programming' AS category,
         'Technology' AS domain,
         'PkZNo7MFNFg' AS video_id
  UNION ALL SELECT
         'Java Full Course for Beginners',
         'Study core Java programming concepts in this full beginner course from Programming with Mosh.',
         'Programming with Mosh','Programming','Technology','eIrMbAQSU34'
  UNION ALL SELECT
         'C Programming Tutorial for Beginners',
         'Learn the fundamentals of the C programming language with this freeCodeCamp.org tutorial.',
         'freeCodeCamp.org','Programming','Technology','KJgsSFOSQv0'
  UNION ALL SELECT
         'SQL Tutorial - Full Database Course for Beginners',
         'Learn SQL and database fundamentals in this complete beginner course from freeCodeCamp.org.',
         'freeCodeCamp.org','Databases','Technology','HXV3zeQKqGY'
  UNION ALL SELECT
         'Learn Node.js - Full Tutorial for Beginners',
         'Get started with Node.js in this full beginner tutorial from freeCodeCamp.org.',
         'freeCodeCamp.org','Web Development','Technology','RLtyhwFtXQA'
  UNION ALL SELECT
         'Accounting Basics for Beginners',
         'Learn foundational accounting concepts in this beginner course from LYFE Accounting.',
         'LYFE Accounting','Accounting','Commerce','Gua2Bo_G-J0'
  UNION ALL SELECT
         'Introduction to Financial Management',
         'Explore financial management fundamentals in this introductory course from Simplilearn.',
         'Simplilearn','Finance','Commerce','q78q5H-r1FU'
  UNION ALL SELECT
         'The Complete Ecommerce Roadmap for Beginners',
         'Get an introductory roadmap to starting an ecommerce business from Ecommerce Doctor.',
         'Ecommerce Doctor','E-commerce','Commerce','oah6nI8l7Kc'
  UNION ALL SELECT
         'The Foundations of Entrepreneurship',
         'Learn the foundations of entrepreneurship in this full course from freeCodeCamp.org.',
         'freeCodeCamp.org','Entrepreneurship','Commerce','UEngvxZ11sw'
  UNION ALL SELECT
         'Stock Market Basics for Beginners',
         'Start learning stock market fundamentals with CA Rachana Phadke Ranade.',
         'CA Rachana Phadke Ranade','Investing','Commerce','Xn7KWR9EOGQ'
  UNION ALL SELECT
         'Economics Full Course: Microeconomics and Macroeconomics',
         'Study introductory microeconomics and macroeconomics in this full course from Accounting Guy.',
         'Accounting Guy','Economics','Commerce','5uE9NWf5hac'
  UNION ALL SELECT
         'Complete Figma UI/UX Design Course',
         'Learn Figma and UI/UX design fundamentals in this complete course from Simplilearn.',
         'Simplilearn','Design','Design','PixMVjfkGBs'
  UNION ALL SELECT
         'Graphic Design Basics',
         'Learn foundational graphic design concepts in this free course from Envato.',
         'Envato','Design','Design','GQS7wPujL2k'
  UNION ALL SELECT
         'Photoshop for Beginners',
         'Get started with Adobe Photoshop in this free beginner course from Envato.',
         'Envato','Design','Design','IyR_uYsRdPs'
  UNION ALL SELECT
         'Logo Design Course for Beginners',
         'Learn logo design fundamentals in this course from Satori Graphics.',
         'Satori Graphics','Design','Design','l9_BM1opTj8'
  UNION ALL SELECT
         'Web Design for Beginners',
         'Explore web design fundamentals in this full beginner course from Flux Academy.',
         'Flux Academy','Design','Design','j6Ule7GXaRs'
  UNION ALL SELECT
         'Typography for Beginners',
         'Learn typography fundamentals in this free course from Envato.',
         'Envato','Design','Design','yAuUDyUC-GM'
  UNION ALL SELECT
         'Digital Marketing Full Course',
         'Learn beginner digital marketing concepts in this three-hour course from WsCube Tech.',
         'WsCube Tech','Marketing','Marketing','G6DmDqYLWL8'
  UNION ALL SELECT
         'Complete SEO Course for Beginners',
         'Learn search engine optimization fundamentals in this beginner course from Ahrefs.',
         'Ahrefs','Marketing','Marketing','xsVTqzratPs'
  UNION ALL SELECT
         'Social Media Marketing Full Course',
         'Study social media marketing fundamentals in this full course from Piyush Sachdeva.',
         'Piyush Sachdeva','Marketing','Marketing','d5pVjv1KYVw'
  UNION ALL SELECT
         'Content Marketing Full Course',
         'Learn content marketing concepts and strategy in this beginner course from Simplilearn.',
         'Simplilearn','Marketing','Marketing','osVm6UrwEYc'
  UNION ALL SELECT
         'Email Marketing for Beginners',
         'Learn the basics of email marketing with HubSpot Academy.',
         'HubSpot Academy','Marketing','Marketing','JKrlUNFrhhg'
  UNION ALL SELECT
         'Google Ads Full Course for Beginners',
         'Explore Google Ads campaign fundamentals in this beginner course from WsCube Tech.',
         'WsCube Tech','Marketing','Marketing','Mh-9srK5w54'
  UNION ALL SELECT
         'Affiliate Marketing Course for Beginners',
         'Learn affiliate marketing fundamentals in this beginner course from Ahrefs.',
         'Ahrefs','Marketing','Marketing','CF3Uk2jc_ig'
  UNION ALL SELECT
         'Communication Skills Full Course (Hindi)',
         'Build communication skills with Summu Tech in this Hindi course, from beginner to advanced.',
         'Summu Tech','Communication','General','h_BPOzvvIks'
  UNION ALL SELECT
         'Spoken English for Beginners',
         'Practice spoken English with English with Lucy in this beginner-to-advanced lesson.',
         'English with Lucy','English','General','oUD2gUmdzeI'
  UNION ALL SELECT
         'Time Management Course',
         'Learn practical time management strategies in this free three-hour course.',
         'Your Life Your Project','Time Management','General','Yq3vog9H7uc'
  UNION ALL SELECT
         'Leadership Skills Course for Beginners',
         'Explore leadership skills in this free leadership crash course from Simplilearn.',
         'Simplilearn','Leadership','General','KI6HlNPZGbM'
  UNION ALL SELECT
         'The 7 Essential Pillars of Personal Development',
         'Explore seven personal development pillars with Brian Tracy.',
         'Brian Tracy','Personal Growth','General','AWGayyX9I6o'
  UNION ALL SELECT
         'Productivity and Time Management Full Course',
         'Learn productivity and time management in this full course from Tales Augusto.',
         'Tales Augusto','Productivity','General','I0Dp1D9MLSU'
  UNION ALL SELECT
         'Critical Thinking Fundamentals',
         'Learn the fundamentals of critical thinking with Wireless Philosophy.',
         'Wireless Philosophy','Critical Thinking','General','Cum3k-Wglfw'
) AS seed
JOIN domains domain ON domain.name=seed.domain
JOIN categories category ON category.name=seed.category
JOIN (SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1) admin ON 1=1
WHERE NOT EXISTS (
  SELECT 1 FROM courses existing WHERE existing.youtube_video_id=seed.video_id
);

INSERT INTO course_modules (course_id,title,sort_order)
SELECT course.id,'Full course video',1
FROM courses course
WHERE course.youtube_video_id IN (
  'PkZNo7MFNFg','eIrMbAQSU34','KJgsSFOSQv0','HXV3zeQKqGY','RLtyhwFtXQA',
  'Gua2Bo_G-J0','q78q5H-r1FU','oah6nI8l7Kc','UEngvxZ11sw','Xn7KWR9EOGQ','5uE9NWf5hac',
  'PixMVjfkGBs','GQS7wPujL2k','IyR_uYsRdPs','l9_BM1opTj8','j6Ule7GXaRs','yAuUDyUC-GM',
  'G6DmDqYLWL8','xsVTqzratPs','d5pVjv1KYVw','osVm6UrwEYc','JKrlUNFrhhg','Mh-9srK5w54','CF3Uk2jc_ig',
  'h_BPOzvvIks','oUD2gUmdzeI','Yq3vog9H7uc','KI6HlNPZGbM','AWGayyX9I6o','I0Dp1D9MLSU','Cum3k-Wglfw'
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
  'PkZNo7MFNFg','eIrMbAQSU34','KJgsSFOSQv0','HXV3zeQKqGY','RLtyhwFtXQA',
  'Gua2Bo_G-J0','q78q5H-r1FU','oah6nI8l7Kc','UEngvxZ11sw','Xn7KWR9EOGQ','5uE9NWf5hac',
  'PixMVjfkGBs','GQS7wPujL2k','IyR_uYsRdPs','l9_BM1opTj8','j6Ule7GXaRs','yAuUDyUC-GM',
  'G6DmDqYLWL8','xsVTqzratPs','d5pVjv1KYVw','osVm6UrwEYc','JKrlUNFrhhg','Mh-9srK5w54','CF3Uk2jc_ig',
  'h_BPOzvvIks','oUD2gUmdzeI','Yq3vog9H7uc','KI6HlNPZGbM','AWGayyX9I6o','I0Dp1D9MLSU','Cum3k-Wglfw'
)
  AND module.title='Full course video'
  AND NOT EXISTS (
    SELECT 1 FROM lessons lesson
    WHERE lesson.module_id=module.id AND lesson.title='Watch the complete course'
  );

UPDATE lessons lesson
JOIN course_modules module ON module.id=lesson.module_id
JOIN courses course ON course.id=module.course_id
SET lesson.video_url=CONCAT('https://www.youtube.com/watch?v=',course.youtube_video_id)
WHERE course.youtube_video_id IN (
  'a_iQb1lnAEQ','eWRfhZUzrAc','x4rFhThSX04','BBk3DXgodmI','gvhsKtjAmgc',
  'mT_Jjn8RJdo','Llnmf5BXLBA','of4L9c2Fdoo','LzMnsfqjzkA',
  'PkZNo7MFNFg','eIrMbAQSU34','KJgsSFOSQv0','HXV3zeQKqGY','RLtyhwFtXQA',
  'Gua2Bo_G-J0','q78q5H-r1FU','oah6nI8l7Kc','UEngvxZ11sw','Xn7KWR9EOGQ','5uE9NWf5hac',
  'PixMVjfkGBs','GQS7wPujL2k','IyR_uYsRdPs','l9_BM1opTj8','j6Ule7GXaRs','yAuUDyUC-GM',
  'G6DmDqYLWL8','xsVTqzratPs','d5pVjv1KYVw','osVm6UrwEYc','JKrlUNFrhhg','Mh-9srK5w54','CF3Uk2jc_ig',
  'h_BPOzvvIks','oUD2gUmdzeI','Yq3vog9H7uc','KI6HlNPZGbM','AWGayyX9I6o','I0Dp1D9MLSU','Cum3k-Wglfw'
)
  AND lesson.video_url IS NULL
  AND (
    (module.title='Full course video' AND lesson.title='Watch the complete course')
    OR (course.id=1 AND module.title='Getting Started' AND lesson.title='Welcome to the Course')
  );
