import {
  KOALA_OFFLINE_ANSWERS,
  buildQuestionCatalog,
  normalizeQuestion,
} from "./koala-offline";
import { KOALA_EXTRA_ANSWERS } from "./koala-extra";
export type HelpRole = "teacher" | "student";
export interface HelpAnswer {
  id: string;
  role: HelpRole | "both";
  question: string;
  answer: string;
  keywords: string;
  duringQuiz?: boolean;
}
// Product guidance only. Never include answer keys, credentials, or student records.
const common: [string, string, string, boolean?][] = [
  [
    "Who is Koala Help?",
    "I’m Koala, your QuizNa guide. I explain QuizNa and show read-only live reports for your account. I cannot change scores or solve exam questions.",
    "hello hi hey help assistant ai ishi",
  ],
  [
    "What is QuizNa?",
    "QuizNa brings online quizzes, printable paper exams, section records, and score review into one classroom workspace.",
    "about features app",
  ],
  [
    "Does Koala Help use paid AI?",
    "This helper uses built-in answers and needs no AI subscription. Handwritten essay suggestions are a separate feature with their own provider setup.",
    "free cost offline chatbot subscription",
  ],
  [
    "Can you see my grades or personal details?",
    "Live reports read only records your account can access. Teachers see their own classes; students see their own permitted results. I cannot access your camera or change grades.",
    "privacy data records personal",
  ],
  [
    "Are my questions sent to an AI service?",
    "Help questions are matched on your device. Live reports request authorized data from QuizNa’s server and refresh while open. No chat text or records are sent to an external AI provider.",
    "send store messages history provider",
  ],
  [
    "How do I sign out?",
    "Use the sign-out icon in the top navigation. On shared devices, sign out when you finish.",
    "logout log out signout",
  ],
  [
    "Can I use QuizNa on a phone or tablet?",
    "Yes. Pages adapt to phones and tablets. Use the Menu button for teacher navigation on smaller screens.",
    "mobile cellphone cp tablet responsive navigation",
  ],
  [
    "Why is a page not loading?",
    "Check your connection, then use the page’s Refresh or retry button. During an online quiz, avoid refreshing while answers are still saving.",
    "error blank loading refresh reload internet",
  ],
  [
    "How do I show or hide my password?",
    "Select the eye beside the password field on the sign-in or registration form. Select it again to hide the password.",
    "eye login password visible",
  ],
  [
    "Where is the quick guide?",
    "Use Quick guide in the top navigation. It has separate steps for teachers and students.",
    "tutorial instructions walkthrough guide",
  ],
  [
    "Can I sign in as teacher and student at once?",
    "Use separate browser profiles or a regular window and a private window. Two tabs in the same browser profile and site normally share one signed-in account.",
    "two accounts simultaneously both incognito private",
  ],
  [
    "I cannot sign in. What should I check?",
    "Check the email, password, and selected account. Passwords are case-sensitive. Ask the person managing your QuizNa installation if access still fails; I cannot reset passwords.",
    "login failed credentials register account",
  ],
  [
    "Can you answer my exam question?",
    "I can explain QuizNa controls and technical issues. I cannot provide exam answers or complete work for you. Ask your teacher about the question after the exam.",
    "solve homework cheating correct answer exam",
    true,
  ],
];
const teacher: [string, string, string][] = [
  [
    "How do I create a quiz?",
    "Open your subject, choose New quiz and add or paste questions at any time. Enter the details, select sections and choose Save quiz to store the draft. Review everything before publishing.",
    "create new make quiz exam",
  ],
  [
    "What is the difference between online and paper exams?",
    "Online exams run in QuizNa with a timer and saved answers. Paper exams use a printed question paper and QR answer sheets, which you scan and review before saving.",
    "online paper format difference",
  ],
  [
    "How do I create a reusable section?",
    "Open Subjects and choose New subject. In Section, choose an existing name or type a new one, then choose Create subject. A new section is saved for reuse; Sections shows its students and quizzes.",
    "create reusable section class",
  ],
  [
    "How do students join my section roster?",
    "Students are added to the section roster when they join a subject or start a quiz using that section’s quiz code. Joining another quiz in the same section does not create a second roster entry.",
    "automatic enrollment enrol duplicate roster add students",
  ],
  [
    "Does each section get a different quiz code?",
    "Yes. Use the code for the section assigned to that quiz. A reusable section can be linked to several quizzes; each quiz assignment has its own access code.",
    "different section access codes share",
  ],
  [
    "Where can I copy a section quiz code?",
    "Open Sections and choose the relevant quiz assignment, then copy its code. Share the code with that section’s students.",
    "copy section code classroom",
  ],
  [
    "How do I paste many questions at once?",
    "In the quiz editor or Paper Exam page, choose Paste questions. Paste your questions, choices, and answer key, review the organized preview, then add them.",
    "bulk import paste multiple choice abcd questions",
  ],
  [
    "What should I check after pasting questions?",
    "Check question types, choices, correct answers, points, and essay criteria in the preview. Fix missing or unclear answers before adding the questions.",
    "paste preview wrong answer key organized",
  ],
  [
    "Which question types are supported?",
    "You can add multiple choice, true/false, short answer, and essay questions.",
    "types mcq true false short essay",
  ],
  [
    "How do I set question points?",
    "Type the number directly in the Points field when editing the question. Review the total before publishing.",
    "points number value weight",
  ],
  [
    "How do I add essay criteria?",
    "Edit the essay question and set its rubric or criteria. Use the criteria when reviewing written responses so grading stays consistent.",
    "rubric criteria essay standards",
  ],
  [
    "How do I set the time limit?",
    "Set the quiz duration in the quiz settings before publishing. Online attempts use the server deadline, so refreshing does not give extra time.",
    "duration time limit countdown",
  ],
  [
    "How do I schedule quiz availability?",
    "Use the availability dates in the quiz settings. Review the opening and closing times before publishing.",
    "schedule open close available dates",
  ],
  [
    "How do attempt limits work?",
    "Set the allowed number of attempts in the quiz settings. The server checks the limit when a student starts a new attempt.",
    "attempt limits retake retry",
  ],
  [
    "Can I randomize questions and choices?",
    "Use the randomization settings in the quiz editor. Review them before publishing so students receive the intended question and option order.",
    "shuffle randomize randomization order choices",
  ],
  [
    "How do I publish a quiz?",
    "Review questions, answer keys, points, section, and settings. Choose Publish to make that version available.",
    "publish draft release exam",
  ],
  [
    "Will editing a quiz change an attempt already started?",
    "Each attempt uses a frozen published version. Later edits do not change the questions or scoring rules of that existing attempt.",
    "edit published frozen version existing attempts",
  ],
  [
    "Where can I monitor an online quiz?",
    "Choose Live monitor on the quiz card to see attempts, progress, and reported focus incidents.",
    "live monitoring progress dashboard",
  ],
  [
    "What do focus warnings mean?",
    "Tab hiding, window focus loss, and fullscreen exits are possible violations, not proof of cheating. Related events are deduplicated; the third incident finalizes saved answers.",
    "suspicious alt tab violations warnings cheating",
  ],
  [
    "How do I see who has not started?",
    "Open Sections, select your section, open the saved quiz, then choose Class list and Not started. The list can show students already known on that section’s roster.",
    "not started missing absent roster submitted status",
  ],
  [
    "How do I filter submitted or in-progress students?",
    "Open your section’s saved quiz, choose Class list, then tap Submitted or In progress. Tap All students to clear the status filter.",
    "submitted in progress counts filter status",
  ],
  [
    "How do I export class-list scores?",
    "Open the quiz inside its section, choose Class list and a status, then Export scores CSV. The export follows those filters and orders students by last name.",
    "class list csv export status alphabetical last name",
  ],
  [
    "Where can I see all scores for a section?",
    "Open Reports, choose Gradebook, and select a section. Each quiz has a column, with students ordered by last name and a total for teacher-confirmed scores.",
    "section gradebook totals table columns",
  ],
  [
    "How are gradebook totals calculated?",
    "Totals use the best teacher-confirmed score for each quiz. Review the student’s answers, save all grades, then select Confirm score. Corrected grades need confirmation again.",
    "gradebook total best score retakes graded",
  ],
  [
    "What is included in the gradebook CSV?",
    "The CSV contains student names, quiz scores such as 8/10, and totals. It exports the whole selected section in last-name order; the student search only filters the screen.",
    "gradebook export csv names email alphabetical totals",
  ],
  [
    "Can I grade directly from the gradebook?",
    "Yes. Select a score or Awaiting grading cell to open the relevant student’s answers and grading page.",
    "click score awaiting grading review gradebook",
  ],
  [
    "How do I grade an essay?",
    "Open Review answers, select the student, read the response and criteria, then enter the awarded score and feedback. Choose Save Grade after reviewing.",
    "manual grade essay written feedback save",
  ],
  [
    "When can students view their scores?",
    "Students see scores when your release settings allow them. Use the score-release control for the quiz; review the correct-answer release setting separately.",
    "release scores visible hide student results",
  ],
  [
    "How do I control correct-answer visibility?",
    "Use Release correct answers in the grading page. Releasing scores and showing answer keys are separate decisions.",
    "release correct answers answer keys visibility",
  ],
  [
    "Where can I find the leaderboard?",
    "Open Leaderboard in teacher navigation, then choose the quiz and section to compare available student scores.",
    "leaderboard rank highest score",
  ],
  [
    "What does question analysis show?",
    "Question analysis shows question-level results and common wrong responses. Use it to decide what topics to review with the class.",
    "analysis difficult questions wrong answers review",
  ],
  [
    "How do I assign a subject?",
    "Choose a subject in the quiz editor. Released, fully graded results are grouped by subject on the student’s Performance page.",
    "assign subject performance grouping",
  ],
  [
    "How do I prepare paper answer sheets?",
    "Open Print & scan for a Paper Exam, select its section and sheet size, then Prepare section. Select a student under Prepared sheets to print.",
    "prepare paper sheets students print section",
  ],
  [
    "How do I print the question paper and answer sheet?",
    "On Paper Exam, select a prepared sheet. Use Print question paper and Print answer sheet separately. Match the selected paper size and print at 100% scale.",
    "print question paper answer sheet scale long bond size",
  ],
  [
    "Can I fit the answer sheet on long bond paper?",
    "Choose Long bond · 8.5 × 13 in before preparing new sheets. Existing sheets retain their layout. Confirm the print preview fits the page without cropping markers or QR codes.",
    "long bond one page paper dimensions",
  ],
  [
    "How do I scan a paper answer sheet?",
    "Select Use camera or upload a sheet photo. Capture the complete page with its QR code and corner markers visible. Review detected answers before saving the result.",
    "scan camera qr ballpen bubbles shade marked answers",
  ],
  [
    "Why will my phone camera not open?",
    "Use HTTPS or localhost, allow the camera permission, and check that another app is not using the camera. On a phone, localhost refers to that phone, not your computer.",
    "camera permission https phone link secure",
  ],
  [
    "What if a scan reads an answer incorrectly?",
    "Use Review or correct answers to check unclear, blank, or multiple marks. Correct the detected answers to match the paper before saving.",
    "scan wrong blurry correction multiple blank marks",
  ],
  [
    "Can essays be graded automatically from a photo?",
    "When configured, Read essays with AI can transcribe handwriting and suggest criterion-based grades. Check the transcription and suggestions yourself and confirm before saving. The built-in Koala Help helper does not perform scanning.",
    "handwriting ai gemini openai essay suggestions",
  ],
  [
    "Will saving a paper result update student records?",
    "A saved paper result is linked to that student’s attempt. It appears in teacher records and on the student dashboard when score-release settings allow it. Essays may still need grading.",
    "save paper result dashboards update score",
  ],
];
const student: [string, string, string, boolean?][] = [
  [
    "How do I join an online quiz?",
    "Open My subjects and join with the subject code from your teacher. Open the subject to choose a quiz. For an individual quiz code, use Quiz code or previous activity. Read the instructions before starting.",
    "join access code online quiz",
  ],
  [
    "My quiz code is not working. What should I do?",
    "Check the code and ask your teacher whether the quiz is published and available. Use the correct section’s code. An attempt limit can also prevent a new start.",
    "invalid wrong code access attempt limit",
  ],
  [
    "Will I be added to my class automatically?",
    "Starting a quiz with your section’s code adds you to that teacher’s section roster. You do not need a second entry for another quiz in the same section.",
    "enroll section class roster automatic duplicate",
  ],
  [
    "Does opening the instructions start my timer?",
    "No. Reading the briefing does not consume an attempt or start the countdown. Start Quiz enters fullscreen and starts or resumes the attempt.",
    "instructions briefing timer before start",
  ],
  [
    "How do I start the quiz?",
    "Read the instructions and monitoring rules, tick the acknowledgment, then choose Start Quiz · Enter Fullscreen. Allow the browser to enter fullscreen.",
    "start fullscreen rules acknowledgment",
  ],
  [
    "How do I choose an answer?",
    "Tap the answer choice for multiple choice or true/false. Type directly in the answer field for short-answer and essay questions.",
    "choose select answer options radio",
    true,
  ],
  [
    "How do I move between questions?",
    "Use Previous, Next Question, or the numbered Question Navigator. Check your answers before submitting.",
    "next previous navigator move questions",
    true,
  ],
  [
    "How can I tell if my answer is saved?",
    "Watch the saving indicator above the questions. All answers saved means the queued answers have been acknowledged. If saving fails, reconnect and use Retry saving.",
    "autosave saving indicator saved retry",
    true,
  ],
  [
    "What happens if my internet disconnects?",
    "Your countdown continues. Keep the page open, reconnect, and let pending saves retry. Check the save indicator before submitting; the server can finalize only answers it received.",
    "disconnect internet offline reconnect connection",
    true,
  ],
  [
    "Can I refresh or resume my quiz?",
    "Use Resume Quiz from My quizzes while time remains. QuizNa restores the same attempt and server-saved answers; refreshing does not reset time or warnings. Avoid refreshing while saves are pending.",
    "resume refresh recovery return reload",
    true,
  ],
  [
    "Why did my timer not reset?",
    "QuizNa uses a server deadline. Refreshing, reconnecting, or closing the page does not restart the allotted time.",
    "timer reset deadline countdown time",
    true,
  ],
  [
    "What happens when time runs out?",
    "The attempt is finalized using answers saved on the server. The server can finalize an expired attempt even if the browser is closed.",
    "time expired timeout automatic submission",
    true,
  ],
  [
    "How do I submit my quiz?",
    "Choose Submit quiz, review the answered and unanswered counts, then confirm submission. Once submitted, answers cannot be changed.",
    "submit finish confirm unanswered",
    true,
  ],
  [
    "What happens if I switch tabs?",
    "Tab hiding, focus loss, or fullscreen exits may be recorded as possible violations. The first gives a warning, the second a final warning, and the third finalizes saved answers.",
    "alt tab switch warnings violation focus",
    true,
  ],
  [
    "Does a warning prove cheating?",
    "No. Browser focus changes are signals, not proof of cheating. Device prompts can trigger them. Tell your teacher about technical problems; QuizNa cannot monitor other devices.",
    "proof cheating suspicious limitations",
    true,
  ],
  [
    "I accidentally left fullscreen. What should I do?",
    "Use Return to fullscreen and follow the quiz rules. If a device prompt or technical issue caused it, let your teacher know after the attempt.",
    "exit fullscreen return restore warning",
    true,
  ],
  [
    "Can Koala Help solve the quiz for me?",
    "I can help with controls and technical issues only. I cannot provide correct answers, solve questions, or write your essay.",
    "solve correct answer write essay homework",
    true,
  ],
  [
    "Where do I see my results?",
    "Open My quizzes and select the result arrow beside a completed quiz. Scores appear only when your teacher releases them.",
    "results score marks dashboard",
  ],
  [
    "Why does my result say awaiting grading or release?",
    "Written responses may need teacher grading, or the teacher may be holding scores. Check again later or ask your teacher; I cannot release or change results.",
    "awaiting grading release missing score pending",
  ],
  [
    "Why can I not see the correct answers?",
    "Your teacher controls whether correct answers are released. Seeing your score does not always mean the answer key is available.",
    "correct answers hidden review key",
  ],
  [
    "How do I check my performance in each subject?",
    "Open Performance, then choose a subject card. Its page shows released quiz scores, the point-weighted percentage and a dated score-progress graph. Use All subjects to return.",
    "subject performance progress percentage",
  ],
  [
    "How is my subject percentage calculated?",
    "QuizNa uses your best released, fully graded result per quiz. Earned points are divided by possible points, so larger quizzes carry more weight. Pending or unreleased results do not contribute.",
    "weighted subject average calculate percentage totals",
  ],
  [
    "Will my paper exam score appear here?",
    "Yes, when the teacher saves the result linked to your account and releases the score. Essays may need to be graded before the full result is available.",
    "paper exam result student dashboard score",
  ],
  [
    "Can I retake a quiz?",
    "That depends on your teacher’s attempt limit and availability settings. If another attempt is allowed, use the quiz’s access code again.",
    "retake retry attempt limit",
  ],
];
export const ISHI_ANSWERS: HelpAnswer[] = [
  ...common.map(([question, answer, keywords, duringQuiz], i) => ({
    id: `common-${i}`,
    role: "both" as const,
    question,
    answer,
    keywords,
    duringQuiz,
  })),
  ...teacher.map(([question, answer, keywords], i) => ({
    id: `teacher-${i}`,
    role: "teacher" as const,
    question,
    answer,
    keywords,
  })),
  ...student.map(([question, answer, keywords, duringQuiz], i) => ({
    id: `student-${i}`,
    role: "student" as const,
    question,
    answer,
    keywords,
    duringQuiz,
  })),
  ...KOALA_EXTRA_ANSWERS,
  ...KOALA_OFFLINE_ANSWERS,
];
const stop = new Set(
  "a an the how do does i my me you your can is are to of for in on it with what where when why will we be this that and or please tell about kindly would could teacher student quizna koala help explain simple using need want show also understand please ako akoa akong nako palihug sa ug og ang mga ra jud lang pud".split(
    " ",
  ),
);
const aliases: Record<string, string> = {
  asnwer: "answer",
  asnwers: "answer",
  answr: "answer",
  savng: "saving",
  sction: "section",
  secton: "section",
  sectons: "section",
  seccion: "section",
  studnet: "student",
  studnets: "student",
  cp: "phone",
  cellphone: "phone",
  enrol: "enrollment",
  enroll: "enrollment",
  enrolment: "enrollment",
  signin: "login",
  loggin: "login",
  pasword: "password",
  qrscan: "scan",
  mcq: "choice",
  tf: "false",
  unsave: "unsaved",
  nagtubag: "answering",
  grado: "grade",
  sectionb: "section",
};
function closeWord(a: string, b: string) {
  if (a.length < 5 || Math.abs(a.length - b.length) > 1) return false;
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(
        next[j - 1] + 1,
        row[j] + 1,
        row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    if (Math.min(...next) > 1) return false;
    row = next;
  }
  return row[b.length] <= 1;
}
function words(value: string) {
  return [
    ...new Set(
      value
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .split(" ")
        .filter((w) => w && !stop.has(w))
        .map((w) => aliases[w] || w)
        .map((w) => (w.length > 4 ? w.replace(/s$/, "") : w)),
    ),
  ];
}
export function helpFor(role: HelpRole, duringQuiz = false) {
  return ISHI_ANSWERS.filter(
    (a) =>
      (a.role === role || a.role === "both") && (!duringQuiz || a.duringQuiz),
  );
}

export const KOALA_QUESTION_CATALOG = buildQuestionCatalog(ISHI_ANSWERS);
interface SearchEntry {
  item: HelpAnswer;
  title: string[];
  tags: string[];
  phrases: string[][];
}
const indexCache = new Map<
  string,
  {
    entries: SearchEntry[];
    exact: Map<string, HelpAnswer[]>;
    vocabulary: string[];
  }
>();
function searchIndex(role: HelpRole, duringQuiz: boolean) {
  const key = `${role}:${duringQuiz}`;
  const cached = indexCache.get(key);
  if (cached) return cached;
  const allowed = helpFor(role, duringQuiz);
  const ids = new Set(allowed.map((item) => item.id));
  const phrases = KOALA_QUESTION_CATALOG.filter((p) => ids.has(p.answerId));
  const byId = new Map(allowed.map((item) => [item.id, item]));
  const exact = new Map<string, HelpAnswer[]>();
  for (const phrase of phrases) {
    const normalized = normalizeQuestion(phrase.question);
    const found = exact.get(normalized) || [];
    const item = byId.get(phrase.answerId)!;
    if (!found.some((a) => a.id === item.id)) found.push(item);
    exact.set(normalized, found);
  }
  const entries = allowed.map((item) => ({
    item,
    title: words(item.question),
    tags: words(item.keywords),
    phrases: phrases
      .filter((p) => p.answerId === item.id)
      .map((p) => words(p.question)),
  }));
  const vocabulary = [
    ...new Set(
      entries.flatMap((entry) => [
        ...entry.title,
        ...entry.tags,
        ...entry.phrases.flat(),
      ]),
    ),
  ];
  const index = { entries, exact, vocabulary };
  indexCache.set(key, index);
  return index;
}
export function findHelp(
  query: string,
  role: HelpRole,
  duringQuiz = false,
): HelpAnswer[] {
  const bounded = query.slice(0, 300);
  const allowed = helpFor(role, duringQuiz);
  const canonical = allowed.find(
    (item) => normalizeQuestion(item.question) === normalizeQuestion(bounded),
  );
  if (canonical) return [canonical];
  const index = searchIndex(role, duringQuiz);
  const exact = index.exact.get(normalizeQuestion(bounded));
  if (exact?.length) return exact;
  const terms = words(bounded)
    .slice(0, 40)
    .map((term) => {
      if (index.vocabulary.includes(term)) return term;
      const candidates = index.vocabulary.filter((word) =>
        closeWord(term, word),
      );
      return candidates.length === 1 ? candidates[0] : term;
    });
  if (!terms.length) return [];
  return index.entries
    .map(({ item, title, tags, phrases }) => {
      const titleMatch = Math.max(
        ...[title, ...phrases].map(
          (phrase) => terms.filter((t) => phrase.includes(t)).length,
        ),
      );
      const matched = terms.filter(
        (t) =>
          title.includes(t) ||
          tags.includes(t) ||
          phrases.some((p) => p.includes(t)),
      ).length;
      return {
        item,
        score: (titleMatch * 2 + matched) / terms.length,
        matched,
      };
    })
    .filter(
      (r) =>
        r.matched > 0 &&
        r.score >= 0.8 &&
        (r.matched >= 2 || terms.length <= 2),
    )
    .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
    .slice(0, 5)
    .map((r) => r.item);
}
/** Broad prompts need a choice rather than an arbitrary automatic answer. */
export function needsHelpChoice(query: string, matches: HelpAnswer[]) {
  if (matches.length < 2) return false;
  if (
    matches.some(
      (item) => normalizeQuestion(item.question) === normalizeQuestion(query),
    )
  )
    return false;
  return words(query).length <= 1;
}
