# QuizNa visual themes

The chosen brand mark is **03 — Campus**: a koala holding a spiral notebook and fountain pen. `frontend/public/quizna-campus.png` contains only the emblem; the separate QuizNa wordmark stays to its right. The mark is 42px in the workspace and 48–52px in the public header. It is reused in the footer, illustrated paper, and favicon. All ten original proposals are archived in `output/logo-concepts/`.

The lighter sage palette uses semantic surface, border, text, and accent tokens in `frontend/src/styles/theme.css`. Public pages and Ishi use those same tokens. Existing slate/indigo utilities are adapted in dark mode; badges retain their success/warning/error meaning. Paper camera colors remain isolated for reliable framing and readable controls. Images are never color-filtered.

The moon/sun control toggles the whole app. Before the first paint, `frontend/index.html` reads the saved `quizna_theme` preference or the system preference. `useTheme` keeps controls synchronized, follows system changes until an explicit choice is saved, handles blocked storage, and receives cross-tab storage events. `ThemeController` stays active on focused quiz screens even where navigation is hidden.

All dark token overrides are limited to screen media. Printed papers keep light/black-on-white styling; QR and answer-sheet images and their geometry are unchanged. No backend or database changes are required.

Validation: theme tests cover persistence, system preference, cross-tab synchronization, blocked storage, shared branding, and WCAG 4.5:1 contrast for body text, supporting text, and primary actions. The full frontend suite, production builds, and responsive checks cover the existing application flows.
