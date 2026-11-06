/* Pure SEO – Raw vs rendered (loaded on demand)
   Raw = the HTML the server sends, before any JavaScript runs.
   Rendered = the live page after JavaScript (pageData from extract.js). */

/* Inline handler attributes (onclick, onload, …) are renamed before parsing. A parsed document never runs
   them, but Chrome still reports them against the extension's Content Security Policy. Only attribute
   names are touched; attribute values and text are left exactly as sent. */
const CMP_TAG_RE = /<!--[\s\S]*?-->|<(script|style)\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/\1\s*>|<([a-zA-Z][^\s\/>]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
const CMP_ATTR_RE = /([^\s"'>\/=]+)(\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/g;
function cmpRenameHandlers(attrs) { return attrs.replace(CMP_ATTR_RE, (m, n, v) => /^on/i.test(n) ? 'data-x-' + n + (v || '') : m); }
function neutralizeHandlers(html) {
  return html.replace(CMP_TAG_RE, (m, blk, blkAttrs, body, tag, attrs) => {
    if (blk) return '<' + blk + cmpRenameHandlers(blkAttrs) + '>' + body + '</' + blk + '>';
    if (tag) return '<' + tag + cmpRenameHandlers(attrs) + '>';
    return m; /* comment */
  });
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const cmpNorm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

/* Reads the raw HTML with the same rules extract.js uses on the live page, so both sides compare alike */
function rawData(html, finalUrl) {
  const doc = new DOMParser().parseFromString(neutralizeHandlers(html), 'text/html');
  let base = finalUrl;
  const b = doc.querySelector('base[href]');
  if (b) { try { base = new URL(b.getAttribute('href'), finalUrl).href; } catch (e) {} }
  const abs = (h) => { if (h == null) return null; try { return new URL(h.trim(), base).href; } catch (e) { return null; } };
  const meta = (n) => { const el = doc.querySelector(`meta[name="${n}"],meta[property="${n}"]`); return el ? el.getAttribute('content') : null; };
  const metaAll = (n) => [...doc.querySelectorAll(`meta[name="${n}" i]`)].map((m) => (m.getAttribute('content') || '').trim()).filter(Boolean);
  const canonEl = doc.querySelector('link[rel="canonical"]');
  const robots = metaAll('robots'), googlebot = metaAll('googlebot');
  const headings = [...doc.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => ({ tag: h.tagName.toLowerCase(), text: cmpNorm(h.textContent).substring(0, 200) }));
  const links = new Set();
  doc.querySelectorAll('a[href]').forEach((a) => { const u = abs(a.getAttribute('href')); if (u && !u.startsWith('javascript:')) links.add(u); });
  const hreflangs = [...doc.querySelectorAll('link[rel="alternate"][hreflang]')].map((l) => ({ lang: l.getAttribute('hreflang'), url: abs(l.getAttribute('href')) }));
  const jsonLd = [];
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => { try { jsonLd.push(JSON.parse(s.textContent)); } catch (e) {} });
  const og = {};
  doc.querySelectorAll('meta[property^="og:"]').forEach((m) => { og[m.getAttribute('property')] = m.getAttribute('content'); });
  const imgs = new Set();
  doc.querySelectorAll('img').forEach((i) => { const u = abs(i.getAttribute('src') || i.getAttribute('data-src') || i.getAttribute('data-lazy-src')); if (u) imgs.add(u); });
  const lang = doc.documentElement.getAttribute('lang');
  /* text a visitor could read: drop non-content elements (the document is throwaway) */
  doc.querySelectorAll('script,style,noscript,template').forEach((e) => e.remove());
  const text = cmpNorm(doc.body ? doc.body.textContent : '');
  return {
    title: cmpNorm(doc.title), description: meta('description'),
    canonical: canonEl ? abs(canonEl.getAttribute('href')) : null,
    robots: robots.length ? robots.join(', ') : null, googlebot: googlebot.length ? googlebot.join(', ') : null,
    headings, links, hreflangs, jsonLd, og, images: imgs.size, lang: lang || null,
    wordCount: text ? text.split(' ').length : 0
  };
}

function ldTypes(list) {
  const out = [];
  const add = (o) => { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) { o.forEach(add); return; } const t = o['@type']; if (t) (Array.isArray(t) ? t : [t]).forEach((x) => out.push(String(x))); if (Array.isArray(o['@graph'])) o['@graph'].forEach(add); };
  (list || []).forEach(add);
  return out.sort();
}
const robotsSet = (v) => String(v || '').toLowerCase().split(/[,\s]+/).filter(Boolean).sort().join(', ');
const headCounts = (hs) => ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((t) => `${t.toUpperCase()}: ${hs.filter((h) => h.tag === t).length}`).join(', ');

/* One comparison row. key: same | changed | added | removed | info
   sev: how much a difference matters (high | medium | low) */
function cmpRow(id, label, raw, ren, opts = {}) {
  const eq = opts.eq || ((a, b) => cmpNorm(a) === cmpNorm(b));
  const hasR = raw != null && raw !== '', hasN = ren != null && ren !== '';
  let key;
  if (!hasR && !hasN) key = 'same';
  else if (opts.info) key = 'info';
  else if (hasR && hasN) key = eq(raw, ren) ? 'same' : 'changed';
  else key = hasN ? 'added' : 'removed';
  return { id, label, raw: hasR ? raw : null, ren: hasN ? ren : null, key, sev: key === 'same' ? null : (opts.sev || 'low'), note: key === 'same' ? '' : (opts.note || ''), fix: opts.fix || '', extra: opts.extra };
}

function buildRawDiff(d, r, res) {
  const rows = [];
  rows.push(cmpRow('title', 'Title', r.title, d.title, { sev: 'medium', note: 'Google can use either version, and crawlers that don’t run JavaScript only see the raw one.', fix: 'Output the final title in the HTML the server sends.' }));
  rows.push(cmpRow('description', 'Meta description', r.description, d.metaDescription, { sev: 'medium', fix: 'Output the final meta description in the HTML the server sends.' }));
  rows.push(cmpRow('canonical', 'Canonical', r.canonical, d.canonical, { sev: 'high', note: 'Google recommends not changing the canonical with JavaScript.', fix: 'Make the canonical identical in the raw HTML and the rendered page.' }));
  const rawNoindex = /\b(noindex|none)\b/i.test(r.robots || '');
  rows.push(cmpRow('robots', 'Meta robots', r.robots, d.robotsMeta, { sev: 'high', eq: (a, b) => robotsSet(a) === robotsSet(b),
    note: rawNoindex ? 'The raw HTML has noindex. Google may skip rendering such pages, so a JavaScript change to robots may never be seen.' : 'Google reads robots rules before rendering.', fix: 'Put the final robots meta in the HTML the server sends and don’t change it with JavaScript.' }));
  if (r.googlebot || d.googlebotMeta) rows.push(cmpRow('googlebot', 'Meta googlebot', r.googlebot, d.googlebotMeta, { sev: 'high', eq: (a, b) => robotsSet(a) === robotsSet(b) }));
  const rH1 = r.headings.filter((h) => h.tag === 'h1').map((h) => h.text), nH1 = (d.headings || []).filter((h) => h.tag === 'h1').map((h) => cmpNorm(h.text));
  rows.push(cmpRow('h1', 'H1', rH1.join(' | ') || null, nH1.join(' | ') || null, { sev: 'medium', eq: (a, b) => a.toLowerCase() === b.toLowerCase(), fix: 'Render the H1 in the HTML the server sends.' }));
  rows.push(cmpRow('headings', 'Headings', r.headings.length ? headCounts(r.headings) : null, (d.headings || []).length ? headCounts(d.headings) : null, { sev: 'low' }));
  rows.push(cmpRow('lang', 'HTML lang', r.lang, d.htmlLang, { sev: 'low' }));
  const hlKey = (l) => l.map((h) => (h.lang || '').toLowerCase() + ' ' + h.url).sort().join('\n');
  rows.push(cmpRow('hreflang', 'Hreflang', r.hreflangs.length ? plural(r.hreflangs.length, 'tag') : null, (d.hreflangs || []).length ? plural(d.hreflangs.length, 'tag') : null,
    { sev: 'medium', eq: () => hlKey(r.hreflangs) === hlKey(d.hreflangs || []), note: 'Hreflang added by JavaScript is unreliable.', fix: 'Output hreflang in the server HTML, the HTTP header or the XML sitemap.' }));
  const rT = ldTypes(r.jsonLd), nT = ldTypes(d.jsonLd);
  rows.push(cmpRow('schema', 'Structured data', rT.length ? rT.join(', ') : null, nT.length ? nT.join(', ') : null, { sev: 'low', note: 'Google reads JSON-LD added by JavaScript, but other tools and AI crawlers often only read the raw HTML.' }));
  const ogKeys = (o) => Object.keys(o || {}).sort().map((k) => k + '=' + cmpNorm(o[k])).join('\n');
  rows.push(cmpRow('og', 'Open Graph tags', Object.keys(r.og).length ? plural(Object.keys(r.og).length, 'tag') : null, Object.keys(d.ogTags || {}).length ? plural(Object.keys(d.ogTags).length, 'tag') : null,
    { sev: 'medium', eq: () => ogKeys(r.og) === ogKeys(d.ogTags), note: 'Facebook, LinkedIn and similar crawlers don’t run JavaScript. They only see the raw tags.', fix: 'Output Open Graph tags in the HTML the server sends.' }));
  /* links: compare unique URLs */
  const nLinks = new Set((d.links || []).map((l) => l.url));
  const added = [...nLinks].filter((u) => !r.links.has(u)), missing = [...r.links].filter((u) => !nLinks.has(u));
  const lr = cmpRow('links', 'Links', `${r.links.size} unique`, `${nLinks.size} unique`, { sev: 'low', eq: () => !added.length && !missing.length,
    note: [added.length ? `${added.length} only after JavaScript` : '', missing.length ? `${missing.length} only in the raw HTML` : ''].filter(Boolean).join(', ') + '. Crawlers that don’t render only find links in the raw HTML.',
    extra: { added, missing } });
  rows.push(lr);
  rows.push(cmpRow('images', 'Images', `${r.images}`, `${(d.images || []).length}`, { sev: 'low', eq: (a, b) => a === b }));
  /* Word count: both sides counted the same way (all body text, hidden text included), so they compare fairly.
     Within 10% (or under 30 words apart) is "Similar"; beyond that the direction and size decide the result. */
  const rawW = r.wordCount, renW = d.textWords != null ? d.textWords : (d.wordCount || 0);
  const delta = renW - rawW, pct = Math.max(rawW, renW) ? Math.abs(delta) / Math.max(rawW, renW) : 0;
  const wr = { id: 'words', label: 'Word count', raw: rawW.toLocaleString(), ren: renW.toLocaleString(), key: 'same', sev: null, note: '', fix: '' };
  if (delta && (pct <= 0.1 || Math.abs(delta) < 30)) wr.key = 'similar';
  else if (delta > 0) {
    const jsHeavy = renW > 50 && rawW < renW * 0.5;
    wr.key = 'added'; wr.sev = jsHeavy ? 'medium' : 'low';
    wr.note = jsHeavy ? 'Most of the text only appears after JavaScript. Google can render it, but it takes longer to process and many other crawlers won’t see it.'
      : `${delta.toLocaleString()} words (${Math.round(pct * 100)}%) are added by JavaScript. Crawlers that don’t render won’t see them.`;
    if (jsHeavy) wr.fix = 'Render the main content on the server (SSR) or pre-render it.';
  } else if (delta < 0) {
    wr.key = 'removed'; wr.sev = 'low';
    wr.note = `${(-delta).toLocaleString()} words (${Math.round(pct * 100)}%) in the raw HTML are gone after JavaScript runs. A script removes or replaces content, so crawlers that don’t render read text that visitors don’t see.`;
  }
  wr.info = `Both counts include text hidden by CSS, such as menus, tabs and pop-ups. Visible text on the rendered page: ${(d.wordCount || 0).toLocaleString()} words.`;
  rows.push(wr);
  return { ok: true, status: res.status, finalUrl: res.finalUrl, bytes: res.bytes, truncated: !!res.truncated, rows };
}

/* ---- Tab UI ---- */
const cmpIsDiff = (r) => r.key !== 'same' && r.key !== 'similar';
const CMP_BADGE = { same: ['Same', 'success'], similar: ['Similar', 'success'], changed: ['Changed by JavaScript', 'warning'], added: ['Added by JavaScript', 'warning'], removed: ['Removed by JavaScript', 'warning'], info: ['Different', 'info'] };
function cmpBadge(row) {
  if (row.key === 'same' || row.key === 'similar') return badge(CMP_BADGE[row.key][0], 'success');
  const [t, c] = CMP_BADGE[row.key];
  return badge(t, row.sev === 'high' ? 'error' : row.sev === 'low' ? 'info' : c);
}
function cmpUrlList(list) {
  const max = 200, shown = list.slice(0, max);
  return `<ul class="cmp-list">${shown.map((u) => `<li>${linkA(u, u)}</li>`).join('')}</ul>${list.length > max ? `<div class="row-note" style="padding:0 16px 10px">Showing ${max} of ${list.length}. The full list is in the report export.</div>` : ''}`;
}
function renderRawRendered(d, st, onlyDiff) {
  if (!st || st === 'loading') return '<div class="card"><div class="loading" style="padding:48px 0"><div class="spinner"></div><p>Fetching raw HTML</p></div></div>';
  if (st.error) return `<div class="card"><div class="empty-state">Couldn’t fetch the raw HTML (${esc(st.error)}).<br><button class="refresh-btn" id="rawRetry" style="margin-top:12px">Try again</button></div></div>`;
  const diff = st.rows.filter(cmpIsDiff), high = diff.filter((r) => r.sev === 'high').length;
  const rows = onlyDiff ? diff : st.rows;
  let body = '';
  rows.forEach((r) => {
    const val = (v) => v == null ? '<span class="missing">Not present</span>' : esc(v);
    const vals = r.key === 'same'
      ? `<div class="cmp-same">${val(r.raw != null ? r.raw : r.ren)}</div>`
      : `<div class="cmp-vals"><div class="cmp-side"><span class="cmp-k">Raw HTML</span><span class="cmp-v">${val(r.raw)}</span></div><div class="cmp-side"><span class="cmp-k">Rendered</span><span class="cmp-v">${val(r.ren)}</span></div></div>`;
    let more = '';
    if (r.extra && (r.extra.added.length || r.extra.missing.length)) {
      if (r.extra.added.length) more += `<div class="collapsible-header cmp-sub" data-target="cmp-add"><span class="caret">▶</span>Only after JavaScript (${r.extra.added.length})</div><div class="collapsible-body" id="cmp-add">${cmpUrlList(r.extra.added)}</div>`;
      if (r.extra.missing.length) more += `<div class="collapsible-header cmp-sub" data-target="cmp-miss"><span class="caret">▶</span>Only in the raw HTML (${r.extra.missing.length})</div><div class="collapsible-body" id="cmp-miss">${cmpUrlList(r.extra.missing)}</div>`;
    }
    body += `<div class="cmp-row cmp-${r.key}"><div class="cmp-head"><span class="cmp-label">${esc(r.label)}</span>${cmpBadge(r)}</div>${vals}${r.note ? rowNote(esc(r.note)) : ''}${r.info ? rowNote(esc(r.info)) : ''}</div>${more}`;
  });
  if (!rows.length) body = '<div class="empty-state">No differences. The raw HTML and the rendered page match on every signal checked.</div>';
  const notes = [];
  if (st.status && st.status !== 200) notes.push(notice('warning', `The server answered the extension’s request with ${st.status}, so the raw side may not be the normal page.`));
  if (st.truncated) notes.push(notice('info', 'The raw HTML is over 5 MB. Only the first 5 MB were compared.'));
  return `<div class="fade-in">
    <div class="stat-row">
      <div class="stat-card tile-success"><div class="stat-value">${st.rows.length - diff.length}</div><div class="stat-label">Same</div></div>
      <div class="stat-card tile-${diff.length ? 'warning' : 'success'}"><div class="stat-value">${diff.length}</div><div class="stat-label">Different</div></div>
      <div class="stat-card tile-${high ? 'error' : 'success'}"><div class="stat-value">${high}</div><div class="stat-label">Critical</div></div>
      <div class="stat-card tile-neutral"><div class="stat-value">${fmtBytes(st.bytes) || '—'}</div><div class="stat-label">Raw HTML size</div></div>
    </div>
    <div class="flex-between mb-8"><div class="section-title" style="margin-bottom:0">Signals</div>
      <div class="flex-row-gap"><button class="switch" id="rawOnlyDiff" role="switch" aria-checked="${onlyDiff ? 'true' : 'false'}"><span class="switch-track"><span class="switch-thumb"></span></span>Only differences</button><button class="refresh-btn" id="rawRetry">Fetch again</button></div></div>
    <div class="card">${notes.join('')}${body}</div>
    <div class="row-note" style="margin-top:8px">Raw HTML is fetched by the extension with Chrome’s user agent. Sites that serve different HTML to Googlebot can differ from this.</div>
  </div>`;
}
