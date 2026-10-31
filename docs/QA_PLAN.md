# QuizNa QA plan

This checklist covers the current product. Automated passes do not mean physical camera accuracy, AI grading quality, production configuration, or 500-user capacity have been certified.

## Run automated QA

Start the normal local app and XAMPP, then run one command from the repository root:

```sh
npm run qa -- --mysql
```

For checks that do not need a disposable MySQL database:

```sh
npm run qa
```

The complete command checks types, production builds, backend/frontend tests, PostgreSQL transactions and RLS, gateway boundaries, bounded API abuse, secrets/source exposure, dependency advisories, and isolated XAMPP workflows. Tests never need to call an external essay AI provider.

The MySQL phase creates a unique `quizna_qa_*` database and a temporary DML-only account. It loads the schema, runs scenarios there, and removes both afterward. It never points those tests at the configured application database. A local migration administrator is needed only to create/drop this sandbox. On this Mac, the XAMPP local root account is available. On another computer, provide `QA_MYSQL_ADMIN_USER` and `QA_MYSQL_ADMIN_PASSWORD` in the shell running QA; do not commit them or place them in frontend configuration. Existing application credentials are not changed.

Only one QA run may execute at a time. Avoid separate backend builds during integration tests. The runner prevents two QA commands from rebuilding concurrently.

## Evidence and results

- `.local/qa/reports/QA_LATEST.json`: most recent overall statuses, durations, test counts and advisories.
- `.local/qa/reports/QA_MYSQL_LATEST.json`: sandbox cleanup and individual database scenarios.
- `.local/qa/reports/QA_SUBJECT_ENTRY_COPY.json`: enrollment, code entry, confirmation and copy workflow.
- `.local/qa/`: private diagnostic logs. Do not publish these logs or attach them without reviewing for generated account/session details.

`PASS` means the listed automated checks passed; `FAIL` needs investigation; `WARN` requires review. The known unpatched low-severity development-only `deepmerge` advisory is recorded as a warning. Any production dependency advisory fails the gate. No audit issue is suppressed.

## Automated coverage

| Area | What is checked |
|---|---|
| Accounts | Teacher/student registration, login, duplicate emails, password rules, token expiry, refresh rotation, logout and restart persistence |
| Authorization | Anonymous, student and foreign-teacher access; owner-only quiz, reports, roster, QR, grading and copy access |
| Authoring | Four question types, pasted imports, unsaved questions, idempotent draft/question saves, points/criteria validation and frozen published editions |
| Subject enrollment | Code validation, repeated/concurrent joins, one roster entry, subject ownership and private quiz codes |
| Quiz entry | Required-code and direct-entry modes, wrong section codes, no timer before Start, attempt limits and result-review links |
| Online attempt | Autosave retry, reconnect/restart recovery, server deadlines, event deduplication, third-incident finalization, repeated/concurrent submission |
| Grading | Objective scores, written grading, frozen criteria, review-required paper saves, stale/repeated confirmation and no unconfirmed gradebook totals |
| Reports | Section filtering, surname order, compact CSV columns, best confirmed scores, totals, aggregate question analysis and score-release restrictions |
| Paper exam | Stable question/option order, QR identity/token/ownership, long-bond layout, multi-page handling, ambiguous marks, double shading, saved-sheet protection and AI-disabled behavior |
| Interface | Role-specific navigation, dialogs, editor controls, performance tables/graph, themes, camera controls and scanner worker reuse |
| Security | Bounded requests and uploads, forged headers/tokens, injection/mass assignment, safe errors, configured secret checks and private-file query variants |

## Hands-on acceptance checklist

Use test accounts and a dedicated test section. Do not edit existing student grades for QA. Record device/browser, case ID, result, evidence and any defect.

| ID | Action | Expected result |
|---|---|---|
| M01 | Sign in as Teacher and Student in separate browser sessions | Correct role and pages; neither session changes the other |
| M02 | Check pages at phone portrait, tablet portrait/landscape and laptop sizes | Readable compact text; no page-level sideways scrolling; contained table scrolling where needed |
| M03 | Navigate login, signup, dialogs and quiz forms with keyboard | Visible focus, accessible labels, logical order and working Escape/focus return |
| M04 | Create a subject and section, paste MCQ/true-false/essay content, clear numeric fields | Blank numeric editing works; correct preview and validation; no lost draft questions |
| M05 | Publish a code-protected quiz and leave/reopen it | Teacher code remains visible/copyable; student sees an empty code field; wrong code is rejected |
| M06 | Publish a quiz with no-code entry | Enrolled student opens instructions directly |
| M07 | Start, answer, briefly disconnect, reconnect and refresh | Same attempt/deadline/warnings; saved answers restored; unsaved state clearly identified |
| M08 | Trigger tab hide/focus/fullscreen events | One action is deduplicated; first/final warnings; third incident finalizes with saved answers |
| M09 | Finish the last allowed attempt and return to subject | No opening/title link; Review result remains; active attempts retain Resume |
| M10 | Grade an essay, inspect gradebook, then confirm | Unconfirmed score excluded; confirmed score included; totals and CSV agree |
| M11 | Hold/release scores and correct answers independently | Student dashboard/result/performance obey release settings; answer keys stay private while held |
| M12 | Copy a quiz to another section | Draft opens with copied questions/criteria, new code, no scores; original remains unchanged |
| M13 | Inspect class list, gradebook, rankings and analysis | Correct section/student, surname ordering, no duplicate records; ranking has no answer-review action |
| M14 | Print a 60-point test at 100% on 8.5 × 13 in long bond | Header, QR, four markers and bubbles fit; no clipping; use actual print settings |
| M15 | Scan a real shaded sheet on phone/tablet camera | Correct prepared student/subject/section; all objective answers checked against the paper before saving |
| M16 | Try a wrong student's sheet, another exam's QR, rotated/dim/glare/cropped page and double marks | No silent wrong-person save; unclear marks require review or retake; wrong exam rejected |
| M17 | Scan all pages of a multi-page sheet and retry a page | No duplicate submission; all required pages/answers reviewed; earlier saved results protected |
| M18 | Upload a photo/PDF of a sample answer sheet | Matching QR and answers; clear errors for invalid/missing QR; no score saved without confirmation |
| M19 | If essay AI is configured, test sample handwriting with varied quality | Transcription/criteria suggestions are editable; teacher confirms; no automatic final grade or invented certainty |
| M20 | Check light/dark mode, loading, empty, error and save states | Consistent contrast, usable buttons, no hidden critical controls; landing stays light |
| M21 | Open Koala Help as each role | Relevant concise help; no extra access to held scores or another teacher/student's records |

These manual cases remain pending until recorded on actual devices. Existing fixture-image tests do not replace M14–M19.

## Capacity and public deployment gate

A real 500-user test is a separate staging exercise, not part of the default local suite. Use a staging database and synthetic accounts, ramp gradually (25 → 100 → 250 → 500), and model realistic login, subject lookup, autosave and submission intervals. Measure response-time percentiles, error rates, pool saturation and duplicate submissions. Test intended classroom/shared-Wi-Fi behavior separately from malicious bursts; legitimate users must not be blocked by aggregate limits. Stop on sustained overload. Do not run this load against the current XAMPP dataset or production student records.

Before public release, verify deployed Supabase migrations/RLS, Auth redirects, Realtime access, HTTPS camera permissions, Render/CORS/proxy settings, backups, secret rotation and shared rate-limit storage/edge protection where required. Use compiled assets for a public link; never expose Vite, XAMPP or repository directories.

## Defects and sign-off

Record defects with the template below. P0 (score/privacy corruption), P1 (blocked core flow), and security/data-loss defects block release. P2 usability problems need an agreed disposition; P3 visual polish can be scheduled. A clean automated run is required, alongside device and deployment acceptance relevant to the release. Do not describe untested capacity, camera accuracy or AI suggestions as certified.

```text
Case ID / title:
Severity: P0 / P1 / P2 / P3
Build/run ID:
Device/browser and role:
Test section/quiz (no passwords or tokens):
Steps:
Expected:
Actual:
Evidence (redact student data):
Owner / status / retest result:
```
