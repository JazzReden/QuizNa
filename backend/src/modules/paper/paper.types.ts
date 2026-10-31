import { StudentQuestionView } from "../../common/types";
export interface PaperRow {
  questionId: string;
  number: number;
  type: string;
  /** Number-label position; omitted by older printed layouts. */
  x?: number;
  y: number;
  height: number;
  width?: number;
  showOptionLabels?: boolean;
  options: { id: string; label: string; x: number }[];
}
export interface PaperPage {
  index: number;
  width?: number;
  height?: number;
  rows: PaperRow[];
}
export interface PaperSheet {
  id: string;
  quiz_id: string;
  quiz_version_id: string;
  student_id: string;
  section_id: string;
  token: string;
  attempt_id?: string;
  created_at: string;
  layout: {
    subject?: string;
    revision: 1 | 2 | 3;
    paperSize?: "a4" | "long_bond";
    title: string;
    instructions: string;
    timeLimit: number;
    student: string;
    section: string;
    questions: StudentQuestionView[];
    pages: PaperPage[];
  };
}
