# Quiz code entry

For an online quiz, choose **Quiz entry → Require quiz code** or **No code required** in the editor, then save. New quizzes select code entry by default. Existing quizzes retain direct entry until their teacher changes this setting. Paper exams do not show this control.

Protected quizzes ask students for the existing quiz/section access code after **Take quiz** or clicking the quiz title. Teachers see explicit **Yes — Require quiz code** and **No — Open without code** choices. This is a shared entry code, not a separate password. Joining a subject does not disclose protected quiz codes. The backend checks membership, the exact subject–quiz assignment, section, publication, and exam format. The entry endpoint is rate limited. Correct entry opens the instructions; only starting an attempt starts its timer. An active attempt resumes with its original deadline and warning count.

When a new attempt is unavailable, quiz-opening buttons and title links are hidden. Completed attempts keep **Review result**. An unfinished own attempt keeps **Resume quiz**. The list explains whether the quiz is not open yet, closed, or at its attempt limit. Backend availability and attempt restrictions remain enforced.

## Database setup

The current XAMPP database has already received the additive column migration. For another existing MySQL installation, apply `mysql/09_quiz_entry_code.sql` using a migration account with ALTER privileges. Keep the runtime application account restricted to its existing data permissions. Fresh installations include the column in `mysql/schema.sql`.

For Supabase deployment, apply `supabase/migrations/13_quiz_entry_code.sql` after the earlier migrations. Existing RLS and browser-role restrictions remain in place.

## Validation

Type checks and builds passed. Automated coverage checks boolean input validation, role and ownership restrictions, protected-code visibility, exact quiz/section verification, direct entry, resume behavior, editor persistence, and student navigation. Database integration checks passed.

Live XAMPP testing verified that a wrong code creates no attempt, correct entry starts no timer, and repeated starts return the same attempt and deadline. Temporary test records were removed. Existing quizzes, questions, scores, rosters, subjects, and settings were checked unchanged; see `QUIZ_ENTRY_MYSQL_CHECK.json`.
