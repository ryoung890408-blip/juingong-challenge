/* 7일 주인공(主人空) 챌린지 — Service Worker */
const VERSION = 'v4';
const CACHE = 'juingong-challenge-' + VERSION;
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './univ_voice.mp3',
  './univ_bgm.mp3'
];
const FONT_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // cache: 'reload' → 항상 네트워크에서 전체(200) 응답을 받아 저장
      .then((cache) => Promise.all(PRECACHE.map((u) =>
        fetch(new Request(u, { cache: 'reload' })).then((r) => {
          if (!r.ok) throw new Error('precache failed: ' + u + ' ' + r.status);
          return cache.put(u, r);
        }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => k.startsWith('juingong-challenge-') && k !== CACHE)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 캐시된 전체 응답에서 Range 요청(오디오/iOS Safari 필수)에 206으로 응답
async function rangeResponse(request, cached) {
  const buf = await cached.arrayBuffer();
  const size = buf.byteLength;
  const m = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') || '');
  const type = cached.headers.get('Content-Type') || 'audio/mpeg';
  if (!m || (m[1] === '' && m[2] === '')) {
    return new Response(buf, { status: 200, headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' } });
  }
  let start, end;
  if (m[1] === '') { // suffix: bytes=-N
    const n = parseInt(m[2], 10);
    start = Math.max(size - n, 0); end = size - 1;
  } else {
    start = parseInt(m[1], 10);
    end = m[2] === '' ? size - 1 : Math.min(parseInt(m[2], 10), size - 1);
  }
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
  }
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': type,
      'Content-Length': String(end - start + 1),
      'Content-Range': 'bytes ' + start + '-' + end + '/' + size,
      'Accept-Ranges': 'bytes'
    }
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 폰트 CDN: 캐시 우선 + 백그라운드 갱신 (오프라인이면 캐시, 없으면 시스템 폰트로 대체)
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      const net = fetch(req).then((r) => { if (r && (r.ok || r.type === 'opaque')) cache.put(req, r.clone()); return r; }).catch(() => null);
      return hit || (await net) || Response.error();
    }));
    return;
  }
  if (url.origin !== location.origin) return;

  // 페이지 이동: 캐시된 index.html (오프라인 대응)
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((hit) => hit || fetch(req))
    );
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) {
      if (req.headers.has('range')) return rangeResponse(req, cached);
      return cached;
    }
    try {
      return await fetch(req);
    } catch (e) {
      return new Response('offline', { status: 503, statusText: 'Offline' });
    }
  })());
});
