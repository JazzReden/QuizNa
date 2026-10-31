# GitHub checklist

Keep this repository focused on application source, tests, migrations and deployment configuration.

## Include

- `frontend/src/`, `frontend/public/`, frontend tests and configuration.
- `backend/src/`, backend tests and configuration.
- `supabase/migrations/`, `mysql/`, and `deploy/` SQL/templates.
- Operational/QA scripts, concise documentation, `package.json` files and `package-lock.json`.
- Ignore files and placeholder-only `.env.example` templates.

Synthetic database fixtures under `backend/test/fixtures/` support isolated tests. They are not production seed data and must not be imported into a hosted database.

## Exclude

- Real environment files, credentials, private keys and deployment tokens.
- `.local/`, `output/`, `tmp/`, uploads, scans, filled answer sheets and database backups.
- Generated QA JSON, classroom screenshots, manual preview/seed scripts and local sample-account manifests.
- Dependencies, builds, logs, caches and IDE configuration.

Run `npm run audit:source`. Its report is `.local/qa/reports/GITHUB_AUDIT.json`; the scan checks ignore rules, required source files, common secret patterns and known local credentials without printing their values. It does not guarantee detection of every possible secret.

## Review and commit

```sh
npm run audit:source
npm run check
npm run test:deployment
git status --short
git add -A
git diff --cached --stat
git diff --cached
```

After reviewing the changes, the repository owner can run:

```sh
git commit -m "Keep repository focused on application and deployment files"
git push origin main
```

These are instructions, not an automatic commit or push. GitHub's manual file-upload UI does not apply local `.gitignore` rules. Previously committed files remain in Git history after a normal cleanup commit. Removing history requires a separate coordinated operation; no history rewriting is part of this cleanup. Rotate any exposed real credentials before considering history removal.

See [deployment](DEPLOYMENT.md) for host setup. Render uses `FRONTEND_URL`, Supabase URL/public/server keys and production mode. Vercel uses only public `VITE_*` settings from `deploy/vercel.env.example`. This application uses Supabase Auth/Data API; it does not require a custom `JWT_SECRET` or `DATABASE_URL`.
