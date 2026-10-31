import { pathToFileURL } from 'node:url';

const placeholder = /YOUR[-_]|your-project|placeholder/i;
function httpsOrigin(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin === value && !url.username && !url.password
      && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch { return false; }
}

// Report variable names only; never log credentials or their values.
export function validateProductionConfig(target, env) {
  const errors = [];
  const required = (key) => {
    if (!env[key]?.trim() || placeholder.test(env[key])) errors.push(`${key} is missing or is a placeholder`);
  };
  const exact = (key, value) => { if (env[key] !== value) errors.push(`${key} must be ${value}`); };
  const origin = (key) => { required(key); if (env[key] && !httpsOrigin(env[key])) errors.push(`${key} must be an HTTPS origin without a path or trailing slash`); };
  if (target === 'frontend') {
    exact('VITE_DEMO_MODE', 'false');
    if (env.VITE_SHOW_DEMO_ACCESS && env.VITE_SHOW_DEMO_ACCESS !== 'false') errors.push('VITE_SHOW_DEMO_ACCESS must be false');
    origin('VITE_API_URL');
    origin('VITE_SUPABASE_URL');
    required('VITE_SUPABASE_ANON_KEY');
    for (const key of Object.keys(env)) {
      if (key.startsWith('VITE_') && /SERVICE_ROLE|SECRET|PASSWORD|DATABASE|GEMINI|OPENAI|ACCESS_TOKEN/i.test(key)) errors.push(`${key} must not be exposed to browsers`);
    }
  } else if (target === 'backend') {
    exact('NODE_ENV', 'production'); exact('DATABASE_MODE', 'supabase'); exact('DEMO_MODE', 'false');
    origin('SUPABASE_URL'); required('SUPABASE_ANON_KEY'); required('SUPABASE_SERVICE_ROLE_KEY');
    origin('FRONTEND_URL');
    if (!/^[0-3]$/.test(env.TRUST_PROXY_HOPS || '')) errors.push('TRUST_PROXY_HOPS must be an explicit hop count from 0 to 3');
    if (env.SUPABASE_ANON_KEY === env.SUPABASE_SERVICE_ROLE_KEY) errors.push('Public and privileged Supabase keys must differ');
    if (env.PAPER_AI_ENABLED === 'true') {
      const key = env.PAPER_AI_PROVIDER === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY'; required(key);
    }
  } else errors.push('Choose frontend or backend');
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = validateProductionConfig(process.argv[2], process.env);
  if (errors.length) { console.error(errors.map(e => `- ${e}`).join('\n')); process.exitCode = 1; }
  else console.log(`Production ${process.argv[2]} configuration passed (values hidden).`);
}
