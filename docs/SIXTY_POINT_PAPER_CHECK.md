# 60-point paper scan check

The local sample **Environmental Science — 60-point Scan Practice** is assigned to Grade 12 St. Vincent. Ella Garcia has a separate, unsubmitted QR sheet. Creation is additive and rerunning setup preserves existing quizzes, questions, answer sheets, attempts, and scores.

## Format

- One answer page, long bond (8.5 × 13 inches), print at 100% / actual size.
- Questions 1–30: 30 multiple-choice questions × 1 point.
- Questions 31–40: 10 true/false questions × 1 point.
- Questions 41–44: four essays × 5 points.
- 44 questions, 60 possible points. This is not 60 questions.
- The answer key is frozen in the published quiz version.
- Objective scanning can award up to 40 points. The remaining 20 points require teacher-reviewed essay grades; this test does not establish handwriting-OCR accuracy.

## Validation

The current frontend canvas renderer produced the sheet at 3000 × 4587 pixels, then it was embedded into an actual single-page PDF. PDF pages were rasterized at 300 dpi. Scan tests use the same 2200-pixel image limit as the phone scanner.

The 40 objective responses were read correctly in the rendered PDF and in each of four simulated camera captures: clear, 5-degree rotation, lower brightness with JPEG compression, and projective perspective. These are synthetic tests of a known marked sample, not a measured real-world accuracy percentage.

Additional checks confirmed 40 blank answers stay blank, four essay regions remain written responses for teacher review, two shaded choices are flagged as multiple, glare covering the QR is rejected, and a missing corner square requires a retake. No result was submitted or saved.

The test revealed QR extrapolation error on long pages and confusion between filled bubbles and page markers. The scanner now expands its bounded corner search with distance and scores candidates against the expected marker area. Four-corner and QR consistency checks remain mandatory. Regression fixtures cover the rotated-page distractor and missing-marker rejection. Existing Ben, Ella, and Carla rendered sheets still pass, with saved scores unchanged.

Machine-readable results: `SIXTY_POINT_SCAN_CHECK.json` and `PAPER_IMAGE_CHECK.json`.

## Physical testing still required

No physical phone camera or physical printer test was completed. No default printer was configured. Desktop/mobile-width rendering and transformed images do not substitute for a real phone capture.

Print the blank sheet for handwriting, or the answered practice sheet for an objective-scanning check, at actual size on long-bond paper. Photograph the entire flat page with all four corner squares and the QR unobstructed, use even lighting, review the detected answers, and only then save. Photographing a laptop display introduces glare and moire and is not the print test.

The sample scanner route is `/teacher/paper/ea3ba324-a164-41a9-85ce-0813fd73558e`, under the existing demo teacher account. A physical phone needs a reachable HTTPS app URL for live camera access. No public tunnel was started by this task.

## Reproduce locally

1. `node scripts/seed-60-point-paper.mjs` (local XAMPP only; additive/idempotent).
2. `node scripts/render-60-point-paper.mjs`.
3. Run `scripts/create-60-point-pdfs.py` with Python/Pillow/reportlab/pypdf installed.
4. Rasterize the blank and answered PDFs using `pdftoppm -r 300 -singlefile -png`, to `output/paper-60/printed-blank` and `output/paper-60/printed-answered` respectively.
5. Run `scripts/create-60-point-camera-fixtures.py` with Python/Pillow/numpy installed.
6. `node scripts/check-60-point-paper.mjs`.
7. `npm --workspace=frontend test -- PaperAlignment.test.ts PaperPrint.test.ts PaperExamPage.test.tsx`.

The app now renders printable answer sheets at twice the base resolution while preserving all scanner coordinates. The standalone PDF uses three times the base resolution.
