# Landing previews

These are illustrative QuizNa demos, not recordings of student data.

- `online.mp4`: choose answers, autosave, submit, and wait for released results.
- `paper.mp4`: align a marked sheet, review detected answers, confirm and save.
- Both are 12-second, silent H.264 loops at 1920 × 1344, 30 fps.
- Graphics and text render at native double resolution before downsampling; H.264 uses CRF 18 for sharp edges.
- A mouse pointer travels to the chosen answers and action buttons, with timed click rings.
- Matching JPG posters remain visible before playback or with reduced motion.
- Playback pauses outside the viewport, in hidden tabs, and by tapping the video or pressing Enter/Space while it is focused.

Regenerate from the repository root with `scripts/render-landing-previews.py`
using Python with Pillow and imageio-ffmpeg installed. The generator uses the
macOS Arial font and the existing campus koala asset. No API or database is used.
