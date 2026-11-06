/* Pure SEO – Background Service Worker v1.4
   - Tab data persisted in chrome.storage.session (survives service-worker sleep)
   - Main-frame redirect chain captured (301/302/307/308 hops)
   - URL checks: timeout, HEAD→GET fallback, redirect detection */

const KEY = (tabId) => `tab_${tabId}`;
const FILTER = { urls: ['<all_urls>'], types: ['main_frame'] };
const queues = {};
/* In-memory copy of each tab record: avoids a storage read on every request event.
   storage.session stays the source of truth after the service worker sleeps. */
const mem = {};

/* Serialised read-modify-write per tab, so events never overwrite each other.
   persist=false keeps the change in memory only; the next persisted event writes it out.
   That keeps storage to one write per page load (when it completes or fails) instead of one per event. */
function updateTab(tabId, fn, persist = true) {
  if (tabId < 0) return Promise.resolve();
  const prev = queues[tabId] || Promise.resolve();
  const next = prev.then(async () => {
    const k = KEY(tabId);
    let cur = mem[tabId];
    if (cur === undefined) { const r = await chrome.storage.session.get(k); cur = r[k] || null; }
    const val = fn(cur);
    if (val !== undefined) { mem[tabId] = val; if (persist) await chrome.storage.session.set({ [k]: val }); }
    else mem[tabId] = cur;
  }).catch(() => {});
  queues[tabId] = next;
  return next;
}

/* New navigation starts a fresh record; redirect hops keep the same requestId */
chrome.webRequest.onBeforeRequest.addListener((d) => {
  updateTab(d.tabId, (cur) => {
    if (cur && cur.requestId === d.requestId) return undefined;
    return { requestId: d.requestId, startUrl: d.url, url: d.url, redirects: [],
             headers: [], statusCode: null, error: null, ts: Date.now() };
  }, false);
}, FILTER);

chrome.webRequest.onBeforeRedirect.addListener((d) => {
  updateTab(d.tabId, (cur) => {
    if (!cur || cur.requestId !== d.requestId) return undefined;
    /* statusLine shows "Internal Redirect" when Chrome itself redirected (HSTS upgrade, extension);
       fromCache is true when a cached 301/308 was replayed instead of asking the server */
    cur.redirects.push({ from: d.url, to: d.redirectUrl, status: d.statusCode,
                         line: d.statusLine || '', cached: !!d.fromCache });
    return cur;
  }, false);
}, FILTER);

/* No 'extraHeaders' here: this listener runs on every page load in every tab, and that option makes Chrome
   route requests through extra processing. Without it every SEO header still arrives; only Set-Cookie is
   held back, and the on-demand Re-check (recheckHeaders) still captures it. */
chrome.webRequest.onHeadersReceived.addListener((d) => {
  updateTab(d.tabId, (cur) => {
    /* If the worker slept mid-navigation the in-memory start was lost: keep what we have rather than nothing */
    if (!cur || cur.requestId !== d.requestId) cur = { requestId: d.requestId, startUrl: d.url, url: d.url, redirects: [], headers: [], statusCode: null, error: null, ts: Date.now() };
    if (d.statusCode >= 300 && d.statusCode < 400 && (d.responseHeaders || []).some((h) => h.name.toLowerCase() === 'location')) return undefined;   /* redirect hop: onBeforeRedirect records it */
    cur.url = d.url;
    cur.headers = d.responseHeaders || [];
    cur.statusCode = d.statusCode;
    return cur;
  }, false);   /* memory only: onCompleted / onErrorOccurred write the finished record once */
}, FILTER, ['responseHeaders']);

chrome.webRequest.onCompleted.addListener((d) => {
  updateTab(d.tabId, (cur) => {
    if (!cur || cur.requestId !== d.requestId) return undefined;
    cur.statusCode = d.statusCode;
    cur.fromCache = !!d.fromCache;
    return cur;
  });
}, FILTER);

chrome.webRequest.onErrorOccurred.addListener((d) => {
  updateTab(d.tabId, (cur) => {
    if (!cur || cur.requestId !== d.requestId) return undefined;
    cur.statusCode = 0;
    cur.error = d.error;
    return cur;
  });
}, FILTER);

chrome.tabs.onRemoved.addListener((tabId) => {
  delete queues[tabId]; delete mem[tabId];
  chrome.storage.session.remove(KEY(tabId)).catch(() => {});
});

/* ---- Message handler ---- */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'getHeaders') {
    const pending = queues[msg.tabId] || Promise.resolve();
    pending
      .then(() => mem[msg.tabId] !== undefined ? { [KEY(msg.tabId)]: mem[msg.tabId] } : chrome.storage.session.get(KEY(msg.tabId)))
      .then((r) => {
        const data = r[KEY(msg.tabId)] || null;
        sendResponse({
          headers: data,
          status: data ? { url: data.url, statusCode: data.statusCode, error: data.error } : null
        });
      })
      .catch(() => sendResponse({ headers: null, status: null }));
    return true;
  }

  /* Save a report file. Runs here, not in the popup: Chrome closes the popup when a Save As dialog opens,
     which used to cancel the download. Replies when the file is saved, cancelled or failed. */
  if (msg.action === 'download') {
    chrome.downloads.download({ url: msg.dataUrl, filename: msg.filename, conflictAction: 'uniquify' }, (id) => {
      if (chrome.runtime.lastError || id === undefined) { sendResponse({ ok: false, error: (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'failed' }); return; }
      const watch = (delta) => {
        if (delta.id !== id || !delta.state) return;
        const st = delta.state.current;
        if (st !== 'complete' && st !== 'interrupted') return;
        chrome.downloads.onChanged.removeListener(watch);
        chrome.downloads.search({ id }).then(([item]) => sendResponse({ ok: st === 'complete', id, error: item && item.error }), () => sendResponse({ ok: st === 'complete', id }));
      };
      chrome.downloads.onChanged.addListener(watch);
    });
    return true;
  }

  if (msg.action === 'recheckHeaders') {
    recheckHeaders(msg.url).then((rec) => {
      if (rec && msg.reason) rec.reason = msg.reason;
      if (rec && msg.tabId != null) updateTab(msg.tabId, () => rec).then(() => sendResponse(rec));
      else sendResponse(rec);
    }, () => sendResponse(null));
    return true;
  }

  if (msg.action === 'fetchRobotsTxt') {
    fetchText(msg.url).then(sendResponse);
    return true;
  }

  if (msg.action === 'fetchRawHead') {
    fetchRawHead(msg.url).then(sendResponse);
    return true;
  }

  if (msg.action === 'fetchRawHtml') {
    fetchRawHtml(msg.url).then(sendResponse);
    return true;
  }

  if (msg.action === 'fetchSitemap' || msg.action === 'checkUrlStatus') {
    checkUrl(msg.url, !!msg.image).then(sendResponse);
    return true;
  }
});

const TIMEOUT_MS = 10000;

/* Fresh request for the URL now in the address bar, used when the page changed its URL without a reload
   (single-page apps) and the headers captured at load time belong to a different URL.
   webRequest sees this request too (tabId -1), so the redirect hops keep their status codes and the
   final response keeps every header; the fetch Response is the fallback. No cookies are sent. */
async function recheckHeaders(url) {
  const hops = [];
  let finalHdr = null, pointer = url;
  const F = { urls: ['<all_urls>'], tabId: -1 };
  const onRedir = (d) => { if (d.url === pointer) { hops.push({ from: d.url, to: d.redirectUrl, status: d.statusCode, line: d.statusLine || '', cached: !!d.fromCache }); pointer = d.redirectUrl; } };
  const onHdr = (d) => { if (d.url === pointer && !(d.statusCode >= 300 && d.statusCode < 400 && (d.responseHeaders || []).some((h) => h.name.toLowerCase() === 'location'))) finalHdr = { status: d.statusCode, headers: d.responseHeaders || [] }; };
  chrome.webRequest.onBeforeRedirect.addListener(onRedir, F);
  chrome.webRequest.onHeadersReceived.addListener(onHdr, F, ['responseHeaders', 'extraHeaders']);
  try {
    const r = await fetch(url, { method: 'GET', redirect: 'follow', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(15000) });
    try { r.body && r.body.cancel(); } catch (e) {}
    const headers = finalHdr ? finalHdr.headers : [...r.headers].map(([name, value]) => ({ name, value }));
    if (!hops.length && r.redirected) hops.push({ from: url, to: r.url, status: 0, line: '', cached: false });
    return { requestId: 'recheck', startUrl: url, url: r.url, redirects: hops, headers, statusCode: finalHdr ? finalHdr.status : r.status,
             error: null, ts: Date.now(), recheck: true };
  } catch (e) {
    return { requestId: 'recheck', startUrl: url, url, redirects: hops, headers: [], statusCode: 0, error: e.name === 'TimeoutError' ? 'timed out' : (e.message || 'failed'), ts: Date.now(), recheck: true };
  } finally {
    chrome.webRequest.onBeforeRedirect.removeListener(onRedir);
    chrome.webRequest.onHeadersReceived.removeListener(onHdr);
  }
}

async function fetchText(url) {
  try {
    const res = await fetch(url, { method: 'GET', cache: 'no-cache', redirect: 'follow',
                                   signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, redirected: res.redirected, finalUrl: res.url };
  } catch (e) {
    return { ok: false, status: 0, text: '', error: e.name === 'TimeoutError' ? 'timeout' : e.message };
  }
}

/* ---- Polite URL checks (link and image status) ----
   - only http(s) is requested; mailto:, tel: and other schemes are reported as skipped
   - at most CHECK_MAX requests in flight, CHECK_PER_HOST per site, HOST_GAP_MS between starts on one site,
     so a page with hundreds of links to its own server never floods it
   - HEAD first; GET when the server rejects or mishandles HEAD (400/403/405/501) or the request failed
   - one retry after 429/502/503/504 or a network failure, waiting for Retry-After (max 5 s)
   - the network error code (net::ERR_…) is captured so "Failed" can say why
   No cookies are sent, so checking a link can't change anything in a logged-in session (logout links etc.). */
const CHECK_MAX = 8, CHECK_PER_HOST = 2, HOST_GAP_MS = 120;
const checkQ = [], hostActive = {}, hostLast = {};
let checkActive = 0, pumpTimer = null;
const netErrors = new Map();
const onCheckError = (d) => { netErrors.set(d.url, d.error); if (netErrors.size > 500) netErrors.delete(netErrors.keys().next().value); };
function hostOf(u) { try { return new URL(u).host; } catch (e) { return ''; } }
function pumpChecks() {
  pumpTimer = null;
  const now = Date.now();
  let wait = Infinity;
  for (let i = 0; i < checkQ.length && checkActive < CHECK_MAX; i++) {
    const job = checkQ[i], h = job.host;
    if ((hostActive[h] || 0) >= CHECK_PER_HOST) continue;
    const gap = (hostLast[h] || 0) + HOST_GAP_MS - now;
    if (gap > 0) { wait = Math.min(wait, gap); continue; }
    checkQ.splice(i--, 1);
    checkActive++; hostActive[h] = (hostActive[h] || 0) + 1; hostLast[h] = now;
    job.run().then(job.resolve, () => job.resolve({ ok: false, status: 0, error: 'failed' })).finally(() => {
      checkActive--; hostActive[h]--;
      if (!checkQ.length && !checkActive) chrome.webRequest.onErrorOccurred.removeListener(onCheckError);
      pumpChecks();
    });
  }
  if (checkQ.length && wait !== Infinity && !pumpTimer) pumpTimer = setTimeout(pumpChecks, wait);
}
function scheduleCheck(url, run) {
  return new Promise((resolve) => {
    if (!chrome.webRequest.onErrorOccurred.hasListener(onCheckError)) chrome.webRequest.onErrorOccurred.addListener(onCheckError, { urls: ['<all_urls>'], tabId: -1 });
    checkQ.push({ host: hostOf(url), run, resolve });
    pumpChecks();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NET_REASON = [[/BLOCKED_BY_CLIENT|BLOCKED_BY_EXTENSION/, 'blocked by another extension (ad or privacy blocker)'], [/NAME_NOT_RESOLVED|NAME_RESOLUTION/, 'domain not found'],
  [/CONNECTION_REFUSED/, 'connection refused'], [/CONNECTION_(RESET|CLOSED|ABORTED)|EMPTY_RESPONSE/, 'connection dropped by the server'], [/TIMED_OUT/, 'timed out'],
  [/CERT|SSL/, 'certificate or HTTPS error'], [/TOO_MANY_REDIRECTS/, 'too many redirects'], [/ADDRESS_UNREACHABLE|INTERNET_DISCONNECTED|NETWORK_CHANGED/, 'network unreachable'], [/BLOCKED_BY_(ADMINISTRATOR|RESPONSE)/, 'blocked by browser policy'], [/UNSAFE_PORT/, 'port blocked by Chrome']];
function failReason(url, e) {
  if (e && e.name === 'TimeoutError') return 'timed out';
  const code = netErrors.get(url) || '';
  for (const [re, t] of NET_REASON) if (re.test(code)) return t;
  return code ? code.replace(/^net::/, '') : 'no response';
}

/* Same Accept headers Chrome sends for pages and <img>, so servers that vary by Accept answer the same way */
const IMG_ACCEPT = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8';
const PAGE_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';

function checkUrl(url, image) {
  let scheme = '';
  try { scheme = new URL(url).protocol.replace(':', ''); } catch (e) { return Promise.resolve({ ok: false, status: 'skip', scheme: 'invalid' }); }
  if (scheme !== 'http' && scheme !== 'https') return Promise.resolve({ ok: false, status: 'skip', scheme });
  return scheduleCheck(url, () => checkUrlNow(url, image));
}
async function checkUrlNow(url, image) {
  const opts = { cache: 'no-cache', redirect: 'follow', credentials: 'omit', headers: { Accept: image ? IMG_ACCEPT : PAGE_ACCEPT } };
  const req = async (method, ms) => {
    const res = await fetch(url, { ...opts, method, signal: AbortSignal.timeout(ms) });
    if (method === 'GET') res.body && res.body.cancel().catch(() => {});
    return res;
  };
  const result = (res) => {
    const len = parseInt(res.headers.get('content-length'), 10);
    return { ok: res.ok, status: res.status, redirected: res.redirected, finalUrl: res.url,
             size: len > 0 ? len : null, contentType: (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() || null };
  };
  let res = null, err = null;
  try { res = await req('HEAD', 10000); } catch (e) { err = e; }
  if (!res || [400, 403, 405, 501].includes(res.status)) {
    try { res = await req('GET', 12000); err = null; } catch (e) { err = e; res = null; }
  }
  /* one patient retry for "slow down" answers and failed connections */
  if (!res || [429, 502, 503, 504].includes(res.status)) {
    const ra = res && parseInt(res.headers.get('retry-after'), 10);
    await sleep(Math.min(5000, ra > 0 ? ra * 1000 : 1500));
    try { res = await req('GET', 15000); err = null; } catch (e) { err = e; res = null; }
  }
  if (res) return result(res);
  return { ok: false, status: 0, error: failReason(url, err) };
}

/* ---- Raw (pre-JavaScript) canonical ----
   Streams the HTML only until the <head> ends (max 2 MB) and reads <link rel=canonical> / <base href>
   with a string parser, so no page HTML is parsed as a DOM in the extension and only two small
   values are sent back to the popup. */
const HEAD_MAX_BYTES = 2 * 1024 * 1024;
const HEAD_TAGS = new Set(['html', 'head', 'meta', 'link', 'base', 'title', 'style', 'script', 'noscript', 'template']);
const TAG_RE = /<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const ATTR_RE = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };

function decodeEntities(s) {
  return s.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);?/g, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n <= 0x10FFFF ? String.fromCodePoint(n) : m;
    }
    const v = ENT[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}

function parseAttrs(str) {
  const out = {};
  ATTR_RE.lastIndex = 0;
  let m;
  while ((m = ATTR_RE.exec(str))) {
    const name = m[1].toLowerCase();
    if (!(name in out)) out[name] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');  /* first occurrence wins, like browsers */
  }
  return out;
}

/* Scans the head like the HTML parser: stops at </head>, <body> or the first element that can't live in <head> */
function scanHead(html) {
  let s = html.replace(/<!--[\s\S]*?(?:-->|$)/g, '')
              .replace(/<(script|style|template|title|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const open = s.search(/<(script|style|template|title|textarea)\b/i);   /* block cut off by the read limit */
  if (open !== -1) s = s.slice(0, open);
  let canonicalAttr = null, baseHref = null, done = false, m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(s))) {
    const close = m[1] === '/', name = m[2].toLowerCase();
    if (close) { if (name === 'head' || name === 'html') { done = true; break } continue; }
    if (!HEAD_TAGS.has(name)) { done = true; break; }
    if (name === 'link' && canonicalAttr === null) {
      const at = parseAttrs(m[3]);
      if ((at.rel || '').toLowerCase().split(/\s+/).includes('canonical')) canonicalAttr = (at.href || '').trim();
    } else if (name === 'base' && baseHref === null) {
      const at = parseAttrs(m[3]);
      if ('href' in at) baseHref = at.href.trim();
    }
  }
  return { canonicalAttr, baseHref, done };
}

async function fetchRawHead(url) {
  try {
    const res = await fetch(url, { method: 'GET', cache: 'no-cache', redirect: 'follow',
                                   signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) { res.body && res.body.cancel().catch(() => {}); return { ok: false, status: res.status }; }
    const reader = res.body.getReader(), dec = new TextDecoder();
    let html = '', bytes = 0, scan = { canonicalAttr: null, baseHref: null, done: false };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.length;
      html += dec.decode(value, { stream: true });
      if (/<\/head\s*>|<body[\s>]/i.test(html) || bytes >= HEAD_MAX_BYTES) {
        scan = scanHead(html);
        if (scan.done || bytes >= HEAD_MAX_BYTES) break;
      }
    }
    reader.cancel().catch(() => {});
    if (!scan.done) scan = scanHead(html + dec.decode());
    const finalUrl = res.url || url;
    let base = finalUrl;
    if (scan.baseHref) { try { base = new URL(scan.baseHref, finalUrl).href } catch (e) {} }
    let canonical = null;
    if (scan.canonicalAttr) { try { canonical = new URL(scan.canonicalAttr, base).href } catch (e) {} }
    return { ok: true, status: res.status, finalUrl, canonicalAttr: scan.canonicalAttr || null, canonical };
  } catch (e) {
    return { ok: false, status: 0, error: e.name === 'TimeoutError' ? 'timeout' : e.message };
  }
}


/* ---- Full raw HTML for the "Raw vs rendered" tab (fetched only when that tab or the report needs it) ---- */
const RAW_MAX_BYTES = 5 * 1024 * 1024;
async function fetchRawHtml(url) {
  try {
    const res = await fetch(url, { method: 'GET', cache: 'no-cache', redirect: 'follow',
                                   signal: AbortSignal.timeout(15000) });
    const reader = res.body.getReader(), dec = new TextDecoder();
    let html = '', bytes = 0, truncated = false;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.length;
      html += dec.decode(value, { stream: true });
      if (bytes >= RAW_MAX_BYTES) { truncated = true; reader.cancel().catch(() => {}); break; }
    }
    html += dec.decode();
    return { ok: res.ok, status: res.status, finalUrl: res.url || url, text: html, bytes, truncated };
  } catch (e) {
    return { ok: false, status: 0, error: e.name === 'TimeoutError' ? 'timeout' : e.message };
  }
}

/* Clean up data left by the removed Google results numbering feature (v1.3 and earlier) */
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.session.remove('serpCounts').catch(() => {});
  chrome.storage.local.get('seoext_settings').then((r) => {
    const st = r.seoext_settings;
    if (st && 'serpCount' in st) { delete st.serpCount; chrome.storage.local.set({ seoext_settings: st }); }
  }).catch(() => {});
});
