/* Screenshot harness only: stands in for the chrome.* APIs so the real popup code runs unmodified.
   The analysed page is loaded in a hidden same-origin iframe; executeScript runs the injected
   function inside it, exactly like chrome.scripting does in the real extension. */
(function () {
  const DEMO = 'https://shop.example.com/trail-running-shoes/ridgeline/';
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:-20000px;top:0;width:1280px;height:900px;border:0';
  frame.src = DEMO;
  const ready = new Promise((r) => frame.addEventListener('load', () => setTimeout(r, 150)));
  document.documentElement.appendChild(frame);

  const store = window.__initStore || {};
  window.__downloads = [];

  const run = async ({ func, args }) => {
    await ready;
    const fn = frame.contentWindow.eval('(' + func.toString() + ')');
    return [{ result: structuredClone(fn(...(args || []))) }];
  };

  const headerRecord = () => ({
    requestId: '1042', startUrl: 'http://shop.example.com/trail-running-shoes/ridgeline/', url: DEMO,
    redirects: [{ from: 'http://shop.example.com/trail-running-shoes/ridgeline/', to: DEMO, status: 301, line: 'HTTP/1.1 301 Moved Permanently', cached: false }],
    headers: [
      { name: 'content-type', value: 'text/html; charset=UTF-8' },
      { name: 'server', value: 'nginx' },
      { name: 'date', value: new Date().toUTCString() },
      { name: 'cache-control', value: 'max-age=0, must-revalidate, public' },
      { name: 'content-encoding', value: 'br' },
      { name: 'vary', value: 'Accept-Encoding' },
      { name: 'last-modified', value: 'Wed, 28 Oct 2026 08:12:00 GMT' },
      { name: 'strict-transport-security', value: 'max-age=31536000; includeSubDomains' },
      { name: 'x-frame-options', value: 'SAMEORIGIN' },
      { name: 'x-content-type-options', value: 'nosniff' },
      { name: 'x-cache', value: 'HIT' },
      { name: 'age', value: '312' }
    ],
    statusCode: 200, error: null, ts: Date.now() - 4000
  });

  const NET = { 'namenotresolved': 'domain not found' };
  async function checkUrl(url, image) {
    let scheme = '';
    try { scheme = new URL(url).protocol.replace(':', ''); } catch (e) { return { ok: false, status: 'skip', scheme: 'invalid' }; }
    if (scheme !== 'http' && scheme !== 'https') return { ok: false, status: 'skip', scheme };
    try {
      let res = await fetch(url, { method: 'HEAD', redirect: 'follow', cache: 'no-cache' });
      const len = parseInt(res.headers.get('content-length'), 10);
      return { ok: res.ok, status: res.status, redirected: res.redirected, finalUrl: res.url, size: len > 0 ? len : null,
               contentType: (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() || null };
    } catch (e) { return { ok: false, status: 0, error: 'domain not found' }; }
  }

  async function handle(msg) {
    switch (msg.action) {
      case 'getHeaders': { const h = headerRecord(); return { headers: h, status: { url: h.url, statusCode: 200, error: null } }; }
      case 'recheckHeaders': return { ...headerRecord(), recheck: true, requestId: 'recheck' };
      case 'fetchRobotsTxt': { const r = await fetch(msg.url); return { ok: r.ok, status: r.status, text: await r.text(), redirected: false, finalUrl: r.url }; }
      case 'fetchRawHead': {
        const r = await fetch(msg.url); const t = await r.text();
        const m = t.match(/<link rel="canonical" href="([^"]+)"/);
        return { ok: true, status: r.status, finalUrl: r.url, canonicalAttr: m ? m[1] : null, canonical: m ? m[1] : null };
      }
      case 'fetchRawHtml': { const r = await fetch(msg.url); const t = await r.text(); return { ok: r.ok, status: r.status, finalUrl: r.url, text: t, bytes: new TextEncoder().encode(t).length, truncated: false }; }
      case 'fetchSitemap': case 'checkUrlStatus': return checkUrl(msg.url, !!msg.image);
      case 'download': window.__downloads.push({ filename: msg.filename, dataUrl: msg.dataUrl }); return { ok: true, id: window.__downloads.length };
    }
    return null;
  }

  window.chrome = {
    tabs: {
      query: async () => [{ id: 7, url: DEMO, windowId: 1, index: 0 }],
      create: async () => ({})
    },
    storage: {
      local: {
        get: async (keys) => { const out = {}; [].concat(keys).forEach((k) => { if (k in store) out[k] = store[k]; }); return out; },
        set: async (o) => { Object.assign(store, o); }
      }
    },
    scripting: {
      executeScript: run,
      insertCSS: async ({ css }) => { await ready; const s = frame.contentDocument.createElement('style'); s.id = '__hlcss'; s.textContent = css; frame.contentDocument.head.appendChild(s); },
      removeCSS: async () => { const s = frame.contentDocument.getElementById('__hlcss'); if (s) s.remove(); }
    },
    runtime: {
      lastError: undefined,
      getURL: (p) => '/__ext/' + p,
      sendMessage: (msg, cb) => { handle(msg).then((r) => setTimeout(() => cb && cb(r), 30), () => cb && cb(null)); }
    }
  };
  window.__frame = frame;
})();
