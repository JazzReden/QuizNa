-- Additive: retain all quiz section IDs, access codes and attempt records.
CREATE TABLE IF NOT EXISTS class_sections (
 id VARCHAR(36) PRIMARY KEY, teacher_id VARCHAR(36) NOT NULL,
 name VARCHAR(80) NOT NULL, created_at VARCHAR(32) NOT NULL,
 FOREIGN KEY(teacher_id) REFERENCES profiles(id) ON DELETE CASCADE,
 UNIQUE KEY teacher_class_name(teacher_id,name)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS section_students (
 id VARCHAR(36) PRIMARY KEY, class_section_id VARCHAR(36) NOT NULL,
 full_name VARCHAR(160) NOT NULL, email VARCHAR(254) NOT NULL, created_at VARCHAR(32) NOT NULL,
 FOREIGN KEY(class_section_id) REFERENCES class_sections(id) ON DELETE CASCADE,
 UNIQUE KEY roster_email(class_section_id,email)
) ENGINE=InnoDB;
ALTER TABLE quiz_sections ADD COLUMN IF NOT EXISTS class_section_id VARCHAR(36) NULL;
ALTER TABLE quiz_sections ADD UNIQUE INDEX IF NOT EXISTS quiz_class_section(quiz_id,class_section_id);
SET @class_fk_exists=(SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='quiz_sections' AND CONSTRAINT_NAME='quiz_class_fk');
SET @class_fk_sql=IF(@class_fk_exists=0,'ALTER TABLE quiz_sections ADD CONSTRAINT quiz_class_fk FOREIGN KEY(class_section_id) REFERENCES class_sections(id) ON DELETE RESTRICT','SELECT 1');
PREPARE class_fk_statement FROM @class_fk_sql;
EXECUTE class_fk_statement;
DEALLOCATE PREPARE class_fk_statement;
INSERT IGNORE INTO class_sections(id,teacher_id,name,created_at)
 SELECT MIN(s.id),q.teacher_id,MIN(TRIM(s.name)),MIN(s.created_at)
 FROM quiz_sections s JOIN quizzes q ON q.id=s.quiz_id GROUP BY q.teacher_id,LOWER(TRIM(s.name));
SET @roster_backfill_needed=(SELECT COUNT(*) FROM quiz_sections WHERE class_section_id IS NULL);
UPDATE quiz_sections s JOIN quizzes q ON q.id=s.quiz_id
 JOIN class_sections c ON c.teacher_id=q.teacher_id AND c.name=TRIM(s.name)
 SET s.class_section_id=c.id WHERE s.class_section_id IS NULL;
-- Existing students who used section codes become the initial roster.
INSERT IGNORE INTO section_students(id,class_section_id,full_name,email,created_at)
 SELECT UUID(),s.class_section_id,LEFT(p.full_name,160),LOWER(TRIM(p.email)),MIN(a.started_at)
 FROM quiz_attempts a JOIN quiz_sections s ON s.id=a.section_id JOIN profiles p ON p.id=a.student_id
 WHERE s.class_section_id IS NOT NULL AND @roster_backfill_needed>0 GROUP BY s.class_section_id,p.id;
