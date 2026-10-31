# QuizNa

Deploy the frontend to Vercel, the API to Render, and the database/Auth to Supabase using the [production deployment guide](docs/DEPLOYMENT.md). Production templates are in `deploy/`; local XAMPP data stays separate.

Before your first GitHub upload, follow the [source audit, exact host variables, and Git commands](docs/GITHUB_PREPARATION.md). Run `npm run audit:source` and review staged changes; no Git push is performed by that audit.

React/Vite/TypeScript frontend, NestJS API, and Supabase PostgreSQL/Auth/Realtime quiz application. Teachers author and publish quizzes, monitor progress, grade written responses, control release, and export CSV. Students join by code, read the rules, enter fullscreen, answer with autosave, resume, submit, and receive a submission receipt.

This repository contained an earlier implementation. The security and reliability review, improvements, and remaining validation are recorded in [docs/IMPLEMENTATION_REPORT.md](docs/IMPLEMENTATION_REPORT.md).

Latest security verification: [30 October security report](docs/SECURITY_REVIEW_2026-10-30.md), including the Vite patch, private-file checks, abuse tests, and the remaining development-only dependency advisory.

QA: run `npm run qa -- --mysql` for the complete automated gate, including seven scenarios in a disposable XAMPP database. Use `npm run qa` for the database-independent gate. See the [QA checklist and sign-off plan](docs/QA_PLAN.md) and [latest automated results](docs/QA_LATEST.json). The existing application database is not used by the disposable scenarios; physical phone/print and production-capacity acceptance remain separate checks.

Teachers can **Copy** a quiz into another section’s subject as an independent draft. Paper scanning identifies prepared students through their QR records and reuses QR detection for answer reading. See [copy and scan setup, checks, and limitations](docs/COPY_AND_SCAN.md). Supabase deployments require migration `14_copy_quiz.sql`; existing XAMPP installations need no new tables.

## Local demo

Use Node 22 or 24 and npm. From the root:

```sh
npm ci
cp .env.example backend/.env
cp .env.example frontend/.env
npm run start:backend
# In another terminal:
npm run start:frontend
```

Open http://localhost:5173. In memory demo mode, sign in as `teacher@quizna.dev` or `student@quizna.dev` without a password. Quiz code: **CS101**. A second seeded student is available as `student2@quizna.dev`. Set frontend `VITE_SHOW_DEMO_ACCESS=true` only when you want the optional demo shortcuts; client screens hide them by default.

`DEMO_MODE=true` with `DATABASE_MODE=memory` selects an **ephemeral in-memory** store. All demo data resets on API restart. It is for local evaluation only; production refuses demo mode. Memory-demo login accepts only the three seeded identities. Registration requires XAMPP mode or Supabase. Existing `.env` files are not overwritten by the application; update their flags and API port if using an older checkout.

## Persistent local testing with XAMPP

Online quizzes now offer **Require quiz code** or **No code required**. Existing quizzes keep their current entry behavior. See [quiz entry setup and validation](docs/QUIZ_ENTRY.md), including the additive MySQL and Supabase migrations for other installations.

QuizNa also supports XAMPP's MariaDB as a **persistent local demo**. This stores profiles, quizzes, published editions, attempts, answers, grades, and incident logs in ordinary InnoDB tables. You can register local teacher and student accounts with email and password; XAMPP requires password-based accounts; seeded demo shortcuts are disabled. Accounts and sessions persist across restarts. Supabase Realtime is not emulated; the local teacher monitor uses its existing polling fallback.

On this computer the database **quizna_local** and a dedicated restricted application account have been created, and `backend/.env` is configured. Start **MySQL** in XAMPP, then start QuizNa normally:

```sh
npm run start:backend
npm run start:frontend
```

Open http://localhost:5173. Data now survives backend restarts. Keep XAMPP MySQL running. Attempt deadlines keep counting while the backend is offline; expired attempts finalize when the backend starts again.

For another computer:

1. Create a separate `quizna_local` database using utf8mb4 in phpMyAdmin.
2. Import `mysql/schema.sql` into that database. For an existing QuizNa MySQL installation, apply `mysql/02_local_auth.sql`, then `mysql/03_sections.sql`, `mysql/04_reusable_sections.sql`, `mysql/05_paper_exams.sql`, `mysql/06_quiz_subjects.sql`, and `mysql/07_score_confirmation.sql` to add accounts, reusable sections and rosters without replacing existing data. Do not run the Supabase/PostgreSQL migrations in MySQL.
3. Create a local application account with only `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on `quizna_local.*`.
4. Configure backend/.env:

```env
NODE_ENV=development
DEMO_MODE=true
DATABASE_MODE=mysql
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=quizna_local
MYSQL_USER=quizna_local
MYSQL_PASSWORD=your-local-app-password
# On XAMPP for this Mac, use the socket; MySQL is not listening on TCP:
MYSQL_SOCKET=/Applications/XAMPP/xamppfiles/var/mysql/mysql.sock
```

On Windows or when using TCP, omit `MYSQL_SOCKET` and use your XAMPP MySQL port. Frontend settings stay `VITE_DEMO_MODE=true` and `VITE_API_URL=http://localhost:3002`. Credentials stay in the ignored backend `.env` file and are never sent to the frontend.

### Local account registration and login

Open `/login`, choose **Need an account?**, and enter your name, email, password, password confirmation, and **Teacher** or **Student** role. Passwords need 10–128 characters. Local accounts are ready immediately; no Supabase credentials or email confirmation are needed. Sign out and sign in with the same email and password afterward. The UI reads authentication capabilities from the running backend, so the role picker is enabled only when the backend permits it.

Passwords use individually salted asynchronous scrypt hashes. Raw passwords are never stored. Sessions use random opaque access/refresh tokens; the database stores only SHA-256 token hashes. Access sessions expire after 30 minutes, refresh tokens after seven days, refresh rotates both tokens, and logout revokes the local session when the API is reachable. Accounts and unexpired sessions survive API restarts. Auth endpoints validate inputs and are rate limited. Credentials live separately from public profiles, and account creation is atomic with its profile/session. Duplicate emails cannot overwrite accounts. Password reset is outside this local testing implementation.

Teacher self-registration is deliberately limited to local XAMPP testing. Production refuses MySQL/demo mode, Supabase registration remains student-only, and demo backends bind to the loopback interface. Seeded password-free accounts are available only in the ephemeral memory demo. XAMPP accounts always require passwords and receive their own identities and ownership permissions.

```sh
npm run test:local-auth
```

This creates disposable teacher/student fixtures, verifies registration/login, roles and ownership, password/session hashing, duplicate and concurrent signup, expiry/refresh/logout, and account/session/answer persistence across an actual backend restart. It removes only its fixture accounts/quizzes afterward. Evidence is recorded in `docs/local-auth-check.json`.

The application seeds CS101 once, inside a transaction. Restarting never reseeds or overwrites edits. When MySQL is configured, connection/write failures return an error; the application never silently switches to memory. The adapter serializes local business transactions with a database lock row, including nested operations on the same connection. This is intended for small local test datasets, not a production MariaDB deployment; Supabase remains the production path with its existing RLS, Auth and Realtime design. Timestamps retain their ISO UTC strings; flexible answer and snapshot fields use JSON columns.

The previous ephemeral session was backed up to the ignored `.local/previous-memory-demo.json` before switching. This file is a backup, not an automatic import of historical versions. Only the dedicated QuizNa database is used; other XAMPP databases are untouched.

After building, run the real MariaDB restart test:

```sh
npm run build
npm run test:mysql
```

It starts a test API on port 3110, creates one uniquely named fixture quiz, saves answers/warnings, restarts the API, verifies restoration/monitoring/grading/release, and deletes only that fixture. It does not clear your other quizzes or attempts. Unit tests deliberately use memory and do not touch XAMPP.

Official driver reference: [mysql2 connection pools](https://sidorares.github.io/node-mysql2/docs/examples/connections/create-pool).

## Supabase setup

1. Create a development Supabase project. Set `DATABASE_MODE=supabase` and `DEMO_MODE=false` in backend/.env, and supply `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
2. Apply all numbered files in `supabase/migrations/` in numeric order, through `14_copy_quiz.sql`. For a fresh project, `npm run deploy:database` generates `deploy/supabase-bootstrap.sql` containing that complete sequence. The old `03_seed.sql` was moved to **supabase/seed.sql** so fixture accounts are not part of production migrations.
3. Set frontend `VITE_DEMO_MODE=false`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_API_URL`. Never put a service-role key in a `VITE_` variable.
4. Configure Supabase Auth Site URL, allowed redirect URLs, and email delivery. Public signup creates students regardless of submitted metadata. Confirm the account by email when email confirmation is enabled, then sign in. Teacher accounts require an administrator to promote a trusted user's profile:

```sql
update public.profiles set role = 'teacher' where id = '<verified-auth-user-uuid>';
```

5. Enable **pg_cron** in Supabase Extensions and install the independent expiry job:

```sql
select cron.schedule(
  'quizna-expiry', '* * * * *',
  $$select public.quizna_attempt_command('expire', null, '{}'::jsonb)$$
);
```

The API also sweeps every 15 seconds, including on startup. The database job ensures expired attempts finalize while the API or student's browser is offline. Each sweep processes at most 100 due attempts; high-volume installations should increase job frequency/batch capacity after load testing. A save/submission always checks the deadline, so scheduler delay does not extend answering time.

6. Migration 04 adds attempts, answers, and incidents to `supabase_realtime`. The teacher monitor subscribes with the teacher JWT and RLS authorization, with a polling fallback. Only sanitized API responses reach students; direct student reads of question keys, snapshots, attempt scores, and graded answers are intentionally denied. This preserves release rules that row-only policies cannot enforce on whole rows.

For an existing database, take a backup and inspect active attempts before applying migration 04. The one-active-attempt index intentionally rejects legacy duplicate active attempts; resolve these first. Existing Auth users without a profile need an administrator-created student profile. The new trigger provisions future registrations. Legacy snapshots lacking private grading data cannot be safely reconstructed after draft edits: inspect those separately and republish for new attempts.

### Optional Supabase development fixtures

Use only a disposable development project. Set `ALLOW_DEMO_SEED=true` and a unique `SEED_DEMO_PASSWORD` of 12+ characters, then run:

```sh
node --env-file=backend/.env scripts/seed-supabase.mjs
```

This creates real Auth users with the demo UUIDs and their profiles. Then run **supabase/seed.sql** in that project's SQL editor. Do not seed production. The in-memory demo needs neither this script nor SQL fixtures.

## Architecture and invariants

- `frontend/src/pages`: separate teacher/student flows, quiz editor with four question types, availability and release settings, fullscreen taking screen, live monitor, grading, results/receipt.
- `backend/src/modules`: Auth/profile provisioning, Quizzes, Questions, Attempts, Answers, Monitoring, Grading, Reports, Workers. Guards verify Supabase tokens, roles, and ownership. A global validation pipe and endpoint rate limits protect requests. CORS uses explicit configured origins.
- `DatabaseService`: live queries fail with a safe retryable error; they never fall back to demo data. Service-role access is confined to the server, which checks ownership before issuing privileged operations. RLS and revoked direct write grants protect all exposed tables.
- Migration 04 exposes a **service-role-only** command function. Starts take a transaction advisory lock per student/quiz. Saves, incidents, finalization and objective grading lock the attempt row. This serializes competing requests across API processes, prevents writes after closure, and commits third-incident termination and grading together. Attempt limits and the partial unique active-attempt index prevent duplicate starts. Deadlines use database timestamps.
- Each attempt references an immutable published snapshot. Delivery, answer validation, grading, result review, and teacher attempt detail read that snapshot. Draft edits/deletions cannot change an active attempt. Option order is deterministic per attempt; question order is stored. Current release settings remain teacher-controlled.
- The frontend save queue debounces edits, serializes requests, retains the latest edit while older requests complete, retries with bounded backoff, and stores pending drafts in sessionStorage scoped to student/attempt. Only confirmed server saves count. Refresh restores the same server attempt and tries pending saves while time remains. Closing the tab can lose unconfirmed drafts; offline drafts are never accepted after the deadline.
- Manual submission waits for the save queue. Timeout finalizes server-saved answers. Countdown uses elapsed wall time to catch up after background throttling; the database deadline remains authoritative. JWTs refresh on authentication expiry during API requests.
- The submission receipt contains the attempt reference, server submission time, deadline, saved-response count, and recorded incidents. It is available while scores remain private.
- Grading uses OOP strategies for each question type in local mode and equivalent SQL objective scoring inside the live transaction. Short answers are trimmed, case-insensitive exact matches against accepted strings; essays require manual grading. Answer maps provide linear-time lookup/scoring. Question shuffling uses Fisher–Yates.
- Reports authorize and load data on the API, then pass structured-cloned data to at most four real `worker_threads`, with a 100-task queue and 30-second task timeout. Trusted handlers must be self-contained. Database credentials and transactions never go to workers. CSV fields are quoted and formula-like values neutralized.

## Browser monitoring limitations

QuizNa reports tab hiding, focus loss, and fullscreen exits as **possible violations, not proof of cheating**. OS prompts, notifications, assistive tools, and browser behavior can cause legitimate events. The pre-quiz briefing explains these limits. Monitoring cannot inspect other devices, external hardware, or physical surroundings and cannot prevent all cheating. Client reports can be suppressed or fabricated; they are untrusted telemetry, while warning counts and consequences are enforced on the server.

Initial fullscreen setup has a short grace window. Related reports within two seconds share one incident. Deduplication uses stored incidents so refresh/API restart does not reset it. First incident: warning; second: final warning; third: finalization using saved answers. Active warnings can be dismissed by the owning teacher with an audit entry; finalized attempts cannot be reopened by that operation.

## Checks

```sh
npm run build
npm --workspace=backend test -- --runInBand
npm run test:database
npm run test:smoke  # after build; starts/stops an isolated demo API on port 3109
```

The compiled-API smoke test covers real HTTP authentication, publication, DTO validation, saves, resume, grading, release, CSV and statistics workers. The Jest suites cover role/ownership guards, access codes, limits, deadlines, snapshot consistency, reconnection, save retries, concurrent/repeated submissions, score privacy, incident deduplication/termination, grading, DTO whitelisting, and actual worker threads. The database test executes the migrations and transactions in embedded PostgreSQL (PGlite), then exercises RLS under student and teacher roles. PGlite substitutes its built-in UUID generator for the Supabase uuid extension; it does not test hosted Auth/email, Realtime delivery, pg_cron, or multiple independent database connections. Run a staging smoke/load test with your actual Supabase project before using real assessments.

## Production deployment

1. Commit the repository and lockfile to your Git host. This workspace initially had no `.git` directory; no commits or pushes were created here.
2. Follow [the deployment guide](docs/DEPLOYMENT.md). **render.yaml** builds only the Nest API; **vercel.json** builds the frontend separately. Both use the npm workspace root. Vercel rewrites SPA routes to index.html; the API uses Render's injected PORT and `/api/health`.
3. Set backend `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `FRONTEND_URL` to your one exact frontend origin without a trailing slash. Keep `DEMO_MODE=false`. Production does not use the legacy local `CORS_ORIGIN` setting.
4. Set frontend `VITE_API_URL` to the deployed API origin and the two public Supabase settings. Keep `VITE_DEMO_MODE=false`. Vite values are build-time settings: rebuild after changing them.
5. Apply migrations, configure Auth, approve teacher profiles, and enable the expiry job as described above. Test login, quiz publication, reconnection, delayed release, realtime events, manual grading, and CSV download in staging.

No deployment or external project changes were performed. You supply credentials and deploy.

## Official API references

- [Supabase password sign-in](https://supabase.com/docs/reference/javascript/auth-signinwithpassword), [verified user lookup](https://supabase.com/docs/reference/javascript/auth-getuser), [Realtime subscriptions](https://supabase.com/docs/reference/javascript/subscribe)
- [Supabase RLS and privileged server keys](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [PostgreSQL row and advisory locks](https://www.postgresql.org/docs/17/explicit-locking.html)
- [Node worker threads](https://nodejs.org/api/worker_threads.html)

## Full local flow verification

After `npm run build`, run `npm run test:full-flow` with XAMPP running and backend `.env` set to local MySQL mode. The test starts an isolated API on port 3114, creates fresh teacher/student accounts, authors all four question types, publishes, saves/resumes across an API restart, submits concurrently, grades, releases scores and answers separately, reviews feedback, exports CSV, and checks ownership/attempt limits. It removes only its own fixture data. Results are recorded in `docs/full-flow-check.json`. Browser verification and client-facing UI changes are documented in [docs/LOCAL_FLOW_REPORT.md](docs/LOCAL_FLOW_REPORT.md).

The client interface hides development shortcuts by default. Teachers can save and publish directly from the editor, then release scores and correct answers separately on the grading page. Student results refresh every ten seconds while visible and when the window regains focus. Submission references are under an optional details disclosure.

## Faster multiple-choice entry

In the quiz editor, save the quiz title, then choose **Paste questions**. Paste up to 100 questions (100,000 characters) with lettered choices on separate lines or together. **Organize & preview** separates the questions and choices; teachers can edit text, set individual points, select missing correct answers, add/remove choices, or remove a question before adding the batch. Publish afterward to make new questions available to students.

Recognized examples:

```text
1. Which planet do we live on?
A. Earth B. Mars C. Venus D. Jupiter
Answer: A

2) What is 5 + 3?
a) 6
b) 8
c) 10
d) 12

Answer key: 2. B
```

This is a local text formatter, requiring no AI credentials or external data transmission. It recognizes common numbered/unnumbered blocks, inline/wrapped A–H choices, answer labels, marked choices, and numbered answer keys. It cannot understand every arbitrary document layout. Missing/conflicting keys require teacher selection; review the preview before adding. The original text remains available with **Back to paste**. **Start over** clears an unwanted pasted draft. Drafts are retained in the current browser tab when storage is available until added, cleared, or signed out.

Question points and grading scores are plain typed decimal fields. Clear them normally and enter a number such as `2`, `1.5`, or `1.25`. Empty input is not converted to zero; an explicit `0` remains valid. Up to two decimal places match database precision. Grades cannot exceed the question's points.

Imports pass teacher/ownership checks and nested validation before saving. MariaDB uses a transaction; Supabase uses one bounded bulk insert operation. Stable question IDs make the same import safe to retry, including after an API restart. The API caps JSON bodies at 512 KiB; the client bounds edited imports before sending. No database migration or external AI configuration is needed.

```sh
npm run build
npm --workspace=backend test -- --runInBand
npm run test:question-import  # real XAMPP fixtures; isolated API on port 3116
```

See [docs/QUESTION_IMPORT_REPORT.md](docs/QUESTION_IMPORT_REPORT.md) for verification and screenshots.

Mixed pastes can include explicitly labeled `True or False:` questions and `Essay – 3 points:` items alongside multiple choice. Inline answer keys can appear between questions, and a final answer-key block can mix letter and True/False values. Essay points written in the heading override the default points; essays require manual grading. See [the mixed-paste regression fix](docs/MIXED_PASTE_FIX.md).


## Reusable sections and student rosters

Open **Sections → New section** and create a class once. Share that section’s quiz code. Starting a quiz automatically adds the signed-in student's registered name and normalized account email to the reusable roster. Viewing instructions alone does not enroll anyone. Reconnects, retries, retakes and starts in other quizzes using the same reusable section do not create duplicate students or overwrite an existing roster name. The manual Add students button and import form have been removed from Sections; existing roster data and the teacher-only compatibility/import API remain available for seeds and integrations. Removing a student removes only the roster entry; answers and grades stay intact. A later new quiz attempt with that section’s code can enroll them again.

In **New Quiz**, select one or more sections and save. Each selected section receives its own access code **for that quiz**. Open **Sections → Quiz codes** to choose a quiz and copy the code. Reusing a section keeps its roster and generates a different quiz-specific code; repeated saves keep the existing code. Sections can be created even before any quizzes exist. Existing section names were grouped into reusable teacher-owned classes without changing quiz section IDs, codes, answers or grades. Previous students who already used a section code were imported into its initial roster. Existing general quiz codes remain usable, and their attempts stay Unassigned.

**Class list** shows **Submitted**, **In progress**, and **Not started**, with clickable counts for the selected quiz/section. Select a status to filter the list, or All students to reset the status filter. Status filtering combines with student search, resets when changing quiz/section, and keeps total counts visible. CSV exports follow the selected section and status, keeping students alphabetical by last name. Not started means an expected roster email has no attempt in that quiz section. A student retaking a quiz appears In progress while the retake is active; their earlier best graded score remains available in Gradebook and Leaderboard. Class list focuses on participation, grading status and Review, without a redundant score column. Accounts match roster entries by normalized email, within the selected quiz section. Unrostered attempts remain visible instead of being discarded. Rosters organize records; sharing a quiz code is not independently verified enrollment. Share the correct section code for accurate tracking. Not started only includes known roster members; students who have never joined the section are not yet known to the app. Current roster edits affect class lists for all quizzes that reuse that section.

Class lists and scorebook exports group students by section, then last name A–Z. **Export scores CSV** includes the expected roster, participation status and best graded score; missing scores are blank. **Detailed CSV** contains actual attempts and question details for the selected section. Detailed exports follow the selected status and contain matching active or finalized attempts; students with an active retake belong to In progress. For Not started, use Export scores CSV; Detailed CSV is disabled because no attempts exist. Search filters the screen; exports apply the section and status filters. Leaderboards remain score-ranked and include submitted, fully graded results; ties share ranks. Pending grading receives no rank. **Review** opens the relevant submitted attempt.

Existing profiles store a full name. Sorting uses the whole family name before a comma in `Last name, First name`; otherwise it uses the final name word with common surname particles and removes trailing Jr./Sr./Roman numeral suffixes. Unusual compound surnames should use comma form for unambiguous ordering. Names are not rewritten.

For local upgrades, apply `mysql/03_sections.sql` then `mysql/04_reusable_sections.sql`; both have been applied on this computer. Fresh local installs use `mysql/schema.sql`. For hosted Supabase, apply migrations 04, 05, then **06_reusable_sections.sql** and **07_automatic_roster.sql** after the base schema/RLS. Migration 06 adds owner-only RLS, indexes, roster uniqueness, and service-only transactional roster/import and section attachment functions. It has been verified against embedded PostgreSQL; you must apply these migrations to your own Supabase project before deployment. Migration 07 adds a service-only trigger that enrolls students in the same transaction as a new attempt using the existing unique section/email constraint. No extra MySQL migration is needed for automatic enrollment.

## Security and local verification

Local XAMPP accounts require their real passwords and opaque sessions. Fixed demo tokens and password-free seeded-account login are rejected in XAMPP mode. Only the explicitly selected ephemeral memory demo retains demo identities. Production disables demo mode and does not allow public teacher registration.

The API enforces authentication, teacher/student roles and ownership. Rosters accept validated batches of 1–200 students. SQL values are parameterized. API responses use safe errors, no-store caching, and browser security headers. The frontend contains public application JavaScript; server source, grading, service-role keys and database passwords are not served to it. Production client source maps are disabled. Vite development filesystem access is restricted to the frontend and dependencies. Render serves only `frontend/dist`, not the repository. Copy **only VITE_* variables** into frontend/.env; privileged variables belong only in backend/.env.

The NestJS limiter applies a classroom-friendly baseline of 600 requests/minute per IP and endpoint, plus a shared 240/minute budget for each verified account across endpoints. Access-code lookup is limited to 60/minute. A bounded admission layer rejects aggregate bursts and overload before parsing or database work. Login/refresh: 20/minute; registration: 10/minute; reusable section creation and roster imports: 20/minute; attachment: 30/minute; CSV exports: 10/minute. Limits return HTTP 429 and Retry-After. Local forwarding headers are not trusted. `TRUST_PROXY_HOPS` is 0 locally; Render configuration uses one trusted proxy hop, which must be reviewed if your proxy topology changes. Counters are in memory per API instance and reset on restart. Before scaling to multiple instances, use a shared limiter store and edge protection. These controls reduce abuse; they are not a guarantee against every attack.

API security configuration follows [NestJS rate-limiting documentation](https://docs.nestjs.com/security/rate-limiting); client filesystem boundaries follow [Vite server documentation](https://vite.dev/config/server-options).

```sh
npm run build
npm --workspace=backend test -- --runInBand
npm run test:database
npm run test:sections
npm run test:full-flow
# With the local production frontend running on port 5173:
npm run test:client-boundary
```

For a clean local client preview: `npm --workspace=frontend run preview -- --host 127.0.0.1 --port 5173 --strictPort` after building. Start the API with `npm --workspace=backend run start:prod`; keep XAMPP MySQL running. `localhost:5173` and `127.0.0.1:5173` keep separate browser logins while sharing the same local database. Only trusted local CORS origins are allowed.

The section test uses disposable accounts, isolated API port 3118, and cleans up only its own fixture records. Full flow uses port 3114. See [docs/REUSABLE_ROSTERS_REPORT.md](docs/REUSABLE_ROSTERS_REPORT.md) for delivered behavior and validation.


### Section gradebook and question analysis

Open **Gradebook** in the teacher navigation and select a reusable section. Each published or archived quiz linked to that section becomes a column, ordered by creation date. Drafts are excluded. Students sort by last name, including current roster members and students who previously submitted without a roster entry. Best fully graded scores use the same rule as the class list (highest percentage, earliest submission on ties). Active retakes keep an earlier best score; pending grading never becomes a zero. Each cell uses that attempt's frozen maximum points. **Total (graded)** sums only recorded fully graded scores and their matching possible points; the graded count shows incomplete records. Totals are points, not weighted term grades. Students missing a quiz remain blank. CSV exports only Student, one column per quiz, and Total for the complete selected section in the same order, regardless of the on-screen search. The section stays in the downloaded filename, with no Email, Section or Graded quizzes columns. Scores appear as `10/10`, and ungraded cells show their status. Totals use the same `20/20` format, with no separate Out of columns. No new database migration is needed.

Open **Question analysis** from the gradebook or class list, or click a quiz column heading. Choose a quiz and optionally a section. It uses one latest finalized attempt per student per quiz section, including timed-out and monitoring-finalized attempts, and excludes active attempts. Immutable quiz editions remain separate. Questions sort by lowest average percentage of available points; ungraded questions appear last. Counts show full credit, unanswered and awaiting grading. Averages use saved graded answers only, including partial essay credit; essay text is never listed as a common wrong answer. The top three wrong objective responses are counted by normalized text and displayed using frozen choice labels. Unanswered responses are counted separately. No AI service, external credentials or additional dependencies are used.

The report endpoints are teacher-only and validate section/quiz ownership before reading records. CSV formula neutralization applies to user-controlled cells. Gradebook export has a 10/minute limit; report reads use the global limit. Analytics aggregation and CSV serialization use the existing bounded worker pool; authorization and data access remain in services. Reports are read on demand; use Refresh for newly saved grades. Large datasets still require multiple database reads per quiz/attempt and should receive pagination/batched read optimization before very large school-wide deployments. These reports do not introduce new exposed tables or bypass existing RLS policies.

Validation: `npm test -- --runInBand` includes gradebook ownership, surname order, retake totals, blanks vs. zero, archived/draft quiz handling, CSV safety, frozen editions, wrong-answer aggregation and pending essays. `npm run test:sections` tests both reports over authenticated HTTP against local XAMPP with disposable accounts, two quizzes, CSV totals, section isolation, access restrictions and backend restart persistence.

To add the optional second sample quiz to the existing local classroom preview, run `node scripts/seed-gradebook-preview.mjs` after building the backend. It requires the original `docs/CLASSROOM_PREVIEW.json`, the original sample accounts and rosters, and local XAMPP mode. It adds a Practical Research quiz shared by St. Vincent and St. Filomena with separate access codes, 19 complete graded submissions, and varied wrong answers for analysis. It never updates rosters or replaces existing submissions; a transaction compares fingerprints of prior quizzes, versions, questions, answers, grades and incidents before committing. Repeating the script preserves existing completed attempts. See `docs/GRADEBOOK_PREVIEW.json` for generated codes and verified totals.

In the section gradebook, click a score to review the exact attempt that earned that best graded score. Click **Awaiting grading** to open the pending submission and grade its essays. These are separate targets when a student has both an earlier graded attempt and a pending retake. In-progress first attempts and Not started cells have no review links. **Back to gradebook** restores the section and student search and reloads saved grades. All links use the existing teacher-owned answer/review and grading endpoints; CSV exports and totals keep the same score-selection rules.


## Online and Paper Exams

In **New Quiz**, choose **Online Exam** or **Paper Exam**. Existing quizzes remain online. A published exam’s format is fixed. Paper Exam alone displays **Print & scan** in the teacher dashboard/editor/Sections. The online exam flow continues unchanged.

For Paper Exam, use **Paste questions** (a new draft saves automatically after you enter its title), select sections, publish, then open **Print & scan**. The Paper Exam screen also has its own **Paste questions** and **Publish questions** buttons, so teachers can paste without leaving that page. Unpublished changes must be published before section preparation. Previously printed papers keep their original questions and are clearly labelled. Choose a section and click **Prepare section** to prepare named QR sheets for all registered students on its roster without entering emails. Print the section’s question papers and answer sheets together in last-name order. Already-saved students are skipped; reprints reuse pending sheet identities. Unregistered roster students are listed as skipped until their matching student accounts exist. Print both at actual A4 size. Every answer page has alignment squares and its own QR page identity. Reprints keep the same frozen sheet and choice ordering.

Use **Use camera → Capture sheet**, or **Upload sheet photo**, on the owning teacher's device. Camera capture needs HTTPS or localhost and camera permission; phone access needs your HTTPS deployment. The QR identifies the exact student, exam and page. QuizNa reads filled multiple-choice/true-false bubbles, flags unclear/multiple marks, and lets the teacher correct every answer. Written answers are transcribed manually; short answers use the existing automatic grading and essays use the existing teacher grading page. Confirm the review before saving. Photos remain on the device. Unfinished reviews are saved in that teacher’s browser session when storage is available; results are saved on the backend and appear in existing gradebooks/reports.

Apply **mysql/05_paper_exams.sql** to an existing XAMPP database (already applied here). Apply **supabase/migrations/08_paper_exams.sql** after 07 on a hosted project before deployment. No additional secrets or AI credentials are required. Run `npm run test:paper` for the disposable XAMPP paper flow. See [Paper Exam setup, architecture, limitations and validation](docs/PAPER_EXAMS_REPORT.md). Live printer/camera hardware still needs a real-device test; generated image, grading, database, ownership and online regression tests have passed.


### Paper Exam form and dashboard tests

Run `npm run test:frontend` for the React interaction tests. They cover direct paper pasting and publishing, new draft creation, section preparation without email entry, QR identification and answer review, save retries, camera permission guidance, and automatic teacher/student dashboard refresh. JSDOM and mocked media/worker boundaries exercise the form logic; physical printer/camera quality still requires a real-device check. The current test toolchain was verified on Node 24.15.0 (jsdom 30.1.3 requires Node 22.22.2+ or 24.15.0+). Production builds exclude the test code and test dependencies from browser assets.


### Handwriting and essay suggestions

Paper Exam supports **Gemini free-tier testing** and optional OpenAI integration. Enable **Read essays with AI**, scan a page, correct the transcription, select **Use this score**, then confirm **Grade & save**. Unclear handwriting gets no suggested score. Bubble scanning and manual grading work without AI.

For free testing, create a [Google AI Studio key](https://aistudio.google.com/apikey) in a project on the Free Tier without paid billing. Add to **backend/.env**:

```dotenv
PAPER_AI_ENABLED=true
PAPER_AI_PROVIDER=gemini
GEMINI_API_KEY=your-own-gemini-api-key
GEMINI_ESSAY_MODEL=gemini-3.1-flash-lite
```

Restart the backend. Google sets free quota and eligibility; a paid project's key can incur charges. QuizNa never automatically falls back to OpenAI when Gemini is unavailable. Use sample essays: Google's free tier may use content to improve its products. Keys belong only in backend variables, never frontend variables or chat. The configured Gemini key has passed a live draft-only test with synthetic handwriting. Real handwriting and camera accuracy still need testing.

OpenAI remains available through explicit `PAPER_AI_PROVIDER=openai`, `OPENAI_API_KEY`, and optional `OPENAI_ESSAY_MODEL` (default `gpt-5.6-terra`). Existing configurations without `PAPER_AI_PROVIDER` preserve OpenAI selection. For Render use the chosen provider's backend variables; Supabase needs migration **09_reviewed_essay_grades.sql** after 08. XAMPP needs no additional schema change.

Only cropped essay boxes and frozen question/criteria text are sent externally. Review all transcriptions and scores before saving. See [setup, architecture and validation](docs/ESSAY_AI.md).

Live synthetic-handwriting check (explicit opt-in): `RUN_LIVE_GEMINI=true npm run test:gemini-live`. [Latest result](docs/GEMINI_LIVE_CHECK.json). Teacher confirmation remains required; the check never saves a grade.


### Student performance

Students can open **Performance** to see their own results by subject. Teachers can set the optional **Subject** field in the quiz editor. Existing quizzes are not relabelled automatically; unlabelled quizzes appear under “Subject not set.” Subject labels organize results and do not change frozen questions, answer keys, quiz versions, or grades.

Only released, fully graded, finalized results contribute to percentages. Each quiz contributes its best percentage attempt (ties choose the most recent), and subject/overall percentages are weighted by that attempt’s available points. Hidden scores, ungraded essays, and ongoing attempts are excluded and shown as pending states. The authenticated student endpoint uses the current user ID and does not accept another student’s ID.

Local upgrades: apply `mysql/06_quiz_subjects.sql`. Hosted upgrades: apply `supabase/migrations/10_quiz_subjects.sql`; existing quiz ownership/RLS policies still apply. No existing quiz or score data is overwritten.

Teacher Ishi provides built-in QuizNa guidance and permission-checked live dashboard reports for both roles. Reports refresh every 15 seconds while her panel is open, with no external AI key needed. See [Teacher Ishi architecture and checks](docs/TEACHER_ISHI.md).

## Local development from VS Code

Open the `QuizNa` project folder in VS Code and run this in its terminal:

```sh
npm run dev
```

This starts the local API and Vite frontend when needed, or reuses existing QuizNa services without a duplicate-port error. Open http://127.0.0.1:5173. Keep XAMPP MySQL running for the configured local database. `npm run dev` also works inside `frontend/` when you only need the frontend; choose one workflow rather than starting both commands together.

VS Code also offers **Terminal → Run Task → QuizNa: Start locally**. Node.js 22 or 24 is required; `.nvmrc` selects 24 for users of nvm (`nvm use`). If a different app occupies port 5173 or 3002, the command explains the conflict and leaves that process untouched. A running production preview should be stopped before starting the editable Vite development server.

## Security review (26 October 2026)

See [the security review](docs/SECURITY_REVIEW.md) for tested protections, dependency patches, rate budgets, database preservation results, and deployment limits. Run `npm run test:security` for the bounded, isolated backend abuse checks. This starts its own loopback API with disposable in-memory data; it does not modify XAMPP or expose a public link.

Public pages use the light palette. Teacher/student workspaces keep their saved light/dark preference and use a borderless moon/sun control. Koala Help is a compact, full-body mascot with role-sensitive guidance and read-only live reports. The landing-page format switch is an illustrative preview and does not create attempts or scores.


### Teacher-confirmed gradebook

The section gradebook is a spreadsheet-style table with student names, quiz scores, and totals, ordered by surname. Select an awaiting-confirmation cell or score to review the individual submission. Save grading corrections, then select **Confirm score**. Only explicitly teacher-confirmed, fully graded attempts contribute to gradebook totals and CSV. Retakes use the best confirmed result; a higher unconfirmed result does not replace it. Corrections revoke confirmation and must be confirmed again. Existing numerical scores are preserved, but pre-upgrade results initially await confirmation. Student score-release settings remain separate and unchanged.

For an existing XAMPP database apply `mysql/07_score_confirmation.sql` using the database administrator (the application account intentionally cannot alter tables). This additive migration has been applied on this computer. For Supabase apply `supabase/migrations/11_score_confirmation.sql` after 10; existing RLS remains authoritative. Confirmation uses a teacher-only endpoint, ownership checks, transaction locks, timestamps, and grade revisions to reject stale review requests. The leaderboard shows rankings and scores without answer-review controls.

Verification: `node scripts/test-score-confirmation-mysql.mjs` runs a disposable API/database flow and verifies that existing records are unchanged; `npm run test:database` also exercises confirmation, correction invalidation, and permissions in embedded PostgreSQL.

### Account type selection and PDF answer sheets
Sign-in and sign-up offer Teacher and Student choices. The backend validates the selected sign-in type against the authenticated profile; selecting Teacher never upgrades an existing student account. Public teacher registration remains controlled by the existing server policy.

Paper Exam supports photos and local PDFs (20 MB, up to 50 pages). Choose a page, scan it, and review the detected answers before saving. PDFs render locally using a bundled PDF.js worker; QR ownership checks and existing grading/confirmation rules still apply. Password-protected PDFs require an unlocked copy. Essay reading remains optional and requires the separately configured AI provider.

### Subject workspaces
Teacher home is now Subjects. Create a subject for a reusable section, then create quizzes inside it or add an existing quiz already assigned to that section. Students join once with the subject's `SUB-` code. Subject pages contain published online quizzes, paper exams and links to their own result reviews. Existing individual quiz codes still work from Previous quiz activity.

A subject is scoped to one teacher and one section. Sharing its code enrolls a student in that subject and adds them once to the section roster; joining again cannot duplicate either record. Teachers control subject leaderboard visibility. Subject rankings use each member's best **confirmed, fully graded, released** score per quiz, filtered to that section. Unreleased scores and unfinished grading never enter student rankings.

Apply `mysql/08_subject_rooms.sql` for XAMPP or `supabase/migrations/12_subject_rooms.sql` for Supabase after previous migrations. The migrations group existing subject-labeled quizzes by teacher and section and preserve questions, versions, answers, score confirmations and quiz codes. Unlabeled/unassigned quizzes remain under Unassigned quizzes on teacher home. For the checked local migration helper run `node scripts/migrate-subjects-mysql.mjs` with administrator migration credentials; the API continues using its restricted database account. Subject RLS denies browser writes; joining uses an authenticated, rate-limited API and a service-only PostgreSQL transaction.

Validation: `npm --workspace=backend test -- --runInBand subjects.spec`, `npm --workspace=frontend test -- --run tests/Subjects.test.tsx`, `npm run test:database`. `scripts/test-subjects-mysql.mjs` is a local sample-data integration check and requires the existing private demo fixtures under `.local/`.

### Keeping the code clean
Run `npm run check` before a build to catch type errors and unused code in both workspaces. Subject cards and leaderboards live in `frontend/src/components/subjects/`; their shared layout is in `frontend/src/styles/subjects.css`. See `docs/CLEANUP.md` for the verified cleanup scope and validation.
