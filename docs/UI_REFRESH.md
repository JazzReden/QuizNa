# QuizNa minimalist interface refresh

The frontend uses a shared visual system: warm neutral surfaces, forest teal actions, restrained status colors, consistent page headings, readable controls and flat tables. The working product name remains QuizNa. No new frontend dependencies or backend/database changes were needed.

## What changed

- Familiar top navigation retained in its established order, with a direct Analysis link. Active pages have both an underline and text treatment. The mobile/narrow navigation scrolls horizontally; quiz-taking and sign-in stay focused without workspace navigation.
- Quiz library replaces repeated summary cards and crowded action clusters with status tabs, title/description search and online/paper filtering. Print & scan / Live monitor and Review answers stay visible; edit, export and delete are in a labelled actions popover. Deletion still requires confirmation and API failures remain visible in the dialog.
- Flat rows, sentence-case statuses, fewer repeated labels, more consistent spacing and a book/check identity replace decorative gradients and oversized shadows. Developer sample-import markers are omitted from displayed descriptions while the stored data remains unchanged.
- Student dashboard has a simple code-entry panel and a consolidated activity list. Existing scores, pending-release states, resume routes and result links remain connected to the same APIs.
- Gradebook, sections, class list, analysis, editor, grading, paper workspace and student result views share page spacing and typography. Gradebook totals/export guidance is available under a labelled details control. Score links remain accessible; completed numeric scores no longer repeat Submitted below every cell.
- Keyboard focus, skip navigation, labelled icon controls, Escape/outside dismissal, reduced-motion support and safe modal focus behavior are included. Menus use ordinary links/buttons with normal Tab navigation rather than an incomplete custom ARIA menu.
- The pre-quiz briefing has a restrained light surface. Fullscreen acknowledgment, monitoring limitations, warning policy, timers, autosave and submission behavior remain intact. Unnecessary bounce animation was removed from the fullscreen-return control.
- Scanner safe-area styles, QR locations, bubble coordinates, answer-sheet dimensions and print pagination rules remain separate from the workspace styles.

## Source organization

`frontend/src/styles/workspace.css` contains shared layout/control styles. `frontend/src/index.css` retains theme aliases and camera-specific geometry. Shared React primitives live in `WorkspaceUi.tsx` and `ActionMenu.tsx`; screens continue to own their data and actions. The favicon is an original code-native SVG at `frontend/public/quizna-mark.svg`.

## Design rationale and sources

The design applies, rather than visually copies, established usability guidance:

- [Nielsen Norman Group: visual hierarchy, scale, contrast and grouping](https://www.nngroup.com/articles/principles-visual-design/): distinguish page titles, working data and secondary metadata; group related filters and actions.
- [GOV.UK button guidance](https://design-system.service.gov.uk/components/button/): use clear action labels and a prominent main page action; reduce competition from secondary actions.
- [GOV.UK table guidance](https://design-system.service.gov.uk/components/table/): use semantic tables for comparisons, with explicit headings and readable data alignment.

These principles guide the implementation; they are not a claim that one aesthetic is universally best.

## Validation

- 59 frontend tests pass, including the 49 existing checks and 10 new workspace/navigation tests. New checks cover combined filters, empty recovery, preserved routes, API publication, explicit delete confirmation/retry, clipboard failure, action-menu keyboard dismissal, role-specific navigation and active-page semantics.
- TypeScript/Vite builds pass for both local and same-origin phone previews. Vite still reports the pre-existing main-chunk size warning (about 506 KB minified).
- Live browser review at 613 px and 1274 px confirmed no page-wide horizontal overflow. Search and menus were exercised; gradebook scores opened the correct submission. Quiz setup, sections and paper controls were inspected without saving data. A separate student session retained Ben's released 10/10.
- Selected color pairs meet 4.5:1: primary action 7.97:1, secondary text 5.37:1, muted text 4.67:1, published badge 6.59:1, draft badge 5.43:1. This is a targeted contrast check, not a full accessibility audit.
- [Record preservation check](UI_REFRESH_CHECK.json): all 46 existing attempts and 298 saved answers match the prior verified checksum. No submission or grade was saved during UI review.
- Browser previews: [Teacher dashboard](../output/ui/teacher-dashboard.png), [Student dashboard](../output/ui/student-dashboard.png).

Actual phone camera/printer hardware was not retested for this visual refresh. Existing paper-rendering and camera-control component checks passed; generated answer-sheet geometry was not changed. No new live AI request was made.
