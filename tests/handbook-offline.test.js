import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { createHandbookWorker } from '../build/handbook-worker.js';
import { HANDBOOK_CACHE, getHandbookUrl, listSavedHandbooks, removeHandbook, validateHandbookResponse, saveHandbook, getOfflineLibraryStatus } from '../src/handbook-offline.js';

const origin = 'https://prepvault.test';
const bytes = Buffer.from('%PDF-1.7\nA complete test document\n%%EOF');
const book = { id: 'water', path: '/handbooks/water.pdf', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
function memoryCaches() {
  const all = new Map();
  const key = request => new URL(typeof request === 'string' ? request : request.url, origin).href;
  return {
    async open(name) {
      if (!all.has(name)) {
        const entries = new Map();
        all.set(name, {
          async match(request) { return entries.get(key(request))?.clone(); },
          async put(request, response) { entries.set(key(request), response.clone()); },
          async delete(request) { return entries.delete(key(request)); },
          async keys() { return [...entries.keys()].map(url => new Request(url)); },
        });
      }
      return all.get(name);
    },
    async keys() { return [...all.keys()]; },
    async delete(name) { return all.delete(name); },
  };
}

function installGlobals(t, values) {
  for (const [key, value] of Object.entries(values)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]);
  }
}

test('handbook URLs accept only verified same-origin catalog paths', () => {
  assert.equal(getHandbookUrl(book), `${book.path}?v=${book.sha256}`);
  for (const path of ['https://outside.test/doc.pdf', '//outside.test/doc.pdf', '/api/secret.pdf', '/handbooks/../secret.pdf', '/handbooks/file.pdf?token=secret']) {
    assert.throws(() => getHandbookUrl({ ...book, path }), /incomplete file details/);
  }
  assert.throws(() => getHandbookUrl({ ...book, bytes: 0 }), /incomplete/);
  assert.throws(() => getHandbookUrl({ ...book, sha256: 'bad' }), /incomplete/);
});

test('PDF validation detects HTML fallback, partial files and changed content', async () => {
  const valid = await validateHandbookResponse(book, new Response(bytes));
  assert.equal(valid.headers.get('Content-Type'), 'application/pdf');
  assert.equal(valid.headers.get('X-PrepVault-SHA256'), book.sha256);
  assert.deepEqual(Buffer.from(await valid.arrayBuffer()), bytes);
  await assert.rejects(validateHandbookResponse(book, new Response('<html>Sign in</html>')), /incomplete|not a PDF/);
  await assert.rejects(validateHandbookResponse(book, new Response(bytes.subarray(0, 7))), /incomplete/);
  const changed = Buffer.from(bytes); changed[12] = 88;
  await assert.rejects(validateHandbookResponse(book, new Response(changed)), /verified copy/);
  await assert.rejects(validateHandbookResponse(book, new Response(bytes, { status: 206 })), /could not be downloaded/);
});

test('saved status checks the current verified cache entry and removal clears older editions', async t => {
  const caches = memoryCaches();
  installGlobals(t, { caches });
  const cache = await caches.open(HANDBOOK_CACHE);
  const other = { ...book, id: 'food', path: '/handbooks/food.pdf' };
  await cache.put(getHandbookUrl(book), new Response(bytes));
  assert.deepEqual(await listSavedHandbooks([book, other]), []);
  await cache.put(getHandbookUrl(book), await validateHandbookResponse(book, new Response(bytes)));
  await cache.put(`${book.path}?v=old-edition`, new Response(bytes));
  await cache.put(getHandbookUrl(other), await validateHandbookResponse(other, new Response(bytes)));
  assert.deepEqual(await listSavedHandbooks([book, other]), ['water', 'food']);
  await removeHandbook(book);
  assert.deepEqual(await listSavedHandbooks([book, other]), ['food']);
  assert.equal((await cache.keys()).length, 1);
  await caches.delete(HANDBOOK_CACHE);
  assert.deepEqual(await listSavedHandbooks([book, other]), []);
});

test('saving waits for an offline-ready worker and writes only verified PDFs', async t => {
  const caches = memoryCaches();
  let ready = true;
  const worker = {
    state: 'activated', scriptURL: `${origin}/handbook-sw.js`,
    addEventListener() {}, removeEventListener() {},
    postMessage(_message, ports) { ports[0].postMessage({ ready }); },
  };
  const registration = { active: worker };
  let response = new Response('<html>missing PDF</html>');
  const navigator = {
    serviceWorker: { controller: worker, async register() { return registration; }, async getRegistration() { return registration; }, addEventListener() {}, removeEventListener() {} },
    storage: { async persist() { return false; }, async persisted() { return false; } },
  };
  installGlobals(t, { caches, navigator, isSecureContext: true, fetch: async () => response.clone() });
  assert.deepEqual(await getOfflineLibraryStatus(), { supported: true, ready: true, persistent: false });
  await assert.rejects(saveHandbook(book), /incomplete|not a PDF/);
  assert.deepEqual(await listSavedHandbooks([book]), []);
  response = new Response(bytes);
  ready = false;
  await assert.rejects(saveHandbook(book), /not completely saved/);
  assert.deepEqual(await listSavedHandbooks([book]), []);
  ready = true;
  assert.equal(await saveHandbook(book), book.id);
  assert.deepEqual(await listSavedHandbooks([book]), [book.id]);
});

function workerHarness(caches = memoryCaches(), options = {}) {
  const listeners = new Map();
  let failNetwork = false;
  let claims = 0;
  const self = { location: { origin }, clients: { async claim() { claims++; } }, async skipWaiting() {}, addEventListener(type, callback) { listeners.set(type, callback); } };
  class OriginRequest extends Request { constructor(input, init) { super(typeof input === 'string' ? new URL(input, origin) : input, init); } }
  const fetch = async input => {
    if (failNetwork) throw new TypeError('Offline');
    const url = new URL(typeof input === 'string' ? input : input.url, origin);
    if (options.responses?.[url.pathname]) return options.responses[url.pathname].clone();
    const isScript = /\.m?js$/.test(url.pathname);
    return new Response(isScript ? 'export const app = true;' : 'body{}', { headers: { 'Content-Type': isScript ? 'text/javascript' : 'text/css' } });
  };
  vm.runInNewContext(createHandbookWorker({ html: '<html>offline-shell</html>', assets: options.assets || ['/assets/app-123.js', '/assets/app-123.css'], version: 'test' }), { self, caches, fetch, Request: OriginRequest, Response, Headers, URL, AbortController, setTimeout, clearTimeout, console });
  return {
    caches,
    offline() { failNetwork = true; }, online() { failNetwork = false; },
    async event(type, extras = {}) { let promise; listeners.get(type)({ waitUntil(value) { promise = value; }, ...extras }); await promise; },
    async request(request) { let response; listeners.get('fetch')({ request, respondWith(value) { response = value; } }); return response; },
    get claims() { return claims; },
  };
}

test('worker saves an exact-build app shell and serves cold navigation without network', async () => {
  const worker = workerHarness();
  await worker.event('install');
  await worker.event('activate');
  assert.equal(worker.claims, 1);
  worker.offline();
  const response = await worker.request({ method: 'GET', url: `${origin}/`, mode: 'navigate', headers: new Headers() });
  assert.match(await response.text(), /offline-shell/);
  const asset = await worker.request(new Request(`${origin}/assets/app-123.js`));
  assert.match(await asset.text(), /app = true/);
  const pdf = await worker.request(new Request(`${origin}/handbooks/missing.pdf`));
  assert.equal(pdf.status, 503);
  assert.match(await pdf.text(), /not saved/);
});

test('worker serves full, open-ended and suffix PDF ranges and rejects invalid ranges', async () => {
  const worker = workerHarness();
  const cache = await worker.caches.open(HANDBOOK_CACHE);
  const url = `${origin}${getHandbookUrl(book)}`;
  await cache.put(url, await validateHandbookResponse(book, new Response(bytes)));
  worker.offline();
  const full = await worker.request(new Request(url));
  assert.equal(full.status, 200);
  assert.deepEqual(Buffer.from(await full.arrayBuffer()), bytes);
  for (const [range, expected, start, end] of [
    ['bytes=0-4', bytes.subarray(0, 5), 0, 4],
    ['bytes=5-', bytes.subarray(5), 5, bytes.length - 1],
    ['bytes=-5', bytes.subarray(-5), bytes.length - 5, bytes.length - 1],
    ['bytes=0-999999', bytes, 0, bytes.length - 1],
  ]) {
    const response = await worker.request(new Request(url, { headers: { Range: range } }));
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('Content-Range'), `bytes ${start}-${end}/${bytes.length}`);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);
  }
  for (const range of ['bytes=999-', 'bytes=6-2', 'bytes=-0', 'bytes=-', 'bytes=0-1,5-6']) {
    assert.equal((await worker.request(new Request(url, { headers: { Range: range } }))).status, 416);
  }
});

test('worker never intercepts APIs, authenticated requests, third parties or arbitrary files', async () => {
  const worker = workerHarness();
  for (const request of [
    new Request(`${origin}/api/private`),
    new Request(`${origin}/auth/callback`),
    new Request(`${origin}/private.pdf`),
    new Request('https://other.test/assets/app-123.js'),
    new Request(`${origin}/assets/app-123.js`, { headers: { Authorization: 'Bearer private' } }),
    new Request(`${origin}/`, { method: 'POST' }),
  ]) assert.equal(await worker.request(request), undefined);
  assert.deepEqual(await worker.caches.keys(), []);
});

test('an evicted app asset is detected and repaired on the next explicit prepare request', async () => {
  const worker = workerHarness();
  await worker.event('install');
  const shell = await worker.caches.open('prepvault-shell-test');
  await shell.delete('/assets/app-123.js');
  let status;
  const ports = [{ postMessage(value) { status = value; } }];
  await worker.event('message', { data: { type: 'PREPVAULT_OFFLINE_STATUS' }, ports });
  assert.equal(status.ready, false);
  await worker.event('message', { data: { type: 'PREPVAULT_PREPARE_OFFLINE' }, ports });
  assert.equal(status.ready, true);
  assert.ok(await shell.match('/assets/app-123.js'));
});

test('failed app install does not leave a partially ready shell cache', async () => {
  const worker = workerHarness();
  worker.offline();
  await assert.rejects(worker.event('install'), /Offline/);
  assert.deepEqual(await worker.caches.keys(), []);
});

test('the module PDF worker is cached and readable offline with a JavaScript MIME type', async () => {
  const modulePath = '/assets/pdf.worker.min-123.mjs';
  const worker = workerHarness(memoryCaches(), { assets: ['/assets/app-123.js', modulePath] });
  await worker.event('install');
  worker.offline();
  const response = await worker.request(new Request(`${origin}${modulePath}`));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'text/javascript');
  assert.match(await response.text(), /export const app/);
});

test('HTML or an incorrect MIME type for the module PDF worker rejects the entire shell install', async () => {
  const modulePath = '/assets/pdf.worker.min-123.mjs';
  for (const contentType of ['text/html', 'text/plain', 'application/octet-stream']) {
    const worker = workerHarness(memoryCaches(), {
      assets: ['/assets/app-123.js', modulePath],
      responses: { [modulePath]: new Response('<html>Authentication required</html>', { headers: { 'Content-Type': contentType } }) },
    });
    await assert.rejects(worker.event('install'), /Could not save the application resource/);
    assert.deepEqual(await worker.caches.keys(), []);
  }
});

function readyWorker(path = '/handbook-sw.js') {
  return {
    state: 'activated', scriptURL: `${origin}${path}`,
    addEventListener() {}, removeEventListener() {},
    postMessage(_message, ports) { ports[0].postMessage({ ready: true }); },
  };
}

test('a failed update preserves a readable existing offline library and allows a later retry', async t => {
  const module = await import('../src/handbook-offline.js?update-failure-test');
  const caches = memoryCaches();
  const cache = await caches.open(HANDBOOK_CACHE);
  await cache.put(getHandbookUrl(book), await validateHandbookResponse(book, new Response(bytes)));
  let attempts = 0;
  const registration = { active: readyWorker(), async update() { attempts++; throw new TypeError('Network unavailable'); } };
  installGlobals(t, { caches, isSecureContext: true, navigator: {
    onLine: true,
    serviceWorker: { async getRegistration() { return registration; } },
    storage: { async persisted() { return false; } },
  } });
  assert.deepEqual(await module.getOfflineLibraryStatus(), { supported: true, ready: true, persistent: false });
  assert.deepEqual(await module.listSavedHandbooks([book]), [book.id]);
  assert.deepEqual(await module.getOfflineLibraryStatus(), { supported: true, ready: true, persistent: false });
  assert.equal(attempts, 2);
});

test('status never starts an update when offline or when a different service worker is registered', async t => {
  const module = await import('../src/handbook-offline.js?update-skip-test');
  let attempts = 0;
  const registration = { active: readyWorker(), async update() { attempts++; } };
  const navigator = {
    onLine: false,
    serviceWorker: { async getRegistration() { return registration; } },
    storage: { async persisted() { return true; } },
  };
  installGlobals(t, { caches: memoryCaches(), isSecureContext: true, navigator });
  assert.deepEqual(await module.getOfflineLibraryStatus(), { supported: true, ready: true, persistent: true });
  navigator.onLine = true;
  registration.active = readyWorker('/other-worker.js');
  assert.deepEqual(await module.getOfflineLibraryStatus(), { supported: true, ready: false, persistent: true });
  assert.equal(attempts, 0);
});

test('a successful update waits for activation and is checked once per module session', async t => {
  const module = await import('../src/handbook-offline.js?update-activation-test');
  let attempts = 0;
  let waited = false;
  const oldWorker = readyWorker();
  const nextWorker = readyWorker();
  const registration = {
    active: oldWorker,
    async update() {
      attempts++;
      nextWorker.state = 'installing';
      nextWorker.addEventListener = (_type, callback) => {
        waited = true;
        queueMicrotask(() => {
          nextWorker.state = 'activated';
          registration.active = nextWorker;
          registration.installing = null;
          callback();
        });
      };
      registration.installing = nextWorker;
    },
  };
  installGlobals(t, { caches: memoryCaches(), isSecureContext: true, navigator: {
    onLine: true,
    serviceWorker: { async getRegistration() { return registration; } },
    storage: { async persisted() { return false; } },
  } });
  assert.equal((await module.getOfflineLibraryStatus()).ready, true);
  assert.equal(waited, true);
  assert.equal(registration.active, nextWorker);
  assert.equal((await module.getOfflineLibraryStatus()).ready, true);
  assert.equal(attempts, 1);
});
