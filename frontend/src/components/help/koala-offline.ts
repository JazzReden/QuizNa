import type { HelpAnswer, HelpRole } from "./ishi-knowledge";

type Topic = readonly [
  HelpRole | "both",
  string,
  string,
  string,
  readonly string[],
  boolean?,
];
// These are product answers, not generated facts. Phrasings share a reviewed answer.
const topics: Topic[] = [
  [
    "teacher",
    "How do subjects and sections fit together?",
    "A section groups students. A subject belongs to a section and holds its quizzes. Open the subject to create or open a quiz, then use that quiz’s Class list and Analysis. Reports contains Gradebook and Leaderboard.",
    "organize subject section relationship workspace",
    [
      "unsa kalahi sa subject ug section",
      "How should I organize my classes and subjects?",
      "Where do subjects fit in a section?",
    ],
  ],
  [
    "teacher",
    "Where do I create a quiz for a subject?",
    "Open Subjects, choose the subject, then select New quiz. QuizNa keeps the subject and section context so the saved quiz appears in that workspace.",
    "subject new quiz create inside assigned",
    [
      "himo quiz sulod sa subject",
      "Create an exam under my subject",
      "Where is new quiz inside a subject?",
    ],
  ],
  [
    "teacher",
    "Why is a quiz missing from this subject?",
    "Check that you opened the right subject and section. Clear the quiz search and status filter. If the quiz exists elsewhere, use Add an existing quiz only when it is assigned to the same section and belongs to your account.",
    "missing quiz subject search status attach",
    [
      "dili makita akong quiz sa subject",
      "My saved exam is not in this subject",
      "Why is my subject empty after saving?",
    ],
  ],
  [
    "teacher",
    "What does the subject code let students do?",
    "Students enter the subject code on My subjects to join that subject and its section roster. They can then open published quizzes there. A subject code is different from an individual section quiz code.",
    "subject code enrollment difference join published",
    [
      "subject code versus quiz code",
      "unsa gamit sa subject code",
      "Which code should I share for my subject?",
    ],
  ],
  [
    "teacher",
    "How do I open one student's answers without the others?",
    "Open the quiz’s Class list, find the student and select Review answers. The focused review shows that student’s answers. Use Back to class list to return to the same quiz context.",
    "single student review answers focused back",
    [
      "Bea ra nga answers akong tanawon",
      "Review only one learner",
      "Where is back to class list?",
    ],
  ],
  [
    "teacher",
    "Why is a fully graded result absent from gradebook totals?",
    "Gradebook totals require teacher confirmation as well as completed grading. Open the student’s review, finish any missing grades, then confirm the result. Recheck the section filter before exporting.",
    "graded missing gradebook confirmed approve total",
    [
      "graded pero wala sa gradebook",
      "How do I approve a result for the gradebook?",
      "A completed mark is not counted in the total",
    ],
  ],
  [
    "teacher",
    "Why must I confirm a result again after correcting it?",
    "Changing a grade revokes the old confirmation so an unreviewed correction does not enter the gradebook. Review the updated total and confirm the result again.",
    "correction changed grade revoked confirmation approve",
    [
      "edited grade needs confirmation again",
      "ngano confirm usab ang score",
      "Does correcting a mark remove approval?",
    ],
  ],
  [
    "teacher",
    "Can I export just students who have not started?",
    "In the quiz’s Class list, select the section and Not started status, then export CSV. The export follows the selected status and section and keeps students alphabetical by last name.",
    "csv export not started status section alphabetical",
    [
      "export wala pa nagsugod",
      "Download only not started students",
      "Does CSV respect my selected status?",
    ],
  ],
  [
    "teacher",
    "How do I interpret common wrong answers?",
    "Open the quiz’s Analysis and look for questions with low scores and repeated wrong choices. Use those patterns to plan a review. Written answers may still need grading; the report cannot explain a student’s reasoning by itself.",
    "analysis common wrong difficult review reteach",
    [
      "which topics should I reteach",
      "asa nga questions sila naglisod",
      "What should I review after question analysis?",
    ],
  ],
  [
    "teacher",
    "Can I compare a learner’s marks in the section gradebook?",
    "Choose the section in Gradebook to see students by last name, quiz score columns and totals. Open a score or Awaiting grading cell to review the relevant attempt. Only confirmed, fully graded results count in totals.",
    "gradebook table excel columns learner compare",
    [
      "table scores like excel",
      "tanawon tanan quiz score sa usa ka student",
      "Where can I record multiple quiz scores together?",
    ],
  ],
  [
    "teacher",
    "Why is the leaderboard hidden from students?",
    "Subject leaderboards stay hidden until you enable Student visibility in that subject. Even when enabled, only eligible confirmed and released scores appear. Review score-release settings separately.",
    "subject leaderboard hidden visibility confirmed released",
    [
      "students cannot see subject ranking",
      "ipakita ang ranking sa students",
      "How do I open my subject leaderboard?",
    ],
  ],
  [
    "teacher",
    "Can Koala confirm grades or publish quizzes for me?",
    "No. Koala explains the controls and shows read-only permitted reports. You must review and confirm results, publish quizzes and change settings yourself.",
    "koala action confirm publish automate modify",
    [
      "approve all marks for me",
      "ikaw publish sa quiz",
      "Can the helper change classroom settings?",
    ],
  ],
  [
    "teacher",
    "What should I check before saving a scan?",
    "Check the displayed student, section, exam and page, then compare the detected choices with the sheet. Correct uncertain answers and complete any essay grading before confirming the final result.",
    "scan checklist identity section page review save",
    [
      "before save scanned result checklist",
      "unsa tanawon before save scan",
      "How do I avoid saving a scan to the wrong student?",
    ],
  ],
  [
    "teacher",
    "Can a blank or double-shaded bubble be trusted automatically?",
    "Review blank or multiple-mark answers against the original sheet. Do not assume an uncertain scan is correct. Correct the detected answer when appropriate, following your exam rules, before saving.",
    "bubble double shaded blank uncertain ambiguous",
    [
      "two bubbles shaded",
      "duha na shade nga answer",
      "What if the scanner sees more than one option?",
    ],
  ],
  [
    "teacher",
    "How should I grade essays consistently?",
    "Use the same criteria and point limits for every student. Compare the response with each criterion, record the awarded marks and helpful feedback, then review the total before confirming. Koala does not award marks.",
    "essay consistent fair rubric criteria points",
    [
      "fair essay grading tips",
      "unsaon patas nga pag grade sa essay",
      "How can I reduce inconsistency when marking essays?",
    ],
  ],
  [
    "teacher",
    "Can I reuse a section next time without entering students again?",
    "Yes. Create the section once and select it for later subjects and quizzes. Students use their existing accounts; joining a subject or starting another quiz in the same section should not duplicate their roster membership.",
    "reuse next section roster existing students deduplicate",
    [
      "same students next examination",
      "dili na mag add students kada quiz",
      "Reuse last week's class roster",
    ],
  ],
  [
    "student",
    "How do I join a subject from My subjects?",
    "Enter the subject code your teacher shared and choose Join subject. The subject card appears on My subjects. Open it to see its published quizzes and available results.",
    "join subject code card enrolled",
    [
      "asa ibutang ang subject code",
      "How do I add my teacher's subject?",
      "I want to join our subject",
    ],
  ],
  [
    "student",
    "Why does a subject show no quizzes yet?",
    "Your teacher may not have published or assigned a quiz to that subject yet. Check that you opened the correct subject and refresh the page. Ask your teacher if a quiz should already be available.",
    "subject empty quiz missing published",
    [
      "walay quiz sulod sa subject",
      "Joined class but no exams",
      "Where are my subject's activities?",
    ],
  ],
  [
    "student",
    "Which subject should I open to see my progress?",
    "Open Performance and choose the subject card you want. Its page shows your available scores, weighted percentage and score-progress graph. Use All subjects to return to the list.",
    "performance subject card choose progress",
    [
      "unsaon pag open sa graph sa subject",
      "Where is my progress chart?",
      "Open only my Science performance",
    ],
  ],
  [
    "student",
    "What does an upward performance line mean?",
    "The next dated, released quiz percentage is higher than the previous point. The graph compares quiz percentages; it does not prove that the quizzes had the same difficulty. Check the score table for each result.",
    "graph up improvement increasing trend higher",
    [
      "nisaka akong graph unsa meaning",
      "Why is my performance line going up?",
      "Does a rising line mean I improved?",
    ],
  ],
  [
    "student",
    "What does a downward performance line mean?",
    "The next dated, released quiz percentage is lower than the previous point. Review that quiz’s available feedback and ask your teacher what to practice. One lower result does not describe all your ability.",
    "graph down declining lower trend decrease",
    [
      "niubos akong graph",
      "Why did my line go down?",
      "Does a falling score mean I am failing everything?",
    ],
  ],
  [
    "student",
    "Why does my graph need more results?",
    "A trend needs at least two dated, released, fully graded quiz results. With one result, Koala cannot infer improvement or decline. Pending or withheld results are not plotted.",
    "graph one point more results trend missing",
    [
      "only one dot in performance",
      "wala pay trend sa graph",
      "Why is there no up or down indicator?",
    ],
  ],
  [
    "student",
    "What is a percentage-point change?",
    "It is the difference between two percentages. A score moving from 50% to 80% rises by 30 percentage points. This is different from the subject’s point-weighted average.",
    "percentage points difference graph delta change",
    [
      "50 to 80 why 30",
      "unsa nang percentage points",
      "Explain the up 30 points label",
    ],
  ],
  [
    "student",
    "Why is my subject average different from my latest score?",
    "The subject average combines earned points and possible points from your counted quiz results. Your latest percentage belongs to one quiz. Quizzes with more possible points have more weight in the subject average.",
    "weighted average latest score different percentage",
    [
      "latest score not same as average",
      "ngano lahi akong average ug last score",
      "Why is my subject average not the simple mean?",
    ],
  ],
  [
    "student",
    "What order does the performance graph use?",
    "The graph orders eligible quiz results by completion date, not quiz title. Each point represents the counted released result for one quiz. Read the score table for titles and dates.",
    "graph date chronological order x axis points",
    [
      "what are the numbers below the graph",
      "unsa order sa line graph",
      "Is the chart alphabetical?",
    ],
  ],
  [
    "student",
    "Why does a result say Subject not set?",
    "That quiz has no subject label assigned by the teacher. Its released result remains available in the unassigned group. Ask your teacher to check the quiz’s subject; you cannot change it from your student account.",
    "subject not set unassigned unknown label",
    [
      "subject not set meaning",
      "walay subject akong result",
      "Can I assign a subject to my own score?",
    ],
  ],
  [
    "student",
    "Can I see other students' private results?",
    "No. Your results and performance show only your permitted records. A subject leaderboard is available only if your teacher opens it, and it does not give you access to other students’ saved answers.",
    "other student privacy scores answers leaderboard",
    [
      "show my classmates answers",
      "makita nako grades sa uban",
      "Can I review another student's attempt?",
    ],
  ],
  [
    "student",
    "Where can I read feedback for a released result?",
    "Open the quiz result from your subject or Performance score table. Read the feedback your teacher has made available. Correct answers can remain hidden even when your score is released.",
    "feedback review comments released result",
    [
      "asa makita teacher feedback",
      "Where are my teacher's comments?",
      "How do I review my mistakes after an exam?",
    ],
  ],
  [
    "student",
    "Can I switch accounts while a quiz is running?",
    "Keep the quiz open in the account that started it. Switching accounts can interrupt access and saving; it does not pause the server timer. If you used the wrong account, tell your teacher rather than creating another attempt.",
    "switch account active quiz wrong login save",
    [
      "wrong account during exam",
      "pwede change account samtang quiz",
      "Can I sign out and use another student account?",
    ],
    true,
  ],
  [
    "student",
    "Should I submit while answers are still saving?",
    "Wait for the saving indicator to confirm your answers when time allows. If saving fails, keep the page open, reconnect and retry. At the deadline, only answers received by the server can be finalized.",
    "submit saving pending unsaved indicator wait",
    [
      "still saving should I submit",
      "wala pa na save akong answer",
      "What if saving is pending near the deadline?",
    ],
    true,
  ],
  [
    "student",
    "Who should I contact about a warning I think is wrong?",
    "Tell your teacher the quiz title, time and what happened. Browser focus events can have legitimate causes and are only possible violations. Koala cannot remove warnings or reopen a finalized attempt.",
    "warning appeal wrong focus incident teacher review",
    [
      "false warning help",
      "sayop nga warning kinsa duolon",
      "Can Koala remove my tab warning?",
    ],
    true,
  ],
  [
    "student",
    "Can I join another subject with the same account?",
    "Yes. Keep your own account and enter the code for each subject your teachers share. Check the subject title and section before starting a quiz.",
    "multiple subject same account join code",
    [
      "two subjects one login",
      "usa ka account daghang subjects",
      "Do I need a new account for each subject?",
    ],
  ],
  [
    "both",
    "Why does QuizNa say Forbidden for a subject?",
    "The signed-in account may not own or belong to that subject. Return to your own subject list and open a card there. If you meant to use another account, sign out and sign in with that account; Koala cannot grant access.",
    "forbidden subject permission unauthorized account",
    [
      "forbidden meaning",
      "dili ko kasulod sa subject",
      "Why does an old subject link deny access?",
    ],
  ],
  [
    "both",
    "How can I make my password safer?",
    "Use a long unique password and keep it private. Do not share accounts or send passwords to Koala. Sign out on shared devices and ask your administrator about any account you believe was accessed without permission.",
    "security password safe protect account",
    [
      "unsaon pag secure sa account",
      "Should classmates share a login?",
      "How can I protect my QuizNa account?",
    ],
  ],
  [
    "both",
    "Can Koala work without a chat subscription?",
    "Yes. Koala’s built-in question matching runs in your browser without an external chat API. Live records still need a connection to QuizNa’s server. Koala does not have general internet knowledge.",
    "offline no api instant subscription local help",
    [
      "koala without gemini",
      "no api instant answers",
      "maka answer si koala offline?",
    ],
  ],
  [
    "both",
    "What should I do when Koala does not understand me?",
    "Use a short QuizNa topic, such as subject code, saving answers or exporting scores. Choose a matching suggested question, or open Browse help. For a private account or grading decision, contact your teacher or administrator.",
    "unknown clarification rephrase understand help",
    [
      "wala ka kasabot sa akong question",
      "Why did Koala give an unrelated answer?",
      "How do I ask clearer questions?",
    ],
  ],
  [
    "both",
    "Can I trust a browser warning as proof of cheating?",
    "No. Hidden tabs, focus loss and fullscreen exits are possible-violation signals with limitations. They do not prove intent or show what happened on another device. Teachers should review the context.",
    "monitoring limitations proof accusation false positive",
    [
      "does alt tab always mean cheating",
      "proof ba cheating ang tab switch",
      "Can QuizNa detect another phone?",
    ],
  ],
  [
    "both",
    "How can I study a difficult topic before a quiz?",
    "Break it into small ideas, test yourself without looking at notes, and explain the idea in your own words. Revisit errors and ask your teacher about the parts you cannot explain. Koala can give study guidance, not an active exam answer.",
    "study difficult topic revision recall practice",
    [
      "how to review effectively",
      "unsaon pag study maayo",
      "I struggle remembering lessons",
    ],
  ],
  [
    "both",
    "Why should I avoid sharing a screenshot with private details?",
    "A screenshot can include names, grades or account details. Share only the part needed to explain the issue, cover private information, and never include a password or API key.",
    "screenshot privacy sensitive share support",
    [
      "what should I hide in a bug screenshot",
      "pwede send screenshot sa grades",
      "Should I include my password in a problem report?",
    ],
  ],
  [
    "both",
    "Does changing dark mode change quiz results?",
    "No. The workspace theme changes appearance only. It does not change saved answers, scores, deadlines or permissions. Use the theme control in your teacher or student workspace.",
    "dark theme light mode scores appearance",
    [
      "dark mode affects grades",
      "ma change score if dark mode",
      "Where can I change workspace appearance?",
    ],
  ],
  [
    "teacher",
    "Can I export only submitted students?",
    "Open the quiz’s Class list, select the section, and choose Submitted. Export CSV to download that filtered group in last-name order. Gradebook export is a separate section score table.",
    "export submitted csv status section only",
    [
      "download completed students only",
      "export ang naka submit ra",
      "Where is the CSV for submitted students?",
    ],
  ],
  [
    "teacher",
    "Can I export only students who are still answering?",
    "Open the quiz’s Class list, select the section, and choose In progress. Export CSV follows those selected filters. The students’ attempts continue normally; exporting does not submit or stop them.",
    "export in progress answering csv status section",
    [
      "download in progress students only",
      "export ang nagtubag pa",
      "Export only ongoing attempts",
    ],
  ],
  [
    "teacher",
    "How do I require a quiz code?",
    "In the quiz editor, choose Require quiz code under Quiz entry and save. Share the published quiz’s section code; students enter it before the instructions. Choose No code required if students in the subject should open the quiz directly. This uses the existing quiz code, not a separate password.",
    "require password quiz code entry protected optional",
    [
      "Can I put a password on a quiz?",
      "pa enter code before exam",
      "How can I turn off the quiz code prompt?",
    ],
  ],
  [
    "student",
    "Why do I need a code after joining a subject?",
    "Your teacher can require an extra quiz code even after you join the subject. Enter the quiz code they shared, not the SUB subject code. Checking the code and reading instructions do not start your attempt or timer; Start Quiz does.",
    "subject joined still need quiz code password prompt",
    [
      "naka join nako ngano code pa",
      "Why does Take quiz ask for a password?",
      "Where do I enter the exam code?",
    ],
  ],
];
export const KOALA_OFFLINE_ANSWERS: HelpAnswer[] = topics.map(
  ([role, question, answer, keywords, , duringQuiz], index) => ({
    id: `offline-${index}`,
    role,
    question,
    answer,
    keywords,
    duringQuiz,
  }),
);
export interface QuestionPhrase {
  question: string;
  answerId: string;
  role: HelpAnswer["role"];
  duringQuiz?: boolean;
}
export const normalizeQuestion = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Finite, inspectable question variations, not 1,000 invented product features. */
export function buildQuestionCatalog(answers: HelpAnswer[]): QuestionPhrase[] {
  const catalog: QuestionPhrase[] = [];
  const seen = new Set<string>();
  for (const answer of answers) {
    const q = answer.question;
    const variants = [
      q,
      `Koala, ${q}`,
      `Please help: ${q}`,
      `${q} Please explain.`,
      `${q} Keep it simple.`,
      `I need help. ${q}`,
      `${q} Can you help me?`,
      `${q} I am using QuizNa.`,
    ];
    const how = q.match(/^How (?:do|can) I (.+)\?$/i);
    if (how)
      variants.push(
        `How to ${how[1]}?`,
        `Help me ${how[1]}.`,
        `I want to ${how[1]}.`,
        `Show me how to ${how[1]}.`,
      );
    const index = KOALA_OFFLINE_ANSWERS.findIndex((a) => a.id === answer.id);
    if (index >= 0) variants.push(...topics[index][4]);
    for (const question of variants) {
      const key = `${answer.role}:${normalizeQuestion(question)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      catalog.push({
        question,
        answerId: answer.id,
        role: answer.role,
        duringQuiz: answer.duringQuiz,
      });
    }
  }
  return catalog;
}
