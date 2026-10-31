# Bulk multiple-choice entry and typed points

Verified locally on 20 October 2026 (Asia/Manila).

## Delivered

- **Paste questions** in the quiz editor, alongside the existing single-question editor.
- One paste accepts common numbered/unnumbered multiple-choice layouts, mixed letter casing, inline or separate choices, wrapped lines, answer labels and answer-key sections. The formatter preserves question/choice text and never invents a correct answer.
- Editable review includes prompts, choices, answer selection, individual points, add/remove choices, and remove question. Missing or ambiguous keys block addition until the teacher selects an answer. Up to 100 questions per paste and 2–8 choices per question.
- Draft source, preview and import identity survive closing/reopening in the same browser tab when session storage is available. Successful addition clears the draft. Start over discards it explicitly; sign-out clears local paste drafts.
- Batch creation validates teacher ownership, inputs, choices, answer keys and decimal precision. All rows are validated before writing. MariaDB commits the batch transactionally. The Supabase path uses one bulk operation with duplicate-ID protection. Deterministic import IDs prevent repeated or simultaneous requests from duplicating a batch.
- Plain typed points in question authoring, bulk review and grading, with decimal keyboards on supported mobile devices. Clearing a field keeps it blank. Missing grades are rejected beside the field rather than silently awarding zero. Entered grades are checked against maximum points.
- Bounded 512 KiB JSON handling supports long quizzes with Unicode/serialization overhead. Oversized requests return a safe message without partial writes.

No new runtime dependency, database migration or external AI credential is required. This is a deterministic local formatter, not semantic AI analysis. Arbitrary document layouts can require corrections in the preview. Existing single-question editing, publishing and grading remain available.

## Validation

- Backend and frontend production builds pass.
- **61 tests / 12 suites pass**: includes 14 new formatter, numeric-input and import-service tests. Covers mixed formats, wrapped lines, missing/unmatched/conflicting keys, 100-question limits, markup as inert text, blank versus zero, decimal limits, ownership, whole-batch validation, ordering, concurrent retries and changed replay rejection.
- **12 real XAMPP import integration checks pass**: role/ownership, invalid-key rollback, decimal precision, simultaneous imports, persisted order, restart-safe replay, published delivery without private keys, decimal manual grading and result release, a 100-question long-text batch, batch limits and safe oversized-body rejection. Evidence: `question-import-check.json`.
- **22 existing full-flow integration checks pass** with new teacher/student accounts: authentication, all four question types, publication, saving/reconnect, immutable versions, concurrent submission, grading, independent release, results, CSV, monitoring and logout. Evidence: `full-flow-check.json`.

## Browser verification

Using disposable accounts and a disposable quiz:

1. Pasted two questions with mixed inline/separate choices and a missing key. The preview found both, kept the recognized answer and blocked saving until the second key was selected.
2. Cleared the first points field; it stayed empty and adding was disabled. Typed `1.25`, added both questions together, and verified the quiz listed them with `1.25` and `1.5` points.
3. Created an essay through the existing editor. Blank points produced an inline error; typed `1.5` saved correctly.
4. Published, submitted answers as the fixture student, opened grading, and verified the ungraded essay field started empty. Blank submission produced a validation message. Typed `1.25` and verified the total became `4 / 4.25` and the attempt was graded.
5. Verified the validation message appears beside the score field. Closed/reopened another preview and verified its questions and selections were restored; saving then cleared the draft.

Screenshots: `paste-questions-preview.png`, `typed-grading.png`. Disposable browser and automated fixtures were removed after verification; existing user data was preserved.

Hosted Supabase and Render were not exercised during this local change. The existing production architecture is retained.

## API references checked

- [React controlled inputs](https://react.dev/reference/react-dom/components/input)
- [Supabase bulk upsert and duplicate handling](https://supabase.com/docs/reference/javascript/upsert)
- [NestJS body parser configuration](https://docs.nestjs.com/v11/faq/raw-body)
