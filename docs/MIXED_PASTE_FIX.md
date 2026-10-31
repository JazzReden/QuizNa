# Mixed paste regression fix

Verified 20 October 2026 (Asia/Manila).

The parser treated any `Answer key:` line as the start of a permanent answer-key section. An inline `Answer key: 2. C` therefore swallowed all later questions. Its loose key matching could also read the start of `4. A student...` as answer A.

Key entries must now consume the full line. Numbered questions resume ordinary parsing after either inline or standalone answer-key blocks. Lettered keys and `True`/`False` values are supported together. Conflicting keys still require teacher review.

The paste preview and batch endpoint now also retain explicitly labeled true/false and essay items. True/false uses the existing canonical choices and automatic grading. `Essay – 3 points:` supplies an essay with three points and manual grading. Missing type fields retain the previous multiple-choice behavior for existing imports and drafts. Every mixed batch passes the same ownership checks, whole-batch validation, transaction handling and replay protection.

The reported eight-question paste is committed as a regression fixture under `backend/test/fixtures/mixed-paste.ts`. It produces five multiple-choice items with keys C, C, A, B, C; two true/false items with keys True and False; and a three-point essay. No answer-key warnings are emitted.

Validation: both production builds pass; 66 tests in 12 suites pass; all 16 XAMPP import integration checks pass, including mixed-type save/replay, true/false grading, essay review and released results. Fixtures were removed by the integration test.

Browser verification used the existing original paste in the user's draft quiz. Back to paste → Organize & preview now shows **8 questions found**, **All questions are ready to add**, correct types/keys, and three essay points. The corrected preview was left open for review; no questions were added to or published in the user's quiz. Screenshot: `mixed-paste-fixed.png`.
