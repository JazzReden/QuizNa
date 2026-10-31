# Paper scanner verification

The current scanner supports QR identification, corner-marker alignment, shaded multiple-choice and true/false bubbles, multi-page accumulation, and teacher correction/review before save. Faint, multiple, blank, or missing alignment marks are not silently treated as correct answers. A saved sheet cannot create a duplicate submission.

Verified on 2026-10-25:

- 43 authenticated XAMPP/API checks: frozen paper versions, student/teacher ownership, QR tampering, preparation/reprint identity, manual review gate, answer validation, simultaneous/repeated saves, objective grading, essay confirmation, score release, both dashboards, and restart persistence. Only disposable fixture records were created and removed.
- 26 backend optical/paper tests and 22 frontend camera/paper/print tests passed.
- The **current** optical scanner was run on seven real rendered pages at the browser’s 2200px maximum resolution: Ben’s 10-question sheet read 10/10; Ella’s 60-question long-bond page read 55/55 objective points and identified five written responses; Carla’s five-page sample read 55/55 objective points and identified five written responses.
- Existing scores remained unchanged. The scanner’s pixel path, review/save API, and camera controls are verified; a physical phone photographing a printed page has not been exercised by this automated check.

Use full dark-ink shading, avoid glare, and capture the complete page with the QR code and all corner squares visible. Use the printed page rather than a laptop-screen photograph for final camera validation. Physical lighting, focus, paper scale, camera resolution, screen moiré, and incomplete shading can affect recognition; the teacher must review detections before saving.

The camera currently uses a manual capture button. Automatic continuous/batch capture like the reference product is not claimed. Essay handwriting/grade suggestions are optional provider-assisted drafts and require configuration and teacher confirmation; objective scanning does not automatically grade essay meaning.

Re-run `node scripts/check-paper-images.mjs` for the existing local sample images and `npm run test:paper` for disposable local API integration checks. Reports: `PAPER_IMAGE_CHECK.json`, `paper-flow-check.json`. These checks do not replace a physical-device acceptance test.
