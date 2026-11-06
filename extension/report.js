/* Pure SEO – Full report export (loaded on demand)
   ctx = { d: pageData, x: extras, hd: headerData, raw: raw-vs-rendered result (or error), at: Date } */

const SEV_LABEL = { high: 'High', medium: 'Medium', low: 'Low' };
const SEV_ORDER = { high: 0, medium: 1, low: 2 };

/* ---- Issues: plain-language findings with a fix, built only from data the extension measured ---- */
function collectIssues(ctx) {
  const { d, x, hd, raw } = ctx, out = [];
  const add = (sev, area, issue, detail, fix, source) => out.push({ sev, area, issue, detail: detail || '', fix: fix || '', source: source || null });
  const code = hd && hd.statusCode;

  if (/^http:/i.test(d.url)) add('high', 'Security', 'Page is served over HTTP', 'The page doesn’t use HTTPS.', 'Serve the page over HTTPS and 301-redirect the HTTP version.');
  if (code >= 400) add('high', 'Status', `Page returns ${code}`, 'Pages that return an error status are dropped from the index.', 'Return 200 for pages that should be indexed, or remove links to this URL.');
  const hops = (hd && hd.redirects || []).length;
  if (hops >= 2) add('medium', 'Status', `Redirect chain with ${hops} hops`, hd.redirects.map((h) => `${h.status} ${h.from}`).join('\n'), 'Link straight to the final URL and keep redirects to a single hop.');
  else if (hops === 1) add('low', 'Status', 'The requested URL redirects', `${hd.redirects[0].status} from ${hd.redirects[0].from}`, 'Update internal links to point at the final URL.');

  /* content */
  const title = d.metaTitle || '';
  if (!title) add('high', 'Content', 'Missing title tag', '', 'Add a unique title that describes the page, with the main topic near the start.');
  else if (typeof textPx === 'function') {
    const px = Math.round(textPx(title, SERP_TITLE_FONT));
    if (px > SERP_W) add('medium', 'Content', 'Title is likely cut off in Google', `About ${px} px wide (${title.length} characters). Desktop results show roughly ${SERP_W} px.`, 'Shorten the title or move the important words to the front.');
  }
  const desc = d.metaDescription || '';
  if (!desc) add('medium', 'Content', 'Missing meta description', 'Google will build a snippet from page text, which is often less relevant.', 'Write a description that summarises the page and gives a reason to click.');
  else if (typeof wrapLines === 'function' && wrapLines(desc, SERP_DESC_FONT, SERP_W).length > SERP_DESC_LINES) add('low', 'Content', 'Meta description is likely cut off', `${desc.length} characters, longer than two lines in desktop results.`, 'Keep the key message in the first ~150 characters.');
  const h1 = (d.headings || []).filter((h) => h.tag === 'h1'), h1v = h1.filter(isVisHeading);
  if (!h1.length) add('medium', 'Content', 'No H1 heading', 'Headings help search engines and visitors understand the main topic.', 'Add one H1 that states what the page is about.');
  else if (!h1v.length) add('medium', 'Content', 'H1 isn’t visible', `${h1.map((h) => `“${h.text}” (${(HEAD_VIS[h.vis] || ['hidden'])[0].toLowerCase()})`).join(', ')}`, 'Make the main H1 visible to visitors.');
  else if (h1v.length > 1) add('low', 'Content', `${h1v.length} visible H1 headings`, 'Google handles several H1s, but one clear H1 usually reads better.', 'Use one H1 for the main topic and H2s for sections.');
  if (!d.htmlLang) add('low', 'Content', 'No lang attribute on <html>', '', 'Add the page language, for example <html lang="en">.');

  /* indexability */
  const fl = (v) => (typeof robotsFlags === 'function' ? robotsFlags(v) : { noindex: /noindex|none/i.test(v || ''), nofollow: /nofollow|none/i.test(v || '') });
  const xr = (x.xRobotsTag || []).filter((v) => { const s = xRobotsScope(v); return !s.agent || s.agent === 'googlebot'; }).map((v) => xRobotsScope(v).value);
  const noindexFrom = [];
  if (fl(d.robotsMeta).noindex) noindexFrom.push('meta robots');
  if (fl(d.googlebotMeta).noindex) noindexFrom.push('meta googlebot');
  if (xr.some((v) => fl(v).noindex)) noindexFrom.push('X-Robots-Tag header');
  if (noindexFrom.length) add('high', 'Indexability', 'Page is set to noindex', `Found in: ${noindexFrom.join(', ')}.`, 'Remove noindex if this page should appear in search results.');
  if (fl(d.robotsMeta).nofollow || xr.some((v) => fl(v).nofollow)) add('low', 'Indexability', 'Page is set to nofollow', 'Search engines are asked not to follow any link on this page.', 'Remove nofollow unless it’s intentional.');
  const canon = d.canonical || (x.rawCanonical || null);
  if (!canon) add('low', 'Indexability', 'No canonical tag', '', 'Add a self-referencing canonical to the preferred URL.');
  else {
    const diffs = noHash(canon) === noHash(d.url) ? [] : urlDiffs(canon, d.url);
    if (diffs.length) add('medium', 'Indexability', 'Canonical points to a different URL', `${canon}\nDiffers by: ${diffs.join(', ')}.`, 'Fine on duplicates (filters, parameters). On a page you want to rank, point the canonical at this URL.');
    const cs = x.canonStatus;
    if (cs && cs.status && cs.redirected) add('high', 'Indexability', 'Canonical URL redirects', `Ends at ${cs.finalUrl} (${cs.status}).`, 'Point the canonical straight at the final URL.');
    else if (cs && cs.status && cs.status !== 200) add('high', 'Indexability', `Canonical URL returns ${cs.status}`, canon, 'Google usually ignores a canonical that doesn’t return 200. Fix the target or the tag.');
    if (d.canonical && x.rawCanonical && noHash(d.canonical) !== noHash(x.rawCanonical)) add('high', 'Indexability', 'JavaScript changes the canonical', `Raw: ${x.rawCanonical}\nRendered: ${d.canonical}`, 'Make the canonical identical in the raw HTML and after JavaScript.');
  }
  const rt = x.robotsTxt;
  if (rt && rt.state === 'server-error') add('high', 'Indexability', `robots.txt returns ${rt.status}`, 'Google treats the whole site as blocked while robots.txt returns a server error.', 'Make robots.txt return 200 (or 404 if you have none).');
  else if (rt && rt.test && !rt.test.allowed && rt.test.rule) add('high', 'Indexability', 'Blocked for Googlebot by robots.txt', `${rt.url}, ${robotsRuleText(rt.test.rule)}`, 'Remove or narrow that rule if this page should be crawled. A blocked page can’t show its noindex or content to Google.');
  const hsz = htmlSizeInfo(d, raw && raw.rows ? raw : null);
  const g2mb = { href: GOOGLE_2MB_DOC, text: 'Google’s 2 MB limit' };
  if (hsz.level === 'over') add('high', 'Indexability', 'HTML is over Google’s 2 MB limit', `${htmlSizeText(hsz)}. Googlebot reads only the first 2 MB of the HTML; content, links and structured data after that aren’t indexed.`, 'Bring the HTML under 2 MB uncompressed so Googlebot reads the whole page.', g2mb);
  else if (hsz.level === 'near') add('low', 'Indexability', 'HTML is close to Google’s 2 MB limit', `${htmlSizeText(hsz)}. Googlebot ignores anything after the first 2 MB.`, 'Keep the HTML under 2 MB uncompressed as the page grows.', g2mb);
  if (x.sitemaps && x.sitemaps.length && x.sitemaps.every((s) => !s.ok)) add('low', 'Indexability', 'No reachable XML sitemap', x.sitemaps.map((s) => s.url).join('\n'), 'Publish a sitemap and list it in robots.txt.');
  const hl = d.hreflangs || [];
  if (hl.length) {
    if (!hl.some((h) => noHash(h.url) === noHash(d.url))) add('medium', 'International', 'Hreflang set doesn’t include this page', 'Each page in an hreflang set must list itself.', 'Add an hreflang entry that points to this URL.');
    if (!hl.some((h) => (h.lang || '').toLowerCase() === 'x-default')) add('low', 'International', 'No x-default hreflang', '', 'Add x-default for visitors whose language doesn’t match any version.');
  }

  /* raw vs rendered */
  if (raw && raw.rows) raw.rows.filter((r) => cmpIsDiff(r) && (r.sev === 'high' || r.sev === 'medium') && r.id !== 'canonical').forEach((r) => {
    const what = r.id === 'words' ? 'Most text only appears after JavaScript' : `${r.label} ${CMP_BADGE[r.key][0].replace(/^./, (c) => c.toLowerCase())}`;
    add(r.sev, 'JavaScript', what, `${r.note ? r.note + '\n' : ''}Raw HTML: ${r.raw == null ? 'not present' : r.raw}\nRendered: ${r.ren == null ? 'not present' : r.ren}`, r.fix || 'Output the final value in the HTML the server sends.');
  });

  /* images */
  const imgs = d.images || [];
  const noAlt = imgs.filter((l) => l.alt === null || l.alt === undefined);
  if (noAlt.length) add('medium', 'Images', `${noAlt.length} image${noAlt.length > 1 ? 's' : ''} without alt attribute`, 'Use alt="" for purely decorative images.', 'Describe meaningful images in the alt text.');
  const noDims = imgs.filter((l) => !l.sized);
  if (noDims.length) add('medium', 'Images', `${noDims.length} image${noDims.length > 1 ? 's' : ''} without width/height`, 'Without them the browser can’t reserve space, so the layout shifts as images load (CLS).', 'Add width and height attributes (or a CSS aspect-ratio).');
  const heavy = imgs.filter((l) => l.heavy);
  if (heavy.length) add('medium', 'Images', `${heavy.length} image${heavy.length > 1 ? 's' : ''} over 200 KB`, `Together ${fmtBytes(heavy.reduce((a, l) => a + l.bytes, 0))}.`, 'Compress them and serve WebP or AVIF.');
  const over = imgs.filter((l) => l.oversized);
  if (over.length) add('low', 'Images', `${over.length} oversized image${over.length > 1 ? 's' : ''}`, 'Much larger than their size on screen.', 'Serve resized versions with srcset/sizes.');
  const legacy = imgs.filter((l) => l.legacy);
  if (legacy.length) add('low', 'Images', `${legacy.length} image${legacy.length > 1 ? 's' : ''} not in WebP/AVIF`, '', 'Convert photos to WebP or AVIF; they’re usually 25–50% smaller.');

  /* links */
  const links = d.links || [];
  /* broken = the server answered 4xx/5xx; no response (timeout, blocked request) is reported separately */
  const broken = links.filter((l) => typeof l.status === 'number' && l.status >= 400);
  const bi = broken.filter((l) => !l.isExternal), be = broken.filter((l) => l.isExternal);
  const more = (list) => list.length > 20 ? `\n…and ${list.length - 20} more (see the Links table)` : '';
  if (bi.length) add('high', 'Links', `${bi.length} broken internal link${bi.length > 1 ? 's' : ''}`, bi.slice(0, 20).map((l) => `${l.status} ${l.url}`).join('\n') + more(bi), 'Fix or remove these links.');
  if (be.length) add('medium', 'Links', `${be.length} broken external link${be.length > 1 ? 's' : ''}`, be.slice(0, 20).map((l) => `${l.status} ${l.url}`).join('\n') + more(be), 'Update or remove these links.');
  const failed = links.filter((l) => l.status === 'err');
  if (failed.length) add('low', 'Links', `${failed.length} link${failed.length > 1 ? 's' : ''} gave no response`, failed.slice(0, 20).map((l) => l.url).join('\n') + more(failed), 'Usually a timeout or a site blocking automated requests. Open them in the browser to confirm.');
  const redir = links.filter((l) => l.redirected && !l.isExternal);
  if (redir.length) add('low', 'Links', `${redir.length} internal link${redir.length > 1 ? 's' : ''} that redirect`, '', 'Point them at the final URL.');

  /* social + schema */
  const og = d.ogTags || {};
  const missOg = ['og:title', 'og:description', 'og:image'].filter((k) => !og[k]);
  if (missOg.length) add('low', 'Social', `Missing ${missOg.join(', ')}`, 'Shared links may show without a proper title, text or image.', 'Add the missing Open Graph tags.');
  if (!(d.jsonLd || []).length && !(d.microdata || []).length && !(d.rdfa || []).length) add('low', 'Structured data', 'No structured data found', '', 'Add JSON-LD that fits the page (for example Product, Article, BreadcrumbList).');

  return out.sort((a, b) => SEV_ORDER[a.sev] - SEV_ORDER[b.sev]);
}

/* ---- Shared tables (used by both formats) ---- */
function reportTables(ctx) {
  const { d, x, hd, raw } = ctx;
  const linkStatus = (l) => statusText(l);
  const issuesFor = (l) => [!l.sized && 'No width/height', l.heavy && 'Over 200 KB', l.oversized && 'Oversized', l.legacy && 'Not WebP/AVIF', (l.alt === null || l.alt === undefined) && 'Missing alt'].filter(Boolean).join(', ');
  return {
    headings: (d.headings || []).map((h) => ({ Level: h.tag.toUpperCase(), Heading: h.text, Visibility: (HEAD_VIS[h.vis] || ['Visible'])[0] })),
    links: (d.links || []).map((l) => ({ URL: l.url, 'Anchor text': l.text || '', Type: l.isExternal ? 'External' : 'Internal', Rel: l.rel, Status: linkStatus(l) })),
    images: (d.images || []).map((l) => ({ URL: l.url, Alt: l.alt == null ? '(missing)' : l.alt, Title: l.title || '', Format: l.fmt || '', 'Size (KB)': l.bytes != null ? Math.round(l.bytes / 102.4) / 10 : '', 'Width/height attrs': l.sized ? 'Yes' : 'No', Intrinsic: l.nw ? `${l.nw}×${l.nh}` : '', 'On screen': l.dw ? `${l.dw}×${l.dh}` : '', Status: linkStatus(l), Issues: issuesFor(l) })),
    hreflang: (d.hreflangs || []).map((h) => ({ Lang: h.lang, URL: h.url })),
    headers: ((hd && hd.headers) || []).map((h) => ({ Header: h.name, Value: h.value })),
    redirects: ((hd && hd.redirects) || []).map((h, i) => ({ Step: i + 1, From: h.from, Status: h.status, To: h.to })),
    schema: [...(d.jsonLd || []).map((s) => ({ Source: 'JSON-LD', Type: ldTypes([s]).join(', '), Data: JSON.stringify(s) })), ...(d.microdata || []).map((s) => ({ Source: 'Microdata', Type: s.type || '', Data: JSON.stringify(s) })), ...(d.rdfa || []).map((s) => ({ Source: 'RDFa', Type: s.type || '', Data: JSON.stringify(s) }))],
    social: [...Object.entries(d.ogTags || {}), ...Object.entries(d.twitterTags || {})].map(([k, v]) => ({ Property: k, Value: v })),
    raw: raw && raw.rows ? raw.rows.map((r) => ({ Signal: r.label, 'Raw HTML': r.raw == null ? '' : r.raw, Rendered: r.ren == null ? '' : r.ren, Result: r.key === 'same' ? 'Same' : CMP_BADGE[r.key][0] })) : [],
    rawLinks: raw && raw.rows ? (() => { const l = raw.rows.find((r) => r.id === 'links'); return l && l.extra ? [...l.extra.added.map((u) => ({ URL: u, Where: 'Only after JavaScript' })), ...l.extra.missing.map((u) => ({ URL: u, Where: 'Only in the raw HTML' }))] : []; })() : [],
    linkStats: (() => { const L = d.links || []; const c = (f) => L.filter(f).length; return { total: L.length, internal: c((l) => !l.isExternal), external: c((l) => l.isExternal), follow: c((l) => l.rel === 'dofollow'), nofollow: c((l) => l.rel === 'nofollow'), ugc: c((l) => l.rel === 'ugc'), sponsored: c((l) => l.rel === 'sponsored'), checked: L.some((l) => l.status !== undefined) }; })()
  };
}

/* What the export checked (status for links; status and size for images) */
const stBucket = (l) => l.status === undefined ? 'unchecked' : l.status === 'skip' ? 'skip' : l.status === 'err' ? 'failed' : l.redirected ? 'redirect' : l.status >= 400 ? 'broken' : 'ok';
function checkSummary(list, kind, at) {
  const all = list || [], L = all.filter((l) => stBucket(l) !== 'skip'), sk = all.length - L.length;
  if (!L.length) return sk ? `${sk} ${kind} aren’t web links (email, phone…) and weren’t checked` : '';
  const n = (b) => L.filter((l) => stBucket(l) === b).length, un = n('unchecked');
  const parts = [`${n('ok')} OK`, n('broken') && `${n('broken')} broken`, n('redirect') && `${n('redirect')} ${n('redirect') === 1 ? 'redirect' : 'redirects'}`, n('failed') && `${n('failed')} no response`].filter(Boolean).join(', ');
  const when = at ? ` on ${at.toLocaleString()}` : '';
  if (un === L.length) return `Not checked`;
  return `${L.length - un} of ${L.length} ${kind} checked${when}: ${parts}${un ? `. ${un} didn’t answer in time` : ''}${sk ? `. ${sk} email/phone ${sk === 1 ? 'link' : 'links'} not checked` : ''}`;
}
function robotsAccessText(rt) {
  const t = rt && rt.test;
  if (!t) return '';
  if (t.serverError) return `Blocked (robots.txt returns ${rt.status})`;
  if (t.noFile) return `Allowed (no robots.txt, ${rt.status})`;
  return `${t.allowed ? 'Allowed' : 'Blocked'}${t.rule ? ` by ${robotsRuleText(t.rule)}` : ', no rule matches this URL'}`;
}
function reportSummary(ctx) {
  const { d, x, hd } = ctx;
  const canonStatus = x.canonStatus && x.canonStatus.status ? (x.canonStatus.redirected ? `Redirects to ${x.canonStatus.finalUrl}` : String(x.canonStatus.status)) : '';
  const rt = x.robotsTxt;
  const imgs = d.images || [], known = imgs.filter((l) => l.bytes != null);
  return [
    ['URL', d.url], ['HTTP status', hd && hd.statusCode ? String(hd.statusCode) : 'Unknown'],
    ['Title', d.metaTitle || '(missing)'], ['Title length', `${(d.metaTitle || '').length} characters`],
    ['Meta description', d.metaDescription || '(missing)'], ['Description length', `${(d.metaDescription || '').length} characters`],
    ['H1', (d.headings || []).filter((h) => h.tag === 'h1').map((h) => h.text + (isVisHeading(h) ? '' : ` (${(HEAD_VIS[h.vis] || ['hidden'])[0].toLowerCase()})`)).join(' | ') || '(none)'],
    ['Word count', String(d.wordCount || 0)], ['HTML size', (() => { const h = htmlSizeInfo(d, ctx.raw && ctx.raw.rows ? ctx.raw : null); return h.bytes == null ? '' : `${htmlSizeText(h)}${h.level === 'over' ? ' (over Google’s 2 MB limit)' : h.level === 'near' ? ' (close to Google’s 2 MB limit)' : ''}`; })()], ['Language', d.htmlLang || '(not set)'],
    ['Canonical (rendered)', d.canonical || '(not set)'], ['Canonical (raw HTML)', x.rawCanonical || (x.rawCanonical === null ? '(not set)' : '')], ['Canonical status', canonStatus],
    ['Meta robots', d.robotsMeta || '(not set)'], ['X-Robots-Tag', (x.xRobotsTag || []).join(' | ')],
    ['robots.txt', rt ? `${rt.url} (${rt.status || rt.error || ''})` : ''], ['Googlebot access', robotsAccessText(rt)], ['Sitemaps', (x.sitemaps || []).map((s) => `${s.url} (${s.ok ? 'found' : 'not reachable'})`).join(' | ')],
    ['Hreflang tags', String((d.hreflangs || []).length)], ['Links', String((d.links || []).length)],
    ['Link status', checkSummary(d.links, 'links', ctx.checks && ctx.checks.at)], ['Image status and size', checkSummary(d.images, 'images', ctx.checks && ctx.checks.at)],
    ['Images', `${imgs.length}${known.length ? `, ${fmtBytes(known.reduce((a, l) => a + l.bytes, 0))} measured for ${known.length}` : ''}`],
    ['Structured data', ldTypes(d.jsonLd).join(', ') || ((d.microdata || []).length || (d.rdfa || []).length ? 'Microdata/RDFa' : '(none)')]
  ];
}

function reportFileName(ctx, ext) {
  let host = 'page'; try { host = new URL(ctx.d.url).hostname.replace(/^www\./, ''); } catch (e) {}
  const t = ctx.at, p = (n) => String(n).padStart(2, '0');
  return `pure-seo-report-${host}-${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}.${ext}`;
}

/* ---- Style helpers shared by both formats ---- */
function statusStyle(v) {
  const s = String(v == null ? '' : v);
  if (!s) return null;
  if (/no response|fail/i.test(s)) return 'medium';
  if (/not checked/i.test(s)) return 'neutral';
  if (/redirect/i.test(s)) return 'low';
  const n = parseInt(s, 10);
  if (!n) return null;
  return n >= 400 ? 'high' : n >= 300 ? 'low' : n >= 200 ? 'pass' : 'neutral';
}
const AREAS = ['Status', 'Security', 'Content', 'Indexability', 'International', 'JavaScript', 'Images', 'Links', 'Social', 'Structured data'];
function areaSummary(ctx, issues) {
  const { d, raw } = ctx;
  return AREAS.filter((a) => {
    if (a === 'International') return (d.hreflangs || []).length || issues.some((i) => i.area === a);
    if (a === 'JavaScript') return (raw && raw.rows) || issues.some((i) => i.area === a);
    return true;
  }).map((a) => {
    const list = issues.filter((i) => i.area === a);
    const worst = list.length ? list[0].sev : null;   /* issues are sorted high → low */
    return { area: a, n: list.length, worst, high: list.filter((i) => i.sev === 'high').length, medium: list.filter((i) => i.sev === 'medium').length, low: list.filter((i) => i.sev === 'low').length };
  });
}

/* ---- Excel workbook (styled, built with xlsx-lite.js) ---- */
function buildWorkbook(ctx) {
  const issues = collectIssues(ctx), T = reportTables(ctx), wb = XL.book(), { d, hd } = ctx;
  const isUrl = (v) => typeof v === 'string' && /^https?:\/\/\S+$/.test(v);
  const urlLink = (k, v) => (isUrl(v) ? v : null);
  const cnt = (s) => issues.filter((i) => i.sev === s).length;

  /* Summary */
  const rows = [
    [{ v: 'Pure SEO report', s: 'title' }],
    [{ v: 'URL', s: 'key' }, { v: d.url, s: 'link', l: d.url }],
    [{ v: 'Generated', s: 'key' }, { v: ctx.at.toLocaleString(), s: 'sub' }],
    [{ v: 'HTTP status', s: 'key' }, { v: hd && hd.statusCode ? String(hd.statusCode) : 'Unknown', s: statusStyle(hd && hd.statusCode) || 'default' }],
    [],
    [{ v: 'Issues to fix', s: 'section' }, { v: '', s: 'section' }],
    [{ v: 'High priority', s: 'high' }, { v: cnt('high'), s: 'num' }],
    [{ v: 'Medium priority', s: 'medium' }, { v: cnt('medium'), s: 'num' }],
    [{ v: 'Low priority', s: 'low' }, { v: cnt('low'), s: 'num' }],
    [{ v: 'Total', s: 'key' }, { v: issues.length, s: 'num' }],
    [],
    [{ v: 'Issues by area', s: 'section' }, { v: '', s: 'section' }]
  ];
  areaSummary(ctx, issues).forEach((a) => {
    const txt = a.n ? ['high', 'medium', 'low'].filter((s) => a[s]).map((s) => `${a[s]} ${s}`).join(', ') : 'No issues found';
    rows.push([{ v: a.area, s: 'key' }, { v: txt, s: a.worst || 'pass' }]);
  });
  rows.push([], [{ v: 'Page overview', s: 'section' }, { v: '', s: 'section' }]);
  reportSummary(ctx).forEach(([k, v]) => { if (v !== '') rows.push([{ v: k, s: 'key' }, isUrl(v) ? { v, s: 'link', l: v } : { v, s: 'wrap' }]); });
  XL.sheet(wb, 'Summary', { cols: [26, 100], rows, grid: false });

  XL.table(wb, 'Issues', issues.map((i) => ({ Priority: SEV_LABEL[i.sev], Area: i.area, Issue: i.issue, Details: i.detail, 'How to fix': i.fix, Source: i.source ? i.source.href : '' })),
    { cols: [11, 16, 44, 70, 60, 40], empty: 'No issues found', link: (k, v) => (k === 'Source' && v ? v : null), style: (k, v, o) => k === 'Priority' ? o.Priority.toLowerCase() : k === 'Issue' ? 'bold' : (k === 'Details' || k === 'How to fix') ? 'wrap' : null });
  XL.table(wb, 'Headings', T.headings, { cols: [8, 90, 18], empty: 'No headings', style: (k, v, o) => k === 'Level' ? (o.Level === 'H1' ? 'low' : 'neutral') : k === 'Visibility' ? (v === 'Visible' ? 'pass' : 'medium') : (o.Level === 'H1' ? 'bold' : 'wrap') });
  XL.table(wb, 'Links', T.links, { cols: [70, 40, 10, 12, 16], empty: 'No links', link: urlLink,
    style: (k, v) => k === 'Status' ? statusStyle(v) : k === 'Rel' ? (v === 'dofollow' ? null : 'medium') : null });
  XL.table(wb, 'Images', T.images, { cols: [64, 34, 22, 9, 10, 12, 12, 12, 12, 36], empty: 'No images', link: urlLink,
    style: (k, v) => k === 'Status' ? statusStyle(v) : (k === 'Alt' && v === '(missing)') ? 'high' : (k === 'Issues' && v) ? 'medium' : (k === 'Width/height attrs' && v === 'No') ? 'medium' : null });
  const rawRows = ctx.raw && ctx.raw.rows ? ctx.raw.rows : [];
  XL.table(wb, 'Raw vs rendered', T.raw, { cols: [18, 56, 56, 24], empty: ctx.raw && ctx.raw.error ? `Raw HTML couldn’t be fetched: ${ctx.raw.error}` : 'Not compared',
    style: (k, v, o) => { if (k !== 'Result') return 'wrap'; const r = rawRows.find((x) => x.label === o.Signal); return !r || !cmpIsDiff(r) ? 'pass' : r.sev === 'high' ? 'high' : r.sev === 'medium' ? 'medium' : 'low'; } });
  if (T.rawLinks.length) XL.table(wb, 'JS-only links', T.rawLinks, { cols: [90, 24], link: urlLink });
  XL.table(wb, 'Hreflang', T.hreflang, { cols: [12, 90], empty: 'No hreflang tags', link: urlLink });
  XL.table(wb, 'HTTP headers', T.headers, { cols: [32, 100], empty: 'No headers captured. Reload the page with the extension installed.', style: (k) => k === 'Value' ? 'mono' : 'bold' });
  if (T.redirects.length) XL.table(wb, 'Redirects', T.redirects, { cols: [6, 70, 8, 70], link: urlLink, style: (k, v) => k === 'Status' ? ([301, 308].includes(v) ? 'low' : 'medium') : null });
  XL.table(wb, 'Structured data', T.schema, { cols: [12, 30, 120], empty: 'No structured data', style: (k) => k === 'Data' ? 'mono' : k === 'Type' ? 'bold' : null });
  XL.table(wb, 'Social tags', T.social, { cols: [24, 100], empty: 'No social tags', link: urlLink });
  return wb;
}

/* ---- Readable HTML report ----
   One self-contained file: Google Sans is embedded when available (ctx.font, base64 woff2),
   charts are inline SVG, the small script only filters lists and opens folds for printing. */
function buildHtmlReport(ctx) {
  const { d, x, hd, raw } = ctx, issues = collectIssues(ctx), T = reportTables(ctx), e = esc;
  const cnt = (s) => issues.filter((i) => i.sev === s).length;
  const isUrl = (v) => /^https?:\/\/\S+$/.test(v);
  const val = (v) => isUrl(v) ? `<a href="${e(v)}">${e(v)}</a>` : e(v);
  const plural = (n, w, p) => `${n} ${n === 1 ? w : (p || w + 's')}`;
  const chip = (t, c) => `<span class="chip chip-${c}">${e(t)}</span>`;
  const statusChipR = (v) => { const s = statusStyle(v); return v === '' || v == null ? '<span class="dim">Not checked</span>' : chip(v, s || 'neutral'); };
  let host = '', path = '';
  try { const u = new URL(d.url); host = u.hostname.replace(/^www\./, ''); path = u.pathname + u.search; } catch (er) { host = d.url; }

  /* tables */
  const grid = (rows, cols, o = {}) => {
    if (!rows.length) return `<p class="none">${e(o.empty || 'None')}</p>`;
    const head = `<tr>${cols.map((c) => `<th>${e(c)}</th>`).join('')}</tr>`;
    const cell = (c, v, r) => {
      if (o.render && o.render[c]) return `<td>${o.render[c](v, r)}</td>`;
      v = v == null ? '' : String(v);
      return `<td${o.mono && o.mono.includes(c) ? ' class="mono"' : ''}>${val(v)}</td>`;
    };
    const body = rows.map((r, i) => `<tr${o.rowAttr ? o.rowAttr(r, i) : ''}>${cols.map((c) => cell(c, r[c], r)).join('')}</tr>`).join('');
    const id = o.id ? ` id="${o.id}"` : '';
    const search = o.search ? `<input class="tsearch" type="search" data-t="${o.id}" placeholder="${e(o.search)}" aria-label="${e(o.search)}">` : '';
    const top = o.filters || o.search ? `<div class="tfilters">${o.filters || ''}<div class="tsearch-row">${search}<span class="tcount" data-t="${o.id}">${rows.length} of ${rows.length} ${e(o.noun || 'rows')}</span></div></div>` : '';
    const t = `${top}<div class="tw"><table class="grid"${id}><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
    return o.fold ? `<details${o.open ? ' open' : ''}><summary>${e(o.fold)} <span class="dim">${rows.length}</span></summary>${t}</details>` : t;
  };
  const kv = (rows) => `<dl class="kv">${rows.filter((r) => r[1] !== '' && r[1] != null).map(([k, v, h]) => `<div><dt>${e(k)}</dt><dd>${h ? v : val(v)}</dd></div>`).join('')}</dl>`;

  /* charts */
  const COL = { follow: '#2f62a3', nofollow: '#c2261c', ugc: '#8a4fbf', sponsored: '#c77700', internal: '#1a56c4', external: '#0f8b8d', ok: '#1f7a44', redir: '#2f62a3', bad: '#c2261c', fail: '#a35700', none: '#c4cad3' };
  const donut = (segs, label) => {
    const total = segs.reduce((a, s) => a + s.v, 0), r = 42, C = 2 * Math.PI * r;
    let off = 0;
    const arcs = total ? segs.filter((s) => s.v).map((s) => { const len = (s.v / total) * C; const a = `<circle r="${r}" cx="60" cy="60" fill="none" stroke="${s.c}" stroke-width="16" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"/>`; off += len; return a; }).join('') : `<circle r="${r}" cx="60" cy="60" fill="none" stroke="${COL.none}" stroke-width="16"/>`;
    const legend = segs.map((s) => `<li><i style="background:${s.c}"></i>${e(s.l)}<b>${s.v}</b></li>`).join('');
    return `<figure class="donut"><svg viewBox="0 0 120 120" width="120" height="120" role="img" aria-label="${e(label)}"><g transform="rotate(-90 60 60)">${arcs}</g><text x="60" y="58" text-anchor="middle" class="dn">${total}</text><text x="60" y="76" text-anchor="middle" class="dl">${e(label)}</text></svg><ul>${legend}</ul></figure>`;
  };
  const stack = (segs) => {
    const total = segs.reduce((a, s) => a + s.v, 0) || 1;
    return `<div class="stack">${segs.filter((s) => s.v).map((s) => `<span style="width:${(s.v / total * 100).toFixed(2)}%;background:${s.c}" title="${e(s.l)}: ${s.v}"></span>`).join('')}</div><ul class="legend">${segs.map((s) => `<li><i style="background:${s.c}"></i>${e(s.l)} <b>${s.v}</b></li>`).join('')}</ul>`;
  };
  const meter = (part, whole, warn) => `<span class="meter${warn ? ' meter-warn' : ''}"><span style="width:${whole ? Math.min(100, part / whole * 100).toFixed(1) : 0}%"></span></span>`;

  /* ---- hero: how the page shows in Google ---- */
  const title = (d.title || '').replace(/\s+/g, ' ').trim(), desc = (d.metaDescription || '').replace(/\s+/g, ' ').trim();
  const canMeasure = typeof textPx === 'function';
  const tPx = canMeasure && title ? Math.round(textPx(title, SERP_TITLE_FONT)) : 0;
  const tCut = tPx > SERP_W, tShown = canMeasure && title ? cutToWidth(title, SERP_TITLE_FONT, SERP_W) : title;
  const lines = canMeasure && desc ? wrapLines(desc, SERP_DESC_FONT, SERP_W) : [];
  const dCut = lines.length > SERP_DESC_LINES;
  let dShown = desc;
  if (dCut) { const kept = lines.slice(0, SERP_DESC_LINES); kept[kept.length - 1] = cutToWidth(kept[kept.length - 1] + ' ' + lines[SERP_DESC_LINES], SERP_DESC_FONT, SERP_W); dShown = kept.join(' '); }
  const site = (d.ogTags && d.ogTags['og:site_name']) || host;
  /* page facts under the snippet: the answers people look for first */
  const noindex = issues.some((i) => i.issue === 'Page is set to noindex');   /* meta robots, googlebot or X-Robots-Tag */
  const canonNow = d.canonical || x.rawCanonical || null;
  const canonFact = !canonNow ? chip('Missing', 'low') : noHash(canonNow) === noHash(d.url) ? chip('Self', 'pass') : chip('Other URL', 'medium');
  const h1n = (d.headings || []).filter((h) => h.tag === 'h1' && isVisHeading(h)).length;
  const sdTypes = ldTypes(d.jsonLd);
  const facts = [
    ['Robots', noindex ? chip('noindex', 'high') : chip('index', 'pass')],
    ['Canonical', canonFact],
    ['H1', h1n === 1 ? chip('1', 'pass') : chip(String(h1n), h1n ? 'low' : 'medium')],
    ['Words', `<b>${(d.wordCount || 0).toLocaleString()}</b>`],
    ['Schema', sdTypes.length ? `<b>${sdTypes.length}</b> <span class="dim">type${sdTypes.length === 1 ? '' : 's'}</span>` : ((d.microdata || []).length || (d.rdfa || []).length ? '<b>Yes</b>' : chip('None', 'neutral'))],
    ['Hreflang', (d.hreflangs || []).length ? `<b>${d.hreflangs.length}</b>` : '<span class="dim">None</span>']
  ];
  const snippet = `<div class="snip">
    <div class="snip-site"><span class="snip-fav">${ctx.favicon ? `<img src="${e(ctx.favicon)}" alt="">` : e((site || '?').charAt(0).toUpperCase())}</span><div><div class="snip-name">${e(site)}</div><div class="snip-url">${e(host)}</div></div></div>
    <div class="snip-title">${title ? e(tShown) : '<span class="dim">No title tag</span>'}</div>
    <div class="snip-desc">${desc ? e(dShown) : '<span class="dim">No meta description. Google builds a snippet from page text.</span>'}</div>
  </div>
  <div class="fit">
    <div><span class="fit-k">Title</span>${title ? `${meter(tPx, SERP_W, tCut)}<span class="fit-v">${tPx} / ${SERP_W} px</span>${chip(tCut ? 'Cut off' : 'Fits', tCut ? 'medium' : 'pass')}` : chip('Missing', 'high')}</div>
    <div><span class="fit-k">Description</span>${desc ? `${meter(Math.min(lines.length, 3), SERP_DESC_LINES, dCut)}<span class="fit-v">${plural(lines.length, 'line')} of ${SERP_DESC_LINES}</span>${chip(dCut ? 'Cut off' : 'Fits', dCut ? 'low' : 'pass')}` : chip('Missing', 'medium')}</div>
  </div>
  <p class="note">Approximate desktop result. Google can rewrite titles and snippets.</p>
  <dl class="facts">${facts.map(([k, v]) => `<div><dt>${e(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;

  const areas = areaSummary(ctx, issues);
  const hi = cnt('high'), me = cnt('medium'), lo = cnt('low');
  const verdict = hi ? `${plural(hi, 'high-priority issue')} to fix first` : me ? `No high-priority issues. ${plural(me, 'medium issue')} to review` : issues.length ? `Only ${plural(lo, 'low-priority issue')} found` : 'No issues found in the checks this report runs';
  const verdictCls = hi ? 'v-high' : me ? 'v-medium' : 'v-pass';
  const areaList = areas.map((a) => `<li><a href="#issues" data-area="${e(a.area)}" class="area-link"><i class="dot dot-${a.worst || 'pass'}"></i>${e(a.area)}<span>${a.n ? plural(a.n, 'issue') : 'OK'}</span></a></li>`).join('');
  const panel = `<div class="verdict ${verdictCls}"><p class="v-line">${e(verdict)}</p>
    <div class="sev-bar">${issues.length ? ['high', 'medium', 'low'].map((s) => cnt(s) ? `<span class="sb-${s}" style="flex:${cnt(s)}"></span>` : '').join('') : '<span class="sb-pass" style="flex:1"></span>'}</div>
    <div class="sev-n"><span><b>${hi}</b> high</span><span><b>${me}</b> medium</span><span><b>${lo}</b> low</span></div>
    <ul class="areas">${areaList}</ul></div>`;

  /* ---- issues ---- */
  const issueHtml = issues.length ? issues.map((i) => `<article class="iss iss-${i.sev}" data-sev="${i.sev}" data-area="${e(i.area)}"><div class="iss-top">${chip(SEV_LABEL[i.sev], i.sev)}<span class="area">${e(i.area)}</span></div><h3>${e(i.issue)}</h3>${i.detail ? `<p class="det">${e(i.detail).replace(/\n/g, '<br>')}</p>` : ''}${i.fix ? `<p class="fix"><b>How to fix</b>${e(i.fix)}</p>` : ''}${i.source ? `<p class="src">Source: <a href="${e(i.source.href)}" target="_blank" rel="noopener">${e(i.source.text)}</a></p>` : ''}</article>`).join('') : '<p class="none">Nothing to fix in the checks this report runs.</p>';
  const filters = issues.length ? `<div class="filters" role="group" aria-label="Filter issues"><button class="f on" data-sev="all">All <b>${issues.length}</b></button>${['high', 'medium', 'low'].map((s) => cnt(s) ? `<button class="f" data-sev="${s}">${SEV_LABEL[s]} <b>${cnt(s)}</b></button>` : '').join('')}<span class="f-area" hidden></span></div>` : '';

  /* ---- content ---- */
  const hs = d.headings || [];
  const lvl = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((t) => ({ t, n: hs.filter((h) => h.tag === t).length }));
  const lvlMax = Math.max(1, ...lvl.map((l) => l.n));
  const lvlChart = `<div class="hbars">${lvl.map((l) => `<div><span class="hb-k">${l.t.toUpperCase()}</span><span class="hb-bar"><span style="width:${(l.n / lvlMax * 100).toFixed(1)}%"></span></span><b>${l.n}</b></div>`).join('')}</div>`;
  const outline = hs.length ? `<ol class="outline">${hs.map((h) => `<li class="o-${h.tag}${isVisHeading(h) ? '' : ' o-hid'}"><span class="lv">${h.tag.toUpperCase()}</span>${e(h.text) || '<i class="dim">(empty)</i>'}${isVisHeading(h) ? '' : ` ${chip((HEAD_VIS[h.vis] || ['Hidden'])[0], 'neutral')}`}</li>`).join('')}</ol>` : '<p class="none">No headings.</p>';

  /* ---- links ---- */
  const L = T.linkStats, links = d.links || [];
  const st = { ok: 0, redir: 0, bad: 0, fail: 0 };
  links.forEach((l) => { if (l.status === undefined) return; if (l.status === 'err') st.fail++; else if (l.redirected) st.redir++; else if (l.status >= 400) st.bad++; else st.ok++; });
  const linkCharts = `<div class="charts">${donut([{ l: 'Internal', v: L.internal, c: COL.internal }, { l: 'External', v: L.external, c: COL.external }], 'links')}${donut([{ l: 'Follow', v: L.follow, c: COL.follow }, { l: 'Nofollow', v: L.nofollow, c: COL.nofollow }, { l: 'UGC', v: L.ugc, c: COL.ugc }, { l: 'Sponsored', v: L.sponsored, c: COL.sponsored }], 'by rel')}</div>`;
  const linkStatus = L.checked ? `<h3 class="sub">Status</h3>${stack([{ l: 'OK', v: st.ok, c: COL.ok }, { l: 'Redirect', v: st.redir, c: COL.redir }, { l: 'Broken (4xx/5xx)', v: st.bad, c: COL.bad }, { l: 'No response', v: st.fail, c: COL.fail }])}` : '<p class="note">Link status wasn’t checked. Run “Check status” in the Links section before exporting to include it.</p>';

  /* Filter buttons for the report tables, same choices as the extension; counts are for the whole list */
  const fseg = (t, k, label, items) => `<div class="fseg" data-t="${t}" data-k="${k}" role="group" aria-label="${e(label)}"><span class="fseg-k">${e(label)}</span>${items.map(([v, l, n], i) => `<button class="${i ? '' : 'on'}${n === 0 ? ' zero' : ''}" data-v="${v}">${e(l)}${n != null ? ` <b>${n}</b>` : ''}</button>`).join('')}</div>`;
  const lc = (f) => links.filter(f).length;
  const linkFilters = links.length ? fseg('tLinks', 'type', 'Type', [['all', 'All', links.length], ['internal', 'Internal', L.internal], ['external', 'External', L.external]])
    + fseg('tLinks', 'rel', 'Rel', [['all', 'All', null], ['dofollow', 'Follow', L.follow], ['nofollow', 'Nofollow', L.nofollow], ['ugc', 'UGC', L.ugc], ['sponsored', 'Sponsored', L.sponsored]])
    + (L.checked ? fseg('tLinks', 'st', 'Status', [['all', 'Any', null], ['ok', 'OK', lc((l) => stBucket(l) === 'ok')], ['broken', 'Broken', lc((l) => stBucket(l) === 'broken')], ['redirect', 'Redirect', lc((l) => stBucket(l) === 'redirect')], ['failed', 'No response', lc((l) => stBucket(l) === 'failed')], ['skip', 'Email/phone', lc((l) => stBucket(l) === 'skip')]].filter((x, i) => !i || x[2])) : '') : '';
  const linkRowAttr = (r, i) => { const l = links[i]; return l ? ` data-type="${l.isExternal ? 'external' : 'internal'}" data-rel="${e(l.rel)}" data-st="${stBucket(l)}"` : ''; };
  const checkNote = (list, kind, what) => {
    const all = list || [], L2 = all.filter((l) => stBucket(l) !== 'skip'), sk = all.length - L2.length, n = (b) => L2.filter((l) => stBucket(l) === b).length, un = n('unchecked');
    if (!L2.length || un === L2.length) return '';
    const parts = [`${n('ok')} OK`, n('broken') && `${n('broken')} broken`, n('redirect') && `${n('redirect')} redirect${n('redirect') === 1 ? '' : 's'}`, n('failed') && `${n('failed')} no response`].filter(Boolean).join(', ');
    const at = ctx.checks && ctx.checks.at ? ` on ${ctx.checks.at.toLocaleString()}` : '';
    return `<p class="note check-note">${e(what)}${e(at)}: ${L2.length - un} of ${L2.length} ${kind} (${e(parts)})${un ? `. ${un} didn’t answer in time` : ''}${sk ? `. ${sk} email/phone ${sk === 1 ? 'link isn’t' : 'links aren’t'} web pages, so ${sk === 1 ? 'it wasn’t' : 'they weren’t'} checked` : ''}. Checked politely: at most 2 requests at a time per site, each URL once.</p>`;
  };

  /* ---- images ---- */
  const imgs = d.images || [], known = imgs.filter((l) => l.bytes != null);
  const imgMeasures = [['Missing alt', imgs.filter((l) => l.alt == null).length], ['No width/height', imgs.filter((l) => !l.sized).length], ['Over 200 KB', imgs.filter((l) => l.heavy).length], ['Oversized', imgs.filter((l) => l.oversized).length], ['Not WebP/AVIF', imgs.filter((l) => l.legacy).length]];
  const imgStats = imgs.length ? `<div class="measures">${imgMeasures.map(([k, n], i) => `<button class="ms${n ? ' ms-warn' : ''}" data-jump-flag="${['missing-alt', 'no-dims', 'heavy', 'oversized', 'legacy'][i]}" title="Show these images"><b>${n}</b><span>${e(k)}</span>${meter(n, imgs.length, n > 0)}</button>`).join('')}</div>${known.length ? `<p class="note">${e(fmtBytes(known.reduce((a, l) => a + l.bytes, 0)))} measured for ${known.length} of ${imgs.length} images${known.length < imgs.length ? '. Run “Check status & size” in the Images section to measure the rest.' : '.'}</p>` : ''}` : '';
  const IMG_FLAGS = ['missing-alt', 'no-dims', 'heavy', 'oversized', 'legacy', 'broken'];
  const imgFlagOf = (l) => IMG_FLAGS.filter((k) => typeof IMG_FILTERS !== 'undefined' && IMG_FILTERS[k](l)).join(' ');
  const ic = (k) => imgs.filter((l) => typeof IMG_FILTERS !== 'undefined' && IMG_FILTERS[k](l)).length;
  const imgFilters = imgs.length && typeof IMG_FILTERS !== 'undefined' ? fseg('tImages', 'flag', 'Show', [['all', 'All', imgs.length], ['missing-alt', 'Missing alt', ic('missing-alt')], ['no-dims', 'No width/height', ic('no-dims')], ['heavy', 'Over 200 KB', ic('heavy')], ['oversized', 'Oversized', ic('oversized')], ['legacy', 'Not WebP/AVIF', ic('legacy')], ...(imgs.some((l) => l.status !== undefined) ? [['broken', 'Broken', ic('broken')]] : [])]) : '';
  const imgRowAttr = (r, i) => imgs[i] ? ` data-flag="${imgFlagOf(imgs[i])}"` : '';
  const imgRender = { URL: (v) => `<div class="imgc"><img src="${e(v)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"><a href="${e(v)}">${e(typeof fileName === 'function' ? fileName(v) : v)}</a></div>`, Alt: (v) => v === '(missing)' ? chip('Missing', 'high') : v === '' ? chip('Empty', 'neutral') : e(v), Status: statusChipR, Issues: (v) => v ? v.split(', ').map((s) => chip(s, 'medium')).join(' ') : '<span class="dim">None</span>' };

  /* ---- raw vs rendered ---- */
  const rawRender = { Result: (v, r) => { const row = raw.rows.find((y) => y.label === r.Signal); return chip(v, !row || !cmpIsDiff(row) ? 'pass' : row.sev === 'high' ? 'high' : row.sev === 'medium' ? 'medium' : 'low'); } };
  const rawDiff = raw && raw.rows ? raw.rows.filter(cmpIsDiff).length : 0;
  const wordsRow = raw && raw.rows ? raw.rows.find((r) => r.id === 'words') : null;
  const rawSection = raw && raw.rows
    ? `${raw.status && raw.status !== 200 ? `<p class="warn">The server answered the raw request with ${raw.status}.</p>` : ''}<p class="lead"><b>${raw.rows.length - rawDiff}</b> of ${raw.rows.length} signals match${rawDiff ? `, <b>${rawDiff}</b> change after JavaScript` : ''}.</p>${grid(T.raw, ['Signal', 'Raw HTML', 'Rendered', 'Result'], { render: rawRender })}${wordsRow && wordsRow.info ? `<p class="note">${e(wordsRow.info)}</p>` : ''}${T.rawLinks.length ? grid(T.rawLinks, ['URL', 'Where'], { fold: 'Links that differ' }) : ''}`
    : `<p class="none">${raw && raw.error ? `Raw HTML couldn’t be fetched: ${e(raw.error)}` : 'Not compared.'}</p>`;

  /* ---- indexability ---- */
  const cs = x.canonStatus;
  const canonCell = cs && cs.status ? (cs.redirected ? chip('Redirects', 'medium') + ` <span class="dim">to ${e(cs.finalUrl)}</span>` : chip(String(cs.status), statusStyle(cs.status) || 'neutral')) : '';
  const robotsCell = (v) => v ? e(v) + (/noindex|none/i.test(v) ? ' ' + chip('noindex', 'high') : '') : '<span class="dim">Not set</span>';
  const rt = x.robotsTxt;
  const idx = kv([
    ['Canonical (rendered)', d.canonical || '(not set)'], ['Canonical (raw HTML)', x.rawCanonical || '(not set)'], ['Canonical status', canonCell, true],
    ['Meta robots', robotsCell(d.robotsMeta), true], ['Meta googlebot', d.googlebotMeta ? robotsCell(d.googlebotMeta) : '', true],
    ['X-Robots-Tag', (x.xRobotsTag || []).length ? robotsCell(x.xRobotsTag.join(' | ')) : '', true],
    ['robots.txt', rt ? `<a href="${e(rt.url)}">${e(rt.url)}</a> ${chip(String(rt.status || rt.error || '—'), rt.state === 'ok' ? 'pass' : rt.state === 'server-error' || rt.state === 'unreachable' ? 'high' : 'neutral')}` : '', true],
    ['Googlebot access', rt && rt.test ? `${chip(rt.test.allowed ? 'Allowed' : 'Blocked', rt.test.allowed ? 'pass' : 'high')} <span class="mono">${e(robotsAccessText(rt).replace(/^(Allowed|Blocked),? ?/, ''))}</span>${rt.test.starDiffers ? `<div class="note">Googlebot follows only its own group; other crawlers using * would be ${rt.test.starDiffers.allowed ? 'allowed' : 'blocked'}.</div>` : ''}` : '', true],
    ['Sitemaps', (x.sitemaps || []).map((s) => `<div><a href="${e(s.url)}">${e(s.url)}</a> ${chip(s.ok ? 'Found' : 'Not reachable', s.ok ? 'pass' : 'high')}</div>`).join(''), true]
  ]);

  /* ---- http ---- */
  const hops = (hd && hd.redirects) || [];
  const chain = hops.length ? `<ol class="chain">${hops.map((h) => `<li>${chip(String(h.status), [301, 308].includes(h.status) ? 'low' : 'medium')}<a href="${e(h.from)}">${e(h.from)}</a></li>`).join('')}<li class="final">${chip(hd.statusCode ? String(hd.statusCode) : '—', statusStyle(hd.statusCode) || 'neutral')}<a href="${e(hd.url || '')}">${e(hd.url || '')}</a></li></ol>` : '';

  /* ---- social: Open Graph (Facebook, LinkedIn…) and X (Twitter) previews ----
     X reads twitter:* tags and falls back to og:* for title, description and image. */
  const og = d.ogTags || {}, tw = d.twitterTags || {};
  const abs = (u) => { try { return u ? new URL(u, d.url).href : ''; } catch (er) { return ''; } };
  const pick = (pairs) => { for (const [src, v] of pairs) if (v) return { v, src }; return { v: '', src: '' }; };
  const ogT = pick([['og:title', og['og:title']], ['<title>', d.title]]), ogD = pick([['og:description', og['og:description']], ['meta description', desc]]), ogI = pick([['og:image', abs(og['og:image'])]]);
  const twT = pick([['twitter:title', tw['twitter:title']], ['og:title', og['og:title']], ['<title>', d.title]]);
  const twD = pick([['twitter:description', tw['twitter:description']], ['og:description', og['og:description']]]);
  const twI = pick([['twitter:image', abs(tw['twitter:image'] || tw['twitter:image:src'])], ['og:image', abs(og['og:image'])]]);
  const twCard = (tw['twitter:card'] || '').toLowerCase();
  const large = twCard === 'summary_large_image' || twCard === 'player';
  const srcLine = (label, p, want) => `<li><span>${e(label)}</span>${p.v ? (p.src === want ? chip(p.src, 'pass') : chip(p.src + ' (fallback)', 'low')) : chip('Missing', 'medium')}</li>`;
  const img = (u, cls) => u ? `<img class="${cls}" src="${e(u)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="${cls} noimg">No image</div>`;
  const ogCard = `<div class="sp sp-og">${img(ogI.v, 'sp-img')}<div class="sp-body"><div class="sp-host">${e(host)}</div><div class="sp-title">${e(ogT.v)}</div><div class="sp-desc">${e(ogD.v)}</div></div></div>`;
  const twCardHtml = large
    ? `<div class="sp sp-x">${img(twI.v, 'sp-img sp-img-x')}<div class="sp-body"><div class="sp-title">${e(twT.v)}</div><div class="sp-host">From ${e(host)}</div></div></div>`
    : `<div class="sp sp-x sp-small">${img(twI.v, 'sp-thumb')}<div class="sp-body"><div class="sp-host">${e(host)}</div><div class="sp-title">${e(twT.v)}</div><div class="sp-desc">${e(twD.v)}</div></div></div>`;
  const card = `<div class="share-grid">
    <div><h3 class="sub" style="margin-top:0">Facebook, LinkedIn and others</h3>${ogCard}
      <ul class="srcs">${srcLine('Title', ogT, 'og:title')}${srcLine('Description', ogD, 'og:description')}${srcLine('Image', ogI, 'og:image')}</ul></div>
    <div><h3 class="sub" style="margin-top:0">X (Twitter)</h3>${twCardHtml}
      <ul class="srcs"><li><span>Card type</span>${twCard ? chip(twCard, 'pass') : chip('No twitter:card', 'medium')}</li>${srcLine('Title', twT, 'twitter:title')}${srcLine('Description', twD, 'twitter:description')}${srcLine('Image', twI, 'twitter:image')}${tw['twitter:site'] ? `<li><span>Site</span>${e(tw['twitter:site'])}</li>` : ''}</ul>
      ${twCard ? '' : '<p class="note">Without twitter:card, X may show a small card or none. Add twitter:card (summary_large_image for a big image).</p>'}</div>
  </div>`;


  const sdItems = typeof sgRoots === 'function' ? sgRoots(d).length : T.schema.length;
  /* Validation in the official tools. Both fetch the live URL, so they can't reach local or protected pages. */
  const encUrl = encodeURIComponent(d.url);
  const privateHost = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1)|\.(local|test|localhost|internal)$/i.test(host) || /(^|[.-])(staging|stage|dev|test|uat|preprod)([.-]|$)/i.test(host);
  const ldScripts = (d.jsonLd || []).map((o) => `<script type="application/ld+json">\n${JSON.stringify(o, null, 2)}\n</script>`).join('\n');
  const sdValidate = `<div class="validate"><div class="validate-btns"><a class="vbtn" href="https://search.google.com/test/rich-results?url=${encUrl}" target="_blank" rel="noopener">Test in Google Rich Results Test</a><a class="vbtn" href="https://validator.schema.org/#url=${encUrl}" target="_blank" rel="noopener">Validate on Schema.org</a>${ldScripts ? '<button class="vbtn vbtn-2 copy" data-copy="sd-ld-all">Copy JSON-LD for testing</button>' : ''}</div>
    <p class="note${privateHost ? ' warn' : ''}">${privateHost ? 'This looks like a local or staging address. ' : ''}Both tools fetch the live URL. For a local, staging or password-protected page, copy the JSON-LD and paste it into the tool’s Code tab.</p>${ldScripts ? `<textarea id="sd-ld-all" hidden>${e(ldScripts)}</textarea>` : ''}</div>`;
  const toc = [['issues', 'Issues to fix', issues.length], ['overview', 'Overview'], ['content', 'Content'], ['raw', 'Raw vs rendered'], ['links', 'Links', L.total], ['images', 'Images', imgs.length], ['indexability', 'Indexability'], ['http', 'HTTP response'], ['schema', 'Structured data', sdItems], ['social', 'Social tags']];
  const fontFace = ctx.font ? `@font-face{font-family:'Google Sans';font-weight:400 700;font-display:swap;src:url(data:font/woff2;base64,${ctx.font}) format('woff2')}` : '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pure SEO report: ${e(host)}${e(path === '/' ? '' : path)}</title>
<script>try{var t=localStorage.getItem('seoext-report-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}</script>
<style>
${fontFace}
:root{color-scheme:light;--bg:#fff;--hover:#fafbfc;--snip:#4d5156;--on-ink:#fff;--on-blue:#fff;--ink:#1c2025;--ink2:#5a6270;--ink3:#8a919c;--rule:#e1e5ea;--panel:#f4f6f9;--blue:#1a56c4;--serp:#1a0dab;--high:#c2261c;--high-bg:#fdeceb;--medium:#9c5300;--medium-bg:#fff1d9;--low:#2f62a3;--low-bg:#e8f0fb;--pass:#1f7a44;--pass-bg:#e5f4ea;--text:var(--ink);--text-2:var(--ink2);--text-3:var(--ink3);--border:var(--rule);--border-light:#edf0f3;--surface:#fff;--surface-2:var(--panel);--blue-text:var(--blue);--green:var(--pass);--green-bg:var(--pass-bg);--red:var(--high);--red-bg:var(--high-bg);--font:'Google Sans',system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;--mono:ui-monospace,SFMono-Regular,Consolas,'Liberation Mono',monospace}
/* Dark theme: follows the system setting unless the reader picks Light or Dark (saved in this browser) */
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--ink:#e4e6ea;--ink2:#aab1bb;--ink3:#80878f;--rule:#383c43;--panel:#24272c;--blue:#8ab4f8;--serp:#a8c7fa;--high:#f28b82;--high-bg:rgba(242,139,130,.15);--medium:#f6c25b;--medium-bg:rgba(246,194,91,.14);--low:#8ab4f8;--low-bg:rgba(138,180,248,.15);--pass:#81c995;--pass-bg:rgba(129,201,149,.15);--surface:#1d2024;--bg:#16181b;--border-light:#2c3036;--hover:#22252a;--snip:#bdc1c6;--on-ink:#16181b;--on-blue:#0d1a2e}}
:root[data-theme="dark"]{color-scheme:dark;--ink:#e4e6ea;--ink2:#aab1bb;--ink3:#80878f;--rule:#383c43;--panel:#24272c;--blue:#8ab4f8;--serp:#a8c7fa;--high:#f28b82;--high-bg:rgba(242,139,130,.15);--medium:#f6c25b;--medium-bg:rgba(246,194,91,.14);--low:#8ab4f8;--low-bg:rgba(138,180,248,.15);--pass:#81c995;--pass-bg:rgba(129,201,149,.15);--surface:#1d2024;--bg:#16181b;--border-light:#2c3036;--hover:#22252a;--snip:#bdc1c6;--on-ink:#16181b;--on-blue:#0d1a2e}
/* Printing and PDFs always use the light theme */
@media print{html:root:not(#_){color-scheme:light;--bg:#fff;--hover:#fafbfc;--snip:#4d5156;--on-ink:#fff;--on-blue:#fff;--ink:#1c2025;--ink2:#5a6270;--ink3:#8a919c;--rule:#e1e5ea;--panel:#f4f6f9;--blue:#1a56c4;--serp:#1a0dab;--high:#c2261c;--high-bg:#fdeceb;--medium:#9c5300;--medium-bg:#fff1d9;--low:#2f62a3;--low-bg:#e8f0fb;--pass:#1f7a44;--pass-bg:#e5f4ea;--text:var(--ink);--text-2:var(--ink2);--text-3:var(--ink3);--border:var(--rule);--border-light:#edf0f3;--surface:#fff;--surface-2:var(--panel);--blue-text:var(--blue);--green:var(--pass);--green-bg:var(--pass-bg);--red:var(--high);--red-bg:var(--high-bg);--font:'Google Sans',system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;--mono:ui-monospace,SFMono-Regular,Consolas,'Liberation Mono',monospace}}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:16px}body{margin:0;font:15px/1.55 var(--font);color:var(--ink);background:var(--bg)}
a{color:var(--blue);text-decoration:none;overflow-wrap:anywhere}a:hover{text-decoration:underline}
.wrap{max-width:1200px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1fr)}
@media(min-width:1180px){.wrap{grid-template-columns:210px minmax(0,1fr);gap:40px;padding-left:24px}}
.toc{display:none}
@media(min-width:1180px){.toc{display:block;position:sticky;top:0;align-self:start;height:100vh;padding:44px 0;overflow:auto}}
.toc p{font-size:13px;color:var(--ink3);margin:0 0 10px 12px}
.toc a{display:flex;justify-content:space-between;gap:8px;padding:6px 12px;border-radius:8px;color:var(--ink2);font-size:14px}
.toc a:hover{background:var(--panel);text-decoration:none;color:var(--ink)}.toc a span{color:var(--ink3);font-variant-numeric:tabular-nums}
main{min-width:0;max-width:920px;padding:44px 28px 80px}
header.top{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;padding-bottom:22px;border-bottom:1px solid var(--rule)}
.brand{font-size:14px;color:var(--ink2);margin:0 0 8px}
h1{font-size:34px;line-height:1.15;font-weight:600;margin:0;letter-spacing:-.01em;overflow-wrap:anywhere}
.path{margin:6px 0 0;font-size:14px;color:var(--ink2);overflow-wrap:anywhere}
.meta{display:flex;flex-direction:column;align-items:flex-end;gap:6px;font-size:13px;color:var(--ink2);white-space:nowrap}
.hero{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(250px,1fr);gap:20px;margin:26px 0 8px}
@media(max-width:760px){.hero{grid-template-columns:1fr}header.top{flex-direction:column}.meta{align-items:flex-start}}
.card{border:1px solid var(--rule);border-radius:14px;padding:20px 22px;background:var(--surface)}
.snip{font-family:'Google Sans',Arial,sans-serif;padding-bottom:16px;border-bottom:1px dashed var(--rule)}
.snip-site{display:flex;gap:12px;align-items:center;margin-bottom:6px}
.snip-fav{width:28px;height:28px;border-radius:50%;overflow:hidden;background:var(--surface);border:1px solid var(--rule);display:flex;align-items:center;justify-content:center;font-size:13px;color:var(--ink2);flex:none}
.snip-fav img{width:18px;height:18px;object-fit:contain;display:block}.snip-name{font-size:14px;line-height:20px}.snip-url{font-size:12px;color:var(--snip);line-height:18px;overflow-wrap:anywhere}
.snip-title{font-size:20px;line-height:26px;color:var(--serp);margin-bottom:3px}
.snip-desc{font-size:14px;line-height:22px;color:var(--snip)}
.fit{display:grid;gap:8px;margin-top:14px;font-size:13px}
.fit>div{display:flex;align-items:center;gap:10px}
.fit-k{width:84px;color:var(--ink2)}.fit-v{color:var(--ink2);font-variant-numeric:tabular-nums;min-width:96px}
.meter{position:relative;display:inline-block;width:120px;height:6px;border-radius:3px;background:var(--panel);overflow:hidden;flex:none}
.meter>span{position:absolute;inset:0 auto 0 0;background:var(--pass);border-radius:3px}
.meter-warn>span{background:var(--medium)}
.facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:16px 0 0;padding-top:16px;border-top:1px dashed var(--rule)}
.facts>div{padding:10px 12px;border-radius:10px;background:var(--panel)}.facts dt{font-size:12px;color:var(--ink2);margin-bottom:3px}.facts dd{margin:0;font-size:15px}
@media(max-width:520px){.facts{grid-template-columns:repeat(2,minmax(0,1fr))}}
.verdict{border-radius:14px;padding:20px 22px;background:var(--panel)}
.v-line{font-size:20px;line-height:1.3;font-weight:600;margin:0 0 14px}
.v-high .v-line{color:var(--high)}.v-medium .v-line{color:var(--medium)}.v-pass .v-line{color:var(--pass)}
.sev-bar{display:flex;gap:3px;height:10px;border-radius:5px;overflow:hidden;background:var(--surface)}
.sb-high{background:var(--high)}.sb-medium{background:var(--medium)}.sb-low{background:var(--low)}.sb-pass{background:var(--pass)}
.sev-n{display:flex;gap:16px;font-size:13px;color:var(--ink2);margin:8px 0 14px}.sev-n b{color:var(--ink);font-size:15px;margin-right:2px}
.areas{list-style:none;margin:0;padding:0;border-top:1px solid var(--rule)}
.areas a{display:flex;align-items:center;gap:10px;padding:6px 2px;color:var(--ink);font-size:14px;border-bottom:1px solid var(--rule)}
.areas a:hover{text-decoration:none;background:var(--surface)}.areas a span{margin-left:auto;color:var(--ink2);font-size:13px}
.dot{width:9px;height:9px;border-radius:50%;flex:none}.dot-high{background:var(--high)}.dot-medium{background:var(--medium)}.dot-low{background:var(--low)}.dot-pass{background:var(--pass)}
section{padding-top:36px}
h2{font-size:22px;font-weight:600;margin:0 0 14px;display:flex;align-items:baseline;gap:10px}
h2 .dim{font-size:15px;font-weight:400}
h3{font-size:16px;margin:0 0 4px;font-weight:600}h3.sub{font-size:14px;color:var(--ink2);font-weight:500;margin:22px 0 10px}
p{margin:6px 0}.lead{color:var(--ink2)}.note{font-size:13px;color:var(--ink2)}.dim{color:var(--ink3)}.none{color:var(--ink2);font-style:italic}.warn{color:var(--medium)}
.chip{display:inline-block;font-size:12px;font-weight:600;line-height:20px;padding:0 8px;border-radius:10px;white-space:nowrap;vertical-align:1px}
.chip-high{background:var(--high-bg);color:var(--high)}.chip-medium{background:var(--medium-bg);color:var(--medium)}.chip-low{background:var(--low-bg);color:var(--low)}.chip-pass{background:var(--pass-bg);color:var(--pass)}.chip-neutral{background:var(--panel);color:var(--ink2)}
.filters{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 14px;align-items:center}
.f{font:inherit;font-size:13px;border:1px solid var(--rule);background:var(--surface);color:var(--ink);border-radius:16px;padding:4px 12px;cursor:pointer}
.f b{font-weight:600;color:var(--ink2);margin-left:2px}.f.on{background:var(--ink);border-color:var(--ink);color:var(--on-ink)}.f.on b{color:var(--on-ink)}
.f-area{font-size:13px;color:var(--ink2)}.f-area button{font:inherit;border:0;background:none;color:var(--blue);cursor:pointer;padding:0 4px}
.iss{position:relative;border:1px solid var(--rule);border-radius:12px;padding:14px 18px 14px 22px;margin:0 0 10px;break-inside:avoid}
.iss::before{content:"";position:absolute;left:0;top:12px;bottom:12px;width:4px;border-radius:0 3px 3px 0;background:var(--low)}
.iss-high::before{background:var(--high)}.iss-medium::before{background:var(--medium)}
.iss-top{display:flex;gap:10px;align-items:center;margin-bottom:6px}.area{font-size:13px;color:var(--ink2)}
.det{font-size:14px;color:var(--ink2);overflow-wrap:anywhere}
.src{font-size:13px;color:var(--ink2);margin-top:8px}.fix{font-size:14px;margin-top:10px;padding:8px 12px;background:var(--panel);border-radius:8px}.fix b{display:block;font-size:12px;color:var(--ink2);font-weight:600}
.kv{margin:0;border-top:1px solid var(--rule)}.kv>div{display:grid;grid-template-columns:200px minmax(0,1fr);gap:16px;padding:8px 0;border-bottom:1px solid var(--rule)}
.kv dt{color:var(--ink2);font-size:14px}.kv dd{margin:0;font-size:14px;overflow-wrap:anywhere}
@media(max-width:600px){.kv>div{grid-template-columns:1fr;gap:2px}}
.two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px}@media(max-width:760px){.two{grid-template-columns:1fr}}
.stats{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 16px}
.stat{min-width:120px;padding:12px 16px;border-radius:12px;background:var(--panel)}.stat b{display:block;font-size:24px;font-weight:600;line-height:1.2;font-variant-numeric:tabular-nums}.stat span{font-size:13px;color:var(--ink2)}
.hbars{display:grid;gap:6px;font-size:13px}.hbars>div{display:grid;grid-template-columns:28px minmax(0,1fr) 36px;gap:10px;align-items:center}
.hb-k{color:var(--ink2);font-weight:600}.hb-bar{height:8px;border-radius:4px;background:var(--panel);overflow:hidden}.hb-bar span{display:block;height:100%;background:var(--blue);border-radius:4px}.hbars b{text-align:right;font-variant-numeric:tabular-nums}
.outline{list-style:none;margin:0;padding:0;max-height:460px;overflow:auto;border:1px solid var(--rule);border-radius:12px}
.outline li{padding:6px 14px;border-bottom:1px solid var(--rule);font-size:14px}.outline li:last-child{border-bottom:0}
.lv{display:inline-block;width:30px;font-size:11px;font-weight:700;color:var(--ink3)}
.o-hid{color:var(--ink2)}.o-h1{font-weight:600}.o-h1 .lv{color:var(--blue)}.o-h2{padding-left:30px!important}.o-h3{padding-left:50px!important}.o-h4{padding-left:70px!important}.o-h5{padding-left:90px!important}.o-h6{padding-left:110px!important}
.charts{display:flex;flex-wrap:wrap;gap:16px 40px;margin:0 0 6px}
.donut{display:flex;align-items:center;gap:16px;margin:0}.donut ul,.legend{list-style:none;margin:0;padding:0;font-size:13px}
.donut li,.legend li{display:flex;align-items:center;gap:8px;padding:2px 0}.donut li b,.legend li b{margin-left:auto;padding-left:14px;font-variant-numeric:tabular-nums}
.donut i,.legend i{width:10px;height:10px;border-radius:3px;flex:none}
.dn{font:600 22px var(--font);fill:var(--ink)}.dl{font:12px var(--font);fill:var(--ink2)}
.stack{display:flex;gap:2px;height:12px;border-radius:6px;overflow:hidden;background:var(--panel);margin-bottom:8px}
.legend{display:flex;flex-wrap:wrap;gap:4px 20px}.legend li b{padding-left:4px}
.measures{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin:0 0 6px}
.ms{padding:12px 14px;border-radius:12px;background:var(--panel);border:0;font:inherit;text-align:left;color:inherit;cursor:pointer}.ms:hover{box-shadow:inset 0 0 0 1px var(--rule)}.ms b{display:block;font-size:22px;font-weight:600;line-height:1.2}.ms span:not(.meter){display:block;font-size:13px;color:var(--ink2);margin-bottom:8px}
.ms .meter{width:100%}.ms-warn b{color:var(--medium)}
details{margin:12px 0;border:1px solid var(--rule);border-radius:12px;padding:0 14px}
summary{cursor:pointer;font-weight:600;padding:10px 0;font-size:14px}details[open] summary{border-bottom:1px solid var(--rule);margin-bottom:10px}
.tfilters{display:flex;flex-direction:column;gap:8px;margin:4px 0 10px}
.fseg{display:flex;flex-wrap:wrap;align-items:center;gap:6px}.fseg-k{font-size:12.5px;color:var(--ink2);min-width:52px}
.fseg button{font:inherit;font-size:13px;border:1px solid var(--rule);background:var(--surface);color:var(--ink);border-radius:16px;padding:3px 11px;cursor:pointer}
.fseg button b{font-weight:600;color:var(--ink2);margin-left:2px}.fseg button.on{background:var(--ink);border-color:var(--ink);color:var(--on-ink)}.fseg button.on b{color:var(--on-ink)}
.fseg button.zero{color:var(--ink3)}.fseg button.zero b{color:var(--ink3)}
.tsearch-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.tsearch-row .tsearch{margin:0}.tcount{font-size:13px;color:var(--ink2);margin-left:auto}
.check-note{margin:10px 0 4px}
.tsearch{font:inherit;font-size:14px;width:100%;max-width:340px;padding:7px 12px;border:1px solid var(--rule);border-radius:8px;margin:2px 0 10px}
.tsearch:focus{outline:2px solid var(--blue);outline-offset:-1px}
.tw{overflow:auto;max-height:560px;margin-bottom:12px}
table{border-collapse:collapse;width:100%;font-size:13.5px}
th,td{text-align:left;vertical-align:top;padding:8px 10px;border-bottom:1px solid var(--rule)}
.grid th{background:var(--surface);color:var(--ink2);font-weight:600;font-size:12.5px;position:sticky;top:0;z-index:1;box-shadow:inset 0 -1px var(--rule)}
.grid td{overflow-wrap:break-word;min-width:72px}.grid tbody tr:hover td{background:var(--hover)}
.mono{font-family:var(--mono);font-size:12.5px}
.imgc{display:flex;align-items:center;gap:10px;min-width:220px}.imgc img{width:44px;height:44px;object-fit:contain;border-radius:6px;background:var(--panel);border:1px solid var(--rule);flex:none}
.chain{list-style:none;margin:0 0 14px;padding:0}.chain li{position:relative;display:flex;gap:10px;align-items:center;padding:8px 0 8px 22px;font-size:14px}
.chain li::before{content:"";position:absolute;left:5px;top:0;bottom:0;width:2px;background:var(--rule)}.chain li::after{content:"";position:absolute;left:1px;top:50%;width:10px;height:10px;margin-top:-5px;border-radius:50%;background:var(--surface);border:2px solid var(--ink3)}
.chain li.final::after{border-color:var(--pass);background:var(--pass)}
.types{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:var(--panel);padding:12px;border-radius:8px;font:12.5px/1.5 var(--mono);max-height:420px;overflow:auto;margin:0 0 12px}
.share-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px;margin:0 0 16px}@media(max-width:760px){.share-grid{grid-template-columns:1fr}}
.sp{border:1px solid var(--rule);border-radius:12px;overflow:hidden;background:var(--surface)}
.sp-img{width:100%;aspect-ratio:1.91/1;object-fit:cover;background:var(--panel);display:block}.sp-img-x{aspect-ratio:2/1}
.noimg{display:flex;align-items:center;justify-content:center;color:var(--ink3);font-size:13px;background:var(--panel)}
.sp-body{padding:10px 14px;border-top:1px solid var(--rule)}.sp-host{font-size:12px;color:var(--ink2)}.sp-title{font-weight:600;margin:2px 0;font-size:14.5px;line-height:1.35}
.sp-desc{font-size:13px;color:var(--ink2);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sp-x{border-radius:16px}.sp-small{display:flex}.sp-small .sp-body{border-top:0;border-left:1px solid var(--rule);min-width:0;align-self:center}
.sp-thumb{width:120px;height:120px;flex:none;object-fit:cover;background:var(--panel)}
.srcs{list-style:none;margin:10px 0 0;padding:0;font-size:13px}.srcs li{display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px solid var(--rule)}.srcs li span:first-child{color:var(--ink2)}
${SG_CSS}
.sg-props div{font-size:13px}.sg-type{font-size:14.5px}
.validate{border:1px solid var(--rule);border-radius:12px;padding:14px 16px;margin:0 0 14px;background:var(--panel)}
.validate-btns{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px}
.vbtn{display:inline-flex;align-items:center;font:inherit;font-size:13.5px;font-weight:600;padding:7px 14px;border-radius:18px;background:var(--blue);color:var(--on-blue);border:0;cursor:pointer;text-decoration:none}.vbtn:hover{text-decoration:none;filter:brightness(1.08)}
.vbtn-2{background:var(--surface);color:var(--blue);border:1px solid var(--rule)}
.code-card{border:1px solid var(--rule);border-radius:12px;margin:0 0 12px;overflow:hidden}.code-card pre{margin:0;border-radius:0}
.code-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 12px;border-bottom:1px solid var(--rule);font-size:14px}
.copy{font:inherit;font-size:12.5px;font-weight:600;border:1px solid var(--rule);background:var(--surface);color:var(--blue);border-radius:14px;padding:3px 12px;cursor:pointer}
.copy.done{color:var(--pass);border-color:var(--pass)}
.graph-fold>summary{font-size:15px}
.theme{display:inline-flex;border:1px solid var(--rule);border-radius:16px;overflow:hidden;margin-top:4px}
.theme button{font:inherit;font-size:12px;border:0;background:var(--surface);color:var(--ink2);padding:3px 10px;cursor:pointer}
.theme button+button{border-left:1px solid var(--rule)}.theme button.on{background:var(--panel);color:var(--ink);font-weight:600}
footer{margin-top:56px;padding-top:16px;border-top:1px solid var(--rule);color:var(--ink2);font-size:13px}
:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
@page{margin:14mm 12mm}
@media print{body{font-size:13px}.toc,.filters,.tsearch{display:none!important}.wrap{display:block}main{max-width:none;padding:0}section{break-inside:auto}h2{break-after:avoid}.grid th{position:static}.tw,.outline,pre{max-height:none;overflow:visible}a{color:var(--ink)}.iss,.card,.verdict,.ms,.stat{break-inside:avoid}details{border:0;padding:0}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
</style></head><body><div class="wrap">
<nav class="toc" aria-label="Report sections"><p>On this report</p>${toc.map(([id, l, n]) => `<a href="#${id}">${e(l)}${n != null ? `<span>${n}</span>` : ''}</a>`).join('')}</nav>
<main>
<header class="top"><div><p class="brand">Pure SEO report</p><h1>${e(host)}</h1><p class="path"><a href="${e(d.url)}">${e(d.url)}</a></p></div>
<div class="meta">${hd && hd.statusCode ? chip(`HTTP ${hd.statusCode}`, statusStyle(hd.statusCode) || 'neutral') : chip('Status unknown', 'neutral')}<span>${e(ctx.at.toLocaleString())}</span><span>${(d.wordCount || 0).toLocaleString()} words</span><div class="theme" role="group" aria-label="Theme"><button data-th="auto">Auto</button><button data-th="light">Light</button><button data-th="dark">Dark</button></div></div></header>

<div class="hero"><div class="card">${snippet}</div>${panel}</div>

<section id="issues"><h2>Issues to fix <span class="dim">${issues.length}</span></h2>
${issues.length ? '<p class="lead">Sorted by priority. High items can stop the page from ranking or being indexed.</p>' : ''}
${filters}<div id="issueList">${issueHtml}</div></section>

<section id="overview"><h2>Overview</h2>${kv(reportSummary(ctx))}</section>

<section id="content"><h2>Content</h2>
<div class="stats"><div class="stat"><b>${(d.wordCount || 0).toLocaleString()}</b><span>Words</span></div><div class="stat"><b>${(d.metaTitle || '').length}</b><span>Title characters</span></div><div class="stat"><b>${(d.metaDescription || '').length}</b><span>Description characters</span></div><div class="stat"><b>${h1n}</b><span>${h1n === 1 ? 'Visible H1' : 'Visible H1s'}${lvl[0].n > h1n ? ` (+${lvl[0].n - h1n} hidden)` : ''}</span></div></div>
<div class="two"><div><h3 class="sub" style="margin-top:0">Heading levels</h3>${lvlChart}</div><div><h3 class="sub" style="margin-top:0">Meta</h3>${kv([['Language', d.htmlLang || '(not set)'], ['Published', d.published || ''], ['Modified', d.modified || '']])}</div></div>
<h3 class="sub">Heading outline</h3>${outline}</section>

<section id="raw"><h2>Raw HTML vs rendered page</h2><p class="lead">Raw is what the server sends before JavaScript runs. Rendered is the page after JavaScript.</p>${rawSection}</section>

<section id="links"><h2>Links <span class="dim">${L.total}</span></h2>${L.total ? linkCharts + linkStatus : ''}
${checkNote(links, 'links', 'Status checked during export')}
${grid(T.links, ['URL', 'Anchor text', 'Type', 'Rel', 'Status'], { fold: 'All links', open: true, noun: 'links', empty: 'No links.', id: 'tLinks', search: 'Search URL or anchor text', filters: linkFilters, rowAttr: linkRowAttr, render: { Status: statusChipR, Rel: (v) => v === 'dofollow' ? '<span class="dim">follow</span>' : chip(v, v === 'nofollow' ? 'medium' : 'low') } })}</section>

<section id="images"><h2>Images <span class="dim">${imgs.length}</span></h2>${imgStats}
${checkNote(imgs, 'images', 'Status and size checked during export')}
${grid(T.images, ['URL', 'Alt', 'Format', 'Size (KB)', 'Intrinsic', 'On screen', 'Status', 'Issues'], { fold: 'All images', open: true, noun: 'images', empty: 'No images.', id: 'tImages', search: 'Search file name or alt text', filters: imgFilters, rowAttr: imgRowAttr, render: imgRender })}</section>

<section id="indexability"><h2>Indexability</h2>${idx}
<h3 class="sub">Hreflang <span class="dim">${T.hreflang.length}</span></h3>${grid(T.hreflang, ['Lang', 'URL'], { empty: 'No hreflang tags.' })}</section>

<section id="http"><h2>HTTP response</h2>
${chain ? `<h3 class="sub" style="margin-top:0">Redirect chain</h3>${chain}` : ''}
${grid(T.headers, ['Header', 'Value'], { fold: 'Response headers', mono: ['Value'], empty: 'No headers captured. Reload the page with the extension installed, then export again.' })}</section>

<section id="schema"><h2>Structured data <span class="dim">${sdItems}</span></h2>
${T.schema.length ? `${sdValidate}
${T.schema.map((s, i) => { let pretty = s.Data; try { pretty = JSON.stringify(JSON.parse(s.Data), null, 2); } catch (er) {} return `<div class="code-card"><div class="code-head"><span>${chip(s.Source, 'neutral')} <b>${e(s.Type || 'Item ' + (i + 1))}</b></span><button class="copy" data-copy="sd-code-${i}">Copy</button></div><pre id="sd-code-${i}">${e(pretty)}</pre></div>`; }).join('')}
<details class="graph-fold"><summary>Show graph</summary><p class="note">Each card is one item. Nested items hang under the property that holds them; ↗ links jump to the item an @id points at.</p>${buildSchemaGraph(d, 'rs')}</details>` : '<p class="none">No structured data.</p>'}</section>

<section id="social"><h2>Social tags</h2>
<p class="lead">Approximate previews of a shared link. Each list shows which tag the site actually uses.</p>${card}
${grid(T.social, ['Property', 'Value'], { empty: 'No Open Graph or Twitter tags.' })}</section>

<footer>Checks ran in the browser on ${e(ctx.at.toLocaleDateString())}. Rendered values come from the page as loaded; raw values come from a separate request without JavaScript.</footer>
</main></div>
<script>
(function(){
  /* Theme switch: Auto follows the system; the choice is remembered for every report opened in this browser */
  var root=document.documentElement,tb=document.querySelectorAll('.theme button');
  function mark(){var cur=root.dataset.theme||'auto';tb.forEach(function(b){b.classList.toggle('on',b.dataset.th===cur);b.setAttribute('aria-pressed',b.dataset.th===cur)})}
  tb.forEach(function(b){b.addEventListener('click',function(){var v=b.dataset.th;if(v==='auto')delete root.dataset.theme;else root.dataset.theme=v;try{localStorage.setItem('seoext-report-theme',v)}catch(e){}mark()})});
  mark();
  var sev='all',area=null,list=document.querySelectorAll('.iss'),btns=document.querySelectorAll('.f'),tag=document.querySelector('.f-area');
  function apply(){list.forEach(function(el){el.hidden=!((sev==='all'||el.dataset.sev===sev)&&(!area||el.dataset.area===area))});
    btns.forEach(function(b){b.classList.toggle('on',b.dataset.sev===sev)});
    if(tag){if(area){tag.hidden=false;tag.textContent='Area: '+area+' ';var x=document.createElement('button');x.textContent='Clear';x.onclick=function(){area=null;apply()};tag.appendChild(x)}else tag.hidden=true}}
  btns.forEach(function(b){b.addEventListener('click',function(){sev=b.dataset.sev;apply()})});
  document.querySelectorAll('.area-link').forEach(function(a){a.addEventListener('click',function(){area=a.dataset.area;sev='all';apply()})});
  /* Tables: filter buttons (all must match) + search; the count shows how many rows are left */
  var TS={};
  function tstate(t){return TS[t]||(TS[t]={f:{},q:''})}
  function tapply(t){var s=tstate(t),rows=document.querySelectorAll('#'+t+' tbody tr'),n=0;
    rows.forEach(function(r){var ok=true;for(var k in s.f){var v=s.f[k];if(v==='all')continue;if(k==='flag'){if((' '+(r.dataset.flag||'')+' ').indexOf(' '+v+' ')<0)ok=false}else if(r.dataset[k]!==v)ok=false}
      if(ok&&s.q&&r.textContent.toLowerCase().indexOf(s.q)<0)ok=false;r.hidden=!ok;if(ok)n++});
    var c=document.querySelector('.tcount[data-t="'+t+'"]');if(c)c.textContent=n+c.textContent.slice(c.textContent.indexOf(' '))}
  document.querySelectorAll('.fseg').forEach(function(g){g.querySelectorAll('button').forEach(function(b){b.addEventListener('click',function(){
    g.querySelectorAll('button').forEach(function(x){x.classList.toggle('on',x===b)});tstate(g.dataset.t).f[g.dataset.k]=b.dataset.v;tapply(g.dataset.t)})})});
  document.querySelectorAll('.tsearch').forEach(function(inp){inp.addEventListener('input',function(){tstate(inp.dataset.t).q=inp.value.toLowerCase();tapply(inp.dataset.t)})});
  document.querySelectorAll('[data-jump-flag]').forEach(function(m){m.addEventListener('click',function(){var b=document.querySelector('.fseg[data-k="flag"] button[data-v="'+m.dataset.jumpFlag+'"]');if(b){b.click();var t=document.getElementById('tImages');if(t){t.closest('details').open=true;t.scrollIntoView({block:'start'})}}})});
  addEventListener('beforeprint',function(){document.querySelectorAll('details').forEach(function(d){d.open=true});sev='all';area=null;apply();
    for(var t in TS){TS[t]={f:{},q:''};tapply(t)}document.querySelectorAll('.fseg button').forEach(function(b,i,a){b.classList.toggle('on',b===b.parentNode.querySelector('button'))});document.querySelectorAll('.tsearch').forEach(function(i){i.value=''})});
  document.querySelectorAll('[data-copy]').forEach(function(b){b.addEventListener('click',function(){var el=document.getElementById(b.dataset.copy);var t=el.value!==undefined&&el.tagName==='TEXTAREA'?el.value:el.textContent;
    function ok(){var o=b.textContent;b.textContent='Copied';b.classList.add('done');setTimeout(function(){b.textContent=o;b.classList.remove('done')},1500)}
    function legacy(){var ta=document.createElement('textarea');ta.value=t;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');ok()}catch(x){}ta.remove()}
    if(navigator.clipboard&&window.isSecureContext)navigator.clipboard.writeText(t).then(ok,legacy);else legacy()})});
  document.querySelectorAll('.imgc img,.sp img').forEach(function(i){i.addEventListener('error',function(){i.style.visibility='hidden'})});
})();
</script>
</body></html>`;
}
