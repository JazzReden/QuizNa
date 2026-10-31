# Reusable sections, student rosters, and security

Verified locally on 20 October 2026 (Asia/Manila).

## Completed

- Teacher-owned reusable sections can be created before quizzes. Quiz setup selects existing sections rather than recreating their names.
- Up to 200 roster lines per batch, `Name | email`, validated before writes. Email is normalized and unique per section. Repeated import updates the roster name without duplicate rows. Students may be added before registering.
- Each section/quiz pairing has a distinct access code. Retried attachment and repeated quiz saves preserve that code. A shared section roster is reused across quizzes; participation remains specific to a quiz and section.
- Class list shows Submitted, In progress, Not started, and concise counts. Missing students have no invented grades. Active retakes remain In progress while preserving the earlier best graded score. Attempts by students outside the roster remain visible.
- Class records group by section and surname. Scorebook CSV includes roster entries and participation; detailed CSV contains actual attempts. Leaderboards remain based on submitted, graded scores.
- Roster removal preserves answers, grades and attempt history. Existing section IDs and codes are preserved. Legacy sections with the same teacher/name were consolidated into a reusable class; existing section-code participants formed its initial roster.
- Sections page has Students and Quiz codes tabs. New Quiz displays section checkboxes with student counts. Manage sections opens the relevant class and quiz code. No long export explanation was reintroduced.

## Validation

- Backend/frontend production builds pass.
- 97 unit tests in 16 suites pass, including ownership, bulk roster validation, repeat imports, shared roster reuse, three participation states, surname ordering and rejecting XAMPP demo-token authentication.
- 56 embedded PostgreSQL checks pass: all migrations, owner-only RLS on reusable sections/rosters, no student/other-teacher reads, no authenticated direct writes, and service-only attachment/import transactions.
- 45 XAMPP integration checks pass: creation, distinct codes, repeated attachment, input validation, privacy, classification, restart recovery, safe removal, CSV, fixed-token rejection, headers, CORS and rate limiting. See sections-check.json.
- 23 local authentication checks pass: salted hashes, opaque sessions, expiry, refresh rotation/replay rejection, restart recovery, ownership, logout and concurrent registration.
- 22 full quiz-flow regression checks pass: fresh accounts, question authoring, immutable versions, saved answers, reconnect, concurrency, objective/manual grading, result release, exports and logout. See full-flow-check.json.
- Production client boundary checks pass: no backend markers or source maps in built assets; server source and environment paths are not served by the frontend.
- Browser verified with disposable teacher data: created a reusable section, imported two students, saw surname order, selected the section for a new quiz, saved it, viewed per-quiz code, and viewed Submitted/In progress/Not started plus a new quiz with both roster students Not started. Screenshots: reusable-section-roster.png, reusable-section-quiz-picker.png, reusable-class-progress.png. Test data was removed afterward; original user data was preserved.

## Security controls

- Backend authentication, teacher/student roles and resource ownership remain mandatory. XAMPP now rejects fixed demo tokens and password-free demo-account login; actual password sessions remain persistent and refreshable.
- NestJS rate limiting: baseline 120/min per IP+endpoint; login/refresh 20/min; registration 10/min; section creation/roster batch writes 20/min; attachment 30/min; exports 10/min. HTTP 429 includes Retry-After and a simple user message. Local spoofed forwarding headers cannot evade limits.
- Bounded roster batches, request body size and report worker queue; parameterized SQL and indexed class/roster access patterns. Public errors exclude SQL and stack traces. Authenticated API responses use private/no-store caching and browser hardening headers.
- Frontend build has no server secrets, grading logic, backend source or source maps. Vite development filesystem access is restricted; the client preview/static deployment serves frontend/dist only. Frontend JavaScript and authenticated API traffic necessarily remain visible in browsers.
- Local servers bind to loopback. Production demo mode is rejected. Public Supabase teacher registration remains disallowed. Render has static security headers and an explicit trusted proxy setting.

Rate counters are process-local and reset on restart; multiple API instances require shared storage/edge limits. Proxy trust must match the deployment topology. These checks reduce specific risks, and do not claim protection against every attack. Current roster edits affect historical class lists; roster membership is not verified school enrollment, and general quiz codes remain available for compatibility.

## Setup

XAMPP mysql/04_reusable_sections.sql was applied additively on this computer. Fresh installs include it in mysql/schema.sql. Hosted Supabase still requires migration 06_reusable_sections.sql after migration 05. No hosted deployment was performed. Keep XAMPP MySQL running. No new dependencies or credentials were required.

Official API references: [NestJS rate limiting](https://docs.nestjs.com/security/rate-limiting), [Vite filesystem boundaries](https://vite.dev/config/server-options).
