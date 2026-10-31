import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPhonePreview } from './phone-preview.mjs';

test('phone gateway serves compiled UI, keeps private files hidden and preserves API authentication', async () => {
  const root = await mkdtemp(join(tmpdir(), 'quizna-phone-'));
  const api = http.createServer((req, res) => {
    if (req.headers.authorization !== 'Bearer fixture') { res.writeHead(401); res.end(); return; }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ url: req.url, forwarded: req.headers['x-forwarded-for'] || null }));
  });
  await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
  const app = createPhonePreview({ root, apiPort: api.address().port });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.address().port}`;
  try {
    await writeFile(join(root, 'index.html'), '<html>QuizNa</html>');
    await mkdir(join(root, 'assets'));
    await writeFile(join(root, 'assets', 'app.js'), 'console.log("public build")');
    await symlink(fileURLToPath(import.meta.url), join(root, 'leaked.js'));
    const page = await fetch(base + '/teacher/paper/sample');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /QuizNa/);
    assert.equal(page.headers.get('permissions-policy'), 'camera=(self), microphone=(), geolocation=()');
    assert.match(page.headers.get('content-security-policy'), /worker-src 'self'/);
    assert.equal((await fetch(base + '/assets/app.js')).status, 200);
    for (const path of ['/.env', '/%2eenv', '/backend/.env', '/src/api/client.ts', '/assets/absent.js', '/assets/app.js.map', '/leaked.js', '/%00'])
      assert.equal((await fetch(base + path)).status, 404, path);
    assert.equal((await fetch(base + '/', { method: 'POST' })).status, 405);
    assert.equal((await fetch(base + '/api/paper/sheet/private')).status, 401);
    const protectedResponse = await fetch(base + '/api/paper/sheet/private?view=1', { headers: { authorization: 'Bearer fixture', 'x-forwarded-for': '192.0.2.1' } });
    assert.equal(protectedResponse.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(await protectedResponse.json(), { url: '/api/paper/sheet/private?view=1', forwarded: null });
  } finally {
    await Promise.all([new Promise(resolve => app.close(resolve)), new Promise(resolve => api.close(resolve))]);
    await rm(root, { recursive: true, force: true });
  }
});
