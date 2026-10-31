# Section and quiz workspace

Teacher flow: Sections → select section → saved quizzes → Open quiz → Class list / Analysis.

- Selecting a section opens its assigned quizzes first, including saved drafts. Quizzes are ordered by subject and title.
- Each quiz opens inside the section workspace. Class list and Analysis are locked to the quiz's actual assignment ID; duplicate quiz/section selectors are hidden.
- Class list retains alphabetical surname order, status filters, CSV export, and answer review. Grading links return to that quiz's class list.
- Edit questions and Print & scan remain available inside the quiz. New quiz retains the selected reusable section.
- Students remains available for the reusable roster. Reports now contains only Gradebook and Leaderboard. Legacy reporting URLs remain compatible.
- URL state supports refresh and browser back navigation. Section switching clears the previously opened activity.

Backend ownership and role checks remain authoritative; no database migration or existing quiz/score rewrite is needed. Existing section assignment APIs resolve quiz-to-class relationships. At most four assignment lookups run concurrently.

Validation: 208 backend tests pass. 134 frontend tests pass. Frontend tests cover section-first quiz listing, isolation from other sections, nested class-list/analysis requests, hidden duplicate selectors, and Reports navigation. Production TypeScript/Vite build passes. Browser checks use existing XAMPP sample data without saving grades or modifying quiz records.

Section entry update: the overview now shows section cards only. Opening a card navigates to a dedicated section view with its title, New quiz, Quizzes/Students tabs, and assigned quiz list. Back to sections returns to the overview; selected section IDs are validated against owned sections before displaying content. Direct links retain the same view.
