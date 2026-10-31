# Koala offline help

Koala recognizes over 1,700 teacher/student question phrasings across more than 180 reviewed answers. This counts natural and polite question variations, not 1,718 distinct product features or a trained language model. The catalog includes English and Cebuano examples. It covers subject/section organization, drafts, question import, grading and confirmation, CSV status filters, paper scanning, results, performance graphs, account access, privacy and study habits.

## Sources and matching

- `ishi-knowledge.ts` retains the original answer IDs and role/active-quiz filtering. It exports the finite question catalog for verification.
- `koala-extra.ts` contains the previous extended help.
- `koala-offline.ts` adds reviewed topic answers, hand-written alternate phrasings, and deterministic conversational/how-to variations. Edit the reviewed answer once to update all its variations.
- Matching first checks canonical questions and exact normalized catalog phrases. Role-specific search indexes are cached; bounded word matching and unique one-edit typo correction handle other wording. An unknown question stays unknown rather than generating facts.
- A broad ambiguous prompt such as “code” shows at most three choices instead of an arbitrary answer. Browse help still starts with six questions, keeping the conversation compact.
- Live-data requests remain separate, including selected Cebuano intents. Explanation questions such as “Why is my performance graph going down?” stay in local help rather than opening a live report unnecessarily.

## Permissions and data

Question text is matched in the browser. No external chat API or key is used. Current records still requires QuizNa’s backend connection and its existing ownership/release checks. Teacher-only guidance is excluded from student search; active quiz help stays limited to technical topics. There are no database mutations or grading actions in the helper.

## Verification

164 frontend tests passed, including all catalog mappings for allowed roles, at least 1,000 distinct normalized questions, typo handling, out-of-scope requests, role/quiz restrictions, and the three-choice clarification UI. Root typecheck and frontend production build passed. The student UI was checked with “niubos akong graph” and returned its relevant explanation immediately. Existing quizzes, answers and scores were not changed.
