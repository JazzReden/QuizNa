// QA output is local-only; never publish generated account/score/scan reports.
import { mkdir } from 'node:fs/promises';
await mkdir(new URL('../.local/qa/reports/', import.meta.url), { recursive: true });
