# QuizNa security review — 26 October 2026

This is a local application review and regression run, not a penetration-test certification or a guarantee against every vulnerability. No new Cloudflare tunnel was started. Public-link testing waits for the owner's confirmation.

## Changes

- Patched the known body-parser and Multer denial-of-service advisories. The final npm advisory audit reports **0 known vulnerabilities**, including development dependencies. Multer 2.5.0 is pinned at the workspace root, with the NestJS adapter declared there too so npm's linked-workspace resolution applies the `$multer` override consistently. The backend also declares its upload runtime. Do not remove this override until the adapter's own pin is patched and the lockfile audit is clean.
- Added bounded request admission **before JSON parsing, authentication and database access**: 300 requests per 10 seconds and 6,000 per minute per trusted client IP; at most 64 active HTTP requests, 32 per IP and 4 multipart uploads. Rate-state storage holds at most 10,000 client entries and expires inactive entries.
- Added a shared **240 requests/minute per verified account**, spanning endpoints and IPs. Existing stricter login, registration, paper, AI and CSV throttles remain. The default endpoint IP limit is 600/minute to accommodate classroom Wi-Fi; access-code lookup is 60/minute.
- Bounded local password work to 2 executing scrypt operations and 12 waiting operations. Password verification remains asynchronous, salted and timing-safe; unknown emails perform password work too. Overload returns a safe retry response.
- Bounded HTTP headers, uploads and JSON; rejected compressed JSON requests, malformed credential objects, oversized fields, invalid nested choices, invalid short-answer keys and out-of-range settings. Header/body/idle timeouts are explicit. JSON is limited to 512 KiB, multipart uploads to 8 files of 700,000 bytes each with 4 concurrent requests, and declared multipart bodies to 6 MiB.
- Preserved parameterized SQL, database ownership checks, private answer keys, safe errors, security headers, production source-map restrictions and frozen quiz versions. Local database concurrency was already bounded to 4 connections and 100 queued connection acquisitions; local write transactions are deliberately serialized.
- The client honors 429/503 retry delays without repeatedly fetching the same endpoint. Background refresh pauses offline/hidden and coalesces focus events. This improves client behavior; security is enforced independently on the server.
- Replaced the human assistant with **Koala Help**, using the existing QuizNa mascot and palette. The launcher is a compact full-body koala cutout, 52 × 64 CSS pixels with a 56 × 70 pixel touch target; its matching face appears in the conversation. Guidance and live records retain role, ownership, quiz-taking and score-release restrictions. This remains built-in guidance plus authorized live reports, not an unrestricted generative chat model.
- Public marketing/auth/guide pages stay light; workspace dark preferences are retained, with a borderless moon/sun button. The landing page includes a sample online/paper preview switch.
- Analysis filters survive URL refreshes. QR photo upload is disabled while the camera is active. Capture, answer review, explicit teacher confirmation and server grading remain separate. Decorative animations now settle rather than running indefinitely; reduced-motion preferences are respected.

## Verification

- **203 backend tests**: auth and ownership behavior, deadlines, warning deduplication, grading, concurrency, idempotency, snapshots, bounded worker queues, AI review and new request/password budgets.
- **112 frontend tests**: table/release behavior, QR/camera/review flows, Koala role-sensitive guidance, refresh cleanup, offline suppression and server backoff.
- **79 PostgreSQL/PGlite migration/RLS checks**: students cannot read private keys, other students' attempts or paper-sheet identities; teachers cannot read others' records; client signup metadata cannot grant teacher access; atomic attempt and paper operations preserve deadlines, editions and repeated-save behavior. This is an embedded PostgreSQL test, not a live Supabase deployment test.
- **27 isolated HTTP abuse checks**: unauthenticated routes, teacher/student restrictions, forged tokens, malformed and oversized JSON, compressed bodies, object credential injection, malformed QR codes, input bounds, access-code brute-force limits, spoofed forwarding headers, verified-account limits and a bounded 320-request burst spread across routes. Runs on its own loopback API with in-memory fixtures.
- **22 real XAMPP full-flow checks**, **23 local authentication checks** and **43 paper-exam checks**, using disposable accounts/quizzes and cleaning up only those fixtures. Paper checks include multipart AI-upload authorization with the provider disabled, QR ownership/tampering, explicit review, objective grading, manual essays, repeated/concurrent saving and restart persistence.
- Compiled-client private-file and source-map boundary checks; compiled-preview gateway tests; frontend and backend builds.
- Existing quiz/score table hashes match before/after: **10 quizzes, 47 attempts, 303 saved answers**, plus unchanged questions, versions, incidents, paper sheets, sections and rosters. No sample scores were edited by this review.

Generated abuse-test evidence: [BACKEND_SECURITY_CHECK.json](BACKEND_SECURITY_CHECK.json). Data preservation evidence: [ISHI_DATA_CHECK.json](ISHI_DATA_CHECK.json) (legacy filename retained).

## Remaining deployment requirements

- These counters and concurrency gates are process-local. Multiple production API instances need shared rate-limit storage and infrastructure-level DDoS/edge protection. They do not provide Facebook-scale infrastructure. Aborted HTTP requests do not cancel every already-running database operation; database pool/queue bounds remain a separate safeguard.
- XAMPP is a development-only adapter. Production requires Supabase credentials, real deployed RLS verification, a suitable backup/restore policy, monitoring and capacity testing with the intended class size.
- Review the actual trusted proxy path before changing `TRUST_PROXY_HOPS`. Raw visitor forwarding headers cannot be used as identity. A temporary public preview strips forwarding headers, so its clients share an upstream IP budget.
- Rotate provider keys previously pasted into chat before public testing. Secrets stay in the backend environment; no AI provider was invoked by this security run.
- Real phone camera accuracy depends on print scale, focus, lighting, complete corner markers and handwriting. Software/fixture tests do not replace a physical printed-sheet test. AI essay suggestions still require teacher review; no scan or AI output can silently change a saved score.
- Set `LOCAL_REGISTRATION_ENABLED=false` for controlled public previews. Existing teacher/student accounts can still sign in; local testing otherwise keeps registration enabled. Production teacher signup remains administrator-only.
- A public preview must serve compiled assets through the restricted gateway, not expose Vite, repository files, XAMPP or a database port. Start a fresh Cloudflare link only after confirmation.

## References

[NestJS rate limiting](https://docs.nestjs.com/security/rate-limiting), [Express trusted proxies](https://expressjs.com/en/guide/behind-proxies/), [Node HTTP timeouts](https://nodejs.org/api/http.html), [body-parser advisory](https://github.com/advisories/GHSA-27r3-jxmh-p828), [Multer advisory](https://github.com/advisories/GHSA-q7qp-rjg7-q26m).
