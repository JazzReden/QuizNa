# Unsaved quiz composition and Koala guidance

Teachers can add, edit, remove or paste questions on New quiz before supplying a title or saving. New questions are kept in the current editor and are stored only when Save quiz is chosen. Save before refreshing or leaving: this feature does not provide full unsaved-quiz recovery after a page reload. Existing saved quizzes keep their established question-editing flow.

A new quiz uses a teacher-scoped `client_draft_id`. Each pending question uses a teacher/quiz-scoped `client_question_id`. The server derives record IDs from these keys, so a lost response and retry do not create duplicate quizzes or questions. Pending questions are saved in batches of at most 100 and roughly 400 KB, below the API body limit. All question types and essay criteria are validated, with ownership checked on the server. MySQL batch work uses the existing transaction boundary; multi-batch saves can leave a partially saved draft if the connection fails. The editor keeps pending questions and offers retry, while preventing ambiguous changes until the save is confirmed. No save automatically publishes a quiz.

Koala's curated product knowledge now contains 137 answers for teachers and students. It includes unsaved questions, retry behavior, roster search, QR identity, paper preparation, scanning problems, essay review, timing, release permissions and study habits. Matching handles common aliases and bounded spelling variations using only vocabulary from the signed-in role's allowed guidance. The interface continues to show three relevant suggestions, with additional help available on demand.

This is expanded curated guidance, not model fine-tuning or unrestricted generative AI. It uses no paid provider, does not send chat text to an external model, cannot change records and cannot answer arbitrary unknown questions. Its fallback states this rather than inventing an answer. Active-quiz help stays limited to permitted technical guidance; live reports retain the existing server authorization and score-release checks.

Validation:

- 208 backend tests passed, including concurrent draft/question reuse, full-batch validation, ownership and frozen-version consistency.
- 131 frontend tests passed, including adding/editing/pasting without a save, retry keys, helper knowledge coverage, matching, fallback and role restrictions.
- The authenticated XAMPP test saved all four question types, retried individual and concurrent batch requests, checked published snapshot consistency and deleted only its disposable quiz. Existing quiz/score hashes matched afterward. See `UNSAVED_QUIZ_CHECK.json`.
- Production frontend/backend builds passed. The compiled phone preview and its loopback API were refreshed.
