-- Additive XAMPP migration. Existing attempts remain unassigned.
CREATE TABLE IF NOT EXISTS quiz_sections (
 id VARCHAR(36) PRIMARY KEY, quiz_id VARCHAR(36) NOT NULL,
 name VARCHAR(80) NOT NULL, access_code VARCHAR(12) NOT NULL UNIQUE,
 created_at VARCHAR(32) NOT NULL,
 FOREIGN KEY(quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
 UNIQUE KEY quiz_section_name(quiz_id,name), INDEX(quiz_id)
) ENGINE=InnoDB;
ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS section_id VARCHAR(36) NULL;
-- MariaDB supports IF NOT EXISTS on indexes/constraints, so this migration is repeatable.
ALTER TABLE quiz_attempts ADD INDEX IF NOT EXISTS attempt_section(section_id,status,is_graded);
SET @section_fk_exists=(SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='quiz_attempts' AND CONSTRAINT_NAME='attempt_section_fk');
SET @section_fk_sql=IF(@section_fk_exists=0,'ALTER TABLE quiz_attempts ADD CONSTRAINT attempt_section_fk FOREIGN KEY(section_id) REFERENCES quiz_sections(id) ON DELETE SET NULL','SELECT 1');
PREPARE section_fk_statement FROM @section_fk_sql;
EXECUTE section_fk_statement;
DEALLOCATE PREPARE section_fk_statement;
