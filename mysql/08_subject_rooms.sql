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
-- Group existing quizzes by their current subject and assigned section; blank labels remain accessible under Unassigned quizzes.
INSERT IGNORE INTO subject_rooms(id,teacher_id,class_section_id,name,access_code,leaderboard_enabled,created_at)
 SELECT UUID(),q.teacher_id,s.class_section_id,MIN(TRIM(q.subject)),CONCAT('SUB-',UPPER(LEFT(REPLACE(UUID(),'-',''),12))),FALSE,MIN(q.created_at)
 FROM quizzes q JOIN quiz_sections s ON s.quiz_id=q.id WHERE s.class_section_id IS NOT NULL AND TRIM(COALESCE(q.subject,''))<>''
 GROUP BY q.teacher_id,s.class_section_id,LOWER(TRIM(q.subject));
INSERT IGNORE INTO subject_quizzes(id,subject_id,quiz_id,class_section_id,created_at)
 SELECT UUID(),r.id,q.id,r.class_section_id,q.created_at FROM subject_rooms r JOIN quizzes q ON q.teacher_id=r.teacher_id AND LOWER(TRIM(q.subject))=LOWER(r.name)
 JOIN quiz_sections s ON s.quiz_id=q.id AND s.class_section_id=r.class_section_id;
INSERT IGNORE INTO subject_members(id,subject_id,student_id,created_at)
 SELECT UUID(),r.id,p.id,r.created_at FROM subject_rooms r JOIN section_students s ON s.class_section_id=r.class_section_id
 JOIN profiles p ON LOWER(p.email)=LOWER(s.email) AND p.role='student';
