// Only compiled public assets and the existing authenticated API are exposed.
// Keep the backend and XAMPP bound to loopback; never point a tunnel at the repo.
import http from 'node:http';
import { createReadStream, realpathSync } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const mime = { '.mp4': 'video/mp4', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const inside = (root, path) => { const rel = relative(root, path); return rel !== '..' && !rel.startsWith('..' + sep) && !rel.startsWith(sep); };
export function createPhonePreview({ root, apiPort = 3002 }) {
  root = realpathSync(resolve(root));
  return http.createServer(async (req, res) => {
    const fail = (code, message) => { res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(message); };
    let path;
    try { path = decodeURIComponent((req.url || '/').split('?')[0]); } catch { fail(400, 'Invalid address'); return; }
    if (path.includes('\\') || path.includes('\0') || path.split('/').some(p => p.startsWith('.'))) { fail(404, 'Not found'); return; }
    if (path === '/api' || path.startsWith('/api/')) {
      const headers = { ...req.headers, host: `127.0.0.1:${apiPort}` };
      // Untrusted visitor headers cannot impersonate a forwarding proxy.
      for (const name of Object.keys(headers))
        if (name.startsWith('x-forwarded-') || name.startsWith('cf-') || ['forwarded', 'connection', 'proxy-authorization', 'proxy-connection'].includes(name)) delete headers[name];
      const upstream = http.request({ hostname: '127.0.0.1', port: apiPort, path: req.url, method: req.method, headers, timeout: path === '/api/paper-ai/suggest' ? 60000 : 30000 }, response => {
        res.writeHead(response.statusCode || 502, { ...response.headers, 'Cache-Control': 'private, no-store' });
        response.on('error', () => res.destroy());
        response.pipe(res);
      });
      upstream.on('timeout', () => upstream.destroy());
      upstream.on('error', () => { if (!res.headersSent) fail(502, 'QuizNa is temporarily unavailable.'); else res.destroy(); });
      req.on('aborted', () => upstream.destroy());
      req.pipe(upstream);
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { fail(405, 'Method not allowed'); return; }
    // Missing assets, private files and source paths must not receive the SPA fallback.
    if (path.endsWith('.map') || /^\/(src|backend|mysql|supabase|scripts|node_modules)(\/|$)/.test(path)) { fail(404, 'Not found'); return; }
    let file = resolve(root, '.' + path);
    try {
      if (!inside(root, file)) { fail(404, 'Not found'); return; }
      let info;
      try { info = await stat(file); } catch { /* Client routes fall back below. */ }
      if (!info?.isFile()) {
        if (extname(path) || path.startsWith('/assets/')) { fail(404, 'Not found'); return; }
        file = resolve(root, 'index.html');
      }
      file = await realpath(file);
      if (!inside(root, file)) { fail(404, 'Not found'); return; }
      const infoFile = await stat(file);
      res.writeHead(200, {
        'Content-Type': mime[extname(file)] || 'application/octet-stream',
        'Content-Length': infoFile.size,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
        'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; connect-src 'self' https: wss:; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data: https://fonts.gstatic.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
      });
      if (req.method === 'HEAD') { res.end(); return; }
      createReadStream(file).on('error', () => res.destroy()).pipe(res);
    } catch { fail(404, 'Not found'); }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = fileURLToPath(new URL('../.local/phone-dist/', import.meta.url));
  await stat(resolve(root, 'index.html'));
  const server = createPhonePreview({ root });
  server.listen(5174, '127.0.0.1', () => console.log('QuizNa phone preview: http://127.0.0.1:5174 (existing local API/XAMPP)'));
  const stop = () => server.close(() => process.exit(0));
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}
