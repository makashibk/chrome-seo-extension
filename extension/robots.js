/* robots.txt parsing (sitemaps + groups) – follows RFC 9309 and Google's documented behaviour:
   - the most specific user-agent group wins (googlebot over *); groups for the same agent are merged
   - Allow and Disallow are both evaluated; the longest matching pattern wins, ties go to Allow
   - * matches any sequence, $ anchors the end of the URL
   - stacked User-agent lines share one group; only Allow/Disallow lines close the agent list
   - only the first 500 KiB are read; /robots.txt itself is always allowed */
const ROBOTS_MAX_BYTES = 500 * 1024;
const RB_KEYS = {
  'user-agent': 'ua', 'useragent': 'ua', 'user agent': 'ua',
  'allow': 'allow',
  'disallow': 'disallow', 'dissallow': 'disallow', 'dissalow': 'disallow',
  'disalow': 'disallow', 'diasllow': 'disallow', 'disallaw': 'disallow',
  'sitemap': 'sitemap', 'site-map': 'sitemap'
};

/* Percent-encode non-ASCII and upper-case existing escapes, so patterns and URLs compare alike */
function robotsNormalize(s) {
  let out = '';
  for (const ch of s) out += ch.codePointAt(0) > 127 ? encodeURIComponent(ch) : ch;
  return out.replace(/%[0-9a-f]{2}/gi, (m) => m.toUpperCase());
}

function robotsAgentToken(val) {
  if (val[0] === '*' && (val.length === 1 || /\s/.test(val[1]))) return '*';
  const m = val.match(/^[A-Za-z_-]+/);
  return m ? m[0].toLowerCase() : '';
}

function parseRobotsTxt(text) {
  let body = (text || '').replace(/^\uFEFF/, '');
  const bytes = new TextEncoder().encode(body);
  if (bytes.length > ROBOTS_MAX_BYTES) body = new TextDecoder().decode(bytes.slice(0, ROBOTS_MAX_BYTES));
  const groups = [], sitemaps = [];
  let cur = null, inAgentList = false;
  body.split(/\r\n|\r|\n/).forEach((raw, i) => {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) return;
    const m = line.match(/^([A-Za-z][A-Za-z -]*?)\s*:\s*(.*)$/);
    if (!m) return;
    const key = RB_KEYS[m[1].toLowerCase()];
    const val = m[2].trim();
    if (key === 'ua') {
      if (!cur || !inAgentList) { cur = { agents: [], rules: [], line: i + 1 }; groups.push(cur); }
      cur.agents.push({ token: robotsAgentToken(val), raw: val });
      inAgentList = true;
    } else if (key === 'allow' || key === 'disallow') {
      if (!cur) return;                 /* rules before any User-agent line are ignored */
      inAgentList = false;              /* an empty Disallow still closes the agent list */
      if (val) cur.rules.push({ type: key, pattern: val, norm: robotsNormalize(val), line: i + 1 });
    } else if (key === 'sitemap') {
      if (val) sitemaps.push(val);
    }
  });
  return { groups, sitemaps };
}

/* Does robots.txt let `agent` crawl `url`? (Google's matching rules)
   - groups whose User-agent token equals the agent are used; otherwise the * groups; matching groups are merged
   - the longest matching Allow/Disallow pattern wins; on a tie Allow wins; no match = allowed
   Returns { allowed, rule: {type, pattern, line} | null, groupLine, agent: 'googlebot' | '*' | null } */
function robotsPatternRe(norm) {
  let anchored = false;
  if (norm.endsWith('$')) { anchored = true; norm = norm.slice(0, -1); }
  const body = norm.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp('^' + body + (anchored ? '$' : ''));
}
function robotsTest(parsed, url, agent) {
  agent = (agent || 'googlebot').toLowerCase();
  let path = '/';
  try { const u = new URL(url); path = robotsNormalize(u.pathname + u.search); } catch (e) {}
  if (path === '/robots.txt') return { allowed: true, rule: null, groupLine: null, agent: null, path };
  const groups = (parsed && parsed.groups) || [];
  let used = groups.filter((g) => g.agents.some((a) => a.token === agent)), who = agent;
  if (!used.length) { used = groups.filter((g) => g.agents.some((a) => a.token === '*')); who = used.length ? '*' : null; }
  let best = null;
  used.forEach((g) => g.rules.forEach((r) => {
    if (!robotsPatternRe(r.norm).test(path)) return;
    const len = r.norm.length;
    if (!best || len > best.len || (len === best.len && r.type === 'allow' && best.r.type !== 'allow')) best = { r, len };
  }));
  return { allowed: !best || best.r.type === 'allow', rule: best ? { type: best.r.type, pattern: best.r.pattern, line: best.r.line } : null,
           groupLine: used.length ? used[0].line : null, agent: who, path };
}

if (typeof module !== 'undefined') module.exports = { parseRobotsTxt, robotsNormalize, robotsTest };