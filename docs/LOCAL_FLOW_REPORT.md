# Local QuizNa verification

Verified against the configured XAMPP MariaDB database on 19 October 2026. Existing user accounts, quizzes, and attempts were preserved. All automated fixtures are uniquely named and removed by their respective scripts. The disposable browser-test accounts and quiz were also removed after screenshots; their temporary credential file was deleted.

## Automated checks

- Production builds: Nest backend and React frontend pass.
- Jest: 47 tests across 10 suites pass, covering authorization, deadlines, save retries, monitoring, grading, immutable questions, concurrent submissions, and workers.
- `npm run test:full-flow`: 22 checks pass using newly registered teacher/student accounts. Covers password login, all four question types, publishing, access codes, saves, restart recovery, question/option order, immutable keys, concurrent submission, objective and manual grading, independent score/answer release, student review/history, CSV/statistics, teacher monitor, logout, and fixture cleanup.
- `npm run test:mysql`: 22 checks pass against real MariaDB, including persisted warnings, related-event deduplication after restart, third-incident finalization, preserved answers, transaction rollback, and expired saves/reconnects.
- `npm run test:local-auth`: 23 checks pass for real local accounts, salted password hashes, hashed sessions, role/ownership checks, concurrent signup, expiry/rotation/logout, and restart persistence.

Machine-readable evidence: `full-flow-check.json`, `mysql-persistence-check.json`, `local-auth-check.json`.

## Browser walkthrough

Used fresh disposable accounts named Morgan Reyes (teacher) and Jamie Cruz (student), not existing user accounts.

1. Signed in as teacher; created **Science check-in**, entered instructions, added multiple-choice and essay questions, and used **Save & publish** to obtain an access code.
2. Signed in as student, joined by code, acknowledged concise monitoring rules, and entered fullscreen using Start Quiz.
3. Answered both questions, refreshed, and verified both saved answers and the original deadline were restored. The browser left fullscreen during refresh; one warning was recorded, acknowledged, and visible on the teacher monitor.
4. Submitted through the confirmation dialog; the receipt showed both saved answers while scores and keys remained hidden.
5. Signed in as teacher, saw the automatic score of 2/4, awarded the essay 2 points with feedback, and verified the total and review status changed to 4/4 and Graded.
6. Released correct answers and scores using separate grading controls.
7. Signed in as student and verified dashboard score, results, readable correct choice, and essay feedback.
8. Toggled result visibility for this fixture to check that an open results page refreshes automatically. Verified the authentication provider remains functional after a Vite update.

Screenshots: `student-submission.png`, `teacher-grading.png`, `student-results.png`.

## Changes

- Added **Save & publish** directly to the editor and notices explaining when question changes need publishing.
- Fixed stale grading details after saving and protected against out-of-order responses when selecting submissions.
- Show readable choice text instead of stored choice IDs; label question types in plain language.
- Added independent correct-answer release to grading; stopped listing active attempts as submitted work.
- Fixed student history to display scores only when the server actually supplies them.
- Refresh visible result pages every ten seconds and on window focus, so newly released results appear without manual reload. Respect reduced-motion preferences for celebration effects.
- Fixed development refresh failures by separating the authentication context/hook from the component module, following [Vite’s consistent-component export guidance](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md#consistent-components-exports).
- Hidden demo shortcuts by default with optional `VITE_SHOW_DEMO_ACCESS=true`; removed local-storage/backend explanations from product screens.
- Replaced the unsupported “anti-cheat active” engine card with an actual draft count. Shortened dashboard, editor, warning, briefing, and receipt copy while retaining monitoring limitations and the three-warning policy.
- Removed the redundant fullscreen test; Start Quiz enters fullscreen. Kept one visible save indicator and concise warning count.
- Added form labels for authoring choices and grading inputs; made the return-to-fullscreen action keyboard accessible.
- CSV downloads refresh expired sessions and release temporary download URLs.
- No database migration or new runtime dependency was necessary. No privileged database/authentication credential references were found in frontend source.

## Scope

Local XAMPP behavior is verified. These runs do not validate hosted Supabase Auth/email, Realtime delivery, Render deployment, or high-volume concurrency. Local monitoring uses polling; its signals remain possible violations, not proof of cheating. Password reset is outside the temporary local-account implementation. XAMPP MySQL must remain running; an offline API processes expired attempts when it starts again.
