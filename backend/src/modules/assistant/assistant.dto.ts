import { IsIn, IsOptional, IsUUID } from "class-validator";
export const ASSISTANT_TOPICS = [
  "submissions",
  "not_submitted",
  "not_started",
  "in_progress",
  "grading",
  "leaderboard",
  "gradebook",
  "results",
  "performance",
] as const;
export type AssistantTopic = (typeof ASSISTANT_TOPICS)[number];
export class AssistantReportDto {
  @IsIn(ASSISTANT_TOPICS) topic: AssistantTopic;
  @IsOptional() @IsUUID() quizId?: string;
  @IsOptional() @IsUUID() sectionId?: string;
  @IsOptional() @IsUUID() classId?: string;
}
