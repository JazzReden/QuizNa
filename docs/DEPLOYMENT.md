# Deploy QuizNa: Vercel + Render + Supabase

You deploy these files yourself. No account or remote service was created by this preparation. URLs such as `quizna.vercel.app` are examples, not reserved addresses. Use the actual domains assigned to your projects.

## 1. Prepare the repository

Use Node 22. From the repository root:

```sh
npm ci --include=dev
npm run deploy:database
npm run test:deployment
npm run check
npm run build
```

Create a **private GitHub repository** and upload the source, including the lockfile, `vercel.json`, `render.yaml`, `deploy/`, and `supabase/migrations/`. Exclude `.env` files, `.local/`, `output/`, `node_modules/`, and `dist/`; the ignore files cover these. Never upload your local database, screenshots with student records, passwords, or tokens. Both hosts build from source, not from your local compiled files.

## 2. Supabase database and authentication

1. Create a new Supabase project and save its database password securely.
2. In **SQL Editor**, run [deploy/supabase-bootstrap.sql](../deploy/supabase-bootstrap.sql). It combines all 13 migrations in order, inside one transaction, without sample data. It refuses to run if QuizNa tables already exist. For an existing project, back up first and apply only its pending individual migrations; do not run the fresh installer or reset the database.
   The installer uses PostgreSQL's built-in UUID generator and does not depend on where Supabase installs `uuid-ossp`. If an older installer failed with `public.uuid_generate_v4() does not exist`, run `ROLLBACK;` in the editor, replace the entire query with the corrected installer, and run it again. Do not delete tables to bypass the existing-project guard.
3. Enable **pg_cron** in Database Extensions, then run [deploy/supabase-expiry.sql](../deploy/supabase-expiry.sql). Confirm its named job is active. This finalizes expired attempts independently of the API.
4. Obtain your project URL, public **anon** key, and server-only **service_role** key from project API settings. The application currently uses these named keys. The database connection string is not required by its Supabase adapter.
5. Set Auth **Site URL** to your final Vercel origin and allow the exact URLs required by your email-confirmation flow. Enable email confirmation and configure SMTP before real student registration. Do not use a broad wildcard redirect list.
6. The migrations provision new Auth users as students, ignoring role metadata. To create the first teacher, create/confirm that trusted user through Supabase Authentication, then run the following in SQL Editor, replacing the UUID with that user's Auth ID:

```sql
update public.profiles
set role = 'teacher'
where id = '<verified-auth-user-uuid>';
```

Do not enable public teacher self-promotion. Check the profile exists and has the intended role before signing in as Teacher.

**Local data:** XAMPP accounts, quizzes, and scores remain on your Mac. They are not automatically transferred to Supabase, and local passwords/sessions do not become Supabase Auth accounts. This deployment starts empty; importing existing records requires a separate verified data migration. Do not run demo seeds in production.

## 3. Render backend

Connect the private repository and create a Blueprint from root [render.yaml](../render.yaml), or a Node web service with these settings:

| Setting | Value |
|---|---|
| Root directory | Repository root (leave blank) |
| Build | `npm ci --include=dev && npm --workspace=backend run build && npm prune --omit=dev` |
| Start | `npm run deploy:check -- backend && npm --workspace=backend run start:prod` |
| Health check | `/api/health` |
| Node | 22 |

Copy [deploy/render.env.example](../deploy/render.env.example) into the service's environment settings and replace placeholders there. Render provides `PORT`; the API binds to `0.0.0.0`. Set `FRONTEND_URL` to the one exact frontend origin, without a trailing slash or path. Production rejects missing/invalid origins and ignores the legacy development-only `CORS_ORIGIN` setting. This configuration trusts one Render proxy hop; review it if you add another proxy.

The Blueprint uses **Starter, a paid plan**. Review pricing and select a plan yourself before creating the service. A sleeping/free instance is unsuitable for reliable timed exams. Keep one API instance initially: current in-memory rate limits are per process. Multiple instances require shared rate limiting or an appropriate edge enforcement layer before scaling. AI essay suggestions are disabled; do not add provider keys unless enabling that feature deliberately.

## 4. Vercel frontend

Import the same repository. Keep **Root Directory at the repository root**, not `frontend/`. Root `vercel.json` specifies Vite, the build command, `frontend/dist`, SPA refresh rewrites, security headers, and camera permission for the scanner.

Set the public variables from [deploy/vercel.env.example](../deploy/vercel.env.example), using the actual Render origin and matching Supabase project. Configure Production and the intended Preview environment explicitly. Build fails if required values are missing, placeholders, or demo mode is enabled. Rebuild after changing public variables.

All `VITE_*` values are public. Never put service-role keys, database passwords, AI keys, or deployment tokens in them. Backend secrets belong only in Render. Update Render CORS and Supabase Auth URLs after Vercel assigns the final domain. Do not add arbitrary preview domains to production CORS; use a separate staging database for previews.

## 5. Check before inviting a class

- `https://YOUR-API.onrender.com/api/health` responds, then verify real login/database reads too; health alone does not prove database readiness.
- Teacher and student login work, with role/ownership restrictions. A student cannot open teacher endpoints or unreleased scores.
- Refreshing `/student` and `/teacher/sections` works without a 404.
- Create a new small test quiz, join from the enrolled student, save/reconnect/submit, review/confirm, release, and check CSV totals.
- On a real phone over HTTPS, allow the camera, scan a newly prepared printed sheet, review marks, then save. Check both dashboards.
- Verify Supabase Realtime subscriptions and the expiry cron job, database backups/recovery, logs, and provider usage limits.
- Rotate previously shared credentials. Run a controlled staging capacity test before promising hundreds of concurrent students.

Keep the existing local app as your fallback. If a deployment fails, inspect host logs without publishing credentials; roll back the application deployment rather than resetting the database. See [QA instructions](QA_PLAN.md) and [security boundaries](SECURITY.md) for tested scope and remaining limits.

Official references: [Vercel Vite](https://vercel.com/docs/frameworks/frontend/vite), [Render Node services](https://render.com/docs/deploy-node-express-app), [Supabase pg_cron](https://supabase.com/docs/guides/database/extensions/pg_cron).
