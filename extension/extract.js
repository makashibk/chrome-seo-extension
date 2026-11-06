/* Content extraction - injected into page via executeScript */
function extractPageData() {
  const getMeta = (name) => {
    const el = document.querySelector(`meta[name="${name}"],meta[property="${name}"]`);
    return el ? el.getAttribute('content') : null;
  };

  /* Dates */
  let published = getMeta('article:published_time') || getMeta('datePublished');
  let modified = getMeta('article:modified_time') || getMeta('dateModified');
  /* JSON-LD is parsed once and reused for dates and structured data */
  const jsonLd = [];
  document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
    try {
      const j = JSON.parse(s.textContent);
      jsonLd.push(j);
      if (!j) return;
      const items = j['@graph'] || [j];
      items.forEach(it => {
        if (!published && it.datePublished) published = it.datePublished;
        if (!modified && it.dateModified) modified = it.dateModified;
      });
    } catch(e) {}
  });

  /* Word count */
  const bodyText = ((document.body && document.body.innerText) || '').trim();
  const wordCount = bodyText ? bodyText.split(/\s+/).length : 0;

  /* Headings */
  const headings = [];
  document.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => {
    /* vis: 'visible' | 'hidden' (display/visibility/content-visibility) | 'sr-only' (clipped to ~1px) | 'offscreen' (moved off the page) */
    let vis = 'visible';
    if (h.checkVisibility ? !h.checkVisibility({ checkVisibilityCSS: true }) : !h.getClientRects().length) vis = 'hidden';
    else {
      const r = h.getBoundingClientRect();
      if (r.width <= 2 || r.height <= 2) vis = 'sr-only';
      else if (r.right + window.scrollX <= 0 || r.bottom + window.scrollY <= 0) vis = 'offscreen';
    }
    headings.push({ tag: h.tagName.toLowerCase(), text: (vis === 'hidden' ? h.textContent : h.innerText).replace(/\s+/g, ' ').trim().substring(0, 200), vis });
  });

  /* Canonical */
  const canonEl = document.querySelector('link[rel="canonical"]');
  const canonical = canonEl ? canonEl.href : null;

  /* Robots meta – the name attribute is case-insensitive for Google, and a page can repeat the tag.
     Collect every robots and googlebot meta so neither is missed. */
  const metaAll = (n) => Array.from(document.querySelectorAll(`meta[name="${n}" i]`))
    .map(m => (m.getAttribute('content') || '').trim()).filter(Boolean);
  const robotsMetaList = metaAll('robots');
  const googlebotMetaList = metaAll('googlebot');
  const robotsMeta = robotsMetaList.length ? robotsMetaList.join(', ') : null;
  const googlebotMeta = googlebotMetaList.length ? googlebotMetaList.join(', ') : null;

  /* Hreflangs */
  const hreflangs = [];
  document.querySelectorAll('link[rel="alternate"][hreflang]').forEach(l => {
    hreflangs.push({ lang: l.getAttribute('hreflang'), url: l.href });
  });


  /* Microdata */
  const microdata = [];
  document.querySelectorAll('[itemscope]').forEach(el => {
    /* an item that is a property of another item (itemprop + itemscope) is shown inside its parent, not again on its own */
    if (el.hasAttribute('itemprop') && el.parentElement && el.parentElement.closest('[itemscope]')) return;
    function parseMD(node) {
      const item = { type: node.getAttribute('itemtype') || '', properties: {} };
      node.querySelectorAll('[itemprop]').forEach(p => {
        const owner = p.closest('[itemscope]');
        if (owner !== node && owner !== null && owner !== p) return;
        const key = p.getAttribute('itemprop');
        let val;
        if (p.hasAttribute('itemscope')) val = parseMD(p);
        else if (p.hasAttribute('content')) val = p.getAttribute('content');
        else if (p.tagName === 'A') val = p.href;
        else if (p.tagName === 'IMG') val = p.src;
        else if (p.tagName === 'TIME') val = p.getAttribute('datetime') || p.textContent;
        else val = p.textContent.trim();
        if (item.properties[key]) {
          if (!Array.isArray(item.properties[key])) item.properties[key] = [item.properties[key]];
          item.properties[key].push(val);
        } else item.properties[key] = val;
      });
      return item;
    }
    microdata.push(parseMD(el));
  });

  /* RDFa */
  const rdfa = [];
  document.querySelectorAll('[typeof]').forEach(el => {
    if (el.closest('[typeof]') !== el && el.parentElement && el.parentElement.closest('[typeof]')) return;
    const item = { type: el.getAttribute('typeof'), properties: {} };
    el.querySelectorAll('[property]').forEach(p => {
      const key = p.getAttribute('property');
      const val = p.getAttribute('content') || p.textContent.trim();
      item.properties[key] = val;
    });
    rdfa.push(item);
  });

  /* OG tags */
  const ogTags = {};
  document.querySelectorAll('meta[property^="og:"]').forEach(m => {
    ogTags[m.getAttribute('property')] = m.getAttribute('content');
  });

  /* Twitter tags */
  const twitterTags = {};
  document.querySelectorAll('meta[name^="twitter:"],meta[property^="twitter:"]').forEach(m => {
    const key = m.getAttribute('name') || m.getAttribute('property');
    twitterTags[key] = m.getAttribute('content');
  });

  /* Outgoing links */
  const links = [];
  const seen = new Set();
  document.querySelectorAll('a[href]').forEach(a => {
    const svg = typeof a.href !== 'string';
    let href = a.href;
    if (svg) { try { href = new URL(a.getAttribute('href'), document.baseURI).href } catch (e) { return } }
    if (!href || href.startsWith('javascript:') || href.startsWith('#')) return;
    const key = href + '|' + (a.getAttribute('rel') || '');
    if (seen.has(key)) return;
    seen.add(key);
    const rel = (a.getAttribute('rel') || '').toLowerCase();
    let attr = 'dofollow';
    if (rel.includes('nofollow')) attr = 'nofollow';
    if (rel.includes('ugc')) attr = 'ugc';
    if (rel.includes('sponsored')) attr = 'sponsored';
    const isExternal = (svg ? new URL(href).hostname : a.hostname) !== location.hostname;
    links.push({ url: href, text: (a.textContent || '').trim().substring(0, 100), rel: attr, isExternal });
  });

  /* Images
     - bytes: file size the browser actually downloaded (Resource Timing). Cross-origin images without a
       Timing-Allow-Origin header report 0, so those stay null until "Check status & size" fills them
     - sized: has width + height attributes, or a CSS aspect-ratio (what stops layout shift)
     - nw/nh: intrinsic size, dw/dh: size on screen (0 when hidden or not loaded yet) */
  const perf = new Map();
  try {
    performance.getEntriesByType('resource').forEach(e => { if (e.encodedBodySize > 0) perf.set(e.name, e.encodedBodySize); });
  } catch (e) {}
  const images = [];
  const imgSeen = new Set();
  document.querySelectorAll('img').forEach(img => {
    const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '';
    if (!src || imgSeen.has(src)) return;
    imgSeen.add(src);
    const cur = img.currentSrc || src;
    const wAttr = img.getAttribute('width'), hAttr = img.getAttribute('height');
    let sized = !!(wAttr && hAttr);
    if (!sized) { try { sized = getComputedStyle(img).aspectRatio !== 'auto'; } catch (e) {} }
    let bytes = perf.get(cur) || perf.get(src) || null;
    if (!bytes && src.startsWith('data:')) { const i = src.indexOf(','); bytes = i > 0 ? Math.round((src.length - i - 1) * (/;base64,/i.test(src.slice(0, i + 1)) ? 0.75 : 1)) : null; }
    images.push({
      url: src, cur: cur !== src ? cur : undefined,
      alt: img.getAttribute('alt'), title: img.getAttribute('title') || '',
      wAttr, hAttr, sized,
      nw: img.naturalWidth || 0, nh: img.naturalHeight || 0,
      dw: img.clientWidth || 0, dh: img.clientHeight || 0,
      bytes
    });
  });

  /* Favicon: the declared icon (largest PNG/SVG first), else /favicon.ico */
  let favicon = null;
  const icons = Array.from(document.querySelectorAll('link[rel][href]')).filter(l => /(^|\s)(icon|shortcut icon|apple-touch-icon)(\s|$)/i.test(l.getAttribute('rel')));
  if (icons.length) {
    const size = (l) => { const m = (l.getAttribute('sizes') || '').match(/(\d+)x\d+/); return m ? +m[1] : (/svg/i.test(l.type || l.href) ? 64 : 16); };
    const score = (l) => { const s = size(l); return (s >= 32 && s <= 192 ? 1000 : 0) + Math.min(s, 192) - (/apple-touch-icon/i.test(l.rel) ? 1 : 0); };
    favicon = icons.sort((a, b) => score(b) - score(a))[0].href;
  } else favicon = location.origin + '/favicon.ico';

  /* How this document was loaded. The URL it was loaded at, whether Chrome preloaded it (activationStart > 0)
     or restored it from the back/forward cache. Explains why no request for it may have been seen. */
  let nav = null;
  try {
    const n = performance.getEntriesByType('navigation')[0];
    if (n) nav = { url: n.name, type: n.type, prerendered: n.activationStart > 0 || document.prerendering === true, status: n.responseStatus || 0, loadedAt: Math.round(performance.timeOrigin),
                   htmlBytes: n.decodedBodySize || 0, htmlTransfer: n.encodedBodySize || 0 };   /* HTML size: uncompressed / as sent */
  } catch (e) {}

  /* HTML Lang */
  const htmlLang = document.documentElement.lang || null;

  return {
    url: location.href,
    title: document.title,
    dpr: window.devicePixelRatio || 1,
    htmlLang,
    metaTitle: getMeta('title') || document.title,
    metaDescription: getMeta('description'),
    published, modified, wordCount, favicon, nav, headings,
    canonical, robotsMeta, googlebotMeta, hreflangs,
    jsonLd, microdata, rdfa,
    ogTags, twitterTags, links, images
  };
}

/* Words counted the same way as the raw HTML side of "Raw vs rendered": all text in <body>, including text
   hidden by CSS (menus, tabs, pop-ups), without script/style/noscript/template. It's the most expensive part of
   the page scan, so it runs only when Raw vs rendered opens or a report is exported, not on every popup open. */
function countAllWords() {
  if (!document.body) return 0;
  const SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1 };
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    { acceptNode: (n) => n.nodeType === 1 ? (SKIP[n.tagName] ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP) : NodeFilter.FILTER_ACCEPT });
  const parts = [];
  while (tw.nextNode()) parts.push(tw.currentNode.nodeValue);
  const all = parts.join('').replace(/\s+/g, ' ').trim();
  return all ? all.split(' ').length : 0;
}
