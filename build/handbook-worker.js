// Serialized into the generated service worker. Keep this function self-contained.
export function handbookWorkerRuntime(config) {
  const { assets, html, version } = config;
  const shellName = `prepvault-shell-${version}`;
  const handbookName = 'prepvault-handbooks-v1';
  const assetPaths = new Set(assets);

  async function cacheShell() {
      try {
        const cache = await caches.open(shellName);
        await Promise.all(assets.map(async path => {
          const response = await fetch(new Request(path, { cache: 'reload', credentials: 'same-origin' }));
          const type = response.headers.get('Content-Type') || '';
          if (!response.ok || response.redirected || (/\.m?js$/.test(path) && !/javascript/.test(type)) || (path.endsWith('.css') && !/text\/css/.test(type))) {
            throw new Error(`Could not save the application resource: ${path}`);
          }
          await cache.put(path, response);
        }));
        // This exact build's HTML always references the assets saved above.
        await cache.put('/', new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
      } catch (error) {
        await caches.delete(shellName);
        throw error;
      }
  }

  self.addEventListener('install', event => {
    event.waitUntil((async () => {
      await cacheShell();
      await self.skipWaiting();
    })());
  });

  self.addEventListener('activate', event => {
    event.waitUntil((async () => {
      // Retain one previous build for pages that were already open during an update.
      const previous = (await caches.keys()).filter(name => name.startsWith('prepvault-shell-') && name !== shellName);
      await Promise.all(previous.slice(0, -1).map(name => caches.delete(name)));
      await self.clients.claim();
    })());
  });

  async function shellReady() {
    const cache = await caches.open(shellName);
    return (await Promise.all(['/', ...assets].map(path => cache.match(path)))).every(Boolean);
  }

  self.addEventListener('message', event => {
    if (!['PREPVAULT_OFFLINE_STATUS', 'PREPVAULT_PREPARE_OFFLINE'].includes(event.data?.type) || !event.ports[0]) return;
    event.waitUntil((async () => {
      try {
        if (event.data.type === 'PREPVAULT_PREPARE_OFFLINE' && !(await shellReady())) await cacheShell();
        event.ports[0].postMessage({ ready: await shellReady(), version });
      } catch { event.ports[0].postMessage({ ready: false, version }); }
    })());
  });

  async function servePdf(request) {
    const cache = await caches.open(handbookName);
    const saved = await cache.match(request.url);
    if (saved) {
      const range = request.headers.get('Range');
      if (!range) return saved;
      const body = await saved.arrayBuffer();
      const size = body.byteLength;
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      let start = match?.[1] ? Number(match[1]) : NaN;
      let end = match?.[2] ? Number(match[2]) : size - 1;
      if (match && !match[1] && match[2]) {
        start = Math.max(0, size - Number(match[2]));
        end = size - 1;
      }
      if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
      }
      end = Math.min(end, size - 1);
      const headers = new Headers(saved.headers);
      headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
      headers.set('Content-Length', String(end - start + 1));
      headers.set('Accept-Ranges', 'bytes');
      return new Response(body.slice(start, end + 1), { status: 206, headers });
    }
    try { return await fetch(request); }
    catch {
      return new Response('This handbook is not saved on this browser. Reconnect and choose Save offline in the Emergency library, or open a PDF you previously downloaded to your device.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  }

  async function serveNavigation(request) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(request, { signal: controller.signal });
      if (response.ok) return response;
      return (await (await caches.open(shellName)).match('/')) || response;
    } catch {
      return (await (await caches.open(shellName)).match('/')) || new Response('Reconnect to prepare your offline library.', { status: 503 });
    } finally { clearTimeout(timer); }
  }

  self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);
    // Never cache API, authentication, third-party, or personal-data responses.
    if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('Authorization')) return;
    if (/^\/handbooks\/[a-z0-9][a-z0-9._-]*\.pdf$/.test(url.pathname)) {
      event.respondWith(servePdf(request));
    } else if (request.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html')) {
      event.respondWith(serveNavigation(request));
    } else if (assetPaths.has(url.pathname) && !url.search) {
      event.respondWith((async () => (await (await caches.open(shellName)).match(url.pathname)) || fetch(request))());
    }
  });
}

export function createHandbookWorker(config) {
  return `/* PrepVault public handbook and application-shell cache. Generated at build time. */\n(${handbookWorkerRuntime.toString()})(${JSON.stringify(config)});\n`;
}
