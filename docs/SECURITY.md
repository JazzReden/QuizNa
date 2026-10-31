# Security and deployment boundaries

## Findings and changes

The production dependency audit reports **0 known advisories**. The full development audit identified a moderate Vite 6.4.4 private-file disclosure advisory. Vite was updated to **6.4.5**, the lockfile updated, and the running loopback development server restarted with the patch. Query variants (`raw`, `import`, `url`, `inline`) now receive no private fixture content. The fixture is non-secret and removed after the test.

The full audit still reports **9 low-severity package entries originating from one deepmerge advisory** in the Jest/Nest CLI development dependency chain. No patched deepmerge release is published. This package is not in the production dependency tree. No unsupported tool downgrade or advisory suppression was applied. Treat repository build/test configuration as trusted code and monitor the upstream fix.

## Verification completed

- **38 isolated API abuse checks:** missing/forged authentication, student access to teacher routes, inaccessible copy destinations, malformed UUID/injection inputs, JSON/encoding/body bounds, copy ownership/publication-field injection, concurrent copy idempotency, copy throttling, access-code brute force, spoofed forwarding headers, account-wide budgets and route-independent burst limits.
- **233 backend unit tests**, **194 frontend tests**, **104 PostgreSQL integration checks**. Includes owner isolation, student score-release boundaries, quiz-copy transactions and service-role-only execution, QR token validation, idempotent submission, server deadlines and grading.
- **4 gateway/link tests:** symlink/private-file protection, authentication preservation, forwarded-header stripping and HTTPS link validation.
- TypeScript/production builds and frontend private-file checks passed. Both frontend and phone compiled bundles are inspected for privileged server markers, source maps and configured private credential values; values are never printed in test output.
- Private-file requests include backend source, `.env` variants, Git configuration, schema/migrations, local fixture files and absolute-file requests. The patched deny-rule test includes raw/import query variants.
- Production dependency audit: zero known vulnerabilities. Full audit: no moderate/high/critical advisories; the low-severity development dependency advisory above remains.

Security testing used disposable in-memory data and temporary loopback gateways; it did not modify existing XAMPP quizzes or scores. Historical preview evidence is kept only in the local repository archive. No new public tunnel was opened, and no AI provider was called.

## Boundaries and deployment requirements

Backend source, answer keys, privileged credentials and database access remain server-side. Frontend HTML/CSS/JavaScript is necessarily visible in browsers; security relies on backend authentication, roles, ownership, input validation and database policies rather than hiding frontend code.

The current rate/concurrency controls are process-local. Multiple production API instances require shared rate-limit storage and edge-level abuse protection. Use compiled static assets for public access, not the Vite development server. Keep XAMPP loopback-only and out of production. Render must use Supabase with all migrations, restricted service-role credentials, HTTPS, correct CORS/proxy configuration, backups and monitored logs. Rotate provider keys previously shared outside the backend environment before public deployment.

This is a repeatable application-level security verification, not a guarantee against every attack or an infrastructure penetration-test certification.

## Reproduce

- `npm run test:security`
- `npm run test:client-boundary` (local frontend running, compiled builds present)
- `node --test scripts/test-phone-preview.mjs scripts/test-phone-link.mjs`
- `npm run test:database`
- `npm --workspace=backend test -- --runInBand`
- `npm --workspace=frontend test`
- `npm audit --omit=dev` and `npm audit`

## Advisory references

- [Vite file-deny bypass, patched in 6.4.5](https://github.com/advisories/GHSA-8g5g-mxqh-grgj)
- [deepmerge prototype poisoning; no patched release](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)
