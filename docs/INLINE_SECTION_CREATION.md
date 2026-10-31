# Create sections with subjects

Teachers create a subject from Subjects → New subject. Section is now a searchable native suggestion field: choose an existing section name or type a new one. A new name displays a New section badge before submission. Create subject first saves/reuses the section, then creates the subject with that section's ID through the existing authenticated APIs.

The duplicate New section action and section-creation form have been removed from Sections. That page remains the section/roster/quiz overview. Its empty state points teachers to Subjects. Koala's section-creation instructions reflect the new flow.

## Reliability and permissions

- Existing names match after trimming, collapsing whitespace, and case normalization. Reuse avoids a new section request.
- The backend still validates teacher role and section ownership. Duplicate names are rejected by the existing section service lock and database constraints.
- A 409 from a concurrent create or a lost-response retry triggers a fresh list of that teacher's sections. The matching section is reused; a nonmatching conflict remains an error.
- Section and subject creation remain two separate API operations. If the section succeeds and the subject fails, the saved section remains selected and reusable; retry does not create another section. No rollback deletes an existing section.
- Blank names are rejected before section creation, duplicate form submissions are guarded, and the form preserves input on failures.

## Verification

- Full frontend suite: 169 tests passed before the final added whitespace-validation case; the final focused Subjects/SectionManager suite includes that additional passing case.
- 13 backend subject/reusable-section tests passed.
- Root typecheck and frontend production build passed.
- Live XAMPP test created one temporary section and subject, checked their relationship, rejected a case-insensitive duplicate, then removed its temporary records. Hash comparison confirmed all pre-existing quizzes, questions, answers, scores, rosters, sections and subjects were unchanged. See INLINE_SECTION_MYSQL_CHECK.json.
- Browser checks: desktop controls align; phone 390px and tablet 820px stay within the viewport. Draft examples used for screenshots were not submitted.
