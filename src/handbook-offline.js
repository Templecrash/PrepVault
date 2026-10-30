export const HANDBOOK_CACHE = 'prepvault-handbooks-v1';
const WORKER_PATH = '/handbook-sw.js';
const SHA_HEADER = 'X-PrepVault-SHA256';
let preparation;
let persistenceRequest;
let checkedForUpdate = false;

function assertBook(book) {
  if (!book || !/^\/handbooks\/[a-z0-9][a-z0-9._-]*\.pdf$/.test(book.path) || !/^[a-f0-9]{64}$/.test(book.sha256) || !Number.isSafeInteger(book.bytes) || book.bytes <= 0) {
    throw new Error('This handbook has incomplete file details. Please reload the library.');
  }
}

export function getHandbookUrl(book) {
  assertBook(book);
  return `${book.path}?v=${book.sha256}`;
}

function isSupported() {
  return !import.meta.env?.DEV && globalThis.isSecureContext === true && Boolean(globalThis.navigator?.serviceWorker && globalThis.caches && globalThis.crypto?.subtle);
}

function workerStatus(worker, prepare = false) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const close = () => { clearTimeout(timer); channel.port1.close(); channel.port2.close(); };
    const timer = setTimeout(() => { close(); reject(new Error('Offline storage is not ready. Reconnect and try Save offline again.')); }, prepare ? 45000 : 5000);
    channel.port1.onmessage = event => { close(); resolve(event.data); };
    worker.postMessage({ type: prepare ? 'PREPVAULT_PREPARE_OFFLINE' : 'PREPVAULT_OFFLINE_STATUS' }, [channel.port2]);
  });
}

export async function getOfflineLibraryStatus() {
  if (!isSupported()) return { supported: false, ready: false, persistent: false };
  try {
    const registration = await navigator.serviceWorker.getRegistration('/');
    // Refresh only an existing, opted-in library so future visits retain the
    // reader and app assets belonging to the latest deployed version.
    if (registration?.active && new URL(registration.active.scriptURL).pathname === WORKER_PATH && registration.update && !checkedForUpdate && navigator.onLine !== false) {
      try {
        await registration.update();
        const installing = registration.installing || registration.waiting;
        if (installing) await waitForActivation(installing);
        checkedForUpdate = true;
      } catch { /* Existing verified files remain readable while offline. */ }
    }
    const worker = registration?.active;
    const isOurs = worker && new URL(worker.scriptURL).pathname === WORKER_PATH;
    const status = isOurs ? await workerStatus(worker) : { ready: false };
    const persistent = await navigator.storage?.persisted?.().catch(() => false);
    return { supported: true, ready: status.ready === true, persistent: persistent === true };
  } catch { return { supported: true, ready: false, persistent: false }; }
}

function waitForActivation(worker) {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); worker.removeEventListener('statechange', check); };
    const check = () => {
      if (worker.state === 'activated') { cleanup(); resolve(); }
      else if (worker.state === 'redundant') { cleanup(); reject(new Error('The site could not be saved for offline use. Check your connection and browser storage, then try again.')); }
    };
    const timer = setTimeout(() => { cleanup(); reject(new Error('Saving the site took too long. Reconnect and try Save offline again.')); }, 45000);
    worker.addEventListener('statechange', check);
    check();
  });
}

function waitForControl() {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); navigator.serviceWorker.removeEventListener('controllerchange', check); };
    const check = () => {
      const controller = navigator.serviceWorker.controller;
      if (controller && new URL(controller.scriptURL).pathname === WORKER_PATH) { cleanup(); resolve(); }
    };
    const timer = setTimeout(() => { cleanup(); reject(new Error('Offline access needs a page reload. Reload while connected and try again.')); }, 10000);
    navigator.serviceWorker.addEventListener('controllerchange', check);
    check();
  });
}

export async function prepareOfflineLibrary() {
  if (!isSupported()) throw new Error('Offline saving needs a browser with storage enabled on the published HTTPS site. You can still download the PDFs.');
  if (preparation) return preparation;
  preparation = (async () => {
    // The request is made only after the user explicitly chooses offline saving.
    persistenceRequest ??= navigator.storage?.persist?.().catch(() => false) || Promise.resolve(false);
    const registration = await navigator.serviceWorker.register(WORKER_PATH, { scope: '/', updateViaCache: 'none' });
    const worker = registration.installing || registration.waiting || registration.active;
    if (!worker) throw new Error('Offline access could not start. Please reconnect and try again.');
    await waitForActivation(worker);
    await waitForControl();
    const status = await workerStatus(registration.active || worker, true);
    if (!status.ready) throw new Error('The site is not completely saved yet. Reconnect and try Save offline again.');
    return { supported: true, ready: true, persistent: (await persistenceRequest) === true };
  })();
  try { return await preparation; }
  finally { preparation = undefined; }
}

export async function validateHandbookResponse(book, response) {
  assertBook(book);
  if (!response.ok || response.status !== 200 || response.redirected) throw new Error('The handbook could not be downloaded. Please reconnect and try again.');
  const body = await response.arrayBuffer();
  const signature = new TextDecoder().decode(body.slice(0, 5));
  if (signature !== '%PDF-' || body.byteLength !== book.bytes) throw new Error('The handbook download was incomplete or was not a PDF. Please try again.');
  const digest = await crypto.subtle.digest('SHA-256', body);
  const sha256 = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
  if (sha256 !== book.sha256) throw new Error('The handbook did not match its verified copy. Reload the library and try again.');
  return new Response(body, { headers: { 'Content-Type': 'application/pdf', 'Content-Length': String(body.byteLength), 'Accept-Ranges': 'bytes', [SHA_HEADER]: sha256 } });
}

export async function listSavedHandbooks(books) {
  if (!globalThis.caches) return [];
  const cache = await caches.open(HANDBOOK_CACHE);
  const saved = await Promise.all(books.map(async book => {
    const response = await cache.match(getHandbookUrl(book));
    return response?.status === 200 && response.headers.get(SHA_HEADER) === book.sha256 && Number(response.headers.get('Content-Length')) === book.bytes ? book.id : null;
  }));
  return saved.filter(Boolean);
}

export async function saveHandbook(book) {
  assertBook(book);
  await prepareOfflineLibrary();
  const cache = await caches.open(HANDBOOK_CACHE);
  const url = getHandbookUrl(book);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
    const verified = await validateHandbookResponse(book, response);
    await cache.put(url, verified);
    // Discard obsolete editions of this same file only after the new copy is verified.
    const old = (await cache.keys()).filter(key => new URL(key.url).pathname === book.path && new URL(key.url).search !== `?v=${book.sha256}`);
    await Promise.all(old.map(key => cache.delete(key)));
    return book.id;
  } catch (error) {
    if (error.name === 'QuotaExceededError') throw new Error('There is not enough browser storage. Remove an offline handbook or download this PDF to your device instead.');
    if (error.name === 'AbortError' || error instanceof TypeError) throw new Error('The download did not finish. Check your connection and try again.');
    throw error;
  } finally { clearTimeout(timer); }
}

export async function removeHandbook(book) {
  assertBook(book);
  if (!globalThis.caches) return;
  const cache = await caches.open(HANDBOOK_CACHE);
  const matches = (await cache.keys()).filter(key => new URL(key.url).pathname === book.path);
  await Promise.all(matches.map(key => cache.delete(key)));
}
