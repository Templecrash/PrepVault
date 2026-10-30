import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
// The portable app has the same public entry points as the hosted client.
const SHELL_PATHS = new Set(['/', '/index.html', '/app', '/demo', '/home']);
export function createLocalServer(root) {
  const baseReady = realpath(resolve(root));
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    const reply = (status, message) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: message })); };
    if (req.headers.host !== `127.0.0.1:${server.address()?.port}`) return reply(403, 'Open this app using the 127.0.0.1 address printed by the launcher.');
    if (!['GET', 'HEAD'].includes(req.method)) return reply(405, 'The local edition has no server-side accounts or connected services.');
    let pathname;
    try { pathname = decodeURIComponent((req.url || '/').split('?')[0]); } catch { return reply(400, 'Invalid path.'); }
    if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(part => part.startsWith('.'))) return reply(403, 'This file is not available.');
    if (pathname.startsWith('/api/')) return reply(503, 'This connected service requires the live PrepVault website. Local plans and downloaded handbooks work here.');
    if (SHELL_PATHS.has(pathname === '/' ? '/' : pathname.replace(/\/$/, ''))) pathname = '/index.html';
    try {
      const base = await baseReady;
      const path = resolve(base, `.${pathname}`);
      const actual = await realpath(path);
      if (!actual.startsWith(base + sep)) return reply(403, 'This file is not available.');
      const info = await stat(actual);
      if (!info.isFile()) return reply(404, 'File not found.');
      let start = 0, end = info.size - 1, status = 200;
      if (req.headers.range) {
        res.setHeader('Content-Range', `bytes */${info.size}`);
        const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if (!info.size || !match || (!match[1] && !match[2])) return reply(416, 'Invalid byte range.');
        if (match[1]) { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), end) : end; }
        else start = Math.max(0, info.size - Number(match[2]));
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= info.size) {
          res.setHeader('Content-Range', `bytes */${info.size}`); return reply(416, 'Invalid byte range.');
        }
        status = 206;
        res.setHeader('Content-Range', `bytes ${start}-${end}/${info.size}`);
      }
      res.writeHead(status, { 'Content-Type': TYPES[extname(actual)] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Content-Length': Math.max(0, end - start + 1) });
      if (req.method === 'HEAD' || !info.size) return res.end();
      const stream = createReadStream(actual, { start, end });
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    } catch { reply(404, 'File not found.'); }
  });
  return server;
}

if (process.argv[1] && await realpath(resolve(process.argv[1])).catch(() => '') === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PREPVAULT_PORT || 4173);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PREPVAULT_PORT must be between 1024 and 65535.');
  const server = createLocalServer(resolve(dirname(fileURLToPath(import.meta.url)), 'app'));
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? 'Port is already in use. Close the other PrepVault launcher and try again.' : 'PrepVault could not start.'); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`PrepVault is running on this computer.\nOpen http://127.0.0.1:${port}/ in your browser.\nKeep this window open. Press Ctrl+C to stop.\nYour plan is saved in that browser; export an encrypted backup regularly.`));
}
