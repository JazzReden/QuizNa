# Quiz sections and teacher leaderboard

Verified locally on 20 October 2026 (Asia/Manila).

## Delivered

- Top navigation has separate **Leaderboard**, **Class list**, and **Sections** pages. Sections centralizes quiz-specific section creation and copying codes. Class list groups by section and sorts student last names A–Z; leaderboard remains score-ranked. Both result pages retain section filters, search, direct grading links, and exports.
- Distinct section access codes for each quiz. Section names are teacher-controlled, trimmed, and unique within a quiz. Students enter the section code through the existing Join quiz flow; the briefing identifies their section.
- Attempts retain their section and code across refresh/API restart. Switching section/general codes cannot bypass quiz limits or move a student's existing records. All modes retain the original server deadlines and immutable question snapshots.
- One leaderboard row per student, using the best fully graded submission's percentage. Equal displayed percentages share ranks (1, 1, 3). Pending grades stay unranked. A prior graded attempt remains ranked while a later retake awaits review, with Review pointing to the pending attempt. In-progress students are excluded.
- Existing submissions appear as Unassigned. Only the quiz owner can correct a submitted student's section; the correction updates their quiz attempts together and preserves grades, saved answers and warnings. Active attempts block correction. Other quizzes' sections cannot be assigned.
- Scorebook CSV has one student per row. Detailed CSV includes all attempts and question scores. Both honor the section filter (including Unassigned), group by section and sort student last names A–Z, case-insensitively with natural section numbering. All-sections exports keep a Section column. Filenames from the results pages identify the quiz and section.
- Scores update while the dashboard is visible and on window focus, with manual refresh available. Grading supports section/student filtering and opens the exact record selected from the scorebook.

The additive XAMPP migration `mysql/03_sections.sql` was applied locally. `mysql/schema.sql` includes it for fresh installs. `supabase/migrations/05_sections.sql` adds owner-only RLS and service-only transactional start/correction handling for deployment. No runtime dependencies or credentials were added. Hosted Supabase/Render delivery remains outside this local verification.

## Validation

- Backend and frontend production builds pass.
- **92 tests / 15 suites pass**, including section ownership, unique codes, grouping, resume, section-change restrictions, old records, tied rankings, retakes, pending grading and varied point totals.
- **43 embedded PostgreSQL checks pass**, including migration execution, owner/student/other-teacher RLS, private section codes, section-aware transactional starts, resume, blocked section switching, active-attempt correction rejection and owner-only submitted-record correction.
- **25 real XAMPP integration checks pass**: distinct codes; duplicate-name protection (including database collation equivalents); role/ownership; section briefing; ties; unassigned records; filtering; private ranking; code-switch/attempt limits; restart recovery; retakes; safe corrections; cross-quiz isolation; filtered/detailed CSV, surname export ordering and export authorization; simultaneous joins and in-progress exclusion. Evidence: `sections-check.json`.
- Existing full-flow regression checks cover creation, all question types, save/reconnect, publication, submission, grading, release, CSV, monitoring and logout. Evidence: `full-flow-check.json`.

## Browser verification

Used disposable accounts on the loopback alias in a separate browser session, preserving the user's main login and quiz drafts. Verified:

1. Ranked rows show two tied first places, a third place, and an unranked pending submission.
2. Created STEM C through Manage sections and saw its own generated code alongside STEM A and STEM B.
3. Filtered STEM B, then STEM A; searched Bob and opened Bob's exact grading record from Review.
4. Grading shows section labels and filtering controls.
5. A new fixture student joined with STEM C's code and saw STEM C on the pre-quiz briefing without consuming an attempt.

Screenshots: `teacher-leaderboard.png`, `teacher-section-codes.png`, `student-section-briefing.png`. Disposable fixtures and their temporary credential file were removed after verification. Existing user quizzes, accounts and scores were preserved.

## Design limits

Sections are per quiz; their names can be reused on other quizzes with distinct codes. Sharing a code groups a submission; it does not verify real-world enrollment. General codes remain usable for backward compatibility. Dashboard CSV filters apply to the selected section, while search affects the visible table only. Ranking uses rounded final percentages; release settings continue controlling student results independently.

RLS and privilege behavior were checked against [Supabase's RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security). Privileged keys stay on the backend; new section tables grant no direct student reads or authenticated writes.

## Surname ordering and quiz setup update

- Navigation: Quizzes → New Quiz → Sections → Class list → Leaderboard.
- Removed the long export explanation from leaderboard/class list screens.
- Class list and both CSV types use server-derived surname keys consistently, retaining section grouping and deterministic ties by full name/email. Registered names are not rewritten.
- Surname extraction tests cover comma-form names, common compound particles, suffixes, whitespace and single-word names. This remains a best-effort rule for legacy free-text names; `Last name, First name` disambiguates unusual compound surnames.
- Quiz editor accepts multiple section names before first save and displays saved section badges. Codes can be managed through the quiz-specific link. Retrying a partial section save uses the same saved draft and reloads existing sections to avoid duplicate codes.
- Browser verified a temporary new quiz with two sections (including an unqueued input saved directly), repeated save without duplicate sections, code management, and a fresh blank New Quiz form. The temporary quiz and its sections were removed. Existing user quizzes and sections were preserved.
- Builds and all 92 unit tests / 25 XAMPP checks pass. Screenshot `quiz-editor-sections.png` shows the temporary editor verification.
