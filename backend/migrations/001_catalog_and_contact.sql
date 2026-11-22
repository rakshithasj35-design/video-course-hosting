CREATE TABLE IF NOT EXISTS categories (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT IGNORE INTO categories (name) VALUES
  ('Development'), ('Design'), ('Business'), ('Marketing'), ('Photography'), ('Personal Growth');

SET @add_category_id = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='courses' AND COLUMN_NAME='category_id')=0,
  'ALTER TABLE courses ADD COLUMN category_id BIGINT UNSIGNED NULL',
  'SELECT 1'
);
PREPARE category_id_statement FROM @add_category_id;
EXECUTE category_id_statement;
DEALLOCATE PREPARE category_id_statement;

SET @add_price = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='courses' AND COLUMN_NAME='price')=0,
  'ALTER TABLE courses ADD COLUMN price DECIMAL(10,2) NOT NULL DEFAULT 0.00',
  'SELECT 1'
);
PREPARE price_statement FROM @add_price;
EXECUTE price_statement;
DEALLOCATE PREPARE price_statement;

UPDATE courses c
LEFT JOIN categories cat ON cat.name=c.category
LEFT JOIN categories fallback ON fallback.name='Development'
SET c.category_id=COALESCE(cat.id,fallback.id)
WHERE c.category_id IS NULL;

SET @make_category_required = IF(
  (SELECT IS_NULLABLE FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='courses' AND COLUMN_NAME='category_id')='YES',
  'ALTER TABLE courses MODIFY COLUMN category_id BIGINT UNSIGNED NOT NULL',
  'SELECT 1'
);
PREPARE category_required_statement FROM @make_category_required;
EXECUTE category_required_statement;
DEALLOCATE PREPARE category_required_statement;

SET @add_category_fk = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='courses'
   AND CONSTRAINT_NAME='fk_courses_category')=0,
  'ALTER TABLE courses ADD CONSTRAINT fk_courses_category FOREIGN KEY (category_id) REFERENCES categories(id)',
  'SELECT 1'
);
PREPARE category_fk_statement FROM @add_category_fk;
EXECUTE category_fk_statement;
DEALLOCATE PREPARE category_fk_statement;

CREATE TABLE IF NOT EXISTS contact_messages (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL,
  subject VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
