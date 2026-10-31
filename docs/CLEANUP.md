# Code cleanup — 29 October 2026

Removed the unrouted teacher quiz library, unused connection banner, and retired action-menu component. Current teacher home remains Subjects; student quiz-code history, section records, quiz editing, paper scanning and reports remain available. Retired library-only tests were removed, and the automatic refresh test now covers the actual subject dashboard.

Removed unused imports, variables and allocations on frontend/backend; preserved awaited grading and monitoring operations. Split subject quiz cards and rankings into focused components. Moved subject styling to its own stylesheet, removed 89 obsolete library CSS selectors, retained shared responsive rules, and simplified navigation to the links actually displayed. Subject cards have explicit accessible names. Grading uses a question-to-answer map rather than repeatedly searching each answer. Subject authorization and section lookup share one typed helper.

`npm run check` now enforces TypeScript unused-code checks for frontend/backend. This prevents unused declarations from quietly accumulating again.

Validation: 224 backend tests, 146 frontend tests, strict unused-code checks, frontend/backend builds, live XAMPP role/ownership/concurrent enrollment checks, and browser phone (390px) / tablet (820px) overflow checks. Existing quizzes, questions, versions, attempts, answers, scores and rosters passed unchanged-data checks. No migrations, credentials, demo records, printable sheets or artwork were deleted. Existing bundle-size advisories remain; they are not build failures.

A private source snapshot is retained at `.local/cleanup-20261029/source-before.tar.gz`; it contains source/configuration/tests, excluding environment secrets and database data.
