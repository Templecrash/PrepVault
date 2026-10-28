import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { createHandbookWorker } from './handbook-worker.js';

const BUILD_DIR = dirname(fileURLToPath(import.meta.url));
const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
export function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
export function createZip(files) {
  const entries = [], central = [];
  let offset = 0;
  for (const file of files) {
    if (!/^[A-Za-z0-9_./ -]+$/.test(file.name) || file.name.split('/').includes('..') || file.name.startsWith('/')) throw new Error('Invalid archive path.');
    const name = Buffer.from(file.name);
    const data = Buffer.from(file.data);
    const compressed = deflateRawSync(data, { level: 6 });
    const checksum = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(8, 8);
    header.writeUInt16LE(33, 12); header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(name.length, 26);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(0x0314, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(8, 10);
    directory.writeUInt16LE(33, 14); directory.writeUInt32LE(checksum, 16);
    directory.writeUInt32LE(compressed.length, 20); directory.writeUInt32LE(data.length, 24); directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(((file.executable ? 0o100755 : 0o100644) * 65536) >>> 0, 38); directory.writeUInt32LE(offset, 42);
    entries.push(header, name, compressed); central.push(directory, name);
    offset += header.length + name.length + compressed.length;
  }
  const index = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(index.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...entries, index, end]);
}

const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
export function localHtml(html) {
  return html.replace(/<link\b[^>]*rel=["']preconnect["'][^>]*>/g, '')
    .replace('<head>', `<head><meta name="prepvault-mode" content="local"><meta http-equiv="Content-Security-Policy" content="${CSP}">`)
    .replace('<title>PrepVault — Ready for real life</title>', '<title>PrepVault — Local edition</title>');
}

const LAUNCH_UNIX = '#!/bin/sh\ncd "$(dirname "$0")" || exit 1\nif command -v python3 >/dev/null 2>&1; then exec python3 serve.py; fi\nif command -v node >/dev/null 2>&1; then exec node serve.mjs; fi\nprintf "Install Python 3 or Node.js 18+ before going offline, then run this launcher again.\\n"\nread -r answer\n';
const LAUNCH_WINDOWS = '@echo off\r\ncd /d "%~dp0"\r\nwhere py >nul 2>nul\r\nif not errorlevel 1 (py -3 serve.py & goto done)\r\nwhere node >nul 2>nul\r\nif not errorlevel 1 (node serve.mjs & goto done)\r\necho Install Python 3 or Node.js 18+ before going offline, then run this launcher again.\r\n:done\r\npause\r\n';
const README = `PREPVAULT — LOCAL EDITION

1. Download an encrypted complete plan backup from Settings & backups on the live site. Keep its passphrase separately.
2. Extract this entire ZIP into a folder on your computer. Do not open app/index.html directly.
3. Run Start PrepVault.command on macOS, Start PrepVault.bat on Windows, or Start PrepVault.sh on Linux. Python 3.8+ or Node.js 18+ must be installed before going offline. On macOS/Linux you can also run: python3 serve.py (or node serve.mjs) in this folder.
4. Open http://127.0.0.1:4173/ in your usual browser. Keep the launcher running. Use this exact address each time: a different hostname, port or browser has separate storage.
5. Open Settings & backups and restore your encrypted backup. Verify your supplies, maps and people, then download a new backup after making changes.

WHAT WORKS WITHOUT INTERNET
Inventory, people/dependants, rationing, planning calculations, codes, saved map images and pins, saved route geometry and directions, daily travel plans, Calendar tasks, Skills checklists, growing records, Bug Out, manual radio notes, backup encryption/restore and the included original PDF handbooks.

WHAT REQUIRES THE LIVE WEBSITE
Secure owner sign-in, Survival LLM, live GPS sharing, community posts, cameras/alarms, internet radio, new route calculation, street map tiles, weather and news. These are not bundled services. External connections are blocked by this edition's content security policy. Links you choose to open in another tab may use the internet.

YOUR DATA
This public ZIP contains the application and handbooks only—no personal plan, credentials or server keys. Your plan stays in browser storage and is NOT encrypted there. The encrypted backup uses AES-256-GCM and PBKDF2-SHA256 (310,000 iterations). Passphrases cannot be recovered. Protect your computer account/disk; do not rely on browser storage as your only backup. Clearing browser data can erase the local plan. Hosted and local plans do not sync automatically. Account sessions, live tracking positions, private chat history, provider feeds and public posts are not part of plan backups.

The server listens only on 127.0.0.1, serves the included app, and never implements remote APIs. It does not collect request logs. Stop it with Ctrl+C. If the port is occupied, stop your other launcher; changing ports creates a different browser workspace.

UPDATES AND CHECKSUMS
Download a fresh local edition from the live site when you want updates. Export your plan first. SHA256SUMS lists every file in this package except itself for integrity checking. Original handbook sources and licenses are in app/handbooks/sources.json and README.txt. The handbooks remain third-party reference documents; this package does not change their contents.
`;

export async function buildPortableApp(outDir) {
  const files = [];
  const add = (name, data, executable = false) => files.push({ name: `PrepVault-local/${name}`, data: Buffer.from(data), executable });
  const html = localHtml(await readFile(resolve(outDir, 'index.html'), 'utf8'));
  add('app/index.html', html);
  add('app/favicon.svg', await readFile(resolve(outDir, 'favicon.svg')));
  const assets = ['/favicon.svg'];
  for (const name of (await readdir(resolve(outDir, 'assets'))).sort()) {
    if (!/^[A-Za-z0-9._-]+\.(?:m?js|css|woff2|png|jpg|webp|svg)$/.test(name)) continue;
    let data = await readFile(resolve(outDir, 'assets', name));
    if (name.endsWith('.css')) data = Buffer.from(data.toString().replace(/@import\s*(?:url\(\s*)?(["'])https:\/\/fonts\.googleapis\.com[^"']*\1\s*\)?\s*;/g, ''));
    add(`app/assets/${name}`, data);
    if (/\.(?:m?js|css)$/.test(name)) assets.push(`/assets/${name}`);
  }
  for (const name of (await readdir(resolve(outDir, 'handbooks'))).sort()) {
    if (!/^[A-Za-z0-9._-]+\.(pdf|json|txt)$/.test(name)) continue;
    add(`app/handbooks/${name}`, await readFile(resolve(outDir, 'handbooks', name)));
  }
  const version = createHash('sha256').update(html).update(JSON.stringify(assets)).digest('hex').slice(0, 16);
  add('app/handbook-sw.js', createHandbookWorker({ assets, html, version: `local-${version}` }));
  add('serve.mjs', await readFile(resolve(BUILD_DIR, 'local-server.mjs')));
  add('serve.py', await readFile(resolve(BUILD_DIR, 'local-server.py')));
  add('Start PrepVault.command', LAUNCH_UNIX, true);
  add('Start PrepVault.sh', LAUNCH_UNIX, true);
  add('Start PrepVault.bat', LAUNCH_WINDOWS);
  add('READ ME.txt', README);
  add('SHA256SUMS', files.map(file => `${createHash('sha256').update(file.data).digest('hex')}  ${file.name.slice('PrepVault-local/'.length)}`).join('\n') + '\n');
  const zip = createZip(files);
  await mkdir(resolve(outDir, 'local'), { recursive: true });
  await writeFile(resolve(outDir, 'local/prepvault-local.zip'), zip);
  await writeFile(resolve(outDir, 'local/manifest.json'), JSON.stringify({ version, bytes: zip.length, sha256: createHash('sha256').update(zip).digest('hex'), files: files.length, generatedAt: new Date().toISOString() }));
  return { bytes: zip.length, files: files.length };
}

export function portableAppBuild() {
  let outDir;
  return { name: 'prepvault-portable-app', apply: 'build', configResolved(config) { outDir = resolve(config.root, config.build.outDir); }, async closeBundle() { await buildPortableApp(outDir); } };
}
