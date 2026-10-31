# Phone testing

Phone access uses the existing XAMPP-backed API. It does not copy the database or submit scores. The local app remains on port 5173.

Start the backend and phone gateway in separate terminals:

```sh
npm --workspace=backend run start:prod
VITE_API_URL='' npm --workspace=frontend run build -- --outDir ../.local/phone-dist
node scripts/phone-preview.mjs
```

Then run the approved public HTTPS preview:

```sh
npm run phone:link
```

The launcher checks the local app and API, starts Cloudflare, verifies the public page and API, and prints **PHONE LINK READY** only after both succeed. It retries up to three tunnel connections. On macOS it prevents idle sleep while running; closing the lid or disconnecting the network can still interrupt access. Keep the terminal open. Ctrl+C stops the tunnel and removes public phone access. The verified URL and PID are saved in the ignored `.local/phone-tunnel.json`.

The gateway serves only `.local/phone-dist` and forwards `/api` to port 3002. It blocks private paths, source maps, and outside symlinks. Login, ownership checks, and backend rate limits still apply. Scanner photos stay on the device.

The user approved exposing the login-protected app and API through Cloudflare. Quick Tunnel URLs are temporary and change on restart; they have no uptime guarantee. A stable hostname requires a configured Cloudflare tunnel/domain or deployment. Never present an old saved URL as currently verified.

For Carla's 60-question sample, scan all five pages, review objective answers, enter the five written responses, save, then choose **Review result & grade essays**. Her 55 objective points are separate from the 25 essay points. Preparation does not submit her result.

Checks: 26 frontend tests, two launcher checks, gateway authentication/private-file test, and both production builds. Physical phone-camera testing remains a user check.

References: [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/), [GradeChum scan/review workflow](https://help.gradechum.com/teachers/getting-started/gradechum-mobile-scanner/).

DNS diagnosis: generated Quick Tunnel hostnames resolved through Cloudflare's public DNS-over-HTTPS service while the Mac's normal lookup returned ENOTFOUND. The launcher now uses a verification-only fallback for HTTPS trycloudflare.com URLs, preserving certificate validation and the original hostname. No system DNS setting is changed. If a phone on the same Wi-Fi cannot resolve the URL, try mobile data or configure a trusted DNS resolver yourself. This fallback cannot fix a phone's network settings and does not make a temporary URL permanent. Reference: [Cloudflare DNS JSON API](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/).

Paper UI cleanup: repeated preparation/privacy/instruction paragraphs removed, answer overview collapsed, page scan status shown individually, Scan next page retained next to progress, camera progress visible, shorter grading labels. Essential review confirmation and handwritten-answer limitations remain visible. Inspired by GradeChum's public scan/review flow; no claim of GradeChum's handwriting or AI capabilities.

The launcher also waits for Cloudflare's tunnel registration before testing public routes and requests IPv4 for edge connectivity. A hostname being allocated is not treated as a working connection. Launcher validation now includes three tests, including preserving TLS failures and refusing DNS fallback for unrelated domains.
