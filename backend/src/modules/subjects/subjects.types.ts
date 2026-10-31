export interface SubjectRoom {
  id: string;
  teacher_id: string;
  class_section_id: string;
  name: string;
  access_code: string;
  leaderboard_enabled: boolean;
  created_at: string;
}
export interface SubjectMember {
  id: string;
  subject_id: string;
  student_id: string;
  created_at: string;
}
export interface SubjectQuiz {
  id: string;
  subject_id: string;
  quiz_id: string;
  class_section_id: string;
  created_at: string;
}
