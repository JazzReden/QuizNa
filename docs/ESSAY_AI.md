# Essay handwriting and reviewed grades

Paper Exam now supports optional handwriting transcription and rubric-based grade drafts using Google Gemini (free-tier testing) or the OpenAI Responses API. Online exams are unchanged. Live Gemini reading has now been tested with one AI-generated fictional handwritten response through the authenticated QuizNa endpoint. The words matched the expected text after case/punctuation normalization, and Gemini returned a 5/5 draft against the published criteria. The grade was not confirmed or saved. See [live test evidence](GEMINI_LIVE_CHECK.json).

## Enable locally

Gemini is selected on this laptop for free-tier testing. Create a key in [Google AI Studio](https://aistudio.google.com/apikey) using a project on the **Free Tier without paid billing enabled**. Google controls eligibility, available models, rate limits and daily quota; QuizNa cannot determine your project's billing tier from an API key. A key from a paid project can incur charges. Do not enable billing to bypass a quota error during free testing.

Add these **server-only** settings to `backend/.env`:

```dotenv
PAPER_AI_ENABLED=true
PAPER_AI_PROVIDER=gemini
GEMINI_API_KEY=your-own-gemini-api-key
GEMINI_ESSAY_MODEL=gemini-3.1-flash-lite
```

The local file selects Gemini 3.1 Flash-Lite and has a configured key. Gemini 3.8 Flash returned a temporary high-demand error during testing, so the available free-tier Flash-Lite model was explicitly selected locally. The adapter default remains Gemini 3.8 Flash if no model is configured. No automatic fallback is performed. Restart the backend after saving. Never put a key in `frontend/.env`, a `VITE_*` variable, source control, or chat.

Gemini's free-tier content may be used to improve Google's products. **Use fictional/sample handwritten essays for testing**, rather than real student submissions with personal information. The scanner displays the selected provider's disclosure. `store:false` disables stored interactions, but does not override Google's free-tier data-use terms.

Optional paid OpenAI support remains available by explicitly setting `PAPER_AI_PROVIDER=openai`, `OPENAI_API_KEY` and `OPENAI_ESSAY_MODEL=gpt-5.6-terra`. Existing installations with no provider setting continue to select OpenAI. QuizNa never automatically switches providers, enables billing or upgrades a project. A missing Gemini key, quota exhaustion or malformed response leaves manual entry available; it does not call OpenAI.

For Render, configure the chosen provider's backend environment variables in `render.yaml` and apply `supabase/migrations/09_reviewed_essay_grades.sql` after 08. This migration extends the existing service-only grading transaction with optimistic confirmation; XAMPP needs no schema change.

## Teacher flow

1. Open an unsaved prepared Paper Exam sheet and enable **Read essays with AI**.
2. Scan or upload a clear full-page photo with all four corner squares visible.
3. Inspect each essay crop beside its editable transcription. Inspect the criterion marks, adjust text/score/feedback, and select **Use this score** for grades you accept.
4. Confirm the reviewed answers and select **Grade & save**. Unselected essays remain awaiting grading. All scores follow existing result-release settings.

Changing a transcription clears its selected grade and requires a new score. Unclear writing is marked `[unclear]` and gets no suggested score. The teacher can transcribe and grade it manually. Blank responses can receive a reviewed zero. Suggested default criteria are visibly identified when the printed version has only a freeform guide.

A saved sheet cannot be read again through the AI endpoint. Open its existing result to grade or correct scores. Existing prepared sheets, answer layouts, records and manual grading remain valid.

## Implementation

- The browser worker aligns the photograph against all four page markers, supporting both frozen A4 and long-bond layouts. It rectifies only essay response boxes; QR/name/section headers stay outside those crops. Short answers retain the existing manual-entry workflow.
- Multipart uploads contain PNG crops, sheet ID and page index. The API checks teacher role, sheet ownership, unsaved status, matching essay count, image signature, dimensions and size before calling the selected provider.
- The selected provider receives frozen question text, essay guide, criteria and crops. Strict structured output supplies transcriptions and criterion levels. The backend computes numeric totals from frozen weights, validates completeness/uniqueness/ranges, and ignores model-supplied totals.
- Model instructions treat handwriting and question text as untrusted data. No tools or database access are given to the model. Model output still needs teacher review.
- AI results are drafts only. They never write answers or grades. Teacher confirmation first saves the paper answers using the existing idempotent transaction, then saves selected grades through the authorized grading service.
- Confirmed essay grades include the expected transcription and an ungraded requirement. XAMPP checks both inside its business transaction. Supabase migration 09 locks the attempt, checks the saved response and grade, and delegates the established grading transaction. An identical retry returns the existing grade; another grade or changed transcription triggers a conflict.
- A partial grade-save failure keeps saved answers and shows a retry control plus a result-review link. A refresh retains transcribed answer drafts locally, but images and AI grade selections are not stored in browser storage; after a saved-result refresh, finish pending grades on the result page.
- Limits: 6 upload requests/minute per IP, 60 uncached reads/hour per teacher, 2 simultaneous provider calls per backend process, 8 crops/request, 700 KB/crop, bounded pixel dimensions, 45-second provider timeout. Matching requests share a five-minute result promise cache (maximum 64 entries); failures are evicted. There are no automatic paid-provider retries. Limits/cache are process-local; use shared enforcement before scaling to multiple replicas.
- The phone proxy allows 60 seconds only for the essay-reading route, preserving other request timeouts. No source maps, server source or provider secrets are served.

## Privacy and accuracy

Only the response crops and question/criteria text are sent to the selected provider, but a student could write personal details inside a response. Follow school permission and data-handling requirements before enabling the feature. The API uses `store:false`; this disables response storage and is **not** a claim of zero provider retention. Provider data controls remain applicable. QuizNa does not log or store uploaded photos on disk. Temporary in-memory processing and draft transcriptions are described above.

Handwriting recognition, legibility classification, and suggested grades can be wrong. Review against actual student work and the rubric. Test clear, faint, crossed-out, blank, multilingual and partially obscured writing on your own devices before classroom use. The existing sample answered PDFs contain typed practice responses and do not demonstrate real handwriting accuracy.

Gemini references: [free-tier pricing and data use](https://ai.google.dev/gemini-api/docs/pricing), [API keys](https://ai.google.dev/gemini-api/docs/api-key), [image inputs](https://ai.google.dev/gemini-api/docs/image-understanding), [structured outputs](https://ai.google.dev/gemini-api/docs/structured-output), [Interactions API reference](https://ai.google.dev/api/interactions-api). The Gemini adapter uses the documented `/v1beta/interactions` endpoint, PNG `input` images, `response_format` JSON schema, `store:false`, and completed `steps` containing model-output text. It shares the same server-computed scoring policy and teacher confirmation as OpenAI.

OpenAI references checked during implementation: [image inputs](https://developers.openai.com/api/docs/guides/images-vision), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [model capabilities](https://developers.openai.com/api/docs/models/gpt-5.6-terra), [data controls](https://developers.openai.com/api/docs/guides/your-data).

## Validation

- Backend Jest: 176 tests / 24 suites, including 35 AI policy/provider/service tests for Gemini/OpenAI selection, no paid fallback, quota handling and draft validation.
- Frontend Vitest: 49 tests / 7 files. Includes scan → draft → explicit teacher confirmation → grade save with mocked AI, transcription invalidation, crop boundaries for both paper heights, authenticated multipart boundaries and partial-save retries.
- Embedded PostgreSQL: 78 checks, including migration 09, RLS, unchanged transactions, optimistic grade conflict protection and idempotent retries.
- Real XAMPP/authenticated HTTP paper flow: 43 checks using disposable accounts and quizzes, including disabled-AI behavior, role/ownership denial, saved-sheet protection, grade retries, existing online behavior, score visibility and persistence after restart.
- Production builds pass. Vite reports an existing main-bundle size warning (about 506 KB minified); it is not a build failure.

**Remaining limits:** one synthetic handwritten response does not establish accuracy on real student handwriting or the correctness of subjective grading. Actual pen-and-camera capture, faint/crossed-out/multilingual writing, printer hardware, live OpenAI behavior and hosted Supabase/Render deployment still need testing. Teacher review remains required.


Existing-score verification: [preservation check](ESSAY_AI_PRESERVATION_CHECK.json) confirms the saved attempts and answers were unchanged during the original AI integration. Gemini support requires no data migration and does not write grades before teacher confirmation.


### Repeat the opt-in live check

With the local backend running and Gemini configured, run:

```sh
RUN_LIVE_GEMINI=true npm run test:gemini-live
```

This sends `output/imagegen/essay-handwriting-synthetic-crop.png` to Gemini using disposable fictional accounts and one temporary quiz. It calls the draft endpoint, checks the transcription and teacher-review flags, confirms that no attempt was created, and removes all temporary records. It never calls paper submission or grading endpoints, and compares saved-answer/score checksums before and after. A failure in the provider does not authorize a grade save. This is an external API request against your configured project's quota; keep that project on the free tier for free testing. The image is AI-generated handwriting, not actual student work or a real camera photo.
