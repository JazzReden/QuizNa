import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { validateProductionConfig } from './production-config.mjs';

const frontend = {
  VITE_DEMO_MODE: 'false', VITE_API_URL: 'https://api.example.com',
  VITE_SUPABASE_URL: 'https://project.supabase.co', VITE_SUPABASE_ANON_KEY: 'public-test-key',
};
const backend = {
  NODE_ENV: 'production', DATABASE_MODE: 'supabase', DEMO_MODE: 'false',
  SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: 'public-test-key',
  SUPABASE_SERVICE_ROLE_KEY: 'private-test-key', FRONTEND_URL: 'https://quiz.example.com', TRUST_PROXY_HOPS: '1',
};

test('lockfile includes matching Linux and macOS native build packages', async () => {
  const {packages} = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
  const targets = {
    rollup: ['@rollup/rollup-linux-x64-gnu', '@rollup/rollup-darwin-arm64'],
    esbuild: ['@esbuild/linux-x64', '@esbuild/darwin-arm64'],
    '@tailwindcss/oxide': ['@tailwindcss/oxide-linux-x64-gnu', '@tailwindcss/oxide-darwin-arm64'],
    lightningcss: ['lightningcss-linux-x64-gnu', 'lightningcss-darwin-arm64'],
  };
  for (const [parent, nativePackages] of Object.entries(targets)) {
    for (const name of nativePackages) {
      const entry = packages[`node_modules/${name}`];
      assert.ok(entry, `${name} must be locked for clean CI installs`);
      assert.equal(entry.version, packages[`node_modules/${parent}`].optionalDependencies[name]);
      assert.ok(entry.integrity, `${name} must have registry integrity metadata`);
    }
  }
});

test('production configuration rejects local, demo, placeholder and browser-secret settings', () => {
  assert.deepEqual(validateProductionConfig('frontend', frontend), []);
  assert.deepEqual(validateProductionConfig('backend', backend), []);
  for (const patch of [
    {VITE_API_URL:'http://localhost:3002'}, {VITE_API_URL:'https://api.example.com/api'},
    {VITE_DEMO_MODE:'true'}, {VITE_SUPABASE_ANON_KEY:'YOUR_PUBLIC_ANON_KEY'},
    {VITE_SERVICE_ROLE_KEY:'secret'}, {VITE_OPENAI_API_KEY:'secret'},
  ]) assert.ok(validateProductionConfig('frontend', {...frontend,...patch}).length);
  for (const patch of [
    {FRONTEND_URL:'*'}, {FRONTEND_URL:'https://quiz.example.com,http://localhost:5173'},
    {DATABASE_MODE:'mysql'}, {DEMO_MODE:'true'}, {SUPABASE_SERVICE_ROLE_KEY:''},
    {SUPABASE_SERVICE_ROLE_KEY:'public-test-key'}, {TRUST_PROXY_HOPS:'true'},
  ]) assert.ok(validateProductionConfig('backend', {...backend,...patch}).length);
  assert.ok(validateProductionConfig('backend', {...backend,FRONTEND_URL:'https://quiz.example.com,https://www.quiz.example.com'}).length);
});

test('Vercel publishes only the compiled frontend, supports deep links and permits its camera', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.outputDirectory, 'frontend/dist');
  assert.equal(config.installCommand, 'npm ci --include=dev --include=optional');
  assert.equal(config.buildCommand, 'npm run build:production:frontend');
  assert.deepEqual(config.rewrites, [{source:'/(.*)',destination:'/index.html'}]);
  const headers = Object.fromEntries(config.headers[0].headers.map(h => [h.key,h.value]));
  assert.match(headers['Permissions-Policy'], /camera=\(self\)/);
  assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.doesNotMatch(headers['Content-Security-Policy'], /unsafe-eval/);
  const ignore = await readFile(new URL('../.vercelignore', import.meta.url), 'utf8');
  for (const entry of ['**/.env', '**/.env.*', '.local', 'output', '.git']) assert.ok(ignore.split('\n').includes(entry));
});

test('fresh Supabase installer is atomic, has RLS and no demo data, and refuses repeat installation', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}');
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE SCHEMA extensions;
      CREATE FUNCTION extensions.uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $$ SELECT pg_catalog.gen_random_uuid() $$;
      SET search_path TO public,extensions;
      CREATE PUBLICATION supabase_realtime;
      GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;`);
    assert.equal((await db.query("SELECT to_regprocedure('public.uuid_generate_v4()') AS helper")).rows[0].helper, null);
    const sql = await readFile(new URL('../deploy/supabase-bootstrap.sql', import.meta.url), 'utf8');
    // Reproduce the hosted schema mismatch and prove a failed installer can be
    // rolled back, then rerun correctly without dropping application tables.
    const broken = sql.replace('pg_catalog.gen_random_uuid()', 'public.uuid_generate_v4()');
    assert.notEqual(broken, sql);
    await assert.rejects(db.exec(broken), /uuid_generate_v4.*does not exist/);
    await db.exec('ROLLBACK;');
    assert.equal((await db.query("SELECT to_regclass('public.profiles') AS table_name")).rows[0].table_name, null);
    await db.exec(sql);
    const unprotected = await db.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity`);
    assert.deepEqual(unprotected.rows, []);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM public.profiles')).rows[0].count, 0);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM public.quizzes')).rows[0].count, 0);
    for (const name of ['quizna_attempt_command(text,uuid,jsonb)','quizna_paper_command(text,uuid,jsonb)','quizna_join_subject(uuid,uuid)','quizna_copy_quiz(uuid,uuid,uuid,uuid)']) {
      const result = await db.query('SELECT has_function_privilege($1,$2,$3) AS allowed', ['authenticated',`public.${name}`,'EXECUTE']);
      assert.equal(result.rows[0].allowed, false);
    }
    await assert.rejects(db.exec(sql), /QuizNa tables already exist/);
    await db.exec('ROLLBACK;');
    assert.equal((await db.query('SELECT count(*)::int AS count FROM public.quizzes')).rows[0].count, 0);
  } finally { await db.close(); }
});
