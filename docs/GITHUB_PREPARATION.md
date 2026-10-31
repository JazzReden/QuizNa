# QuizNa GitHub preparation

No Git repository was initialized here. No commit, push, deployment, source deletion, credential change, or existing score change was performed. Create an **empty private GitHub repository** before running the commands below; replace `YOUR_USERNAME` with your GitHub login. Do not initialize that remote with a README or license if using the first-push commands below. Use Git for the upload: manually dragging files into GitHub's website does not apply your local `.gitignore` rules.

## Structure

| Path | Purpose |
|---|---|
| `frontend/src/` | React 19, Vite 6, TypeScript, React Router, Tailwind CSS |
| `frontend/public/` | Koala artwork, images and preview media |
| `backend/src/` | NestJS 11/Node API, guards, controllers, services, grading and worker pool |
| `supabase/migrations/` | Hosted PostgreSQL schema, transactions, RLS and service-only RPCs |
| `mysql/` | Local XAMPP schema and additive migrations |
| `scripts/` | Development, synthetic fixtures, QA and deployment checks |
| `deploy/` | Placeholder environment templates and fresh Supabase SQL installer |

There is **no ORM or Prisma**. Hosted queries use `@supabase/supabase-js`; XAMPP uses `mysql2` with parameterized SQL. Authentication uses Supabase Auth in production. `DATABASE_URL` and a custom `JWT_SECRET` are not used by this architecture.

## Changes in this audit

- `.gitignore`, `frontend/.gitignore`, `backend/.gitignore`: exclude real environment files, dependencies, builds, uploads/scans, logs, IDE files, local backups, generated PDFs/images, private key files and common credential-file names. Source and public branding assets remain included.
- `.vercelignore`: also excludes local print previews, uploads, IDE state and unrelated local audio from CLI uploads.
- `frontend/.env.example`, `backend/.env.example`: separate public/server placeholder templates; `.env.example`: updated frontend-origin setting.
- `frontend/src/api/config.ts`: removed its hardcoded localhost API fallback. Local development supplies `VITE_API_URL`; an intentionally empty value supports the same-origin phone proxy. Production validates a real HTTPS API origin before building.
- `backend/src/common/security/cors-origin.ts` and `.spec.ts`: production accepts exactly one HTTPS `FRONTEND_URL`, with no path/trailing slash. It rejects missing origins and ignores legacy `CORS_ORIGIN`. Local previews keep their previous settings.
- `backend/src/main.ts`: uses that origin policy. It already listened on `process.env.PORT` and already provided `GET /api/health`; neither needed replacement.
- `backend/package.json`: `start` runs compiled `dist/main.js`; `build`, `start:prod` and `start:dev` remain available. No Prisma generation is needed.
- `render.yaml`, `deploy/render.env.example`, `scripts/production-config.mjs`, `scripts/test-deployment.mjs`, `docs/DEPLOYMENT.md`, `README.md`: consistent `FRONTEND_URL` production configuration.
- `scripts/audit-source.mjs`, root `package.json`: `npm run audit:source` checks candidate uploads, required source paths, ignored private paths, credential patterns and matches against locally stored secrets. It reports paths/line numbers, never credential values. When the project has no Git repository, it uses and removes an isolated temporary Git directory to evaluate ignore rules; it does not initialize this workspace.

No hardcoded **live credentials** were found among upload candidates by the pattern/known-local-secret scan. Disposable test passwords, generated fixture-password prefixes, local test endpoints, placeholder configuration and explicitly local demo tokens are not production credentials and remain in tests/local tooling. The production frontend source no longer contains hardcoded localhost HTTP URLs. Local URLs in development configuration and documentation are intentional.

Ignore rules cannot identify arbitrary secret text inside an otherwise ordinary source file. Run the scanner and review the staged diff before committing. If a real secret has ever been committed elsewhere, ignoring it does not erase history: rotate it and follow GitHub's secret-removal procedure before publishing that history.

## Safe to include

Include `frontend/src/`, `frontend/public/`, `backend/src/`, source tests, `mysql/` SQL schemas, `supabase/migrations/`, synthetic `supabase/seed.sql`, `scripts/`, `deploy/` placeholder templates/SQL, and the reviewed documentation. Include root/workspace `package.json`, **`package-lock.json`**, `.gitignore` files, `.env.example` files, `.vercelignore`, `.nvmrc`, `vercel.json`, `render.yaml`, Vite/Nest/TypeScript/Tailwind-related configuration, and `README.md`.

Do not run development seeds in production. Database schemas and synthetic seeds are source; actual database backups and live student records are not.

## Must stay out

- All real `.env` files, provider keys, database passwords, JWT/session tokens, private keys and credential exports.
- `.local/`, `output/`, `tmp/`, `temp/`, `uploads/`, `scans/`, `scanned-exams/`, actual exam scans, filled answer PDFs, database dumps and backups.
- `node_modules/`, `dist/`, `build/`, `.next/`, `out/`, `coverage/`, TypeScript build caches, logs and `.DS_Store`.
- `.idea/`, `.vscode/`, `.vercel/`, local agent/cloud-account configuration and the unrelated root `cp-check.mp3` recording.

## Exact hosting variables

Replace placeholders in the hosting dashboards, never in committed source. The domains below are the intended domains; verify that your projects actually receive them.

**Render (backend only):**

```dotenv
NODE_ENV=production
NODE_VERSION=22
DATABASE_MODE=supabase
DEMO_MODE=false
FRONTEND_URL=https://quizna.vercel.app
TRUST_PROXY_HOPS=1
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
PAPER_AI_ENABLED=false
```

Render injects `PORT`; normally leave it unset. `TRUST_PROXY_HOPS=1` assumes the Render proxy directly fronts the API. Keep the initial deployment to one API instance; shared rate limiting is required before scaling across instances. The Blueprint's Starter plan is paid: choose the plan yourself before creating it.

**Vercel (public build variables only):**

```dotenv
VITE_API_URL=https://quizna-api.onrender.com
VITE_DEMO_MODE=false
VITE_SHOW_DEMO_ACCESS=false
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
```

Use the same Supabase URL/public key on both hosts. Never add `VITE_SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, database passwords or AI keys to Vercel. Vercel's Root Directory is the **repository root**, not `frontend/`. Rebuild after changing Vite variables. See [deployment steps](DEPLOYMENT.md) for SQL installation, teacher provisioning, SMTP, redirects and the expiry job.

## Commands for you to run

From the project directory, run the checks before initializing Git:

```sh
cd /Users/jazzreden/Documents/Startup/QuizNa
npm run audit:source
npm run check
npm run test:deployment
git init -b main
git add .
git status --short
git diff --cached --stat
git diff --cached
```

Review the staged files. `.env.example` templates belong in Git; real `.env` files, scans, credentials and local data must not appear. `git check-ignore -v backend/.env frontend/.env .local/classroom-preview.json tmp/pdfs/example.pdf` can explain the matching exclusions. Do not use `git add -f` for private files.

After review, these are the commit/push commands **for you**:

```sh
git commit -m "Prepare QuizNa for Vercel Render and Supabase"
git remote add origin https://github.com/YOUR_USERNAME/QuizNa.git
git remote -v
git push -u origin main
```

If you already initialized Git or added a remote after this audit, inspect `git status` and `git remote -v` first; do not blindly repeat initialization or overwrite a different repository. Authenticate with GitHub's normal browser/credential-manager flow, never paste a token into source, a remote URL or chat. The assistant did not execute these commit/push commands.

## Remaining deployment limits

The source scan is not a guarantee against all secrets or vulnerabilities. The earlier full QA passed, with one unpatched low-severity development-only dependency advisory. Real hosted Auth/Realtime/cron, printer/camera accuracy and staging capacity still require post-deployment acceptance. XAMPP data stays local and is not silently copied to Supabase.

## Validation for this preparation

- Candidate source scan: no matching local credentials or provider-secret patterns; 22 private/generated path exclusions verified. See [audit report](GITHUB_AUDIT.json) for candidate counts and scan limitations.
- TypeScript checks and both builds passed.
- 241 backend tests, 194 frontend tests, 3 deployment tests and 38 isolated API security checks passed.
- Vite still reports a bundle above 500 kB. This is an optimization warning, not a failed build. No dependency changes were needed for this preparation.
