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
