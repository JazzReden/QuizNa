export type LiveTopic =
  | "submissions"
  | "not_submitted"
  | "not_started"
  | "in_progress"
  | "grading"
  | "leaderboard"
  | "gradebook"
  | "results"
  | "performance";
export interface LivePlan {
  topic: LiveTopic;
  quizId?: string;
  sectionId?: string;
  classId?: string;
}
export interface LiveReport {
  topic: string;
  title: string;
  summary: string;
  rows: { name: string; detail: string }[];
  checkedAt: string;
  total: number;
  truncated: boolean;
}
export interface LiveOptions {
  quizzes: {
    id: string;
    title: string;
    sections: { id: string; name: string; classId: string | null }[];
  }[];
}
export const liveLabels: Record<LiveTopic, string> = {
  submissions: "Who submitted?",
  not_submitted: "Who hasn’t submitted?",
  not_started: "Who hasn’t started?",
  in_progress: "Who is answering?",
  grading: "What needs grading?",
  leaderboard: "Highest scores",
  gradebook: "Section totals",
  results: "My latest scores",
  performance: "My subject performance",
};
/** Explicit read-only report intents. How-to questions continue using product help. */
export function liveIntent(
  text: string,
  role: "teacher" | "student",
): LiveTopic | null {
  const q = text.toLowerCase().replace(/[’']/g, "");
  if (
    /^\s*(how (do|can|to|should|is|are)|why|where|what does|can i|unsaon|ngano|asa)\b/.test(
      q,
    )
  )
    return null;
  if (role === "teacher" && /kinsa|kinsay/.test(q)) {
    if (/wala|wapa/.test(q) && /nagsugod|sugod|started/.test(q))
      return "not_started";
    if (/wala|wapa/.test(q) && /submit/.test(q)) return "not_submitted";
    if (/nagtubag|answering/.test(q)) return "in_progress";
    if (/submit/.test(q)) return "submissions";
  }
  if (role === "student" && /ipakita|tanawa/.test(q) && /akong|akoa/.test(q)) {
    if (/performance|average/.test(q)) return "performance";
    if (/grado|score|result/.test(q)) return "results";
  }
  if (role === "student") {
    if (
      /\b(my|show|latest|overall)\b/.test(q) &&
      /performance|average|overall/.test(q)
    )
      return "performance";
    if (/\b(my|show|latest)\b/.test(q) && /score|result|grade/.test(q))
      return "results";
    return null;
  }
  if (
    /who|show|list|which|what|highest|leaderboard|section totals|how many/i.test(
      q,
    )
  ) {
    if (/not submitted|hasnt submitted|havent submitted/.test(q))
      return "not_submitted";
    if (/not started|hasnt started|havent started|missing/.test(q))
      return "not_started";
    if (/in progress|still answering|is answering|are answering/.test(q))
      return "in_progress";
    if (/need.*grad|awaiting grad|pending grad|ungraded/.test(q))
      return "grading";
    if (/highest|leaderboard|top score/.test(q)) return "leaderboard";
    if (/gradebook|section total/.test(q)) return "gradebook";
    if (/submitted|finished/.test(q)) return "submissions";
  }
  return null;
}
/** One bounded batch at a time. Pauses offline/hidden; no requests after cleanup. */
export function startIshiRefresh<T>(options: {
  load: (signal: AbortSignal) => Promise<T>;
  apply: (data: T) => void;
  error: (error: unknown) => void;
  canRun?: () => boolean;
}) {
  let stopped = false,
    busy = false,
    timer: ReturnType<typeof setTimeout> | undefined,
    request: AbortController | undefined;
  const canRun = options.canRun || (() => !document.hidden && navigator.onLine);
  const schedule = (ms = 15000) => {
    if (!stopped) timer = setTimeout(() => void tick(), ms);
  };
  const tick = async () => {
    if (stopped || busy) return;
    if (timer) clearTimeout(timer);
    if (!canRun()) {
      schedule();
      return;
    }
    busy = true;
    request = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let delay = 15000;
    try {
      const data = await Promise.race([
        options.load(request.signal),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            request?.abort();
            reject(new Error("Live report timed out. Please try again."));
          }, 20000);
        }),
      ]);
      if (!stopped && !request.signal.aborted) options.apply(data);
    } catch (error) {
      request?.abort();
      if (!stopped) {
        options.error(error);
        const status = (error as { status?: number })?.status;
        if (status === 401 || status === 403) stopped = true;
        delay = status === 429 ? 60000 : 30000;
      }
    } finally {
      if (timeout) clearTimeout(timeout);
      busy = false;
      schedule(delay);
    }
  };
  const wake = () => {
    if (canRun()) void tick();
  };
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("online", wake);
  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    request?.abort();
    document.removeEventListener("visibilitychange", wake);
    window.removeEventListener("online", wake);
  };
}
