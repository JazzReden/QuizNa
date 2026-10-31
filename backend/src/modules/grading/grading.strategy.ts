import { Question } from "../../common/types";

export interface GradingResult {
  scoreAwarded: number;
  isAutoGraded: boolean;
  isCorrect: boolean;
}

export interface IGradingStrategy {
  grade(question: Question, studentAnswer: any): GradingResult;
}

export class McqGradingStrategy implements IGradingStrategy {
  grade(question: Question, studentAnswer: any): GradingResult {
    if (studentAnswer === undefined || studentAnswer === null) {
      return { scoreAwarded: 0, isAutoGraded: true, isCorrect: false };
    }

    const expected = question.correct_answer;
    let isCorrect = false;

    if (Array.isArray(expected)) {
      // Multiple select
      const studentArr = Array.isArray(studentAnswer)
        ? studentAnswer
        : [studentAnswer];
      const sortedExpected = [...expected].sort().join(",");
      const sortedStudent = [...studentArr].sort().join(",");
      isCorrect = sortedExpected === sortedStudent;
    } else {
      // Single select
      isCorrect = String(studentAnswer).trim() === String(expected).trim();
    }

    return {
      scoreAwarded: isCorrect ? question.points : 0,
      isAutoGraded: true,
      isCorrect,
    };
  }
}

export class TrueFalseGradingStrategy implements IGradingStrategy {
  grade(question: Question, studentAnswer: any): GradingResult {
    if (studentAnswer === undefined || studentAnswer === null) {
      return { scoreAwarded: 0, isAutoGraded: true, isCorrect: false };
    }

    const expected = question.correct_answer;
    let isCorrect = false;

    if (typeof expected === "boolean") {
      const boolStudent =
        studentAnswer === true ||
        studentAnswer === "true" ||
        studentAnswer === "opt_true";
      const valid = [
        true,
        false,
        "true",
        "false",
        "opt_true",
        "opt_false",
      ].includes(studentAnswer);
      isCorrect = valid && boolStudent === expected;
    } else {
      isCorrect =
        String(studentAnswer).toLowerCase() === String(expected).toLowerCase();
    }

    return {
      scoreAwarded: isCorrect ? question.points : 0,
      isAutoGraded: true,
      isCorrect,
    };
  }
}

export class ShortAnswerGradingStrategy implements IGradingStrategy {
  grade(question: Question, studentAnswer: any): GradingResult {
    if (!studentAnswer || typeof studentAnswer !== "string") {
      return { scoreAwarded: 0, isAutoGraded: true, isCorrect: false };
    }

    const normalizedStudent = studentAnswer.trim().toLowerCase();
    const expected = question.correct_answer;
    let isCorrect = false;

    if (Array.isArray(expected)) {
      isCorrect = expected.some(
        (val) => String(val).trim().toLowerCase() === normalizedStudent,
      );
    } else if (typeof expected === "string") {
      isCorrect = expected.trim().toLowerCase() === normalizedStudent;
    }

    return {
      scoreAwarded: isCorrect ? question.points : 0,
      isAutoGraded: true,
      isCorrect,
    };
  }
}

export class EssayGradingStrategy implements IGradingStrategy {
  grade(_question: Question, _studentAnswer: any): GradingResult {
    // Essays cannot be automatically fully graded objective-style; require manual teacher assessment
    return {
      scoreAwarded: 0,
      isAutoGraded: false,
      isCorrect: false,
    };
  }
}
