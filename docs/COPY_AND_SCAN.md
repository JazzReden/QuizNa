# Copy quizzes and scan identity

## Teacher workflow

Open a subject and choose **Copy** beside a quiz. Choose a destination subject in another section, then **Copy quiz**. The editor opens the independent draft. Questions, answer keys, explanations, essay criteria, timing, attempt limits, randomization and code-entry preference are retained. The destination subject supplies its subject name. Review dates, result-release options and publish before sharing the new code.

Dates and score/answer release are reset. Submissions, grades, confirmations, incidents, published editions, paper sheets and student enrollments are never copied. Each copy receives new quiz/question/section IDs and fresh access codes. Network retries reuse a request identifier; concurrent retries return one draft.

The destination must be an existing subject owned by the teacher in a different section. A quiz already assigned to that section is rejected. Create the destination subject first when needed.

## Paper scanning

Prepared sheets are tied to a student, section and frozen exam edition. The QR carries an opaque sheet ID, page number and random token; the server validates the token and teacher ownership before returning identity. The review panel shows student, section, subject and exam. Existing QR sheets remain valid.

QR identification uses the prepared sheet record, not handwriting recognition of the name. Do not exchange prepared student sheets. Unclear marks remain reviewable. Essay handwriting and suggested grades still use the separately configured optional essay reader and teacher confirmation; QR scanning itself does not add a paid AI service.

The scanner now reuses one QR detection for the answer-reading pass. It does not decode the same captured frame twice. Preparing print previews no longer blocks student identification and mark reading. The image still retains its full scan resolution and corner-marker checks.

## Validation and deployment

- XAMPP integration: concurrent copies produced one draft, questions/criteria were preserved, fresh section code verified, student copying/QR resolution denied, no scores copied, and all original data verified unchanged after temporary-copy cleanup. See `COPY_SCAN_MYSQL_CHECK.json`.
- PostgreSQL integration: migration, copy ownership, idempotency, draft defaults, question criteria, destination assignment and browser execution denial checked by `npm run test:database`.
- Frontend tests cover destination filtering, draft navigation, retries, single QR detection, no-QR errors, and existing paper review behavior. Optical tests cover layout alignment, blank/uncertain/multiple marks and written-answer handling.
- Local image checks read all 40 objective marks and identify 4 written rows in the 60-point fixture, including perspective and dim variants. No score was saved. `SCAN_SPEED_CHECK.json` records local processing timings. These are software-generated image tests, not measurements from a physical phone camera; phone speed depends on hardware, image quality and network.
- Existing XAMPP tables need no new schema migration. Supabase deployments must apply `supabase/migrations/14_copy_quiz.sql` after migration 13. The copy function is transactional and executable only by the service role; browser RLS is unchanged.

API behavior was checked against the [official jsQR documentation](https://github.com/cozmo/jsQR) and [PostgreSQL function security documentation](https://www.postgresql.org/docs/current/sql-createfunction.html).
