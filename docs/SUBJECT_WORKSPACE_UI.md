# Subject workspace redesign

The subject view now has a compact identity header and breadcrumbs, a focused quiz work panel, and a teacher-only settings rail. An empty subject offers one clear New quiz action. Populated subjects have local title search and status filters with an explicit clear-filter state. Existing quiz-opening, code-copying, leaderboard visibility, result reviews and reuse endpoints are preserved. The settings rail adds direct links to the existing section roster and gradebook.

The green palette is retained. The layout stacks on phones, uses a compact rail on tablets, supports dark theme variables and preserves reduced-motion preferences. No database schema or backend behavior changed.

Design references: Google Classroom classwork organization (https://support.google.com/edu/classroom/answer/9093681), Carbon empty states (https://www.carbondesignsystem.com/building-blocks/core/patterns/empty-states).

Validation: all 148 frontend tests, frontend/backend TypeScript checks, frontend build, live XAMPP access/ownership checks and unchanged-record hashes. Browser viewports 390px and 820px had no horizontal overflow. A disposable empty subject was used for the screenshot and removed only after confirming it had no quiz links or members. Existing subjects, quizzes, questions, student answers and scores remain unchanged. Phone preview build was updated. Physical-device testing was not performed.
