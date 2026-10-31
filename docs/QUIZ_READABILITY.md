# Quiz workspace readability

Changes:
- Opened quizzes have one title card with section, subject, format, and publication status. Repeated section headings, section management actions, and roster tabs are omitted while reviewing an opened quiz.
- Class list and Analysis remain the two primary quiz views. Edit questions and paper printing remain secondary actions.
- Back to section quizzes and all grading return controls show an arrow, a visible destination label, an outline, keyboard focus, and a minimum 44px target.
- Review answers links identify the student to assistive technology and use a 44px target.
- Review student answers uses a separate return row, readable title and quiz name. Entering from a section's quiz preselects that student's section in grading.
- Backend operations and existing grades are unchanged.

Validation:
137 frontend tests passed, including exact return URLs for class list, gradebook, and quiz library; TypeScript/Vite production build passed. Browser checked a real XAMPP sample review and returned to the same section and quiz without saving grades. At simulated 390px and 820px widths, page width equaled viewport width; the phone Back to class list control measured 44px high. Physical phone/tablet hardware was not used.

Design references:
- https://www.nngroup.com/articles/breadcrumbs/ — consistent hierarchical navigation.
- https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum/ — target size and spacing.
