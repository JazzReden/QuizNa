# Subjects

Teacher home: Subjects → subject → quiz → Class list / Analysis → one student's answers. Reports retain Gradebook and Leaderboard. Sections remain reusable class rosters. New quiz opened from a subject selects that subject and section; existing quiz and result URLs continue working.

Students: My subjects → Join subject (SUB code) → published quizzes / own result reviews. Subject joining is idempotent and adds one section roster record without renaming existing roster students. Existing sample roster accounts were enrolled during migration. Standalone quiz codes and past results remain under Quiz code or previous activity.

Each subject belongs to one teacher and one reusable section. Code sharing authorizes enrollment in that subject and section. Teachers should share codes only with their class. Subject quiz links require the same owner and an existing quiz-to-section assignment. Students cannot see drafts, answer keys or other students' attempts. Backend checks remain authoritative for deadlines and attempt limits.

Subject leaderboards are off by default. Only the owning teacher can enable them. Rankings include subject members in that section, using best confirmed, fully graded, released scores per published quiz. Ties share ranks. Unreleased scores never enter these rankings. Existing section gradebook and ranking rules are unchanged.

Migrations: MySQL 08 / Supabase 12. Existing subject labels group quizzes into section-specific subjects. Existing quizzes/questions/versions/answers/attempts and numeric scores are untouched. Unlabeled quizzes remain accessible on teacher home. The MySQL helper generates cryptographically random final codes and verifies hashes; production PostgreSQL uses random UUID bytes. All three new tables have RLS in Supabase, read-only browser grants, foreign keys and unique membership/link constraints. A service-only PostgreSQL RPC enrolls members and roster students atomically; MySQL uses the existing transaction mutex. Join endpoint: authenticated student only, 10 requests/minute plus existing account/IP budgets.

Verified locally: 224 backend tests; 152 frontend tests; 95 PostgreSQL migration/RLS checks; frontend/backend builds; live XAMPP authentication, ownership, invalid codes, repeated/concurrent enrollment, duplicate quiz linking, leaderboard restrictions and unchanged data hashes. Phone (390px) and tablet (820px) subject views have no page-level horizontal overflow. These are browser viewport checks, not physical-device tests.
