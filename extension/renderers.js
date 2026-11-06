/* Pure SEO – Tab Renderers v2 */
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function row(l,v,cls){const m=!v;return `<div class="data-row"><span class="data-label">${esc(l)}</span><span class="data-value${cls?' '+cls:''}${m?' missing':''}">${m?'Not found':esc(v)}</span></div>`}
function rowHtml(l,h){return `<div class="data-row"><span class="data-label">${esc(l)}</span><span class="data-value">${h}</span></div>`}
function badge(t,c){return `<span class="badge badge-${c}">${esc(t)}</span>`}
function linkA(url,text){return url?`<a class="data-link" href="${esc(url)}" target="_blank" rel="noopener">${esc(text||url)}</a>`:'<span class="missing">Not set</span>'}
function copyBtn(val){return `<button class="copy-btn" data-copy="${esc(val)}" title="Copy"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>`}

/* Status text shared by chips, exports and the report. 'skip' = not a web link (mailto:, tel:…) */
const SCHEME_LABEL={mailto:'Email',tel:'Phone',sms:'SMS',whatsapp:'WhatsApp',ftp:'FTP',data:'Data URL',blob:'Blob'};
function schemeLabel(l){return SCHEME_LABEL[l.scheme]||(l.scheme?l.scheme+': link':'Not a web link')}
function statusText(l){const c=l.status;if(c===undefined||c===null||c==='')return '';if(c==='skip')return `${schemeLabel(l)} (not checked)`;if(c==='err')return `No response${l.error?': '+l.error:''}`;return l.redirected?`${c} (redirect)`:String(c)}
function statusChip(l){const c=l?l.status:undefined;
  if(c===undefined||c===null||c==='')return '<span class="missing">—</span>';
  if(c==='skip')return `<span class="badge badge-neutral" title="Not a web link, so it isn’t requested">${esc(schemeLabel(l))}</span>`;
  if(c==='err')return `<span class="badge badge-error" title="${esc(l.error?'No response: '+l.error:'No response')}">Failed</span>`;
  if(l.redirected){const t=`Redirects to ${l.finalUrl||'another URL'} (final status ${c})`;return `<span class="badge badge-info" title="${esc(t)}">Redirect</span>`}
  if(typeof c!=='number')return badge(String(c),'neutral');
  const cls=c>=500?'error':c>=400?'warning':c>=300?'info':c>=200?'success':'neutral';return badge(String(c),cls)}
function displayUrl(l){try{const u=new URL(l.url);return l.isExternal?u.host+u.pathname+u.search:(u.pathname+u.search+u.hash)}catch(e){return l.url}}
function fileName(url){if(!url)return '';if(url.startsWith('data:'))return 'Inline data URI';try{const u=new URL(url);const seg=u.pathname.split('/').filter(Boolean).pop();return seg?decodeURIComponent(seg):u.host}catch(e){return url}}
/* ---- Image weight, format and sizing ---- */
const HEAVY_IMG=200*1024;
const IMG_FMT={jpg:'JPEG',jpeg:'JPEG',jfif:'JPEG',pjpeg:'JPEG',png:'PNG',apng:'PNG',gif:'GIF',webp:'WebP',avif:'AVIF',svg:'SVG','svg+xml':'SVG',ico:'ICO','x-icon':'ICO','vnd.microsoft.icon':'ICO',bmp:'BMP',tif:'TIFF',tiff:'TIFF',heic:'HEIC'};
const LEGACY_FMT=new Set(['JPEG','PNG','GIF','BMP','TIFF']);
function fmtFromType(ct){if(!ct||!ct.startsWith('image/'))return null;const k=ct.slice(6);return IMG_FMT[k]||k.toUpperCase()}
function fmtFromUrl(u){if(!u)return null;if(u.startsWith('data:'))return fmtFromType((u.slice(5).split(/[;,]/)[0]||'').toLowerCase());try{const m=new URL(u).pathname.match(/\.([a-z0-9]+)$/i);return m?IMG_FMT[m[1].toLowerCase()]||null:null}catch(e){return null}}
/* ---- HTML size vs Googlebot's limit ----
   Google Search Central: "Googlebot crawls the first 2MB of a supported file type… Once the cutoff limit is reached,
   Googlebot stops the fetch and only sends the already downloaded part of the file for indexing consideration.
   The file size limit is applied on the uncompressed data." Decimal MB is used so the warning never comes late. */
const GOOGLE_HTML_LIMIT=2e6,HTML_NEAR_LIMIT=1.5e6;
const GOOGLE_2MB_DOC='https://developers.google.com/search/blog/2026/03/crawler-blog-post#the-2mb-limit:-what-happens-to-your-bytes';
const GOOGLE_2MB_LINK=`<a href="${GOOGLE_2MB_DOC}" target="_blank" rel="noopener">Google’s 2 MB limit</a>`;
function fmtHtmlSize(b){return b<1e6?Math.round(b/1000)+' KB':(b/1e6).toFixed(2)+' MB'}
/* Size of this URL's HTML: from the page load (free) or, when the address changed since, from the raw fetch */
function htmlSizeInfo(d,raw){
  const n=(d&&d.nav)||{},same=!n.url||String(n.url).split('#')[0]===String(d.url).split('#')[0];
  let bytes=null,transfer=null,atLeast=false;
  if(same&&n.htmlBytes>0){bytes=n.htmlBytes;transfer=n.htmlTransfer||null}
  else if(raw&&raw.bytes){bytes=raw.bytes;atLeast=!!raw.truncated}
  const level=bytes==null?'unknown':bytes>GOOGLE_HTML_LIMIT?'over':bytes>HTML_NEAR_LIMIT?'near':'ok';
  return{bytes,transfer,atLeast,level};
}
function htmlSizeText(h){return h.bytes==null?'':`${h.atLeast?'at least ':''}${fmtHtmlSize(h.bytes)} uncompressed${h.transfer&&h.transfer<h.bytes*0.95?` (${fmtHtmlSize(h.transfer)} compressed)`:''}`}
function htmlSizeBadge(h){return h.level==='over'?badge('Over the 2 MB limit','error'):h.level==='near'?badge('Close to the 2 MB limit','warning'):h.level==='ok'?badge('Within limit','success'):''}
function htmlSizeNotice(h){
  if(h.level==='over')return notice('error',`<b>The HTML is ${esc(htmlSizeText(h))}, over ${GOOGLE_2MB_LINK}.</b> Googlebot stops reading after the first 2 MB, so anything later in the HTML (content, links, structured data) isn’t indexed.`);
  if(h.level==='near')return notice('warning',`The HTML is ${esc(htmlSizeText(h))}, close to ${GOOGLE_2MB_LINK}. Googlebot ignores anything after the first 2 MB.`);
  return '';
}
function fmtBytes(b){if(b==null)return null;if(b<1024)return b+' B';if(b<1048576)return (b/1024).toFixed(b<10240?1:0)+' KB';return (b/1048576).toFixed(1)+' MB'}
/* Oversized: intrinsic width is more than 1.5× what this screen needs (display width × pixel density) */
function annotateImage(l,dpr){
  l.fmt=l.srvFmt||fmtFromUrl(l.cur||l.url);
  l.heavy=l.bytes>HEAVY_IMG;
  l.legacy=LEGACY_FMT.has(l.fmt);
  l.oversized=l.fmt!=='SVG'&&l.dw>0&&l.nw>l.dw*Math.max(dpr||1,1)*1.5;
  return l}
function imgMetaHtml(l){
  const p=[];
  if(l.fmt)p.push(`<span class="img-chip${l.legacy?' img-chip-warn':''}" title="${l.legacy?'Older format. WebP or AVIF is usually much smaller.':'Image format'}">${esc(l.fmt)}</span>`);
  if(l.bytes!=null)p.push(`<span class="img-chip${l.heavy?' img-chip-warn':''}" title="File size">${fmtBytes(l.bytes)}</span>`);
  if(l.nw)p.push(`<span class="img-dim" title="Intrinsic size, then size on screen">${l.nw}×${l.nh}${l.dw?` shown ${l.dw}×${l.dh}`:''}</span>`);
  if(!l.sized)p.push(`<span class="badge badge-warning" title="No width and height attributes (or CSS aspect-ratio). The page can shift while this image loads.">No width/height</span>`);
  if(l.heavy)p.push(badge('Heavy','warning'));
  if(l.oversized)p.push(`<span class="badge badge-info" title="Much larger than its size on screen. A smaller version would load faster.">Oversized</span>`);
  return p.join('')}

function altCell(a){return a===null||a===undefined?badge('Missing','error'):a===''?badge('Empty','neutral'):esc(a)}

function renderContent(d, cf={heading:'all'}){
  const tl=(d.metaTitle||'').length,dl=(d.metaDescription||'').length;
  const h1All=d.headings.filter(h=>h.tag==='h1'),h1c=h1All.filter(isVisHeading).length,h1Hidden=h1All.length-h1c;
  
  const tags = ['h1','h2','h3','h4','h5','h6'];
  const counts = {all: d.headings.length};
  tags.forEach(t=>counts[t]=d.headings.filter(h=>h.tag===t).length);
  
  let filterHtml = `<div class="filter-bar mb-8" style="margin-top:12px;width:100%"><div class="filter-group" style="width:100%;overflow-x:auto;display:flex">`;
  const btn = (v, l) => `<button class="filter-btn filter-btn-col${cf.heading===v?' active':''}" data-filter="heading" data-val="${v}"><span class="circle-count">${counts[v]}</span><span>${l}</span></button>`;
  filterHtml += btn('all', 'All');
  tags.forEach(t => filterHtml += btn(t, t.toUpperCase()));
  filterHtml += `</div></div>`;

  let hdgs = d.headings;
  if(cf.heading !== 'all') hdgs = hdgs.filter(h=>h.tag===cf.heading);

  let hHtml='';
  if(hdgs.length){
    hHtml='<div class="card"><div class="table-wrap"><table class="data-table"><thead><tr><th style="width:64px">Level</th><th>Heading</th></tr></thead><tbody>';
    hdgs.forEach(h=>{hHtml+=`<tr class="hl-${h.tag}${isVisHeading(h)?'':' h-invisible'}"><td><span class="h-level ${h.tag}">${h.tag.toUpperCase()}</span></td><td>${esc(h.text)}${headVisBadge(h)}</td></tr>`});
    hHtml+='</tbody></table></div></div>';
  }else hHtml='<div class="card"><div class="empty-state">No headings found</div></div>';

  const hs=htmlSizeInfo(d,typeof rawState!=='undefined'&&rawState&&rawState.rows?rawState:null),hsN=htmlSizeNotice(hs);
  return `<div class="fade-in">${hsN?`<div class="card mb-8">${hsN}</div>`:''}
    <div class="stat-row">
      <div class="stat-card"><div class="stat-value">${d.wordCount.toLocaleString()}</div><div class="stat-label">Word count</div></div>
      <div class="stat-card"><div class="stat-value">${tl}</div><div class="stat-label">Title length</div></div>
      <div class="stat-card"><div class="stat-value">${dl}</div><div class="stat-label">Description length</div></div>
      <div class="stat-card tile-${h1c===0||h1All.filter(isVisHeading).every(h=>!h.text)?'warning':h1c===1?'success':'info'}"><div class="stat-value">${h1c}${h1Hidden?`<span class="stat-sub">+${h1Hidden} hidden</span>`:''}</div><div class="stat-label">${h1c===1?'Visible H1':'Visible H1s'}</div></div>
    </div>
    <div class="section"><div class="flex-between${cf.serpOpen?' mb-8':''}"><div class="section-title" style="margin-bottom:0">Search preview</div><button class="switch" id="serpToggle" role="switch" aria-checked="${cf.serpOpen?'true':'false'}" aria-label="Show search preview"><span class="switch-track"><span class="switch-thumb"></span></span>${cf.serpOpen?'On':'Off'}</button></div>${cf.serpOpen?renderSerpPreview(d):''}</div>
    <div class="section"><div class="section-title">Meta tags</div><div class="card">
      ${rowHtml('Language',d.htmlLang?esc(d.htmlLang):'<span class="missing">Not set</span>')}
      ${rowHtml('Title',d.metaTitle?esc(d.metaTitle)+` <span class="char-count">${tl} chars</span>`+copyBtn(d.metaTitle):'<span class="missing">Not found</span>')}
      ${rowHtml('Description',d.metaDescription?esc(d.metaDescription)+` <span class="char-count">${dl} chars</span>`+copyBtn(d.metaDescription):'<span class="missing">Not found</span>')}
      ${row('Published',d.published)}
      ${row('Modified',d.modified)}
    </div></div>
    <div class="section"><div class="flex-between mb-8"><div class="section-title" style="margin-bottom:0">Headings (${counts.all})</div><button class="refresh-btn" id="copyHeadingsBtn"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy headings</button></div>${h1Notices(d)}${filterHtml}${hHtml}</div>
  </div>`}

function renderIndexability(d,x){
  let smHtml='<div class="card"><div class="empty-state">Loading…</div></div>';
  if(x.sitemaps!==undefined){
    if(x.sitemaps.length){smHtml='<div class="card">';x.sitemaps.forEach(s=>{smHtml+=`<div class="data-row"><span class="data-value mono truncate">${linkA(s.url,s.url)}</span>${s.ok?badge('Found','success'):badge('Not reachable','error')}</div>`});smHtml+='</div>'}
    else smHtml='<div class="card"><div class="empty-state">No sitemaps detected</div></div>'
  }
  let hlHtml='';
  if(d.hreflangs.length){
    hlHtml='<div class="card"><div class="table-wrap"><table class="data-table"><thead><tr><th style="width:60px">Lang</th><th>URL</th></tr></thead><tbody>';
    d.hreflangs.forEach(h=>{hlHtml+=`<tr><td><strong>${esc(h.lang)}</strong></td><td class="url-col">${linkA(h.url,h.url)}</td></tr>`});
    hlHtml+='</tbody></table></div></div>'
  }else hlHtml='<div class="card"><div class="empty-state">No hreflang tags found</div></div>';
  return `<div class="fade-in">
    <div class="section"><div class="section-title">Canonical URL</div>${renderCanonical(d,x)}</div>
    <div class="section"><div class="section-title">Robots directives</div><div class="card">
      ${rowHtml('Meta robots',robotsValueHtml(d.robotsMeta))}
      ${d.googlebotMeta?rowHtml('Meta googlebot',robotsValueHtml(d.googlebotMeta)):''}
      ${rowHtml('X-Robots-Tag',x.xRobotsStale?(typeof recheckP!=='undefined'&&recheckP?'Loading…':'<span class="missing">Unknown for this URL. The headers are from an earlier URL in this tab.</span> '+RECHECK_BTN()):xRobotsHtml(x.xRobotsTag))}
      ${rowHtml('robots.txt',robotsFileHtml(x.robotsTxt))}
      ${rowHtml('Googlebot access',robotsAccessHtml(x.robotsTxt))}
      ${(()=>{const h=htmlSizeInfo(d,typeof rawState!=='undefined'&&rawState&&rawState.rows?rawState:null);return rowHtml('HTML size',h.bytes==null?'<span class="missing">Not known yet. Open Raw vs rendered to measure it.</span>':`${esc(htmlSizeText(h))} ${htmlSizeBadge(h)}${h.level!=='ok'?rowNote(`Googlebot reads only the first 2 MB of the HTML. Content after that isn’t indexed. Source: ${GOOGLE_2MB_LINK}.`):''}`)})()}
    </div></div>
    <div class="section"><div class="section-title">Sitemaps</div>${smHtml}</div>
    <div class="section"><div class="section-title">Hreflang (${d.hreflangs.length})</div>${hlHtml}</div>
  </div>`}

function renderStructuredData(d,vm){
  const hJ=d.jsonLd.length>0,hM=d.microdata.length>0,hR=d.rdfa.length>0;
  if(!hJ&&!hM&&!hR)return '<div class="fade-in"><div class="empty-state"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/></svg><br>No structured data found</div></div>';
  let tgl=`<div class="sd-toggle"><button class="sd-toggle-btn${vm!=='graph'?' active':''}" data-view="normal">Code</button><button class="sd-toggle-btn${vm==='graph'?' active':''}" data-view="graph">Graph</button></div>`;
  let c='';
  if(vm!=='graph'){
    const renderGroup=(items,label,prefix)=>{let h='<div class="section"><div class="section-title">'+label+' ('+items.length+')</div>';items.forEach((s,i)=>{const exp=items.length===1;const tn=s['@type']||(s['@graph']?'@graph':'Schema');h+=`<div class="card mb-8"><div class="collapsible-header${exp?' open':''}" data-target="${prefix}-${i}"><span class="caret">▶</span>${esc(Array.isArray(tn)?tn.join(', '):tn)}</div><div class="collapsible-body${exp?' open':''}" id="${prefix}-${i}"><div class="json-tree" style="padding:8px 14px">${buildJsonTree(s,true)}</div></div></div>`});return h+'</div>'};
    if(hJ)c+=renderGroup(d.jsonLd,'JSON-LD','jld');
    if(hM)c+=renderGroup(d.microdata,'Microdata','md');
    if(hR)c+=renderGroup(d.rdfa,'RDFa','rdfa');
  }else{
    if(!document.getElementById('sg-css')){const st=document.createElement('style');st.id='sg-css';st.textContent=SG_CSS;document.head.appendChild(st)}
    c=buildSchemaGraph(d,'sg');
  }
  const u=encodeURIComponent(d.url);
  const val=`<div class="sd-validate"><span class="char-count">Validate:</span><a class="refresh-btn" href="https://search.google.com/test/rich-results?url=${u}" target="_blank" rel="noopener">Google Rich Results Test</a><a class="refresh-btn" href="https://validator.schema.org/#url=${u}" target="_blank" rel="noopener">Schema.org validator</a></div>`;
  return `<div class="fade-in">${val}${tgl}${c}</div>`}

function buildJsonTree(o,open){
  if(o===null||o===undefined)return '<span class="json-null">null</span>';
  if(typeof o==='string')return `<span class="json-string">"${esc(o.length>200?o.substring(0,200)+'…':o)}"</span>`;
  if(typeof o==='number')return `<span class="json-number">${o}</span>`;
  if(typeof o==='boolean')return `<span class="json-boolean">${o}</span>`;
  if(Array.isArray(o)){if(!o.length)return '<span class="json-null">[]</span>';let h='<ul>';o.forEach((it,i)=>{const cx=typeof it==='object'&&it!==null;if(cx){const tn=it['@type']||it.type||`[${i}]`;h+=`<li class="json-node"><div class="json-toggle${open?' open':''}"><span class="arrow">▶</span><span class="json-key">[${i}]</span> ${typeof tn==='string'?'<span class="json-string">'+esc(tn)+'</span>':''}</div><div class="json-children${open?'':' collapsed'}">${buildJsonTree(it,false)}</div></li>`}else h+=`<li>[${i}]: ${buildJsonTree(it)}</li>`});return h+'</ul>'}
  let h='<ul>';for(const[k,v]of Object.entries(o)){const cx=typeof v==='object'&&v!==null;if(cx){const tn=v['@type']||'';h+=`<li class="json-node"><div class="json-toggle${open?' open':''}"><span class="arrow">▶</span><span class="json-key">${esc(k)}</span>: ${tn?'<span class="json-string">'+esc(tn)+'</span>':(Array.isArray(v)?`[${v.length}]`:'{…}')}</div><div class="json-children${open?'':' collapsed'}">${buildJsonTree(v,false)}</div></li>`}else h+=`<li><span class="json-key">${esc(k)}</span>: ${buildJsonTree(v)}</li>`}return h+'</ul>'}

/* Social tag value: URL/image values open in a new tab (same window, so incognito stays incognito); URL, image, title and description get a copy button */
const SOCIAL_LINK_KEY=/(^|:)(url|image)(:url|:secure_url|:src)?$/i;
const SOCIAL_COPY_KEY=/(^|:)(url|image|title|description)(:url|:secure_url|:src)?$/i;
function socialAbs(v,base){try{const u=new URL(v,base);return /^https?:$/.test(u.protocol)?u.href:null}catch(e){return null}}
function socialValueHtml(k,v,base){
  if(!v)return '<span class="missing">Missing</span>';
  const href=SOCIAL_LINK_KEY.test(k)?socialAbs(v,base):null;
  return (href?`<a class="data-link" href="${esc(href)}" target="_blank" rel="noopener">${esc(v)}</a>`:esc(v))+(SOCIAL_COPY_KEY.test(k)?copyBtn(v):'');
}
function renderSocialTags(d){
  const ogR=['og:title','og:type','og:image','og:url','og:description','og:site_name'];
  const twR=['twitter:card','twitter:site','twitter:description','twitter:title','twitter:image','twitter:creator'];
  const ogK=new Set([...ogR,...Object.keys(d.ogTags)]),twK=new Set([...twR,...Object.keys(d.twitterTags)]);
  const ogFound=Object.keys(d.ogTags).length,twFound=Object.keys(d.twitterTags).length;
  let ogH='<div class="card"><table class="data-table"><thead><tr><th>Property</th><th>Value</th></tr></thead><tbody>';
  ogK.forEach(k=>{const v=d.ogTags[k];ogH+=`<tr><td class="tag-col" style="width:130px">${esc(k)}</td><td class="social-val">${socialValueHtml(k,v,d.url)}</td></tr>`});
  ogH+='</tbody></table></div>';
  let twH='<div class="card"><table class="data-table"><thead><tr><th>Property</th><th>Value</th></tr></thead><tbody>';
  twK.forEach(k=>{const v=d.twitterTags[k];twH+=`<tr><td class="tag-col" style="width:130px">${esc(k)}</td><td class="social-val">${socialValueHtml(k,v,d.url)}</td></tr>`});
  twH+='</tbody></table></div>';
  return `<div class="fade-in">
    <div class="stat-row"><div class="stat-card"><div class="stat-value">${ogFound}</div><div class="stat-label">Open Graph tags</div></div><div class="stat-card"><div class="stat-value">${twFound}</div><div class="stat-label">Twitter tags</div></div></div>
    <div class="section"><div class="section-title">Open Graph</div>${ogH}</div>
    <div class="section"><div class="section-title">Twitter Card</div>${twH}</div></div>`}

const RECHECK_BTN=(label)=>`<button class="refresh-btn" data-recheck><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>${label||'Re-check'}</button>`;
function headerStateNotice(st){
  if(st.stale)return `<div class="card mb-8 stale-card">${notice('warning',`<b>These headers may not apply to this URL.</b> They were captured when the tab loaded <span class="mono">${esc(st.loadedUrl)}</span>. The page has since changed its address to <span class="mono">${esc(st.pageUrl)}</span> without reloading, which single-page sites (Next.js, PWA Studio) do.`)}<div class="stale-actions">${RECHECK_BTN('Re-check this URL')}<span class="char-count">Sends a fresh request without cookies.</span></div></div>`;
  if(st.recheck){
    const time=new Date(st.ts).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    const msg=st.error?`Couldn’t fetch headers for this URL: ${esc(st.error)}.`
      :`Fetched at ${time} with a fresh request for this URL (no cookies).${st.recheckReason?' '+esc(st.recheckReason):''}`;
    return `<div class="card mb-8">${notice(st.error?'warning':'info',msg)}<div class="stale-actions">${RECHECK_BTN('Re-check again')}</div></div>`;
  }
  return '';
}
function renderHttpHeaders(hd,st={}){
  if(st.checking)return '<div class="fade-in"><div class="card"><div class="loading" style="padding:48px 0"><div class="spinner"></div><p>Fetching headers for this URL</p></div></div></div>';
  if(!hd||!hd.headers)return `<div class="fade-in"><div class="empty-state">No headers captured for this tab yet.<br><span class="text-sm">The extension may have been installed after the page loaded.</span><div style="margin-top:12px">${RECHECK_BTN('Check headers now')}</div></div></div>`;
  if(st.stale)return `<div class="fade-in">${headerStateNotice(st)}<details class="stale-old"><summary>Show the headers from ${esc(st.loadedUrl)}</summary>${renderHttpHeadersBody(hd)}</details></div>`;
  return `<div class="fade-in">${headerStateNotice(st)}${renderHttpHeadersBody(hd)}</div>`;
}
function renderHttpHeadersBody(hd){
  const c=hd.statusCode||0;let bt='neutral';if(c>=200&&c<300)bt='success';else if(c>=300&&c<400)bt='info';else if(c>=400&&c<500)bt='warning';else if(c>=500)bt='error';
  const hdrs=hd.headers||[];
  const rc=(hd.redirects||[]).filter(h=>!isInternalHop(h)).length;const rt=rc===0?'success':rc===1?'info':'warning';
  let tH='<div class="card"><div class="table-wrap table-wrap-tall"><table class="data-table"><thead><tr><th style="width:210px">Header</th><th>Value</th></tr></thead><tbody>';
  hdrs.forEach(h=>{tH+=`<tr><td><strong>${esc(h.name)}</strong></td><td class="mono" style="overflow-wrap:anywhere">${esc(h.value)}</td></tr>`});
  tH+='</tbody></table></div></div>';
  return `<div><div class="stat-row"><div class="stat-card tile-${bt}"><div class="stat-value">${c||'—'}</div><div class="stat-label">HTTP status</div></div><div class="stat-card tile-${rt}"><div class="stat-value">${rc}</div><div class="stat-label">${rc===1?'Redirect':'Redirects'}</div></div><div class="stat-card tile-neutral"><div class="stat-value">${hdrs.length}</div><div class="stat-label">Response headers</div></div>${(()=>{const h=typeof pageData!=='undefined'&&pageData?htmlSizeInfo(pageData,typeof rawState!=='undefined'&&rawState&&rawState.rows?rawState:null):{level:'unknown'};return h.bytes==null?'':`<div class="stat-card tile-${h.level==='over'?'error':h.level==='near'?'warning':'success'}" title="Uncompressed size. Googlebot reads the first 2 MB."><div class="stat-value">${fmtHtmlSize(h.bytes)}</div><div class="stat-label">HTML size</div></div>`})()}</div>
    ${(()=>{const h=typeof pageData!=='undefined'&&pageData?htmlSizeInfo(pageData,typeof rawState!=='undefined'&&rawState&&rawState.rows?rawState:null):{level:'unknown'};const n=htmlSizeNotice(h);return n?`<div class="card mb-8">${n}</div>`:''})()}
    ${(hd.redirects||[]).length?`<div class="section"><div class="section-title">Redirect chain</div>${renderRedirectChain(hd)}</div>`:''}
    <div class="section"><div class="section-title">Headers</div>${tH}${!hd.recheck&&!hdrs.some(h=>h.name.toLowerCase()==='set-cookie')?'<div class="row-note" style="margin-top:8px">Set-Cookie isn’t captured on page load, which keeps every page load light. Re-check shows it.</div>':''}</div></div>`}

/* ---- Heading visibility ---- */
const HEAD_VIS={hidden:['Hidden','Hidden by CSS (display, visibility or content-visibility).'],'sr-only':['Screen reader only','Clipped to about 1px. Screen readers announce it; visitors don’t see it.'],offscreen:['Off-screen','Moved outside the page. Visitors don’t see it.']};
const isVisHeading=h=>!h.vis||h.vis==='visible';
function headVisBadge(h){const v=HEAD_VIS[h.vis];return v?` <span class="badge badge-neutral" title="${esc(v[1])}">${v[0]}</span>`:''}
/* ---- H1 checks ---- */
function h1Notices(d){
  const h1=d.headings.filter(h=>h.tag==='h1'),vis=h1.filter(isVisHeading),hid=h1.length-vis.length;
  const list=a=>a.map(h=>'“'+esc(h.text.substring(0,60)||'(empty)')+'”').join(', ');
  let n='';
  if(!h1.length)n=notice('warning','No H1 on this page. Add one H1 that says what the page is about.');
  else if(!vis.length)n=notice('warning',`${h1.length===1?'The only H1 is':'All '+h1.length+' H1s are'} not visible (${list(h1)}). Google reads it from the code, but visitors don’t see it. Make the main H1 visible.`);
  else if(vis.every(h=>!h.text))n=notice('warning',`The H1 has no text${vis.length>1?' (all '+vis.length+')':''}. It’s empty or holds only an image, so it says nothing about the page.`);
  else if(vis.length===1&&hid)n=notice('info',`${h1.length} H1 tags in the code, 1 visible: ${list(vis)}. The other${hid>1?' '+hid+' are':' is'} not visible, which is common with separate mobile and desktop headers. Google reads all of them, so keep their text the same.`);
  else if(vis.length>1)n=notice('info',`${vis.length} visible H1 headings: ${list(vis)}${hid?` (plus ${hid} not visible)`:''}. Google says multiple H1s aren’t a problem, but one H1 that names the page is the usual practice.`);
  return n?`<div class="card mb-8">${n}</div>`:'';
}

/* ---- SERP preview (desktop, approximate) ----
   Rendered and measured in Google Sans (bundled with the extension, no network request):
   title 20px on one line, description 14px, ~600px column. Change SERP_FAMILY to switch font.
   Google truncates by pixel width, not characters, and may rewrite either text. */
const SERP_FAMILY='"Google Sans", Arial, sans-serif';
const SERP_W=600,SERP_TITLE_FONT='20px '+SERP_FAMILY,SERP_DESC_FONT='14px '+SERP_FAMILY,SERP_DESC_LINES=2;
/* Canvas measures with a fallback font until the webfont is loaded, so wait for it and re-render once */
let _serpFontReady=false;
function serpFontReady(){
  if(_serpFontReady||document.fonts.check('20px "Google Sans"')){_serpFontReady=true;return true}
  document.fonts.load('20px "Google Sans"').then(()=>{_serpFontReady=true;if(typeof renderActiveTab==='function'&&activeTab==='content')renderActiveTab()});
  return false;
}
let _serpCtx=null;
function textPx(t,font){if(!_serpCtx)_serpCtx=document.createElement('canvas').getContext('2d');_serpCtx.font=font;return _serpCtx.measureText(t).width}
function cutToWidth(t,font,max){
  if(textPx(t,font)<=max)return t;
  const words=t.split(/(\s+)/);let out='';
  for(const w of words){if(textPx((out+w).trimEnd()+' ...',font)>max)break;out+=w}
  out=out.trimEnd();
  if(!out){out=t;while(out&&textPx(out+'...',font)>max)out=out.slice(0,-1);return out+'...'}
  return out+' ...';
}
function wrapLines(t,font,max){
  const words=t.split(/\s+/).filter(Boolean),lines=[];let cur='';
  words.forEach(w=>{const test=cur?cur+' '+w:w;if(cur&&textPx(test,font)>max){lines.push(cur);cur=w}else cur=test});
  if(cur)lines.push(cur);return lines;
}
/* Snippet site line: domain only (no path) and the site's favicon, falling back to the first letter */
function serpDomain(u){try{return new URL(u).hostname.replace(/^www\./,'')}catch(e){return u}}
function serpFavHtml(src,site,cls){const letter=esc((site||'?').charAt(0).toUpperCase());
  return src?`<span class="${cls}"><img src="${esc(src)}" alt="" data-letter="${letter}" referrerpolicy="no-referrer"></span>`:`<span class="${cls}">${letter}</span>`}
function renderSerpPreview(d){
  serpFontReady();
  const title=(d.title||'').replace(/\s+/g,' ').trim();
  const desc=(d.metaDescription||'').replace(/\s+/g,' ').trim();
  const tPx=Math.round(textPx(title,SERP_TITLE_FONT));
  const tCut=tPx>SERP_W;
  const tShown=cutToWidth(title,SERP_TITLE_FONT,SERP_W);
  const lines=desc?wrapLines(desc,SERP_DESC_FONT,SERP_W):[];
  const dCut=lines.length>SERP_DESC_LINES;
  let dShown=desc;
  if(dCut){const kept=lines.slice(0,SERP_DESC_LINES);kept[kept.length-1]=cutToWidth(kept[kept.length-1]+' '+lines[SERP_DESC_LINES],SERP_DESC_FONT,SERP_W);dShown=kept.join(' ')}
  const dPx=Math.round(textPx(desc,SERP_DESC_FONT));
  let host='';try{host=new URL(d.url).hostname.replace(/^www\./,'')}catch(e){}
  const site=(d.ogTags&&d.ogTags['og:site_name'])||host;
  const tBadge=!title?badge('Missing','error'):tCut?badge('Truncated','warning'):badge('Fits','success');
  const dBadge=!desc?badge('Missing','neutral'):dCut?badge('Truncated','warning'):badge('Fits','success');
  return `<div class="card">
    <div class="serp-wrap"><div class="serp">
      <div class="serp-site">${serpFavHtml(d.favicon,site,'serp-fav')}<div class="serp-site-text"><div class="serp-name">${esc(site)}</div><div class="serp-url">${esc(serpDomain(d.url))}</div></div></div>
      <div class="serp-title">${title?esc(tShown):'<span class="missing">No title tag</span>'}</div>
      <div class="serp-desc">${desc?esc(dShown):'<span class="missing">No meta description. Google will build a snippet from the page content.</span>'}</div>
    </div></div>
    ${rowHtml('Title width',(title?`${tPx.toLocaleString()} of ~${SERP_W} px `:'')+tBadge+(tCut?rowNote(`About ${(tPx-SERP_W).toLocaleString()} px too wide. The preview cuts off after “${esc(tShown.replace(/ ?\.\.\.$/,'').split(' ').slice(-3).join(' '))}”.`):''))}
    ${rowHtml('Description width',desc?`${dPx.toLocaleString()} px across ${lines.length} line${lines.length===1?'':'s'} (shows ${SERP_DESC_LINES}) ${dBadge}`:dBadge)}
    <div class="notice notice-neutral">Approximate desktop preview: 20px title, 14px description, ${SERP_W}px column. Google can rewrite titles and snippets.</div>
  </div>`;
}

/* ---- Canonical ---- */
function noHash(u){try{const x=new URL(u);x.hash='';return x.href}catch(e){return u}}
function urlDiffs(a,b){
  let A,B;try{A=new URL(a);B=new URL(b)}catch(e){return['URL']}
  const r=[];
  if(A.protocol!==B.protocol)r.push(`protocol (${A.protocol.slice(0,-1)} vs ${B.protocol.slice(0,-1)})`);
  if(A.host!==B.host)r.push(A.host.replace(/^www\./,'')===B.host.replace(/^www\./,'')?'www vs non-www':'domain');
  if(A.pathname!==B.pathname){const t=p=>p.replace(/\/+$/,'');r.push(t(A.pathname)===t(B.pathname)?'trailing slash':A.pathname.toLowerCase()===B.pathname.toLowerCase()?'letter case':'path')}
  if(A.search!==B.search)r.push('query string');
  return r;
}
function notice(type,html){return `<div class="notice notice-${type}">${html}</div>`}
function renderCanonical(d,x){
  const rendered=d.canonical||null,raw=x.rawCanonical,rawLoaded=raw!==undefined,rawOk=rawLoaded&&!x.rawError;
  const effective=rendered||(rawOk?raw:null);
  const pageUrl=noHash(d.url);
  const notes=[];
  /* rows */
  const rawCell=!rawLoaded?'Loading…':x.rawError?badge('Couldn’t fetch','neutral'):raw?linkA(raw,raw)+copyBtn(raw):'<span class="missing">Not set</span>';
  const cs=x.canonStatus;let stCell='<span class="missing">—</span>';
  if(effective){
    if(cs===undefined)stCell='Checking…';
    else if(cs){
      if(!cs.status)stCell=badge('Not checked','neutral')+rowNote(`Request failed (${esc(cs.error||'network error')}).`);
      else if(cs.redirected)stCell=badge('Redirects','warning')+rowNote(`Ends at ${esc(cs.finalUrl)} with ${cs.status}.`);
      else stCell=badge(String(cs.status),cs.status===200?'success':cs.status>=400?'error':'warning');
    }
  }
  let diffs=[];
  if(effective)diffs=noHash(effective)===pageUrl?[]:urlDiffs(effective,pageUrl);

  /* 1. rendered vs raw */
  if(rawLoaded&&x.rawError)notes.push(notice('info',`Couldn’t fetch the raw HTML (${esc(x.rawError)}), so raw and rendered canonicals weren’t compared.`));
  if(rawOk){
    if(rendered&&raw&&noHash(rendered)!==noHash(raw))notes.push(notice('warning','Raw and rendered canonicals differ: JavaScript changes the canonical after the page loads. Google recommends not changing it with JavaScript. Make both identical.'));
    else if(rendered&&!raw)notes.push(notice('info','The canonical only exists after JavaScript runs. Google can read it when it renders the page, but having it in the raw HTML is more reliable.'));
    else if(!rendered&&raw)notes.push(notice('warning','The canonical is in the raw HTML but gone after JavaScript runs. A script is removing it.'));
    if(x.rawCanonicalAttr&&!/^https?:\/\//i.test(x.rawCanonicalAttr))notes.push(notice('info',`The raw HTML uses a relative canonical (<code>${esc(x.rawCanonicalAttr)}</code>). Google accepts it but recommends absolute URLs.`));
    if(!rendered&&!raw)notes.push(notice('info','No canonical tag. Google will choose the canonical URL itself.'));
  }
  /* 2. canonical target status */
  if(effective&&cs&&cs.status){
    if(cs.redirected)notes.push(notice('warning',`The canonical URL redirects (ends at ${esc(cs.finalUrl)}, ${cs.status}). Point the canonical straight at the final URL.`));
    else if(cs.status!==200)notes.push(notice(cs.status>=400?'error':'warning',`The canonical URL returns ${cs.status}. Google is likely to ignore a canonical that doesn’t return 200.`));
  }
  /* 3. canonical vs final URL */
  if(diffs.length){
    const minor=diffs.every(t=>t==='trailing slash'||t==='www vs non-www'||t==='letter case'||t.startsWith('protocol'));
    notes.push(notice('warning',minor
      ?`The canonical differs from this page’s URL only by ${esc(diffs.join(', '))}. That’s usually a template or config mistake, and it asks Google to index the other version.`
      :'The canonical points to a different URL, so Google is asked to index that URL instead of this one. Expected on duplicates such as filter or parameter URLs, a problem on a page you want to rank.'));
  }
  return `<div class="card">
      ${rowHtml('Rendered DOM',rendered?linkA(rendered,rendered)+copyBtn(rendered):'<span class="missing">Not set</span>')}
      ${rowHtml('Raw HTML',rawCell)}
      ${rowHtml('Status',stCell)}
      ${notes.join('')}</div>`;
}

/* ---- Robots directives ---- */
const RB_COLON_DIRECTIVES=['unavailable_after','max-snippet','max-image-preview','max-video-preview'];
function robotsTokens(v){return String(v||'').toLowerCase().split(/[,\s]+/).filter(Boolean)}
function robotsFlags(v){const t=robotsTokens(v);const none=t.includes('none');return{noindex:none||t.includes('noindex'),nofollow:none||t.includes('nofollow')}}
function robotsFlagBadges(v){const f=robotsFlags(v);return (f.noindex?' '+badge('noindex','error'):'')+(f.nofollow?' '+badge('nofollow','warning'):'')}
function robotsValueHtml(v){return v?esc(v)+robotsFlagBadges(v):'<span class="missing">Not set</span>'}
/* "otherbot: noindex" only applies to otherbot; "unavailable_after: …" is a directive, not a bot name */
function xRobotsScope(v){const m=String(v).match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*)$/);if(m&&!RB_COLON_DIRECTIVES.includes(m[1].toLowerCase()))return{agent:m[1].toLowerCase(),value:m[2]};return{agent:null,value:v}}
function xRobotsHtml(list){
  if(!list||!list.length)return '<span class="missing">Not set</span>';
  return list.map(v=>{const sc=xRobotsScope(v);
    const tag=sc.agent&&sc.agent!=='googlebot'?' '+badge(sc.agent+' only','neutral'):robotsFlagBadges(sc.value);
    return `<div class="mono">${esc(v)}${tag}</div>`}).join('')}
function rowNote(t){return `<div class="row-note">${t}</div>`}
function robotsFileHtml(r){
  if(r===undefined)return 'Loading…';
  const link=linkA(r.url,r.url);
  if(r.state==='ok')return link+' '+badge(String(r.status),'success');
  if(r.state==='no-file')return link+' '+badge(String(r.status),'neutral');
  if(r.state==='server-error')return link+' '+badge(String(r.status),'error');
  return link+' '+badge('Not reachable','error');
}
/* robots.txt verdict for this URL: allowed or blocked for Googlebot, and the exact line that decides it */
function robotsRuleText(r){return `line ${r.line}: ${r.type==='allow'?'Allow':'Disallow'}: ${r.pattern}`}
function robotsAccessHtml(r){
  if(r===undefined)return 'Loading…';
  const t=r.test;
  if(!t)return '<span class="missing">Couldn’t check. robots.txt wasn’t reachable.</span>';
  if(t.serverError)return badge('Blocked','error')+rowNote(`robots.txt returns ${esc(r.status)}. Google treats the whole site as blocked until it can fetch the file.`);
  if(t.noFile)return badge('Allowed','success')+rowNote(`No robots.txt (${esc(r.status)}), so nothing is blocked.`);
  const grp=t.agent==='googlebot'?'the Googlebot group':t.agent==='*'?'the * group':'no group';
  let h=t.allowed?badge('Allowed','success'):badge('Blocked','error');
  if(t.rule)h+=` <span class="mono">${esc(robotsRuleText(t.rule))}</span>`;
  else h+=` <span class="char-count">No rule matches this URL${t.agent?` in ${grp}`:''}</span>`;
  if(!t.allowed)h+=rowNote('Google can’t crawl this URL, so it won’t see the content or a noindex tag. It can still be indexed without content if other pages link to it.');
  if(t.starDiffers)h+=rowNote(`Googlebot follows only its own group, so the * rules don’t apply to it. Other crawlers using * would be ${t.starDiffers.allowed?'allowed':'blocked'}${t.starDiffers.rule?' by '+esc(robotsRuleText(t.starDiffers.rule)):''}.`);
  return h}
/* ---- Redirect chain ---- */
const REDIRECT_NAMES={301:'Moved permanently',302:'Found (temporary)',303:'See other (temporary)',307:'Temporary redirect',308:'Permanent redirect'};
function isInternalHop(h){return /internal redirect/i.test(h.line||'')}
function renderRedirectChain(hd){
  const hops=hd.redirects||[];
  if(!hops.length)return '';
  const notes=[];
  const serverHops=hops.filter(h=>!isInternalHop(h));
  let steps='';
  hops.forEach((h,i)=>{
    const internal=isInternalHop(h);
    const name=internal?'Browser internal redirect':(REDIRECT_NAMES[h.status]||'Redirect');
    const cls=internal?'neutral':(h.status===301||h.status===308)?'info':'warning';
    let meta=badge(String(h.status),cls)+`<span class="rc-name">${esc(name)}</span>`;
    if(h.cached)meta+=badge('From cache','neutral');
    steps+=`<li class="rc-step"><span class="rc-num">${i+1}</span><div class="rc-body"><div class="rc-url">${linkA(h.from,h.from)}${copyBtn(h.from)}</div><div class="rc-meta">${meta}</div></div></li>`;
  });
  const fc=hd.statusCode||0,fcls=fc>=200&&fc<300?'success':fc>=400?'error':fc?'info':'neutral';
  const finalUrl=hd.url||(hops.length?hops[hops.length-1].to:'');
  steps+=`<li class="rc-step rc-final"><span class="rc-num">${hops.length+1}</span><div class="rc-body"><div class="rc-url">${linkA(finalUrl,finalUrl)}${copyBtn(finalUrl)}</div><div class="rc-meta">${badge(fc?String(fc):'No response',fcls)}<span class="rc-name">Final URL</span></div></div></li>`;

  /* Checks */
  const urls=[...hops.map(h=>h.from),finalUrl];
  if(new Set(urls).size<urls.length||/too_many_redirects/i.test(hd.error||''))notes.push(['error','Redirect loop: the same URL appears more than once in the chain.']);
  if(serverHops.length>=2)notes.push(['warning',`${serverHops.length} server redirects before the final URL. Point internal links, canonicals, hreflang and sitemap entries straight at the final URL, and redirect the first URL to it in one hop.`]);
  const temp=serverHops.filter(h=>[302,303,307].includes(h.status));
  if(temp.length)notes.push(['warning',`Temporary redirect (${[...new Set(temp.map(h=>h.status))].join(', ')}). If the move is permanent, use 301 or 308. Google treats a permanent redirect as a strong signal to show the target URL in results, and a temporary one as a signal to keep the original.`]);
  hops.forEach((h,i)=>{if(/^https:/i.test(h.from)&&/^http:/i.test(h.to))notes.push(['warning',`Hop ${i+1} drops from HTTPS to HTTP.`])});
  const ih=hops.map((h,i)=>isInternalHop(h)?i+1:0).filter(Boolean);
  if(ih.length)notes.push(['info',`Hop ${ih.join(', ')} came from Chrome itself (usually an HSTS upgrade to HTTPS), not from the server. It doesn’t show what a crawler gets for that URL. Test it with curl -I to see the server’s real response.`]);
  const ch=hops.map((h,i)=>h.cached?i+1:0).filter(Boolean);
  if(ch.length)notes.push(['info',`Hop ${ch.join(', ')} was replayed from the browser cache, not fetched from the server. Clear the cache or use an incognito window to see the current server response.`]);
  const nh=notes.map(([t,m])=>`<div class="notice notice-${t}">${esc(m).replace(/curl -I/,'<code>curl -I</code>')}</div>`).join('');
  return `<div class="card"><ol class="rc-list">${steps}</ol>${nh}</div>`;
}

const HL_TYPES=[['nofollow','Nofollow','#d93025'],['sponsored','Sponsored','#e37400'],['ugc','UGC','#9334e6'],['external','External follow','#1a73e8'],['broken','Broken','#c2185b']];
const ICON_SEARCH='<svg class="search-ico" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>';
const ICON_REFRESH='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>';
const ICON_DOWNLOAD='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
function toolbar(searchId,placeholder,value,middle,checkId,checkLabel,exportId,exportTitle){
  return `<div class="toolbar"><label class="search-box">${ICON_SEARCH}<input class="search-input" id="${searchId}" type="search" placeholder="Search" title="${placeholder}" value="${esc(value)}" aria-label="${placeholder}"></label>${middle}<button class="refresh-btn" id="${checkId}">${ICON_REFRESH}${checkLabel}</button><button class="icon-btn" id="${exportId}" title="${exportTitle}" aria-label="${exportTitle}">${ICON_DOWNLOAD}</button></div>`}
function seg(filter,current,items){return `<div class="seg" role="group">${items.map(([v,l,n])=>`<button class="${current===v?'active':''}" data-filter="${filter}" data-val="${v}" aria-pressed="${current===v}">${l}${n!=null?`<span class="n">${n}</span>`:''}</button>`).join('')}</div>`}

function renderHighlightBar(hl){
  const chips=HL_TYPES.map(([k,l])=>`<label class="hl-chip"><input type="checkbox" data-hl="${k}"${hl.types[k]?' checked':''}><span class="hl-dot hl-dot-${k}"></span>${l}</label>`).join('');
  return `<div class="hl-bar${hl.on?'':' hl-off'}"><button class="switch" id="hlToggle" role="switch" aria-checked="${hl.on?'true':'false'}"><span class="switch-track"><span class="switch-thumb"></span></span>Highlight on page</button>${hl.on?`<div class="hl-types">${chips}</div>`:'<span class="hl-hint">Outline nofollow, sponsored, UGC, external and broken links</span>'}</div>`}

/* Status buckets used by the Links filter (only after "Check status") */
const LINK_STATUS={'all':()=>true,'broken':l=>typeof l.status==='number'&&l.status>=400,'redirect':l=>!!l.redirected,'failed':l=>l.status==='err','ok':l=>typeof l.status==='number'&&l.status<400&&!l.redirected};
/* One filter used by the table, the live search and the export */
function filterLinks(all,f){
  let links=all||[];
  if(f.rel!=='all')links=links.filter(l=>l.rel===f.rel);
  if(f.type!=='all')links=links.filter(l=>f.type==='internal'?!l.isExternal:l.isExternal);
  if(f.status&&f.status!=='all')links=links.filter(LINK_STATUS[f.status]||LINK_STATUS.all);
  if(f.search){const s=f.search.toLowerCase();links=links.filter(l=>l.url.toLowerCase().includes(s)||l.text.toLowerCase().includes(s))}
  return links}

function renderLinksFilterBar(f,total,count,dLinks){
  const c=k=>dLinks.filter(l=>l.rel===k).length;
  const rel=[['all','All',total],['dofollow','Follow',c('dofollow')],['nofollow','Nofollow',c('nofollow')]];
  if(c('ugc')||f.rel==='ugc')rel.push(['ugc','UGC',c('ugc')]);
  if(c('sponsored')||f.rel==='sponsored')rel.push(['sponsored','Sponsored',c('sponsored')]);
  const nInt=dLinks.filter(l=>!l.isExternal).length;
  const type=[['all','All'],['internal','Internal',nInt],['external','External',total-nInt]];
  const checked=dLinks.some(l=>l.status!==undefined);
  let statusSeg='';
  if(checked){const n=k=>dLinks.filter(LINK_STATUS[k]).length;
    statusSeg=seg('status',f.status||'all',[['all','Any status'],['ok','OK',n('ok')],['broken','Broken',n('broken')],['redirect','Redirect',n('redirect')],['failed','No response',n('failed')]].filter(x=>x[0]==='all'||x[2]||f.status===x[0]))}
  return `${renderHighlightBar(hlSettings())}
  ${toolbar('linkSearch','Search URL or anchor text',f.search,'','refreshStatus','Check status','exportLinksBtn','Export links shown to Excel')}
  <div class="quick-row">${seg('rel',f.rel,rel)}${seg('type',f.type,type)}${statusSeg}</div>`}

function renderLinksTable(links,all){
  const idx=new Map((all||links).map((l,i)=>[l,i]));
  const head=`<div class="table-head"><span class="link-count">${links.length} of ${(all||links).length} links</span></div>`;
  if(!links.length)return `<div class="card">${head}<div class="empty-state">No links match these filters</div></div>`;
  let h=`<div class="card">${head}<div class="table-wrap table-wrap-list"><table class="data-table" id="linksTable"><thead><tr><th>URL</th><th style="width:96px">Rel</th><th style="width:72px">Status</th></tr></thead><tbody>`;
  links.forEach(l=>{const i=idx.get(l);const ab=l.rel==='dofollow'?badge('follow','neutral'):l.rel==='ugc'?badge('ugc','info'):l.rel==='sponsored'?badge('sponsored','info'):badge('nofollow','warning');
    h+=`<tr><td class="url-col"><a href="${esc(l.url)}" title="${esc(l.url)}${l.text?'\nAnchor: '+esc(l.text):''}" target="_blank" rel="noopener">${esc(displayUrl(l))}</a></td><td>${ab}</td><td class="link-status" data-idx="${i}">${statusChip(l)}</td></tr>`});
  return h+'</tbody></table></div></div>'}

function renderOutgoingLinks(d,f){
  const total=(d.links||[]).length,links=filterLinks(d.links,f);
  return `<div class="fade-in">
    <div id="linksFilterBar">${renderLinksFilterBar(f,total,links.length,d.links||[])}</div>
    <div id="linksTableWrap">${renderLinksTable(links,d.links)}</div></div>`}

function renderSettings(s){
  const ta=v=>s.theme===v?' active':'';
  const tabs=['Last Opened','content','images','outgoing-links','indexability','raw-rendered','http-headers','structured-data','social-tags'];
  const names={'Last Opened':'Last opened section','content':'Content','images':'Images','outgoing-links':'Links','indexability':'Indexability','raw-rendered':'Raw vs rendered','http-headers':'HTTP headers','structured-data':'Structured data','social-tags':'Social tags'};
  let opts='';tabs.forEach(t=>{const l=names[t];opts+=`<option value="${t}"${s.defaultTab===t?' selected':''}>${l}</option>`});
  return `<div class="fade-in">
    <div class="settings-group"><div class="settings-group-title">Theme</div><div class="radio-group">
      <button class="radio-option${ta('system')}" data-theme="system"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> System</button>
      <button class="radio-option${ta('dark')}" data-theme="dark"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg> Dark</button>
      <button class="radio-option${ta('light')}" data-theme="light"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> Light</button>
    </div></div>
    <div class="settings-group"><div class="settings-group-title">Open the extension on</div><div class="select-wrap"><select id="defaultTabSelect">${opts}</select></div></div>
    <div class="settings-group"><div class="settings-group-title">Keyboard shortcut</div><button class="shortcut-link" id="shortcutLink"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg> Set a shortcut</button></div></div>`}

/* One filter used by the table, the live search and the export */
const IMG_FILTERS={
  'all':()=>true,
  'with-alt':l=>!!l.alt,'no-alt':l=>!l.alt,'missing-alt':l=>l.alt===null||l.alt===undefined,
  'with-title':l=>!!l.title,'no-title':l=>!l.title,
  'alt-no-title':l=>!!l.alt&&!l.title,'title-no-alt':l=>!!l.title&&!l.alt,
  'no-dims':l=>!l.sized,'heavy':l=>l.heavy,'oversized':l=>l.oversized,'legacy':l=>l.legacy,
  'broken':l=>typeof l.status==='number'&&l.status>=400||l.status==='err'
};
/* Grouped filter menu; the "needs attention" chips are shortcuts to the issue filters */
const IMG_ISSUES=[['missing-alt','Missing alt','err'],['broken','Broken','err'],['no-dims','No width/height'],['heavy','Heavy'],['oversized','Oversized'],['legacy','Not WebP/AVIF']];
const IMG_MENU=[['', [['all','All images']]],
  ['Alt text',[['with-alt','Has alt'],['no-alt','No alt (missing or empty)'],['missing-alt','Missing alt attribute']]],
  ['Title',[['with-title','Has title'],['no-title','No title'],['alt-no-title','Alt, no title'],['title-no-alt','Title, no alt']]],
  ['Performance',[['no-dims','No width/height'],['heavy','Heavy (over 200 KB)'],['oversized','Oversized'],['legacy','Not WebP/AVIF']]]];
function filterImages(images,f){
  let out=(images||[]).filter(IMG_FILTERS[f.type]||IMG_FILTERS.all);
  if(f.search){const s=f.search.toLowerCase();out=out.filter(l=>l.url.toLowerCase().includes(s)||(l.alt||'').toLowerCase().includes(s)||(l.title||'').toLowerCase().includes(s))}
  return out;
}
function renderImagesFilterBar(f,total,count,dImages){
  const cnt=k=>dImages.filter(IMG_FILTERS[k]).length;
  const checked=dImages.some(l=>l.status!==undefined);
  const menu=IMG_MENU.map(([g,opts])=>{const o=opts.map(([v,l])=>`<option value="${v}"${f.type===v?' selected':''}>${l} (${v==='all'?total:cnt(v)})</option>`).join('');return g?`<optgroup label="${g}">${o}</optgroup>`:o}).join('')
    +(checked?`<optgroup label="Status"><option value="broken"${f.type==='broken'?' selected':''}>Broken or no response (${cnt('broken')})</option></optgroup>`:'');
  const select=`<select class="filter-select" id="imgFilter" aria-label="Filter images">${menu}</select>`;
  const issues=IMG_ISSUES.filter(([k])=>k!=='broken'||checked).map(([k,l,t])=>[k,l,t,cnt(k)]).filter(x=>x[3]||f.type===x[0]);
  const quick=issues.length
    ?`<span class="quick-label">Needs attention</span>${issues.map(([k,l,t,n])=>`<button class="qchip${t?' qchip-err':''}${f.type===k?' active':''}" data-qf="${k}" aria-pressed="${f.type===k}">${l}<span class="n">${n}</span></button>`).join('')}`
    :`<span class="quick-ok"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>No image issues found</span>`;
  return `${toolbar('imgSearch','Search file, alt or title',f.search,select,'refreshImageStatus','Check status &amp; size','exportImagesBtn','Export images shown to Excel')}

  <div class="quick-row">${quick}</div>`}

function renderImagesTable(images,all,fullUrl){all=all||images;const idx=new Map(all.map((l,i)=>[l,i]));
  const head=`<div class="table-head"><span class="link-count">${images.length} of ${all.length} images</span><label class="check-toggle"><input type="checkbox" id="imgFullUrl"${fullUrl?' checked':''}> Full URL</label></div>`;
  if(!images.length)return `<div class="card">${head}<div class="empty-state">No images match these filters</div></div>`;
  let h=`<div class="card">${head}<div class="table-wrap table-wrap-list"><table class="data-table" id="imagesTable" style="table-layout:fixed; width:100%"><thead><tr><th style="width:42%">Image</th><th style="width:26%">Alt text</th><th style="width:20%">Title</th><th style="width:12%">Status</th></tr></thead><tbody>`;
  images.forEach(l=>{
    const i=idx.get(l);
    h+=`<tr><td class="images-url-col"><div class="img-cell"><img class="img-thumb" src="${esc(l.url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"><div class="img-info"><a href="${esc(l.url)}" title="${esc(l.url)}" target="_blank" rel="noopener"${fullUrl&&!l.url.startsWith('data:')?' class="img-full"':''}>${esc(fullUrl&&!l.url.startsWith('data:')?l.url:fileName(l.url))}</a><div class="img-meta" data-idx="${i}">${imgMetaHtml(l)}</div></div></div></td><td style="word-break:break-word;white-space:normal">${altCell(l.alt)}</td><td style="word-break:break-word;white-space:normal">${esc(l.title)}</td><td class="img-status" data-idx="${i}">${statusChip(l)}</td></tr>`});
  return h+'</tbody></table></div></div>'}

function renderImageStats(all){
  const noAlt=all.filter(l=>l.alt===null||l.alt===undefined).length,noDims=all.filter(l=>!l.sized).length,heavy=all.filter(l=>l.heavy).length;
  const known=all.filter(l=>l.bytes!=null),sum=known.reduce((a,l)=>a+l.bytes,0);
  const t=n=>n?'warning':'success';
  return `<div class="stat-row" id="imgStats">
    <div class="stat-card"><div class="stat-value">${all.length}</div><div class="stat-label">Images</div></div>
    <div class="stat-card tile-${t(noAlt)}" title="Images with no alt attribute. Empty alt (decorative images) isn’t counted."><div class="stat-value">${noAlt}</div><div class="stat-label">Missing alt</div></div>
    <div class="stat-card tile-${t(noDims)}"><div class="stat-value">${noDims}</div><div class="stat-label">No width/height</div></div>
    <div class="stat-card tile-${t(heavy)}"><div class="stat-value">${heavy}</div><div class="stat-label">Over 200 KB</div></div>
  </div>${known.length?`<div class="img-total">Total size: <strong>${fmtBytes(sum)}</strong> for ${known.length} of ${all.length} images.</div>`:''}`;
}
function renderImages(d,f){
  const total=(d.images||[]).length;const images=filterImages(d.images,f);
  return `<div class="fade-in">${renderImageStats(d.images||[])}
    <div id="imagesFilterBar">${renderImagesFilterBar(f,total,images.length,d.images||[])}</div>
    <div id="imagesTableWrap">${renderImagesTable(images,d.images,f.fullUrl)}</div></div>`}
/* ---- Structured data: visual entity graph (popup Graph view and HTML report) ----
   Every item (JSON-LD, @graph members, Microdata, RDFa) becomes a card. Nested items hang under their
   parent with the property name on the connector; {"@id": …} references become links to the card they point at. */
const SG_KINDS=[[/^(Organization|Corporation|LocalBusiness|Store|OnlineStore|Brand|NGO|EducationalOrganization)$|(Business|Store|Shop)$/,'org'],[/^(Person|ProfilePage)$/,'person'],
  [/^(Product|ProductGroup|ProductModel|Offer|AggregateOffer|OfferShippingDetails|MerchantReturnPolicy|PriceSpecification|UnitPriceSpecification|ShippingDeliveryTime|DefinedRegion|MonetaryAmount|QuantitativeValue)$/,'product'],
  [/^(BreadcrumbList|ListItem|ItemList|SiteNavigationElement)$/,'nav'],[/^(Review|AggregateRating|Rating)$/,'rating'],
  [/^(Article|NewsArticle|BlogPosting|TechArticle|WebPage|WebSite|AboutPage|ContactPage|CollectionPage|ItemPage|FAQPage|Question|Answer|HowTo|HowToStep|Recipe|VideoObject|ImageObject|CreativeWork|SearchAction|Event)$/,'content']];
const SG_KIND_LABEL={org:'Organization',person:'Person',product:'Product & offer',nav:'Navigation',rating:'Rating & review',content:'Page & content',other:'Other'};
const SG_IMG_KEYS=/^(image|logo|thumbnailUrl|contentUrl|photo|thumbnail|primaryImageOfPage)$/;
function sgTypes(t){return (Array.isArray(t)?t:[t]).filter(Boolean).flatMap(x=>String(x).split(/\s+/)).map(x=>x.replace(/^https?:\/\/(www\.)?schema\.org\//i,'')).filter(Boolean)}
function sgKind(types){for(const t of types)for(const[re,k]of SG_KINDS)if(re.test(t))return k;return 'other'}
function sgFromItem(it){/* Microdata/RDFa item {type, properties} → JSON-LD-like object */
  const conv=v=>v&&typeof v==='object'&&'properties' in v?sgFromItem(v):v;
  const o={'@type':sgTypes(it.type)};
  for(const[k,v]of Object.entries(it.properties||{}))o[k]=Array.isArray(v)?v.map(conv):conv(v);
  return o}
function sgRoots(d){
  const out=[];
  const addLd=o=>{if(!o||typeof o!=='object')return;if(Array.isArray(o)){o.forEach(addLd);return}if(Array.isArray(o['@graph'])){o['@graph'].forEach(addLd);return}out.push({src:'JSON-LD',o})};
  (d.jsonLd||[]).forEach(addLd);
  (d.microdata||[]).forEach(m=>out.push({src:'Microdata',o:sgFromItem(m)}));
  (d.rdfa||[]).forEach(m=>out.push({src:'RDFa',o:sgFromItem(m)}));
  return out}
const sgIsRef=o=>o&&typeof o==='object'&&!Array.isArray(o)&&o['@id']&&Object.keys(o).filter(k=>k!=='@id').length===0;
function sgShortId(id){const s=String(id);const h=s.indexOf('#');if(h>=0&&h<s.length-1)return s.slice(h);try{const u=new URL(s);return u.pathname==='/'?u.host:u.pathname}catch(e){return s.length>40?s.slice(0,40)+'…':s}}
function sgVal(k,v,isImg){
  if(v==null||v==='')return '<span class="sg-empty">empty</span>';
  if(typeof v!=='string')return `<span class="sg-num">${esc(String(v))}</span>`;
  if(/^https?:\/\/schema\.org\/[A-Z]\w*$/i.test(v)||/^(In|Out|Pre|Back|Discontinued|Limited|Online|Sold|Used|New|Refurbished|Damaged)[A-Z]\w+$/.test(v))return `<span class="sg-enum">${esc(v.replace(/^https?:\/\/schema\.org\//i,''))}</span>`;
  if(/^https?:\/\//i.test(v)){
    if(isImg||SG_IMG_KEYS.test(k))return `<span class="sg-imgv"><img src="${esc(v)}" alt="" loading="lazy" referrerpolicy="no-referrer"><a href="${esc(v)}" target="_blank" rel="noopener">${esc(fileName(v))}</a></span>`;
    let short=v;try{const u=new URL(v);short=(u.host.replace(/^www\./,'')+u.pathname+u.search).replace(/\/$/,'')}catch(e){}
    return `<a href="${esc(v)}" target="_blank" rel="noopener" title="${esc(v)}">${esc(short.length>70?short.slice(0,70)+'…':short)}</a>`}
  const t=v.replace(/\s+/g,' ').trim();
  return esc(t.length>180?t.slice(0,180)+'…':t)}
function sgStars(r){
  const val=parseFloat(r.ratingValue),best=parseFloat(r.bestRating)||5;if(!isFinite(val))return '';
  const pct=Math.max(0,Math.min(100,val/best*100));const n=r.reviewCount||r.ratingCount;
  return `<div class="sg-hl"><span class="sg-stars" title="${esc(val)} of ${esc(best)}"><span style="width:${pct.toFixed(0)}%">★★★★★</span>★★★★★</span><b>${esc(val)}</b><span class="sg-dim">/ ${esc(best)}${n?` from ${esc(n)} ${r.reviewCount?'reviews':'ratings'}`:''}</span></div>`}
function sgHighlights(o,types){
  let h='';
  if(types.includes('BreadcrumbList')&&Array.isArray(o.itemListElement)){
    const items=o.itemListElement.filter(x=>x&&typeof x==='object').slice().sort((a,b)=>(+a.position||0)-(+b.position||0));
    h+=`<div class="sg-hl sg-trail">${items.map(li=>{const it=li.item;const url=typeof it==='string'?it:it&&(it['@id']||it.url);const name=li.name||(it&&typeof it==='object'&&it.name)||(url?sgShortId(url):'(no name)');
      return url?`<a href="${esc(url)}" target="_blank" rel="noopener" title="${esc(url)}">${esc(name)}</a>`:`<span>${esc(name)}</span>`}).join('<span class="sg-sep">›</span>')}</div>`}
  if(types.some(t=>/Rating$/.test(t)))h+=sgStars(o);
  else if(o.aggregateRating&&typeof o.aggregateRating==='object'&&!sgIsRef(o.aggregateRating))h+=sgStars(o.aggregateRating);
  const offer=types.some(t=>/Offer$/.test(t))?o:null;
  if(offer&&(offer.price!=null||offer.lowPrice!=null)){
    const p=offer.price!=null?offer.price:`${offer.lowPrice}${offer.highPrice!=null?' – '+offer.highPrice:''}`;
    const av=offer.availability?String(offer.availability).replace(/^https?:\/\/schema\.org\//i,''):'';
    h+=`<div class="sg-hl"><span class="sg-price">${esc(p)} ${esc(offer.priceCurrency||'')}</span>${av?`<span class="sg-enum sg-av-${/InStock|OnlineOnly|InStoreOnly|LimitedAvailability|PreOrder|BackOrder/.test(av)?'ok':'no'}">${esc(av)}</span>`:''}</div>`}
  return h}
function sgCard(o,ctx,depth,anchor,src){
  const types=sgTypes(o['@type']),kind=sgKind(types),skip=new Set(['@context','@type','@id','@graph']);
  if(types.includes('BreadcrumbList'))skip.add('itemListElement');
  const props=[],kids=[];
  for(const[k,v]of Object.entries(o)){if(skip.has(k))continue;
    const vals=Array.isArray(v)?v:[v];const objs=vals.filter(x=>x&&typeof x==='object'),prims=vals.filter(x=>!(x&&typeof x==='object'));
    if(prims.length)props.push([k,prims]);if(objs.length)kids.push([k,objs])}
  const imgObj=types.includes('ImageObject');
  const row=([k,vals])=>`<div><dt>${esc(k)}</dt><dd>${vals.map(v=>sgVal(k,v,imgObj&&(k==='url'||k==='contentUrl'))).join('<br>')}</dd></div>`;
  const shown=props.slice(0,6),rest=props.slice(6);
  let h=`<div class="sg-node sg-k-${kind}"${anchor?` id="${anchor}"`:''}><div class="sg-head"><span class="sg-type">${esc(types.join(', ')||'Item')}</span>${src?`<span class="sg-src">${esc(src)}</span>`:''}${o['@id']?`<span class="sg-id" title="${esc(o['@id'])}">${esc(sgShortId(o['@id']))}</span>`:''}</div>`;
  h+=sgHighlights(o,types);
  if(props.length)h+=`<dl class="sg-props">${shown.map(row).join('')}${rest.length?`<details class="sg-more"><summary>${rest.length} more ${rest.length===1?'property':'properties'}</summary>${rest.map(row).join('')}</details>`:''}</dl>`;
  else if(!kids.length&&!h.includes('sg-hl'))h+='<div class="sg-dim sg-pad">No properties</div>';
  if(kids.length){
    h+='<div class="sg-kids">';
    kids.forEach(([k,objs])=>objs.forEach(c=>{
      h+=`<div class="sg-edge"><span class="sg-prop">${esc(k)}</span>`;
      if(sgIsRef(c)){const t=ctx.ids.get(c['@id']);h+=t?`<a class="sg-ref" href="#${t.anchor}">↗ ${esc(t.label)}<span class="sg-dim">${esc(sgShortId(c['@id']))}</span></a>`:`<span class="sg-ref sg-ref-x" title="${esc(c['@id'])}">↗ ${esc(sgShortId(c['@id']))}<span class="sg-dim">not on this page</span></span>`}
      else if(ctx.seen.has(c)||depth>=6)h+='<span class="sg-dim">(shown above)</span>';
      else{ctx.seen.add(c);const t=c['@id']&&ctx.ids.get(c['@id']);h+=sgCard(c,ctx,depth+1,t&&t.o===c?t.anchor:'')}
      h+='</div>'}));
    h+='</div>'}
  return h+'</div>'}
function buildSchemaGraph(d,prefix){
  const roots=sgRoots(d);
  if(!roots.length)return '';
  const ids=new Map(),counts={};
  let n=0;
  const walk=(o,isRoot)=>{if(!o||typeof o!=='object')return;if(Array.isArray(o)){o.forEach(x=>walk(x,false));return}
    if(sgIsRef(o))return;const types=sgTypes(o['@type']);
    if(types.length)types.forEach(t=>{counts[t]=counts[t]||{n:0,kind:sgKind([t])};counts[t].n++});
    if(o['@id']&&!ids.has(o['@id']))ids.set(o['@id'],{o,anchor:`${prefix||'sg'}-${n++}`,label:types.join(', ')||'Item'});
    Object.entries(o).forEach(([k,v])=>{if(k!=='@context')walk(v,false)})};
  roots.forEach(r=>walk(r.o,true));
  const ctx={ids,seen:new Set()};
  const chips=Object.entries(counts).sort((a,b)=>b[1].n-a[1].n).map(([t,c])=>`<span class="sg-chip sg-k-${c.kind}">${esc(t)}${c.n>1?` <b>×${c.n}</b>`:''}</span>`).join('');
  const kindsUsed=[...new Set(Object.values(counts).map(c=>c.kind))];
  const legend=kindsUsed.map(k=>`<span class="sg-lg sg-k-${k}"><i></i>${SG_KIND_LABEL[k]}</span>`).join('');
  const cards=roots.map((r,i)=>{ctx.seen.add(r.o);const t=r.o['@id']&&ids.get(r.o['@id']);return sgCard(r.o,ctx,0,t&&t.o===r.o?t.anchor:`${prefix||'sg'}-r${i}`,r.src)}).join('');
  return `<div class="sg"><div class="sg-summary"><div class="sg-chips">${chips}</div><div class="sg-legend">${legend}</div></div><div class="sg-roots">${cards}</div></div>`}
/* Styles shared by the popup and the report; the report maps these tokens to its own palette */
const SG_CSS=`.sg-summary{display:flex;flex-direction:column;gap:8px;margin-bottom:14px}
.sg-chips{display:flex;flex-wrap:wrap;gap:6px}.sg-chip{font-size:12px;font-weight:500;line-height:22px;padding:0 10px;border-radius:11px;background:color-mix(in srgb,var(--sgc) 14%,transparent);color:var(--text)}.sg-chip b{font-weight:600;color:var(--sgc)}
.sg-legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:11.5px;color:var(--text-2)}.sg-lg{display:inline-flex;align-items:center;gap:6px}.sg-lg i{width:10px;height:10px;border-radius:3px;background:var(--sgc)}
.sg-roots{display:flex;flex-direction:column;gap:12px}
.sg-node{border:1px solid var(--border);border-left:4px solid var(--sgc);border-radius:10px;background:var(--surface);min-width:0}
.sg-head{display:flex;align-items:center;flex-wrap:wrap;gap:6px 8px;padding:8px 12px;background:color-mix(in srgb,var(--sgc) 9%,transparent);border-radius:6px 9px 0 0}
.sg-type{font-weight:600;font-size:13.5px;color:var(--text)}.sg-src{font-size:11px;padding:0 7px;line-height:18px;border-radius:9px;background:var(--surface);color:var(--text-2);border:1px solid var(--border)}
.sg-id{margin-left:auto;font-family:var(--mono);font-size:11px;color:var(--text-2);max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sg-hl{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:8px 12px;border-bottom:1px solid var(--border-light);font-size:13px}
.sg-trail a,.sg-trail span{color:var(--blue-text)}.sg-trail span{color:var(--text)}.sg-trail .sg-sep{color:var(--text-3)}
.sg-stars{position:relative;display:inline-block;color:var(--border);letter-spacing:1px;font-size:15px;line-height:1}.sg-stars span{position:absolute;inset:0 auto 0 0;overflow:hidden;white-space:nowrap;color:#f5a623}
.sg-price{font-weight:600;font-size:15px;color:var(--text)}
.sg-enum{font-size:11.5px;padding:0 8px;line-height:20px;border-radius:10px;background:var(--surface-2);color:var(--text-2);border:1px solid var(--border-light)}.sg-av-ok{background:var(--green-bg);color:var(--green);border-color:transparent}.sg-av-no{background:var(--red-bg);color:var(--red);border-color:transparent}
.sg-props{margin:0;padding:4px 12px 8px}.sg-props div{display:grid;grid-template-columns:minmax(90px,32%) minmax(0,1fr);gap:10px;padding:4px 0;border-bottom:1px dashed var(--border-light);font-size:12.5px}.sg-props div:last-child{border-bottom:0}
.sg-props dt{color:var(--text-2);overflow-wrap:anywhere}.sg-props dd{margin:0;color:var(--text);overflow-wrap:anywhere}.sg-props a,.sg-ref{color:var(--blue-text);text-decoration:none}.sg-props a:hover,a.sg-ref:hover{text-decoration:underline}
.sg-num{font-variant-numeric:tabular-nums}.sg-empty,.sg-dim{color:var(--text-3)}.sg-pad{padding:8px 12px;font-size:12px}
.sg-imgv{display:inline-flex;align-items:center;gap:8px}.sg-imgv img{width:36px;height:36px;object-fit:contain;border-radius:4px;background:var(--surface-2);border:1px solid var(--border-light)}
.sg-more summary{cursor:pointer;font-size:12px;color:var(--blue-text);padding:4px 0;list-style:none}.sg-more summary::-webkit-details-marker{display:none}.sg-more[open] summary{color:var(--text-2)}
.sg-kids{padding:2px 10px 10px 20px;display:flex;flex-direction:column;gap:8px}
.sg-edge{position:relative;padding-left:16px}.sg-edge::before{content:"";position:absolute;left:0;top:-8px;bottom:0;border-left:1.5px solid var(--border)}.sg-edge:last-child::before{bottom:auto;height:20px}
.sg-edge::after{content:"";position:absolute;left:0;top:12px;width:12px;border-top:1.5px solid var(--border)}
.sg-prop{display:inline-block;font-family:var(--mono);font-size:11px;color:var(--text-2);margin:0 0 4px}
.sg-ref{display:inline-flex;align-items:center;gap:8px;margin-left:6px;font-size:12.5px;padding:3px 10px;border-radius:12px;border:1px dashed var(--border)}.sg-ref-x{color:var(--text-2)}
.sg-node:target{box-shadow:0 0 0 3px color-mix(in srgb,var(--sgc) 40%,transparent)}
.sg-k-org{--sgc:#1a73e8}.sg-k-person{--sgc:#00897b}.sg-k-product{--sgc:#188038}.sg-k-nav{--sgc:#e37400}.sg-k-rating{--sgc:#d93025}.sg-k-content{--sgc:#8e44c4}.sg-k-other{--sgc:#80868b}`;
