# Teacher section roster update

Sections now show teacher-owned class cards, current roster counts, section search, student search, a last-name-sorted roster, and a section-filtered Gradebook link. Existing quiz-code and Print & scan flows remain available. Paper links carry the selected reusable section into the matching quiz section. No manual Add students button was introduced.

The browser uses the existing authenticated sections API. The backend restricts all section routes to teachers, checks ownership before roster access, sorts class names naturally, and sorts students by family name with stable full-name/email tie breaks. Visible rosters refresh at most every 20 seconds, with the existing coalescing/offline/hidden-tab protections. Stale responses from a previous selection cannot replace the current roster.

QR identity remains the source of truth: each prepared answer sheet links to its frozen exam version, assigned student and quiz section. The camera does not infer the student's identity from handwritten name/section text. A copied sheet still identifies its assigned student, so the teacher must check the physical name against the displayed identity before confirming a result.

Validation: frontend section card/selection/search/code-loading tests; backend reusable-section/ownership/paper-service tests; real XAMPP API checks for counts, surname ordering, duplicate emails, anonymous denial, student denial, foreign-teacher denial and unchanged saved score hashes. See SECTION_ROSTER_CHECK.json. Phone (390px), tablet (768px), desktop and dark-mode layouts were reviewed.
