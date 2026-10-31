import { buildClassList, Participation } from "./class-list";
import { studentLastName } from "./student-name";
import { buildLeaderboard } from "./leaderboard";
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { DatabaseService } from "../../database/database.service";
import { BoundedWorkerPoolService } from "../workers/bounded-worker-pool.service";

export type ParticipationFilter = "all" | Participation;

function validateStatus(status: string): asserts status is ParticipationFilter {
  if (!["all", "submitted", "in_progress", "not_started"].includes(status))
    throw new BadRequestException("Choose a valid student status");
}

@Injectable()
export class ReportsService {
  constructor(
    private db: DatabaseService,
    private workerPool: BoundedWorkerPoolService,
  ) {}

  async getLeaderboard(
    quizId: string,
    teacherId: string,
    sectionId?: string,
    confirmedOnly = false,
  ) {
    const quiz = await this.db.getQuizById(quizId);
    if (!quiz) throw new NotFoundException("Quiz not found");
    if (quiz.teacher_id !== teacherId)
      throw new ForbiddenException("You do not own this quiz");
    const sections = await this.db.listSections(quizId);
    if (
      sectionId &&
      sectionId !== "unassigned" &&
      !sections.some((s) => s.id === sectionId)
    )
      throw new BadRequestException("Choose a section from this quiz");
    let attempts = await this.db.listAttemptsByQuiz(quizId);
    if (sectionId)
      attempts = attempts.filter((a) =>
        sectionId === "unassigned" ? !a.section_id : a.section_id === sectionId,
      );
    const names = new Map(sections.map((s) => [s.id, s.name]));
    const profiles = new Map();
    for (const a of attempts) {
      if (!profiles.has(a.student_id))
        profiles.set(a.student_id, await this.db.getProfile(a.student_id));
      a.student_profile = profiles.get(a.student_id);
      a.section_name = names.get(a.section_id) || "Unassigned";
    }
    return {
      quiz: { id: quiz.id, title: quiz.title, status: quiz.status },
      sections,
      rows: buildLeaderboard(attempts, confirmedOnly),
      pendingCount: attempts.filter(
        (a) => a.status !== "in_progress" && !a.is_graded,
      ).length,
    };
  }
  async getClassList(
    quizId: string,
    teacherId: string,
    sectionId?: string,
    confirmedOnly = false,
  ) {
    const board = await this.getLeaderboard(
      quizId,
      teacherId,
      sectionId,
      confirmedOnly,
    );
    const sections = board.sections.filter(
      (s) => !sectionId || s.id === sectionId,
    );
    const classIds = [
      ...new Set(sections.map((s) => s.class_section_id).filter(Boolean)),
    ];
    const roster = (
      await Promise.all(classIds.map((id) => this.db.listRoster(id)))
    ).flat();
    const attempts = (await this.db.listAttemptsByQuiz(quizId)).filter(
      (a) =>
        a.status === "in_progress" &&
        (!sectionId ||
          (sectionId === "unassigned"
            ? !a.section_id
            : a.section_id === sectionId)),
    );
    for (const a of attempts)
      a.student_profile = await this.db.getProfile(a.student_id);
    const rows = buildClassList(board.rows, attempts, sections, roster);
    return {
      ...board,
      rows,
      summary: {
        submitted: rows.filter((r) => r.participation === "submitted").length,
        in_progress: rows.filter((r) => r.participation === "in_progress")
          .length,
        not_started: rows.filter((r) => r.participation === "not_started")
          .length,
      },
    };
  }
  async exportScorebookCsv(
    quizId: string,
    teacherId: string,
    sectionId?: string,
    status: string = "all",
  ): Promise<string> {
    validateStatus(status);
    const board = await this.getClassList(quizId, teacherId, sectionId);
    return this.workerPool.runTask(
      `scorebook_${quizId}`,
      {
        rows: board.rows.filter(
          (row) => status === "all" || row.participation === status,
        ),
      },
      (data) => {
        const escape = (value: any) => {
          let text = String(value ?? "");
          if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
          return '"' + text.replace(/"/g, '""') + '"';
        };
        const rows = [
          [
            "Rank",
            "Student",
            "Email",
            "Section",
            "Best score",
            "Out of",
            "Percentage",
            "Grading",
            "Submitted attempts",
            "Submission status",
            "On roster",
          ],
          ...data.rows
            .slice()
            .sort(
              (a, b) =>
                a.sectionName.localeCompare(b.sectionName, "en", {
                  sensitivity: "base",
                  numeric: true,
                }) ||
                a.studentLastName.localeCompare(b.studentLastName, "en", {
                  sensitivity: "base",
                  numeric: true,
                }) ||
                a.studentName.localeCompare(b.studentName, "en", {
                  sensitivity: "base",
                  numeric: true,
                }) ||
                a.studentEmail.localeCompare(b.studentEmail) ||
                a.studentId.localeCompare(b.studentId),
            )
            .map((r) => [
              r.rank,
              r.studentName,
              r.studentEmail,
              r.sectionName,
              r.score,
              r.participation === "not_started" ? "" : r.maxScore,
              r.percentage === null ? "" : r.percentage + "%",
              r.participation === "not_started" ||
              (r.participation === "in_progress" && !r.isGraded)
                ? ""
                : r.isGraded
                  ? "Graded"
                  : "Pending",
              r.attemptCount,
              r.participation === "submitted"
                ? "Submitted"
                : r.participation === "in_progress"
                  ? "In progress"
                  : "Not started",
              r.rosterMember ? "Yes" : "No",
            ]),
        ];
        return rows.map((row) => row.map(escape).join(",")).join("\n");
      },
    );
  }
  async getQuizStatistics(quizId: string, teacherId: string) {
    const quiz = await this.db.getQuizById(quizId);
    if (!quiz) throw new NotFoundException("Quiz not found");
    if (quiz.teacher_id !== teacherId)
      throw new ForbiddenException("You do not own this quiz");

    const attempts = await this.db.listAttemptsByQuiz(quizId);
    const questions = await this.db.listQuestions(quizId);

    // Run statistical calculations through bounded worker pool
    return this.workerPool.runTask(
      `stats_${quizId}`,
      { attempts, questions, quizId },
      (data) => {
        const { attempts: atts, questions: qs } = data;
        const totalAttempts = atts.length;
        const completedAttempts = atts.filter(
          (a) => a.status !== "in_progress",
        );
        const submittedCount = atts.filter(
          (a) => a.status === "submitted",
        ).length;
        const timedOutCount = atts.filter(
          (a) => a.status === "timed_out",
        ).length;
        const terminatedCount = atts.filter(
          (a) => a.status === "terminated_violation",
        ).length;

        const scores = completedAttempts
          .map((a) => Number(a.score || 0))
          .sort((a, b) => a - b);

        const maxPossibleScore = qs.reduce(
          (sum, q) => sum + Number(q.points),
          0,
        );
        const avgScore =
          scores.length > 0
            ? scores.reduce((sum, s) => sum + s, 0) / scores.length
            : 0;
        const medianScore =
          scores.length === 0
            ? 0
            : scores.length % 2 === 1
              ? scores[Math.floor(scores.length / 2)]
              : (scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2;

        const highestScore = scores.length > 0 ? scores[scores.length - 1] : 0;
        const lowestScore = scores.length > 0 ? scores[0] : 0;

        const totalWarnings = atts.reduce(
          (sum, a) => sum + (a.warning_count || 0),
          0,
        );

        return {
          quizId: data.quizId,
          totalAttempts,
          completedCount: completedAttempts.length,
          submittedCount,
          timedOutCount,
          terminatedCount,
          maxPossibleScore,
          avgScore: Number(avgScore.toFixed(2)),
          medianScore: Number(medianScore.toFixed(2)),
          highestScore,
          lowestScore,
          totalWarnings,
        };
      },
    );
  }

  async exportQuizCsv(
    quizId: string,
    teacherId: string,
    sectionId?: string,
    status: string = "all",
  ): Promise<string> {
    validateStatus(status);
    const quiz = await this.db.getQuizById(quizId);
    if (!quiz) throw new NotFoundException("Quiz not found");
    if (quiz.teacher_id !== teacherId)
      throw new ForbiddenException("You do not own this quiz");

    const sections = await this.db.listSections(quizId);
    if (
      sectionId &&
      sectionId !== "unassigned" &&
      !sections.some((section) => section.id === sectionId)
    )
      throw new BadRequestException("Choose a section from this quiz");
    let attempts = await this.db.listAttemptsByQuiz(quizId);
    if (sectionId)
      attempts = attempts.filter((attempt) =>
        sectionId === "unassigned"
          ? !attempt.section_id
          : attempt.section_id === sectionId,
      );
    if (status !== "all") {
      const board = await this.getClassList(quizId, teacherId, sectionId);
      const matching = new Set(
        board.rows
          .filter((r) => r.participation === status)
          .map((r) => JSON.stringify([r.sectionId || null, r.studentId])),
      );
      // Active retakes belong to In progress, even when an older attempt is submitted.
      attempts = attempts.filter(
        (a) =>
          matching.has(JSON.stringify([a.section_id || null, a.student_id])) &&
          (status === "in_progress"
            ? a.status === "in_progress"
            : status === "submitted"
              ? a.status !== "in_progress"
              : false),
      );
    }
    const sectionNames = new Map(
      sections.map((section) => [section.id, section.name]),
    );
    const questionColumns = new Map<
      string,
      { id: string; prompt: string; points: number }
    >();

    // Prepare enriched dataset
    const rows = [];
    for (const att of attempts) {
      const version = await this.db.getVersionForAttempt(att);
      for (const q of await this.db.getAttemptQuestions(att)) {
        const key = `${version.id}:${q.id}`;
        questionColumns.set(key, {
          id: key,
          prompt: `Edition ${version.version_number}: ${q.prompt}`,
          points: q.points,
        });
      }
      const student = await this.db.getProfile(att.student_id);
      const answers = await this.db.getAnswersByAttempt(att.id);
      const incidents = await this.db.getIncidentsByAttempt(att.id);

      rows.push({
        attemptId: att.id,
        sectionName: sectionNames.get(att.section_id) || "Unassigned",
        studentName: student?.full_name || "Unknown",
        studentLastName: studentLastName(student?.full_name || "Unknown"),
        studentEmail: student?.email || "Unknown",
        status: att.status,
        startedAt: att.started_at,
        submittedAt: att.submitted_at || "N/A",
        score: att.score !== undefined ? att.score : "N/A",
        maxScore: att.max_score,
        isGraded: att.is_graded ? "Yes" : "No",
        warningCount: att.warning_count || 0,
        incidentCount: incidents.length,
        answersMap: new Map(
          answers.map((a) => [`${version.id}:${a.question_id}`, a]),
        ),
      });
    }

    // Run RFC-compliant CSV serialization via Bounded Worker Pool
    return this.workerPool.runTask(
      `csv_${quizId}`,
      { quiz, questions: [...questionColumns.values()], rows },
      (data) => {
        const escape = (val: any) => {
          if (val === null || val === undefined) return '""';
          const raw = String(val);
          const str = (/^[=+@\-\t\r]/.test(raw) ? "'" + raw : raw).replace(
            /"/g,
            '""',
          );
          return `"${str}"`;
        };

        const header = [
          "Attempt ID",
          "Student Name",
          "Student Email",
          "Section",
          "Status",
          "Started At",
          "Submitted At",
          "Score",
          "Max Score",
          "Percentage",
          "Is Fully Graded",
          "Violation Warnings",
          ...data.questions.map(
            (q: any, i: number) =>
              `Q${i + 1} (${q.points}pts): ${q.prompt.slice(0, 30)}...`,
          ),
        ];

        const lines = [header.map(escape).join(",")];

        const orderedRows = data.rows.slice().sort(
          (a, b) =>
            a.sectionName.localeCompare(b.sectionName, "en", {
              sensitivity: "base",
              numeric: true,
            }) ||
            a.studentLastName.localeCompare(b.studentLastName, "en", {
              sensitivity: "base",
              numeric: true,
            }) ||
            a.studentName.localeCompare(b.studentName, "en", {
              sensitivity: "base",
              numeric: true,
            }) ||
            a.studentEmail.localeCompare(b.studentEmail) ||
            a.startedAt.localeCompare(b.startedAt) ||
            a.attemptId.localeCompare(b.attemptId),
        );
        for (const row of orderedRows) {
          const percentage =
            row.maxScore > 0 && typeof row.score === "number"
              ? `${((row.score / row.maxScore) * 100).toFixed(1)}%`
              : "N/A";

          const questionScores = data.questions.map((q: any) => {
            const ans = row.answersMap.get(q.id);
            return ans?.score_awarded !== undefined
              ? ans.score_awarded
              : "Unscored";
          });

          const line = [
            row.attemptId,
            row.studentName,
            row.studentEmail,
            row.sectionName,
            row.status,
            row.startedAt,
            row.submittedAt,
            row.score,
            row.maxScore,
            percentage,
            row.isGraded,
            row.warningCount,
            ...questionScores,
          ];

          lines.push(line.map(escape).join(","));
        }

        return lines.join("\n");
      },
    );
  }
}
