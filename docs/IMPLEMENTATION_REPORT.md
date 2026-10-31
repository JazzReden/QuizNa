# QuizNa implementation review

Reviewed and improved 19 October 2026 (Asia/Manila).

## What existed

A React/Vite/TypeScript frontend, NestJS modules, Supabase schema/RLS files, seeded in-memory demo, Render blueprint, and 16 passing backend tests. Both dashboards, authoring, quiz-taking, monitoring, grading, and reporting screens were present. The workspace was not initialized as a Git repository.

The initial tests and build passed, but several README claims were stronger than the implementation. The review prioritized correctness and data protection over adding more dashboard decoration.

## Gaps found and addressed

| Area | Original weakness | Change delivered |
| --- | --- | --- |
| Authentication | Passwords ignored; arbitrary IDs and x-user-id accepted; teacher role inferred from email; demo identities accepted in live mode | Verified Supabase password login/JWTs, rotating refresh sessions, trusted teacher promotion, explicit local-only demo mode |
| Database failures | Errors silently fell back to seeded process memory | Live failures return safe retryable errors; missing production credentials fail startup |
| RLS | Students could read question/snapshot keys and write deadlines, scores, warning counts and profile roles | Replaced policies; revoked direct client writes; student quiz content and released results served through authorized API |
| Publication | Snapshot stored but delivery, saves, grading and results read mutable draft questions | Complete published snapshots used throughout; live publication is transactional; option order stable across refresh |
| Concurrency | Submission and incident checks were read-then-write; duplicate starts and stale saves could race | Per-attempt row locks and per-student/quiz advisory locks in PostgreSQL; demo keyed locks; unique active attempt constraint |
| Expiry | Closed browsers left attempts active indefinitely | API startup/periodic sweep, database expiry RPC and independent pg_cron setup instructions |
| Autosave | Debounce-only saves, no safe retries/flush; answer DTO missing validation decorators meant global whitelisting removed answer data | Ordered save queue, retries/backoff, pending draft recovery, acknowledgement status, save flush before manual submission, validated answer payloads |
| Monitoring | Deduplication only in process memory; event listener cleanup ineffective; terminated attempts could be reopened by pardon | Persistent deduplication, transaction-safe third-incident finalization, real cleanup and setup grace, immutable finalized attempts |
| Score privacy | Automatic grading implicitly released scores; other endpoints leaked totals and answer grades | All student response paths respect explicit teacher release; answer keys never released during active attempts |
| Teacher tools | Availability absent from editor; existing questions lacked editing UI; historical grading used current draft | Availability inputs/date validation, question editing, frozen-question teacher attempt detail and grading |
| Reports | Promise queue presented as worker threads; draft-only CSV columns; CSV formula risk | Actual bounded worker threads, edition-specific frozen columns, formula neutralization |
| Deployment | Misaligned ports/CORS, unsafe fallback, fixture migration depended on nonexistent Auth users; build included test-imported frontend source | Consistent env examples, configured origins, separate Auth-aware development seed, production demo disabled, dedicated backend build config |
| Accessibility | Dialogs allowed keyboard focus to escape | Reusable focus-trapping dialog with focus restoration; keyboard quiz shortcuts pause while dialogs are open |

## Distinctive addition: submission receipt

Students receive a server-backed receipt even while scores are withheld. It shows the attempt reference, received time, quiz deadline, assigned edition, saved-response count and incident timeline. This helps distinguish “I typed an answer” from “the server received it,” and gives a concrete reference for technical disputes. The receipt exposes no answer key or unreleased score.

Browser-verified example: [submission-receipt.png](submission-receipt.png).

## Validation

- Production build: NestJS and React/Vite passed.
- Jest: **45 tests across 9 suites passed**, including simultaneous starts/submissions, ownership/role restrictions, deadline boundaries, persisted recovery, queue ordering/retry, frozen-question editing/deletion, deduplication after service restart, third-incident finalization, objective/manual grading, release privacy, DTO whitelisting, live Auth contract mocks, and actual worker-thread execution.
- Embedded PostgreSQL: **32 checks passed**. Executed migrations and transactions, exercised publication/manual grading, repeated saves/finalization, deadline expiry, incident deduplication/termination, and direct RLS denial of keys, protected attempts, role escalation, RPC invocation and cross-teacher access.
- Compiled API: **27 HTTP smoke checks passed**, including the complete teacher publication → student answering/resume/submission → manual grading → score/answer release → CSV/statistics flow. This caught and fixed a missing report-worker input after moving CPU work to real threads. Repeated builds also verify the Nest startup artifact exists.
- Browser: student demo authentication → join CS101 → instructions/limitations → fullscreen Start → objective/written answers → saved status → submission confirmation → receipt with scores withheld.
- Production dependency audit: `npm audit --omit=dev` reported **0 advisories**. Full development-tree audit still reported **34 advisories** (5 moderate, 29 high), primarily the existing Jest/tooling dependency graph. Compatible audit fixes were attempted; a breaking toolchain upgrade was not forced. Remove dev dependencies from deployed runtime installations where practical and track this separately.

## Configuration and validation still required

1. Supply your Supabase project keys, apply migrations, configure Auth email/redirects, and promote approved teachers. Do not use demo mode for real data.
2. Enable the pg_cron expiry job so deadlines finalize while the API is offline.
3. Set actual Render origins and deploy the supplied blueprint. No deployment was performed.
4. Verify hosted Auth/signup/email, refresh rotation, RLS-backed Realtime delivery, and cron execution using your project. Those external services were not contacted with real credentials.
5. Run staging tests using independent database connections and realistic class sizes. Embedded PostgreSQL validates SQL and policies but does not simulate distributed API failures, independent Postgres connections, or hosted Realtime.
6. Review legacy data before upgrading: duplicate active attempts block the new unique index, older users may need profiles, and historical snapshots that omitted keys require manual review. No existing live data was migrated here.

The application does not monitor other devices or prove cheating. Offline drafts can be retried only while the server deadline remains open. Demo storage resets on restart. Password-reset UI, institutional SSO, and a full administrative teacher-approval portal are outside this pass; teacher approval uses a trusted administrator workflow documented in the README.

## XAMPP local persistence follow-up — 19 October 2026

Added a separate MariaDB development adapter while retaining the Supabase production path. Created `quizna_local` in the existing XAMPP MariaDB 10.4.28 installation, imported eight InnoDB tables (seven entity tables plus schema/seed metadata), created a restricted application account with a generated password, and configured the ignored backend environment file. No existing databases or accounts were overwritten.

The local adapter uses parameterized SQL, JSON conversion for answer/snapshot fields, one-time transactional seeding, pool cleanup, and transaction context propagation. A database mutex row serializes local business transactions across processes. Published quiz delivery, answers, warning counts, grading and release all use persisted records; database failures do not fall back to memory. SQL foreign keys and uniqueness constraints cover quiz ownership, versions, attempts, active attempts and answer identity.

Verification against actual XAMPP: **22 persistence checks passed**, including stopping and restarting the compiled backend, restoring the same attempt/answers/deadline/warnings, retaining edited drafts and frozen versions, deduplication after restart, third-incident finalization, objective/manual grading, score release and rollback. The test removes only its own fixture quiz. Evidence: `docs/mysql-persistence-check.json`. Existing automated suites, build, and PostgreSQL migration tests were also rerun.

Local mode retains seeded demo authentication and polling monitoring. It does not implement production MariaDB authentication or Supabase Realtime. Data from the previous temporary server was backed up locally before switching (one quiz, zero attempts). Future saved changes use MariaDB and survive backend restarts. XAMPP must be running; attempt deadlines continue while the API is stopped.

## XAMPP account registration and login — 19 October 2026

Added local teacher/student email-and-password registration, password verification, database-backed opaque sessions, rotating refresh tokens, logout revocation, and backend-provided UI capabilities. Existing quiz data and demo logins are preserved. The additive `mysql/02_local_auth.sql` migration adds `local_auth_credentials` and `local_auth_sessions`; credentials and tokens are not mixed into public profiles. The initial schema includes these tables for fresh installs.

Passwords use random salts and asynchronous scrypt; only password hashes and token digests are stored. Registration and session rotation are transactional, duplicate emails cannot overwrite profiles, new account roles are loaded from the database, and arbitrary user IDs remain invalid credentials. Local self-registration of teachers remains explicitly development-only, and the backend binds to loopback in demo mode. Supabase registration still rejects unapproved teacher roles.

Verification: **23 real local-auth integration checks passed**, including teacher/student signup, same-password/different-salt checks, wrong-password handling, duplicate/concurrent email rejection, role/ownership checks, creating and answering a quiz as the new users, backend restart, persistent sessions, expiry, refresh rotation/replay rejection, and server-side logout. All disposable fixture data was removed. **47 automated tests** now pass, including dedicated password-hashing tests. No production Supabase configuration is required for these local accounts.
