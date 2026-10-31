# Teacher Ishi

Teacher Ishi is a read-only QuizNa assistant for authenticated teachers and students. Her original face and full-body waving sprite are reused from the user’s AbangTa assets (`public/assistant/nadine.png` and `nadine-wave.png`), copied into QuizNa as `frontend/public/assistant/ishi*.png`. No AbangTa files are modified. The active `ishi-green-wave.png` variant recolors her cardigan to muted campus green. The launcher has no permanent label; “Ishi help” appears on pointer hover or keyboard focus. The header uses a centered head crop from the same sprite. Reduced-motion preferences pause animation.

## Product help and live reports

The 77 curated questions remain available (53 teacher/shared and 37 student/shared). Help is matched locally, with an explicit fallback for unknown questions. Recognized report requests, such as “Who has not started?” or “Show my scores”, use the same read-only services as dashboard reports. This is deterministic reporting, not an unrestricted generative AI chat, and needs no provider key.

- Teachers select an owned quiz and its section to see submitted, in-progress, not-started, pending-grading, and ranked results. A linked reusable section is required for gradebook totals.
- Students can see only their own latest attempt statuses/released, fully graded scores and subject performance. Subject percentages use the existing best-result weighting rules. Unreleased/provisional marks and answer keys never appear in reports.
- Up to three report cards refresh together every 15 seconds while the panel is open, online, and visible. Refresh preserves the draft question and replaces each report in place. Polling aborts on close/navigation/account changes, uses a 20-second timeout, avoids overlapping batches, and backs off after failures/429 responses. On failures, old cards are removed; denied access stops polling.
- During online quizzes (`/take/`), live reports are unavailable and only technical help is offered. Quiz shortcuts ignore keyboard focus in the helper. Fullscreen/monitoring rules are unchanged. The helper is hidden when printing.

## Security and data

`GET /api/assistant/options` is teacher-only and returns only safe labels/IDs for owned scopes. `GET /api/assistant/report` uses an allowlisted topic and UUID filters, authentication/role guards, resource ownership checks, and `Cache-Control: no-store`. Both are rate-limited to 60 requests/minute per endpoint/IP. Unknown report filters are rejected. The student identity comes from the authenticated session, never a query parameter. Teacher reports reuse ReportsService/TeacherInsightsService; student reports reuse AttemptsService’s release-gated projections. No new database tables or migrations are needed. No scores, questions, attempts, rosters, or grades are written by this feature.

Chat text and records are not sent to an external AI provider. Responses are kept in component memory and cleared when context/account changes. A release change is reflected on the next successful refresh; the UI does not promise instantaneous updates.

## Validation

- `npm --workspace=backend test -- --runInBand`: ownership, authentication, role/section isolation, release revocation, provisional grading, live status/score transitions, and existing regressions.
- `npm --workspace=frontend test`: content, report intents, focus/Escape, no report access during quizzes, polling, offline/hidden pauses, timeout/rate-limit handling, cleanup, multi-card refresh, and scope/error clearing.
- Browser and local API checks cover real read-only sample reports and responsive panels.
- `node scripts/check-ishi-data.mjs --baseline`, then `node scripts/check-ishi-data.mjs`: hashes ten data tables to verify existing records remain unchanged. Report: `docs/ISHI_DATA_CHECK.json`.
