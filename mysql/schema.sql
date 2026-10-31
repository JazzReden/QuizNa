-- Local XAMPP/MariaDB schema. Apply inside a dedicated quizna_local database.
-- Supabase PostgreSQL migrations remain separate and unchanged.
CREATE TABLE IF NOT EXISTS quizna_local_metadata (
  id INT PRIMARY KEY, schema_version INT NOT NULL, seeded BOOLEAN NOT NULL DEFAULT FALSE
) ENGINE=InnoDB;
INSERT IGNORE INTO quizna_local_metadata(id,schema_version,seeded) VALUES(1,1,FALSE);
CREATE TABLE IF NOT EXISTS profiles (
  id VARCHAR(36) PRIMARY KEY, email VARCHAR(254) NOT NULL UNIQUE, full_name TEXT NOT NULL,
  role ENUM('teacher','student') NOT NULL, avatar_url TEXT NULL,
  created_at VARCHAR(32) NOT NULL, updated_at VARCHAR(32) NOT NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS quizzes (
  id VARCHAR(36) PRIMARY KEY, teacher_id VARCHAR(36) NOT NULL, title TEXT NOT NULL,
  subject VARCHAR(120) NULL, description TEXT NULL, instructions TEXT NULL, access_code VARCHAR(12) NOT NULL UNIQUE,
  time_limit_minutes INT NOT NULL, max_attempts INT NOT NULL,
  randomize_questions BOOLEAN NOT NULL DEFAULT FALSE, randomize_options BOOLEAN NOT NULL DEFAULT FALSE,
  available_from VARCHAR(32) NULL, available_until VARCHAR(32) NULL,
  release_scores_immediately BOOLEAN NOT NULL DEFAULT FALSE, release_answers_immediately BOOLEAN NOT NULL DEFAULT FALSE,
  require_access_code BOOLEAN NOT NULL DEFAULT FALSE,
  status ENUM('draft','published','archived') NOT NULL, version INT NOT NULL,
  created_at VARCHAR(32) NOT NULL, updated_at VARCHAR(32) NOT NULL,
  FOREIGN KEY(teacher_id) REFERENCES profiles(id), INDEX(teacher_id),
  CHECK(time_limit_minutes>0), CHECK(max_attempts>0)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS questions (
  id VARCHAR(36) PRIMARY KEY, quiz_id VARCHAR(36) NOT NULL,
  type ENUM('mcq','true_false','short_answer','essay') NOT NULL, prompt TEXT NOT NULL,
  explanation TEXT NULL, points DECIMAL(10,2) NOT NULL, order_index INT NOT NULL,
  options JSON NULL, correct_answer JSON NULL, rubric TEXT NULL,
  created_at VARCHAR(32) NOT NULL, updated_at VARCHAR(32) NOT NULL,
  FOREIGN KEY(quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE, INDEX(quiz_id,order_index), CHECK(points>=0)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS quiz_versions (
  id VARCHAR(36) PRIMARY KEY, quiz_id VARCHAR(36) NOT NULL, version_number INT NOT NULL,
  snapshot_data JSON NOT NULL, created_at VARCHAR(32) NOT NULL,
  FOREIGN KEY(quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE, UNIQUE(quiz_id,version_number)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id VARCHAR(36) PRIMARY KEY, quiz_id VARCHAR(36) NOT NULL, quiz_version_id VARCHAR(36) NOT NULL,
  student_id VARCHAR(36) NOT NULL, attempt_number INT NOT NULL,
  status ENUM('in_progress','submitted','timed_out','terminated_violation') NOT NULL,
  started_at VARCHAR(32) NOT NULL, deadline_at VARCHAR(32) NOT NULL, submitted_at VARCHAR(32) NULL,
  score DECIMAL(10,2) NULL, max_score DECIMAL(10,2) NOT NULL, is_graded BOOLEAN NOT NULL DEFAULT FALSE,
  warning_count INT NOT NULL DEFAULT 0, question_order JSON NOT NULL,
  created_at VARCHAR(32) NOT NULL, updated_at VARCHAR(32) NOT NULL,
  active_student VARCHAR(36) GENERATED ALWAYS AS (CASE WHEN status='in_progress' THEN student_id ELSE NULL END) STORED,
  FOREIGN KEY(quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
  FOREIGN KEY(quiz_version_id) REFERENCES quiz_versions(id) ON DELETE CASCADE, FOREIGN KEY(student_id) REFERENCES profiles(id),
  UNIQUE(quiz_id,student_id,attempt_number), UNIQUE(quiz_id,active_student),
  INDEX(student_id,started_at), INDEX(status,deadline_at), CHECK(warning_count BETWEEN 0 AND 3)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS attempt_answers (
  id VARCHAR(36) PRIMARY KEY, attempt_id VARCHAR(36) NOT NULL, question_id VARCHAR(36) NOT NULL,
  answer JSON NULL, score_awarded DECIMAL(10,2) NULL, teacher_feedback TEXT NULL,
  is_manually_graded BOOLEAN NOT NULL DEFAULT FALSE, updated_at VARCHAR(32) NOT NULL,
  FOREIGN KEY(attempt_id) REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  UNIQUE(attempt_id,question_id)
  -- question_id refers to the frozen snapshot; deleting a draft must preserve answers.
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS quiz_incidents (
  id VARCHAR(36) PRIMARY KEY, attempt_id VARCHAR(36) NOT NULL,
  incident_type ENUM('tab_hidden','window_blur','fullscreen_exit') NOT NULL,
  warning_number INT NOT NULL, details JSON NOT NULL, occurred_at VARCHAR(32) NOT NULL, created_at VARCHAR(32) NOT NULL,
  FOREIGN KEY(attempt_id) REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  INDEX(attempt_id,occurred_at), CHECK(warning_number BETWEEN 1 AND 3)
) ENGINE=InnoDB;

-- Additive local-only account/session migration. Existing quiz data is preserved.
CREATE TABLE IF NOT EXISTS local_auth_credentials (
  user_id VARCHAR(36) PRIMARY KEY,
  password_hash VARCHAR(256) NOT NULL,
  FOREIGN KEY(user_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS local_auth_sessions (
  access_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  refresh_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  user_id VARCHAR(36) NOT NULL,
  access_expires_at VARCHAR(32) NOT NULL,
  refresh_expires_at VARCHAR(32) NOT NULL,
  created_at VARCHAR(32) NOT NULL,
  FOREIGN KEY(user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  INDEX(user_id), INDEX(refresh_expires_at)
) ENGINE=InnoDB;

-- Section grouping and distinct quiz access codes.
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
-- Additive upgrade; existing exams remain online.
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS exam_format varchar(10) NOT NULL DEFAULT 'online';
ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS paper_sheet_id varchar(36) NULL;
CREATE TABLE IF NOT EXISTS paper_sheets (
 id varchar(36) PRIMARY KEY, quiz_id varchar(36) NOT NULL, quiz_version_id varchar(36) NOT NULL,
 student_id varchar(36) NOT NULL, section_id varchar(36) NOT NULL, token varchar(64) NOT NULL,
 layout longtext NOT NULL CHECK(json_valid(layout)), attempt_id varchar(36) NULL UNIQUE, created_at varchar(35) NOT NULL,
 FOREIGN KEY(quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
 FOREIGN KEY(quiz_version_id) REFERENCES quiz_versions(id) ON DELETE CASCADE,
 FOREIGN KEY(student_id) REFERENCES profiles(id) ON DELETE CASCADE,
 FOREIGN KEY(section_id) REFERENCES quiz_sections(id) ON DELETE CASCADE,
 INDEX paper_quiz_student(quiz_id,student_id,created_at)
) ENGINE=InnoDB;
CREATE UNIQUE INDEX IF NOT EXISTS attempt_paper_sheet ON quiz_attempts(paper_sheet_id);

ALTER TABLE paper_sheets ADD COLUMN IF NOT EXISTS active_student varchar(36) GENERATED ALWAYS AS (CASE WHEN attempt_id IS NULL THEN student_id ELSE NULL END) STORED;
CREATE UNIQUE INDEX IF NOT EXISTS paper_one_open ON paper_sheets(quiz_id,active_student);

-- Teacher-confirmed gradebook results
ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS score_confirmed_at VARCHAR(40) NULL;
ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS score_confirmed_by CHAR(36) NULL;

ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS score_revision INT NOT NULL DEFAULT 0;

-- Additive subject workspaces. No changes to quiz questions, versions or scores.
CREATE TABLE IF NOT EXISTS subject_rooms (
 id VARCHAR(36) PRIMARY KEY, teacher_id VARCHAR(36) NOT NULL, class_section_id VARCHAR(36) NOT NULL,
 name VARCHAR(120) NOT NULL, access_code VARCHAR(16) NOT NULL UNIQUE,
 leaderboard_enabled BOOLEAN NOT NULL DEFAULT FALSE, created_at VARCHAR(40) NOT NULL,
 FOREIGN KEY(teacher_id) REFERENCES profiles(id) ON DELETE CASCADE,
 FOREIGN KEY(class_section_id) REFERENCES class_sections(id) ON DELETE CASCADE,
 UNIQUE KEY subject_section_name(teacher_id,class_section_id,name),
 UNIQUE KEY subject_class(id,class_section_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS subject_members (
 id VARCHAR(36) PRIMARY KEY,subject_id VARCHAR(36) NOT NULL,student_id VARCHAR(36) NOT NULL,created_at VARCHAR(40) NOT NULL,
 FOREIGN KEY(subject_id) REFERENCES subject_rooms(id) ON DELETE CASCADE,
 FOREIGN KEY(student_id) REFERENCES profiles(id) ON DELETE CASCADE,
 UNIQUE KEY subject_student(subject_id,student_id),INDEX student_subject(student_id,subject_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS subject_quizzes (
 id VARCHAR(36) PRIMARY KEY,subject_id VARCHAR(36) NOT NULL,quiz_id VARCHAR(36) NOT NULL,class_section_id VARCHAR(36) NOT NULL,created_at VARCHAR(40) NOT NULL,
 FOREIGN KEY(subject_id,class_section_id) REFERENCES subject_rooms(id,class_section_id) ON DELETE CASCADE,
 FOREIGN KEY(quiz_id,class_section_id) REFERENCES quiz_sections(quiz_id,class_section_id) ON DELETE CASCADE,
 UNIQUE KEY subject_quiz(subject_id,quiz_id),INDEX quiz_subject(quiz_id,subject_id)
) ENGINE=InnoDB;
