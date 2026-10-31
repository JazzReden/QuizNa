# QuizNa

A workspace for online quizzes, printable paper exams, QR answer-sheet scanning, and teacher-reviewed grading.

## Features

- Subject and section organization with student rosters.
- Multiple-choice, true/false, short-answer and essay questions.
- Timed online attempts with autosave, reconnect recovery and server-enforced deadlines.
- Browser-event monitoring with warnings and teacher visibility.
- Printable QR answer sheets, camera/photo/PDF scanning and answer review.
- Teacher-confirmed scores, release controls, gradebooks, analysis and CSV exports.
- Student results and performance by subject.

Browser events indicate possible violations, not proof of cheating. QuizNa cannot monitor other devices. Scanned answers and optional AI essay suggestions require teacher review.

## Project structure

| Directory | Purpose |
|---|---|
| `frontend/` | React, Vite, TypeScript and public branding assets |
| `backend/` | NestJS API, authentication, authorization and grading |
| `supabase/migrations/` | Production PostgreSQL schema, transactions and RLS |
| `mysql/` | Schema and migrations for persistent local XAMPP testing |
| `scripts/` | Development, migration, audit and QA commands |
| `deploy/` | Hosting templates and fresh Supabase installer |
| `docs/` | Deployment, security and testing instructions |

No ORM is used. Production uses Supabase PostgreSQL, Auth and Realtime through the Supabase client. Local XAMPP support uses `mysql2`. Synthetic fixtures live with tests; production migrations do not create sample accounts or quizzes.

## Local development

Use Node.js 22 or 24. Run from the repository root:

```sh
npm ci --include=dev
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
npm run dev
```

Open `http://localhost:5173`. The API runs on port `3002`; its health route is `/api/health`. The default example configuration uses an ephemeral local demo. Do not overwrite an existing `.env` file or use demo mode for real student data.

For persistent local testing, create a dedicated XAMPP database and restricted application user, import `mysql/schema.sql`, and configure backend-only `DATABASE_MODE=mysql`, `DEMO_MODE=true`, and `MYSQL_*` variables. Public local registration supports teacher/student accounts. Existing databases require only their pending numbered migrations; never reinitialize a database containing scores. Keep XAMPP private to the local computer.

For Supabase, follow the deployment guide. Teacher accounts are approved administratively; public production registration cannot grant teacher privileges.

## Checks

```sh
npm run check
npm run build
npm test -- --runInBand
npm run test:frontend
npm run test:deployment
npm run test:database
npm run audit:source
```

`npm run qa` runs the automated gate. `npm run qa -- --mysql` also runs isolated workflows in a temporary XAMPP database. See [testing](docs/QA_PLAN.md) for prerequisites and remaining acceptance checks. Generated reports, scan previews, local credentials and backups stay under ignored `.local/`, `output/`, or `tmp/` paths.

## Deployment

- **Vercel:** frontend; repository-root `vercel.json`.
- **Render:** backend; repository-root `render.yaml`.
- **Supabase:** PostgreSQL, authentication and Realtime.

Follow [deployment instructions](docs/DEPLOYMENT.md) and the [GitHub checklist](docs/GITHUB_PREPARATION.md). Environment templates contain placeholders only. Never publish real `.env` files, service-role keys, database passwords, filled answer sheets or student records.

Local XAMPP accounts and scores are not automatically transferred to hosted Supabase. Real-device scanning, hosted Auth/Realtime/cron and staging capacity require validation after deployment. See [security boundaries](docs/SECURITY.md).
