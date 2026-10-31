# Subject workspace and performance

- Reports opens directly under its navigation label. On phones it stays in the expanded navigation flow.
- Subject pages use the standard 1280px page container. Desktop class access uses a 360px rail, reducing at tablet widths and stacking on phones.
- Performance initially lists subjects. Selecting a card stores its key in the URL query; All subjects returns to the index. Existing unassigned results remain available.
- The graph uses the existing student-only performance endpoint. Each point is a best released, fully graded quiz result with a valid completion date, ordered chronologically. Pending/unreleased and undated results never become graph points.
- Trend compares the latest two graph points in percentage points. With fewer than two points, no trend is inferred. The subject average retains existing point-weighted calculation.
- SVG colours use theme tokens. An accessible graph description and the existing result table provide text equivalents. No new dependencies or database writes.

Validation: 155 frontend tests; 10 backend student-performance tests; root typecheck and production build; phone build. Browser checked Ben's 6/12 and 8/10 research results (50% to 80%, weighted average 63.64%), dropdown alignment, and no document overflow at 390px and 820px for performance and subject workspace.
