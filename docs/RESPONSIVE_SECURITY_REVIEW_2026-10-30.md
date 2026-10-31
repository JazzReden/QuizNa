# Security and responsive QA — 30 October 2026

## Automated verification

`npm run qa -- --mysql` passed. See [machine-readable results](QA_LATEST.json).

- 233 backend tests and 194 frontend tests.
- 104 PostgreSQL/RLS integration checks.
- 38 isolated API abuse/security checks and 4 gateway/link checks.
- 7 workflow scenarios against a disposable XAMPP database; its temporary database and restricted account were removed afterward.
- TypeScript checks, production builds, and client/private-file boundary tests passed.
- Production dependency audit: zero known advisories. One unpatched low-severity deepmerge advisory remains in development tooling (9 dependency entries). See [security review](SECURITY_REVIEW_2026-10-30.md).

These checks cover authorization, ownership, score release, input/body bounds, request budgets, throttling, deadlines, answer preservation, concurrent/idempotent submission, quiz copies, and database transactions. Existing production/sample quizzes and scores were not submitted, edited, or graded during this review.

## Browser layout verification

44 completed viewport cases were measured in the in-app browser. Each had the requested viewport width, no document-level horizontal overflow, no controls extending beyond the viewport outside intentional table scroll regions, and no displayed error alert. This is emulation, not physical-device certification.

At both **390 × 844** and **768 × 1024**, checked:

- Teacher subjects, subject detail, sections, gradebook, leaderboard, analysis, quiz editor, class list, grading, paper exam, populated section gradebook, populated question analysis, and section quiz class list.
- Student subjects, subject detail, performance, and released result.

Additional cases:

- Phone pre-start quiz instructions; the attempt was not started.
- Selected student subject performance with graph/table in dark mode at phone and tablet widths.
- Populated teacher analysis in dark mode on phone, gradebook on tablet, and selected-student grading on phone.
- Public welcome, sign-in, registration, and quick guide on phone.

Dark-mode screenshots were visually reviewed: [student tablet](../output/ui/student-tablet-dark-review.png) and [teacher phone analysis](../output/ui/teacher-analysis-phone-dark-review.png). Text, card boundaries, graph labels, and controls were readable in those screenshots. Theme settings were restored to light and the test viewport was reset.

Public-link and later navigation automation intermittently timed out. The public API health check returned HTTP 200, but the timed-out layout cases are excluded from the 44 completed cases. Public tablet/laptop checks therefore remain unverified in this pass.

## Remaining acceptance checks

- Physical Safari/Chrome phone/tablet interactions, keyboard/screen-reader accessibility, camera permission flow, printed-sheet scanning, and handwriting accuracy.
- A controlled staging capacity test for 500 users; local bounded abuse tests do not establish that capacity.
- Deployed Render/Supabase Auth, Realtime, migrations, backups, and production edge/shared rate limiting.

Backend files and privileged credentials must remain server-side; browser frontend code is inherently inspectable. No application-level test can guarantee protection against every attack. This review makes no such guarantee.
