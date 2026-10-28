import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { request, createServer } from 'node:http';
import { spawn } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { createZip, crc32, localHtml, buildPortableApp } from '../build/portable-app.js';
import { createLocalServer } from '../build/local-server.mjs';
import { isLocalEdition, LIVE_APP_URL } from '../src/runtime-mode.js';

const HTML = '<!doctype html><html><head><link rel="preconnect" href="https://fonts.googleapis.com"><title>PrepVault — Ready for real life</title></head><body><div id="root"></div><script type="module" src="/assets/app-123.js"></script></body></html>';

// Read both ZIP directories independently so bad offsets, truncated data, and
// disagreement between the file headers and central index fail the tests.
function unpackZip(zip) {
  const end = zip.length - 22;
  assert.equal(zip.readUInt32LE(end), 0x06054b50);
  assert.equal(zip.readUInt16LE(end + 4), 0);
  assert.equal(zip.readUInt16LE(end + 6), 0);
  assert.equal(zip.readUInt16LE(end + 8), zip.readUInt16LE(end + 10));
  const count = zip.readUInt16LE(end + 10);
  const length = zip.readUInt32LE(end + 12);
  let cursor = zip.readUInt32LE(end + 16);
  assert.equal(cursor + length, end);
  const entries = new Map();
  for (let index = 0; index < count; index++) {
    assert.equal(zip.readUInt32LE(cursor), 0x02014b50);
    assert.equal(zip.readUInt16LE(cursor + 10), 8);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const compressedLength = zip.readUInt32LE(cursor + 20);
    const plainLength = zip.readUInt32LE(cursor + 24);
    const checksum = zip.readUInt32LE(cursor + 16);
    const name = zip.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    const offset = zip.readUInt32LE(cursor + 42);
    assert.equal(zip.readUInt32LE(offset), 0x04034b50);
    assert.equal(zip.readUInt16LE(offset + 8), 8);
    assert.equal(zip.readUInt32LE(offset + 14), checksum);
    assert.equal(zip.readUInt32LE(offset + 18), compressedLength);
    assert.equal(zip.readUInt32LE(offset + 22), plainLength);
    assert.equal(zip.readUInt16LE(offset + 26), nameLength);
    assert.equal(zip.toString('utf8', offset + 30, offset + 30 + nameLength), name);
    const data = inflateRawSync(zip.subarray(offset + 30 + nameLength, offset + 30 + nameLength + compressedLength));
    assert.equal(data.length, plainLength);
    assert.equal(crc32(data), checksum);
    assert.ok(!entries.has(name), `Duplicate archive path: ${name}`);
    entries.set(name, { data, mode: zip.readUInt32LE(cursor + 38) >>> 16 });
    cursor += 46 + nameLength + zip.readUInt16LE(cursor + 30) + zip.readUInt16LE(cursor + 32);
  }
  assert.equal(cursor, end);
  return entries;
}

async function tempDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), 'prepvault-portable-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function fixtureRoot(t) {
  const directory = await tempDirectory(t);
  const root = join(directory, 'app');
  await mkdir(join(root, 'handbooks'), { recursive: true });
  await writeFile(join(root, 'index.html'), localHtml(HTML));
  await writeFile(join(root, 'handbooks', 'guide.pdf'), Buffer.from('%PDF-1.7\n0123456789\n%%EOF'));
  await writeFile(join(root, 'empty.txt'), '');
  await writeFile(join(root, '.env'), 'must-not-be-served');
  await writeFile(join(directory, 'private.txt'), 'outside-root');
  await symlink(join(directory, 'private.txt'), join(root, 'escape.txt'));
  return root;
}

function requester(port) {
  return ({ path = '/', method = 'GET', headers = {} } = {}) => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method, headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

async function fixtureServer(t) {
  const root = await fixtureRoot(t);
  const server = createLocalServer(root);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const port = server.address().port;
  return { send: requester(port), port };
}

test('portable ZIP roundtrips binary files, independent headers, checksums and launcher permissions', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  const binary = Buffer.from(Array.from({ length: 512 }, (_, index) => index % 256));
  const zip = createZip([
    { name: 'PrepVault-local/app/guide.pdf', data: binary },
    { name: 'PrepVault-local/Start PrepVault.command', data: '#!/bin/sh\n', executable: true },
    { name: 'PrepVault-local/app/empty.txt', data: '' },
  ]);
  const files = unpackZip(zip);
  assert.equal(files.size, 3);
  assert.deepEqual(files.get('PrepVault-local/app/guide.pdf').data, binary);
  assert.equal(files.get('PrepVault-local/app/guide.pdf').mode, 0o100644);
  assert.equal(files.get('PrepVault-local/Start PrepVault.command').mode, 0o100755);
  assert.equal(files.get('PrepVault-local/app/empty.txt').data.length, 0);
});

test('portable ZIP rejects paths that could leave the extracted folder', () => {
  for (const name of ['/absolute.txt', '../outside.txt', 'app/../outside.txt', 'app\\outside.txt', 'C:/outside.txt', 'app/\0file.txt']) {
    assert.throws(() => createZip([{ name, data: 'secret' }]), /Invalid archive path/);
  }
});

test('local HTML installs its mode and restrictive CSP before app scripts', () => {
  const html = localHtml(HTML);
  assert.match(html, /<title>PrepVault — Local edition<\/title>/);
  assert.match(html, /<meta name="prepvault-mode" content="local">/);
  assert.ok(!html.includes('rel="preconnect"'));
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1];
  assert.ok(csp);
  for (const directive of ["connect-src 'self'", "media-src 'self' blob:", "frame-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) assert.ok(csp.includes(directive), directive);
  assert.ok(!csp.includes('https:'));
  assert.ok(!csp.includes("'unsafe-eval'"));
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<script'));
});

test('local runtime mode is explicit and has a fixed HTTPS live destination', t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  t.after(() => descriptor ? Object.defineProperty(globalThis, 'document', descriptor) : delete globalThis.document);
  delete globalThis.document;
  assert.equal(isLocalEdition(), false);
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { querySelector: () => null } });
  assert.equal(isLocalEdition(), false);
  globalThis.document.querySelector = () => ({ content: 'hosted' });
  assert.equal(isLocalEdition(), false);
  globalThis.document.querySelector = selector => selector === 'meta[name="prepvault-mode"]' ? { content: 'local' } : null;
  assert.equal(isLocalEdition(), true);
  assert.equal(LIVE_APP_URL, 'https://prepvault-xi.vercel.app/');
});

test('portable package contains verified files, local worker and no private config or recursive archive', async t => {
  const directory = await tempDirectory(t);
  await mkdir(join(directory, 'assets'));
  await mkdir(join(directory, 'handbooks'));
  await mkdir(join(directory, 'local'));
  await writeFile(join(directory, 'index.html'), HTML);
  await writeFile(join(directory, 'favicon.svg'), '<svg/>');
  await writeFile(join(directory, 'assets', 'app-123.js'), 'export const app = true;');
  await writeFile(join(directory, 'assets', 'style-123.css'), '@import"https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;450;500&display=swap";:root{--ink:green}body{color:var(--ink)}');
  await writeFile(join(directory, 'assets', 'font-url.css'), '@import url("https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;450;500&display=swap");\n:root{--paper:white}');
  await writeFile(join(directory, 'assets', 'app-123.js.map'), 'private-source-map');
  await writeFile(join(directory, 'handbooks', 'guide.pdf'), '%PDF-1.7\nexample\n%%EOF');
  await writeFile(join(directory, 'handbooks', 'sources.json'), '{"source":"publisher"}');
  await writeFile(join(directory, 'handbooks', 'README.txt'), 'Original publisher license');
  await writeFile(join(directory, '.env.local'), 'PRIVATE_KEY=excluded');
  await writeFile(join(directory, 'local', 'prepvault-local.zip'), 'old-archive');
  const result = await buildPortableApp(directory);
  const archive = await readFile(join(directory, 'local', 'prepvault-local.zip'));
  const manifest = JSON.parse(await readFile(join(directory, 'local', 'manifest.json'), 'utf8'));
  assert.equal(manifest.bytes, archive.length);
  assert.equal(result.bytes, archive.length);
  assert.equal(manifest.sha256, createHash('sha256').update(archive).digest('hex'));
  const files = unpackZip(archive);
  assert.equal(result.files, files.size);
  const names = [...files.keys()];
  for (const name of names) assert.ok(name.startsWith('PrepVault-local/'), name);
  assert.ok(names.includes('PrepVault-local/app/handbooks/guide.pdf'));
  assert.ok(names.includes('PrepVault-local/serve.mjs'));
  assert.ok(names.includes('PrepVault-local/serve.py'));
  assert.ok(names.includes('PrepVault-local/Start PrepVault.command'));
  assert.ok(names.includes('PrepVault-local/Start PrepVault.sh'));
  assert.ok(names.includes('PrepVault-local/Start PrepVault.bat'));
  assert.ok(!names.some(name => name.includes('.env') || name.endsWith('.map') || name.endsWith('.zip')));
  assert.ok(!files.get('PrepVault-local/app/assets/style-123.css').data.toString().includes('fonts.googleapis.com'));
  assert.equal(files.get('PrepVault-local/app/assets/style-123.css').data.toString(), ':root{--ink:green}body{color:var(--ink)}');
  assert.equal(files.get('PrepVault-local/app/assets/font-url.css').data.toString().trim(), ':root{--paper:white}');
  assert.match(files.get('PrepVault-local/app/index.html').data.toString(), /name="prepvault-mode" content="local"/);
  assert.match(files.get('PrepVault-local/app/handbook-sw.js').data.toString(), /local-/);
  const sums = files.get('PrepVault-local/SHA256SUMS').data.toString().trim().split('\n');
  assert.equal(sums.length, files.size - 1);
  for (const line of sums) {
    const [, hash, name] = /^([a-f0-9]{64}) {2}(.+)$/.exec(line) || [];
    assert.ok(name, `Bad checksum line: ${line}`);
    assert.equal(createHash('sha256').update(files.get(`PrepVault-local/${name}`).data).digest('hex'), hash, name);
  }
});

test('local server returns exact static files, correct types, HEAD metadata and no directory listing', async t => {
  const { send } = await fixtureServer(t);
  const response = await send();
  assert.equal(response.status, 200);
  assert.match(response.body.toString(), /PrepVault — Local edition/);
  assert.equal(response.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['cross-origin-resource-policy'], 'same-origin');
  assert.equal(response.headers['x-frame-options'], 'DENY');
  const head = await send({ method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.body.length, 0);
  assert.equal(Number(head.headers['content-length']), response.body.length);
  const pdf = await send({ path: '/handbooks/guide.pdf?v=checksum' });
  assert.equal(pdf.headers['content-type'], 'application/pdf');
  assert.equal(pdf.status, 200);
  assert.equal((await send({ path: '/handbooks/' })).status, 404);
  assert.equal((await send({ path: '/missing.html' })).status, 404);
});

test('local server rejects nonlocal hosts, APIs, writes, traversal, hidden files and symlink escapes', async t => {
  const { send, port } = await fixtureServer(t);
  for (const host of ['evil.test', `evil.test:${port}`, `localhost:${port}`, `127.0.0.1.evil.test:${port}`, `127.0.0.1:${port + 1}`, '[::1]:4173']) {
    assert.equal((await send({ headers: { Host: host } })).status, 403, host);
  }
  assert.equal((await send({ path: '/api/account' })).status, 503);
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) assert.equal((await send({ path: '/api/account', method })).status, 405, method);
  for (const path of ['/../private.txt', '/%2e%2e/private.txt', '/%2eenv', '/.env', '/handbooks/%2e%2e/index.html', '/%5cprivate.txt', '/%00private.txt', '/escape.txt']) {
    assert.equal((await send({ path })).status, 403, path);
  }
  assert.equal((await send({ path: '/%invalid' })).status, 400);
});

test('local server serves PDF byte ranges and rejects ambiguous or impossible requests', async t => {
  const { send } = await fixtureServer(t);
  const whole = await send({ path: '/handbooks/guide.pdf' });
  for (const [range, start, end] of [['bytes=0-4', 0, 4], ['bytes=5-', 5, whole.body.length - 1], ['bytes=-5', whole.body.length - 5, whole.body.length - 1], ['bytes=0-99999', 0, whole.body.length - 1]]) {
    const response = await send({ path: '/handbooks/guide.pdf', headers: { Range: range } });
    assert.equal(response.status, 206, range);
    assert.equal(response.headers['content-range'], `bytes ${start}-${end}/${whole.body.length}`);
    assert.deepEqual(response.body, whole.body.subarray(start, end + 1));
    assert.equal(Number(response.headers['content-length']), end - start + 1);
  }
  const head = await send({ path: '/handbooks/guide.pdf', method: 'HEAD', headers: { Range: 'bytes=0-4' } });
  assert.equal(head.status, 206);
  assert.equal(head.body.length, 0);
  assert.equal(head.headers['content-length'], '5');
  for (const range of ['bytes=99999-', 'bytes=5-2', 'bytes=-0', 'bytes=-', 'bytes=1-2,5-6', 'items=0-4']) {
    const response = await send({ path: '/handbooks/guide.pdf', headers: { Range: range } });
    assert.equal(response.status, 416, range);
    assert.equal(response.headers['content-range'], `bytes */${whole.body.length}`);
  }
  assert.equal((await send({ path: '/empty.txt' })).body.length, 0);
  const emptyRange = await send({ path: '/empty.txt', headers: { Range: 'bytes=0-0' } });
  assert.equal(emptyRange.status, 416);
  assert.equal(emptyRange.headers['content-range'], 'bytes */0');
});

test('Node CLI starts from a symlinked package path and serves its canonical app directory', async t => {
  const root = await fixtureRoot(t);
  const directory = dirname(root);
  await writeFile(join(directory, 'serve.mjs'), await readFile(new URL('../build/local-server.mjs', import.meta.url)));
  const alias = join(directory, 'linked-package');
  await symlink(directory, alias);
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, [join(alias, 'serve.mjs')], { env: { ...process.env, PREPVAULT_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
    const closed = once(child, 'exit');
    child.kill('SIGTERM');
    await closed;
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  await new Promise((resolve, reject) => {
    let stdout = '';
    const timeout = setTimeout(() => reject(new Error(`Node launcher did not start: ${stderr}`)), 5000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Node launcher exited ${code}: ${stderr}`)); });
    child.stdout.on('data', chunk => {
      stdout += chunk;
      if (stdout.includes(`http://127.0.0.1:${port}/`)) { clearTimeout(timeout); resolve(); }
    });
  });
  const send = requester(port);
  const response = await send();
  assert.equal(response.status, 200);
  assert.match(response.body.toString(), /PrepVault — Local edition/);
  assert.equal((await send({ path: '/api/account' })).status, 503);
  assert.equal((await send({ headers: { Host: `localhost:${port}` } })).status, 403);
});

test('Python launcher serves the same local app and denies host, API and file-system escapes', async t => {
  const root = await fixtureRoot(t);
  const modulePath = fileURLToPath(new URL('../build/local-server.py', import.meta.url));
  const script = `import importlib.util, pathlib, sys, http.server
spec = importlib.util.spec_from_file_location("prepvault_test", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.ROOT = pathlib.Path(sys.argv[2]).resolve()
server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), module.Handler)
print(server.server_port, flush=True)
server.serve_forever()
`;
  const child = spawn('python3', ['-u', '-c', script, modulePath, root], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
    const closed = once(child, 'exit');
    child.kill('SIGTERM');
    await closed;
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  const port = await new Promise((resolve, reject) => {
    let stdout = '';
    const timeout = setTimeout(() => reject(new Error(`Python server did not start: ${stderr}`)), 5000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Python server exited ${code}: ${stderr}`)); });
    child.stdout.on('data', chunk => {
      stdout += chunk;
      if (/^\d+\n/.test(stdout)) { clearTimeout(timeout); resolve(Number(stdout.trim())); }
    });
  }).catch(error => {
    if (error.code === 'ENOENT') { t.skip('Python 3 is unavailable; Node launcher remains covered.'); return null; }
    throw error;
  });
  if (!port) return;
  const send = requester(port);
  const app = await send();
  assert.equal(app.status, 200);
  assert.match(app.body.toString(), /PrepVault — Local edition/);
  assert.equal(app.headers['cache-control'], 'no-store');
  assert.equal(app.headers['x-content-type-options'], 'nosniff');
  assert.equal(app.headers['x-frame-options'], 'DENY');
  const head = await send({ method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.body.length, 0);
  assert.equal(Number(head.headers['content-length']), app.body.length);
  assert.equal((await send({ headers: { Host: `evil.test:${port}` } })).status, 403);
  assert.equal((await send({ headers: { Host: `127.0.0.1:${port + 1}` } })).status, 403);
  assert.equal((await send({ path: '/api/account' })).status, 503);
  assert.ok([405, 501].includes((await send({ method: 'POST' })).status));
  for (const path of ['/../private.txt', '/%2e%2e/private.txt', '/.env', '/%5cprivate.txt', '/%00private.txt', '/escape.txt']) {
    assert.equal((await send({ path })).status, 403, path);
  }
  assert.equal((await send({ path: '/handbooks/' })).status, 404);
  const full = await send({ path: '/handbooks/guide.pdf' });
  const range = await send({ path: '/handbooks/guide.pdf', headers: { Range: 'bytes=0-4' } });
  assert.equal(full.status, 200);
  assert.equal(full.headers['content-type'], 'application/pdf');
  assert.ok([200, 206].includes(range.status));
  assert.deepEqual(range.body, range.status === 206 ? full.body.subarray(0, 5) : full.body);
});
