# Confirmed score gradebook and ranking-only leaderboard

Teacher workflow:
1. Open a section's quiz and review one student's answers, or select Confirm score / Grade answers in the gradebook.
2. Save any grading corrections. Finish all essay grading.
3. Select Confirm score. The confirmed result contributes to the section gradebook and its CSV export.
4. Correcting a saved grade or feedback clears confirmation. Review and confirm the revised result again.

The gradebook uses the best confirmed, fully graded attempt per quiz. An unconfirmed retake cannot replace a previously confirmed result. Unconfirmed marks are preserved and shown as actions rather than included in totals. Student result release settings and stored numeric marks remain unchanged. Existing pre-upgrade results require confirmation; there is no automatic approval backfill.

The gradebook remains a native spreadsheet-style table on desktop, tablet, and phone, with sticky headers/student names and scrolling confined to the sheet. It shows names, quiz scores in score/max format, and totals, with surname ordering. CSV uses the same confirmed-only computation and has names, quiz scores, and totals.

The leaderboard shows Rank, Student, Section, and Score; answer-review links, grading columns, email detail, attempt-number detail, and section-edit controls are omitted. It retains the existing best fully graded ranking rule and tie behavior. Confirmation is required for gradebook recording, independently of score release or rankings.

Backend:
- POST /api/grading/attempt/:attemptId/confirm is teacher-only, validates UUID/review timestamp/revision, and verifies quiz ownership.
- MySQL confirmation and manual grading share the existing database mutex transaction; in-memory grading and confirmation share a lock. Repeated confirmation is idempotent.
- Every local grade update increments score_revision and invalidates confirmation. Revision checks prevent stale confirmation even if timestamps collide.
- Supabase migration 11 wraps the existing privileged command in a row-locking confirmation operation, and invalidates confirmation using an answer-update trigger. No new exposed table is created, and existing RLS policies remain authoritative.
- The application database account retains restricted DML permissions. The additive local migration was applied using XAMPP administrator access, without granting ALTER to the app.

Validation:
- 213 backend tests passed across 32 suites, including ownership, unfinished grading, confirmation totals/CSV, corrections, concurrent/repeated confirmations, stale revision rejection, feedback corrections, and retake selection.
- 143 frontend tests passed across 23 files, including native table presentation, ranking-only UI, explicit confirmation, and blocking confirmation of unsaved edits.
- 86 embedded PostgreSQL migration/transaction/RLS checks passed, including migration 11, confirmation ownership/idempotency, and invalidation after corrections. Hosted Supabase has not been deployed/tested.
- Production backend and frontend builds passed. The existing frontend large-chunk advisory remains.
- XAMPP API test used a disposable quiz; anonymous/student requests were rejected, unfinished results could not be confirmed, 9/10 appeared in totals/CSV after confirmation, correction required re-confirmation, and 8/10 appeared after re-confirming. The fixture was removed and hashes confirmed all existing quiz, attempt, and answer records unchanged.
- Browser verified a live legacy submission's Confirm score control is enabled, without approving it on the teacher's behalf. Leaderboard columns and absence of review/section-edit controls were checked. Phone (390px) and tablet (820px) page widths matched the viewport; the sheet remains a table and scrolls internally. Physical devices were not used.

Artifacts: SCORE_CONFIRMATION_MIGRATION.json and SCORE_CONFIRMATION_MYSQL_CHECK.json.
