# Section gradebook and question analysis

Completed October 21, 2026.

- Added teacher-only Gradebook navigation and a section picker with a searchable, horizontally scrollable score table. Published and archived quizzes linked to the reusable section appear as columns. Last-name order is shared by table and CSV. Totals sum best fully graded scores only; missing grades remain blank, actual zero grades remain zero, pending essays and active retakes remain identifiable. Existing attempts outside the current roster remain visible.
- Added Question analysis from the gradebook and class list, with quiz/section filters, lowest-average questions first, full-credit counts, unanswered counts, pending grading and top three wrong objective answers. Frozen editions are separate. One latest finalized submission per student/section prevents retake duplication. Essay text is excluded from wrong-answer lists.
- Reused existing database tables, ownership checks, role guards, rate limits and bounded workers. No migration, credentials, dependency, or external AI service is required. Sample classroom records were not altered; normal server expiration still applies.

Validation:

- Frontend TypeScript/Vite and Nest production builds passed.
- 109 unit tests in 17 suites passed, including seven report tests covering ownership, sorted totals, missing vs zero scores, CSV formula safety, retakes, quiz editions and answer aggregation.
- 60 XAMPP integration checks passed with disposable accounts. New checks cover two published quizzes in one reusable section, correct CSV totals, section isolation, private report access and persistence through a backend restart.
- Browser checks: switched between St. Filomena/St. Vincent, filtered students, opened analysis from a quiz column, selected an empty Unassigned analysis, and restored a populated section.
- Downloaded the St. Filomena gradebook through the browser and verified 13 records, surname order, section identity, a graded total and a blank missing total.
- Screenshots: section-gradebook.png and question-analysis.png.

Operational details:

- Use Refresh to retrieve newly saved grades; reports load on demand.
- Gradebook totals are raw graded points, not a weighted term grade. The possible-point denominator includes only the graded quizzes represented in that student's total, and each score keeps its frozen attempt maximum.
- CSV exports the whole selected section; search affects only the table.
- Analysis uses saved scores and excludes pending answers from averages. Different editions are never merged. Completed timed-out or monitoring-finalized attempts are included.
- Hosted Supabase paths reuse the existing database abstraction and ownership/RLS setup; this turn validated local XAMPP, not a live hosted deployment. Larger school-wide datasets would benefit from batched reads/pagination.

## Direct review from gradebook

Scores now link to their best fully graded attempt, including zero scores. Awaiting grading links independently to a pending submission. During active retakes an earlier best score remains reviewable without opening the active attempt for grading. Missing or active-only cells have no link. Review links have student/quiz-specific accessible names and keyboard focus styles. The grading page selects and scopes the requested submission, rejects unavailable selections without silently opening another student, and provides Back to gradebook with section/search restoration. Returning reloads grades and totals.

Validation: frontend/backend builds passed; 111 unit tests and 64 XAMPP integration checks passed. Integration coverage includes exact best-score/pending targets, no links for missing work, owner-only review access, saving a pending essay grade and removing its pending target while retaining the higher earlier score. Browser verification opened Kyla Bautista's pending submission, returned to the same section/search, and used keyboard navigation on Hannah Castillo's research score to open her matching saved answers and essay grade. No sample scores were changed during browser checks.

## Compact CSV export

Gradebook exports now use one column per quiz, with values such as `10/10`; Total (graded) similarly uses `20/20`. Removed separate quiz Score/Out of/Status columns and the separate total Out of column. Cells without a grade show their participation/grading status, and totals remain blank until at least one fully graded score exists. Student, email, section and graded-quiz count remain. Surname ordering, ownership checks, CSV escaping/formula neutralization and saved scores are unchanged. The targeted nine report tests, backend build and 64 XAMPP checks passed with the new layout.

The final simplified gradebook CSV contains only Student, one column per quiz, and Total. Email, Section and Graded quizzes columns are removed; section identity stays in the frontend download filename. Last-name ordering and the compact score format remain unchanged. Tests assert the exact header and row width and verify zero scores, missing/pending work, totals and CSV safety.
