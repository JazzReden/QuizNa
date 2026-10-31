# Published quiz share codes

Online quizzes show a persistent highlighted share panel directly below the editor heading after successful publishing and when reopening an already-published quiz. Section names and their actual section assignment codes are shown together. The general quiz code is used only when no section assignments exist. Draft and failed-publish flows do not advertise a new code. Paper exams retain their existing print-and-scan flow.

Copy code copies exactly the displayed value, confirms success, and falls back to manual copying when clipboard access is unavailable. Codes are selectable text. Theme tokens support workspace themes; the panel wraps on phones without document overflow.

The component uses existing authenticated teacher quiz/section responses. No backend permissions, code generation, quiz questions or scores were modified.

Validation: 177 frontend tests pass, including seven share-panel/editor tests for section-specific codes, copying, clipboard failure, successful/failed publishing, persistence on reload, and paper exam behavior. Root typecheck and frontend build pass. Existing published Personal Development quiz checked read-only in the browser; phone viewport 390px has no sideways overflow.

## Visible after leaving the editor

Each published online quiz in a teacher's subject workspace now also shows its stored section quiz code beside Open quiz, with a copy action and manual-copy fallback. It reloads from the existing subject API's section-specific access_code; no browser storage or transient publish notice is needed. Drafts, paper exams and student views do not gain these teacher share controls.

Four additional tests cover remount persistence, exact-code copying, clipboard failure, and hiding controls in draft/paper/student views. The focused subject suite has 17 passing tests; typecheck and build pass. Browser verified exiting the editor and reloading the subject still shows the same code.
