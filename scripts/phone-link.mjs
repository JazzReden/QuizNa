// Launch only the existing compiled gateway, never the repository or database.
import { spawn } from 'node:child_process';
import https from 'node:https';
import { isIP } from 'node:net';
import { writeFile, rename, mkdir, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
export function tunnelUrl(text) {
  return text.match(/https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com\b/)?.[0] || null;
}
// Verification-only DNS fallback. TLS still validates the original hostname.
// It does not modify the Mac or phone DNS settings.
export async function publicRequest(address, options = {}) {
  try { return await fetch(address, options); }
  catch (error) {
    const url = new URL(address);
    if (!['ENOTFOUND', 'EAI_AGAIN'].includes(error.cause?.code) || url.protocol !== 'https:' || !/^[a-z0-9-]+\.trycloudflare\.com$/.test(url.hostname)) throw error;
    const dns = await fetch('https://cloudflare-dns.com/dns-query?type=A&name=' + encodeURIComponent(url.hostname), { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(8000) });
    const answer = await dns.json();
    const ip = answer.Status === 0 && answer.Answer?.find(item => item.type === 1 && isIP(item.data) === 4)?.data;
    if (!ip) throw error;
    console.log('Local DNS lookup failed; checking HTTPS through Cloudflare DNS. If your phone cannot open the link on Wi-Fi, try mobile data.');
    return new Promise((resolve, reject) => {
      const req = https.request(url, { method: 'GET', headers: options.headers, signal: options.signal, lookup: (_hostname, opts, callback) => opts.all ? callback(null, [{ address: ip, family: 4 }]) : callback(null, ip, 4) }, response => {
        let bytes = 0; const chunks = [];
        response.on('data', chunk => { bytes += chunk.length; if (bytes > 1048576) req.destroy(new Error('Preview response too large')); else chunks.push(chunk); });
        response.on('error', reject);
        response.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: response.statusCode, headers: response.headers })));
      });
      req.setTimeout(8000, () => req.destroy(new Error('HTTPS timed out')));
      req.on('error', reject); req.end();
    });
  }
}
export async function verifyPhoneLink(url, request = publicRequest) {
  const health = await request(url + '/api/health', { signal: AbortSignal.timeout(8000) });
  if (!health.ok || !(health.headers.get('content-type') || '').includes('application/json')) return false;
  const page = await request(url + '/login', { signal: AbortSignal.timeout(8000) });
  const html = await page.text();
  return page.ok && html.includes('id="root"') && html.includes('/assets/');
}
async function main() {
  const binary = process.env.CLOUDFLARED_PATH || resolve('.local/tools/cloudflared');
  await access(binary);
  if (!await verifyPhoneLink('http://127.0.0.1:5174')) throw Error('Start the QuizNa API and phone gateway before running npm run phone:link.');
  // Prevent idle sleep while the user is actively testing on a phone.
  const awake = process.platform === 'darwin' ? spawn('/usr/bin/caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore' }) : null;
  awake?.on('error', () => {});
  let child, stopped = false;
  const shutdown = () => { stopped = true; child?.kill('SIGTERM'); awake?.kill('SIGTERM'); };
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
  for (let attempt = 1; attempt <= 3 && !stopped; attempt++) {
    console.log(`Connecting phone preview (${attempt}/3)…`);
    child = spawn(binary, ['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:5174', '--protocol', 'http2', '--edge-ip-version', '4'], { stdio: ['ignore', 'ignore', 'pipe'] });
    const proc = child;
    let ended = false;
    const closed = new Promise(resolve => { proc.once('exit', () => { ended = true; resolve(); }); proc.once('error', () => { ended = true; resolve(); }); });
    let log = '';
    const candidate = await new Promise(resolve => {
      const timer = setTimeout(() => resolve(null), 30000);
      const finish = value => { clearTimeout(timer); resolve(value); };
      proc.stderr.on('data', chunk => { log = (log + chunk).slice(-16000); const url = tunnelUrl(log); if (url) finish(url); });
      void closed.then(() => finish(null));
    });
    // A URL is allocated before Cloudflare has connected the tunnel.
    // Wait for registration before checking its public routes.
    for (let wait = 0; candidate && !ended && !stopped && !log.includes('Registered tunnel connection') && wait < 24; wait++) {
      await new Promise(resolve => setTimeout(resolve, 2500));
    }
    await mkdir('.local', { recursive: true });
    await writeFile('.local/phone-link-diagnostic.log', log);
    let verified = false;
    if (candidate) console.log(`Checking HTTPS: ${candidate}`);
    for (let check = 0; candidate && !ended && !stopped && check < 5; check++) {
      try { verified = await verifyPhoneLink(candidate); } catch (error) { if (check === 4) console.log(`HTTPS check failed: ${error.cause?.code || error.message}`); }
      if (verified) break;
      await new Promise(resolve => setTimeout(resolve, 2500));
    }
    if (!verified || stopped || ended) { proc.kill('SIGTERM'); await closed; continue; }
    await mkdir('.local', { recursive: true });
    const paperPath = process.env.QUIZNA_PHONE_PAPER_PATH || '/teacher/paper/c4c5b1fe-2405-4875-8d48-60f93b9c589b?sheet=2c8a6328-a284-42d7-a32d-468a38ba17db';
    const metadata = { url: candidate, paperUrl: candidate + paperPath, verifiedAt: new Date().toISOString(), tunnelPid: proc.pid, gatewayPort: 5174, backendPort: Number(process.env.QUIZNA_PHONE_BACKEND_PORT || 3002), database: 'existing XAMPP', cameraDeviceTested: false };
    await writeFile('.local/phone-tunnel.json.tmp', JSON.stringify(metadata, null, 2) + '\n');
    await rename('.local/phone-tunnel.json.tmp', '.local/phone-tunnel.json');
    console.log(`PHONE LINK READY: ${metadata.paperUrl}\nKeep this terminal open and your Mac awake. Ctrl+C closes phone access.`);
    await closed;
    if (!stopped) console.log('Phone tunnel stopped. Reconnecting…');
  }
  awake?.kill('SIGTERM');
  if (!stopped) throw Error('Cloudflare phone access could not stay connected. Run npm run phone:link to retry; a stable URL requires a configured tunnel or deployment.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
