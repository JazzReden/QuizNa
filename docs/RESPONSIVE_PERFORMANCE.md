# Responsive audit and student performance

The existing application was audited at 390px phone and 768px tablet widths, with additional 320px checks for forms, records, paper controls, the performance page, menu, question/import dialogs and expanded essay rubric. `RESPONSIVE_AUDIT.json` contains 54 final browser checks: no document-width overflow and no visible main-content buttons below the audit's 40px detection threshold (shared controls target 44px).

Phone teacher navigation uses an expandable Menu. Desktop navigation wraps rather than sliding sideways. Gradebook, class list, leaderboard, section roster and rubric tables become labelled cards on phone/tablet; desktop comparison tables remain available. Readable text, 16px form fields, wrapping labels and touch targets are shared across the workspace. Small authentication and quiz-error buttons were enlarged.

## Student performance

Students have a Performance tab, backed by `GET /api/attempts/performance`. AuthGuard and the student role guard apply; the endpoint takes its student ID from authenticated context. It aggregates the same sanitized, teacher-release-gated attempt data used by the existing student dashboard. Response fields contain no answer keys, rubric internals or other students' information.

Teachers can set an optional Subject (maximum 120 characters) in the editor. Subject labels are normalized and grouped case-insensitively. Existing quiz subjects remain unset; their existing results appear under “Subject not set.” Setting a subject is organizational metadata and does not modify frozen questions, scoring or published answer sheets.

Each quiz contributes its best released, finalized, fully graded percentage, with the latest submission breaking ties. Subject and overall percentages use the sum of earned points divided by available points for those selected attempts. Ongoing attempts, provisional grades, zero-point invalid records and unreleased scores do not contribute. Student-visible result links use existing ownership-checked result routes. The page refreshes with the existing dashboard refresh mechanism.

## Validation

- 186 backend tests, including subject grouping, weighted scoring, zero scores, retakes, release privacy, authenticated student scoping, role restrictions and input validation.
- 74 frontend tests, including performance states, result links, retry behavior and mobile menu behavior.
- 79 embedded PostgreSQL migration/RLS/transaction checks, including migration 10.
- Backend, frontend and phone production builds pass. Existing Vite bundle-size warning remains advisory.
- `PERFORMANCE_DATA_CHECK.json`: all 9 existing quizzes, 46 attempts and 298 answers are unchanged; hashes also cover questions, frozen editions, incidents, paper sheets, classes, rosters and quiz-section assignments.

The local additive MySQL migration `mysql/06_quiz_subjects.sql` has been applied using the administrator connection. The runtime application account retains its limited privileges. Fresh MySQL installs include the field in `mysql/schema.sql`. Hosted Supabase requires `supabase/migrations/10_quiz_subjects.sql`; existing ownership and RLS policies continue to apply.

The browser review did not start or submit an actual quiz, save a grade, publish/edit an existing quiz, capture a live camera image, or print on physical hardware. Active quiz styling was reviewed in source; existing timer, monitoring and autosave tests remain green. No new provider keys or services are required.
