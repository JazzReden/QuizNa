import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Monitor,
  ScanLine,
  BookOpen,
  GraduationCap,
} from "lucide-react";
import {
  PublicHeader,
  PublicFooter,
} from "../../components/common/PublicLayout";
import "../../styles/public-pages.css";

const teacherSteps = [
  [
    "Create a section",
    "Create your class in Sections, then create a subject for it on Subjects.",
  ],
  [
    "Build your quiz",
    "Open your subject and choose New quiz. Select Online Exam or Paper Exam, add questions, and set answers and essay criteria.",
  ],
  [
    "Publish and share",
    "Publish your quizzes and share the subject code. Open the subject leaderboard whenever you’re ready.",
  ],
];
const studentSteps = [
  [
    "Create your account",
    "Choose Student when registering, then sign in with your email and password.",
  ],
  [
    "Get ready",
    "Enter your teacher’s subject code on My subjects. Open the subject to find quizzes and released results.",
  ],
];
function Steps({ items }: { items: string[][] }) {
  return (
    <ol className="qg-steps">
      {items.map(([title, text], index) => (
        <li key={title}>
          <span className="qg-step-number" aria-hidden="true">
            {String(index + 1).padStart(2, "0")}
          </span>
          <div>
            <h3>{title}</h3>
            <p>{text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
export function GuidePage() {
  const [params] = useSearchParams();
  const student = params.get("role") === "student";
  return (
    <div className="qn-landing">
      <PublicHeader />
      <div id="public-content" tabIndex={-1} className="qg-page ql-container">
        <header className="qg-heading">
          <p className="ql-eyebrow">THE QUIZNA QUICK GUIDE</p>
          <h1>
            A simple start.
            <br />
            <span>A smoother class.</span>
          </h1>
          <p>Just the steps you need to get going.</p>
        </header>
        <nav className="qg-role-nav" aria-label="Choose your guide">
          <Link to="/guide" aria-current={!student ? "page" : undefined}>
            <BookOpen size={18} aria-hidden="true" />
            For teachers
          </Link>
          <Link
            to="/guide?role=student"
            aria-current={student ? "page" : undefined}
          >
            <GraduationCap size={19} aria-hidden="true" />
            For students
          </Link>
        </nav>
        <section aria-labelledby="guide-start-title">
          <h2 id="guide-start-title">
            {student ? "Before your exam" : "Set up your first quiz"}
          </h2>
          <Steps items={student ? studentSteps : teacherSteps} />
        </section>
        <div className="qg-format-guides">
          <section aria-labelledby="online-guide-title">
            <span className="ql-feature-icon">
              <Monitor size={24} aria-hidden="true" />
            </span>
            <h2 id="online-guide-title">Online quiz</h2>
            <Steps
              items={
                student
                  ? [
                      [
                        "Enter your code",
                        "Join your subject, choose Take quiz, and read the instructions and monitoring rules. Existing quiz codes still work from Quiz code or previous activity.",
                      ],
                      [
                        "Start and answer",
                        "Select Start Quiz to enter fullscreen. Watch the timer and save indicator. Reconnect using the same account to resume while time remains.",
                      ],
                      [
                        "Submit and view results",
                        "Select Submit when finished. Time expiry also finalizes your saved answers. Your result appears when your teacher releases it.",
                      ],
                    ]
                  : [
                      [
                        "Share the section code",
                        "Students enter the code on My quizzes. Starting the quiz adds them to that section’s roster without duplicates.",
                      ],
                      [
                        "Follow live progress",
                        "Open Live monitor to see progress and possible focus violations. Class list filters show Submitted, In progress, and Not started.",
                      ],
                      [
                        "Review and release",
                        "Review answers, grade written responses, and choose when scores and correct answers are released.",
                      ],
                    ]
              }
            />
          </section>
          <section aria-labelledby="paper-guide-title">
            <span className="ql-feature-icon">
              <ScanLine size={24} aria-hidden="true" />
            </span>
            <h2 id="paper-guide-title">Paper exam</h2>
            <Steps
              items={
                student
                  ? [
                      [
                        "Complete your details",
                        "Write your name and section in the spaces provided on the answer sheet.",
                      ],
                      [
                        "Mark your answers",
                        "Fully shade one circle per objective question. Write essays in the space provided. Keep QR codes and corner squares clear.",
                      ],
                      [
                        "Hand in your sheet",
                        "Your teacher scans and reviews your answers, then grades essays. Check My quizzes after your result is saved to your account and released.",
                      ],
                    ]
                  : [
                      [
                        "Prepare and print",
                        "Open Print & scan. Prepare answer sheets for the section and print the question paper and QR answer sheets at the indicated size and 100% scale.",
                      ],
                      [
                        "Scan and review",
                        "Use a camera or upload a photo. Include the full page, QR code, and all four corner squares. Scan every page, then check the detected answers.",
                      ],
                      [
                        "Save and finish grading",
                        "Confirm the scan and save the result. Grade essays against the criteria; review any available AI suggestions before confirming. Release results for students.",
                      ],
                    ]
              }
            />
          </section>
        </div>
        <section
          id="monitoring"
          className="qg-monitoring"
          aria-labelledby="monitoring-title"
        >
          <p className="ql-eyebrow">ONLINE QUIZZES</p>
          <h2 id="monitoring-title">Understand focus warnings</h2>
          <p>
            Switching tabs, losing window focus, or leaving fullscreen may be
            recorded as a possible violation. Teachers can review these
            incidents in Live monitor.
          </p>
          <ol className="qg-warnings">
            <li>
              <strong>1</strong>First warning
            </li>
            <li>
              <strong>2</strong>Final warning
            </li>
            <li>
              <strong>3</strong>Attempt finalized using saved answers
            </li>
          </ol>
          <p className="qg-limit">
            These browser signals are not proof of cheating. QuizNa cannot
            monitor other devices or prevent all cheating. Read your teacher’s
            rules before starting.
          </p>
        </section>
        {!student && (
          <section className="qg-finish">
            <h2>Keep your class record ready</h2>
            <p>
              Open Gradebook, select a section, and export scores as CSV.
              Students are sorted alphabetically by last name. Use Analysis to
              find questions that need a review.
            </p>
          </section>
        )}
        <div className="qg-bottom">
          <p>Ready for your next quiz?</p>
          <Link to="/login" className="qn-button-primary">
            Sign in to QuizNa <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
      <PublicFooter />
    </div>
  );
}
