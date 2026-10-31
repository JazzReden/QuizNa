# Phone scanner update

The Paper Exam scanner now opens a dedicated full-screen camera dialog with a portrait page guide, a large shutter button, a photo picker, and safe-area spacing for phone controls. It prefers the rear camera and keeps inline playback for mobile browsers. The preview uses contain sizing, and capture reads the full camera frame rather than a cropped preview.

Capture stays disabled until playback starts and while a scan is processing. Scan errors appear inside the camera so teachers can retry without leaving it. Successful scans return to the existing answer review; saving still requires confirmation. Closing releases the camera tracks. The dialog locks page scrolling, traps keyboard focus, supports Escape when idle, and restores focus when dismissed.

Validation: 25 frontend tests passed across 5 files; TypeScript and both local/phone production builds passed. New tests cover readiness, duplicate capture protection, error display, blocked playback recovery, keyboard focus, rear-camera preference, and releasing tracks on close. Existing paper exam tests still pass. No scores or database records were edited by this update. Physical Android/iPhone camera testing is still required.

Browser API references: [getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia), [video element / playsinline](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video).
