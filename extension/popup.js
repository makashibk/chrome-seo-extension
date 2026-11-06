/* Pure SEO – Popup Controller v2 */
let pageData=null,headerData=null,headersLoaded=false;
let extras={rawCanonical:undefined,rawError:null,canonStatus:undefined,xRobotsTag:[],robotsTxt:undefined,sitemaps:undefined};
let activeTab='content',sdView='normal';
let linkFilters={rel:'all',type:'all',status:'all',search:''};
let imageFilters={type:'all',search:''};
let contentFilters={heading:'all'};
const HL_DEFAULT_TYPES={nofollow:true,sponsored:true,ugc:true,external:false,broken:true};
let settings={theme:'system',defaultTab:'Last Opened',lastTab:'content',imgFullUrl:false,serpOpen:false,rawOnlyDiff:false,hl:{on:false,types:{...HL_DEFAULT_TYPES}}};
let rawState,rawPromise=null;   /* Raw vs rendered: undefined → 'loading' → result | {error} */
let currentTabId=null,currentUrl='',currentWindowId=null,currentTabIndex=null;

document.addEventListener('DOMContentLoaded',async()=>{
  /* Settings + active tab lookup run in parallel */
  const[[tab]]=await Promise.all([chrome.tabs.query({active:true,currentWindow:true}),loadSettings()]);
  settings.hl={on:false,...settings.hl};settings.hl.types={...HL_DEFAULT_TYPES,...settings.hl.types};
  applyTheme();
  imageFilters.fullUrl=!!settings.imgFullUrl;
  contentFilters.serpOpen=!!settings.serpOpen;
  activeTab=settings.defaultTab==='Last Opened'?(settings.lastTab||'content'):settings.defaultTab;
  setActiveTabUI();
  if(!tab)return;
  currentTabId=tab.id;currentUrl=tab.url||'';currentWindowId=tab.windowId;currentTabIndex=tab.index;
  const urlEl=document.getElementById('pageUrl');
  urlEl.textContent=currentUrl;urlEl.title=currentUrl;
  /* Start page extraction and header fetch at the same time */
  const extractP=chrome.scripting.executeScript({target:{tabId:tab.id},func:extractPageData});
  chrome.runtime.sendMessage({action:'getHeaders',tabId:tab.id},(res)=>{headersLoaded=true;if(res)headerData=res.headers;updateStatusBadge();maybeAutoRecheck();if(activeTab==='http-headers')renderActiveTab()});
  try{
    const results=await extractP;
    if(results&&results[0]){
      pageData=results[0].result;
      (pageData.images||[]).forEach(l=>annotateImage(l,pageData.dpr));
      updateStatusBadge();maybeAutoRecheck();renderActiveTab();
      if(settings.hl.on)applyHighlight();
    }
  }catch(e){document.getElementById('contentArea').innerHTML=pageHead(activeTab)+CANNOT_ANALYZE}
  bindEvents();
});

async function loadSettings(){try{const s=await chrome.storage.local.get(['seoext_settings']);if(s.seoext_settings)Object.assign(settings,s.seoext_settings);delete settings.serpCount}catch(e){}}
async function saveSettings(){try{await chrome.storage.local.set({seoext_settings:settings})}catch(e){}}
function applyTheme(){const r=document.documentElement;if(settings.theme==='dark')r.setAttribute('data-theme','dark');else if(settings.theme==='light')r.removeAttribute('data-theme');else{window.matchMedia('(prefers-color-scheme:dark)').matches?r.setAttribute('data-theme','dark'):r.removeAttribute('data-theme')}}

function setActiveTabUI(){document.querySelectorAll('.nav-item').forEach(t=>{t.classList.toggle('active',t.dataset.tab===activeTab)})}
function switchTab(tab){activeTab=tab;settings.lastTab=tab;saveSettings();setActiveTabUI();renderActiveTab()}

const PAGE_HEADS={
  'content':['Content','Title, description, headings and word count for this page.'],
  'images':['Images','Every image on the page with its alt text, title and HTTP status.'],
  'outgoing-links':['Links','Internal and external links with their rel value and HTTP status.'],
  'indexability':['Indexability','Signals that decide whether search engines can crawl and index this URL.'],
  'raw-rendered':['Raw vs rendered','The HTML the server sends compared with the page after JavaScript runs.'],
  'http-headers':['HTTP headers','Status code and response headers returned for this page.'],
  'structured-data':['Structured data','JSON-LD, Microdata and RDFa found on the page.'],
  'social-tags':['Social tags','Open Graph and Twitter Card tags used when the page is shared.'],
  'settings':['Settings','Theme, start section and keyboard shortcut.']
};
const CANNOT_ANALYZE='<div class="empty-state">This page can\u2019t be analyzed.<br><span class="text-sm">Chrome doesn\u2019t allow extensions on chrome:// pages, the Chrome Web Store or the new tab page. Open a website and try again.</span></div>';
function pageHead(tab){const h=PAGE_HEADS[tab];return h?`<div class="page-head"><h1>${h[0]}</h1><p>${h[1]}</p></div>`:''}

function renderActiveTab(){
  const a=document.getElementById('contentArea');
  if(!pageData&&activeTab!=='settings'&&activeTab!=='http-headers'){a.innerHTML=pageHead(activeTab)+CANNOT_ANALYZE;return}
  let html='';
  switch(activeTab){
    case'content':html=renderContent(pageData,contentFilters);break;
    case'indexability':ensureExtras();html=renderIndexability(pageData,extras);break;
    case'raw-rendered':
      if(typeof renderRawRendered==='function'&&rawState&&rawState!=='loading')html=renderRawRendered(pageData,rawState,settings.rawOnlyDiff);
      else{html='<div class="card"><div class="loading" style="padding:48px 0"><div class="spinner"></div><p>Fetching raw HTML</p></div></div>';ensureRaw()}
      break;
    case'structured-data':html=renderStructuredData(pageData,sdView);break;
    case'social-tags':html=renderSocialTags(pageData);break;
    case'http-headers':html=renderHttpHeaders(headerData,{...headerState(),checking:!!recheckP});break;
    case'images':html=renderImages(pageData,imageFilters);break;
    case'outgoing-links':html=renderOutgoingLinks(pageData,linkFilters);break;
    case'settings':html=renderSettings(settings);break;
  }
  a.innerHTML=pageHead(activeTab)+html;
  if(activeTab==='content')fitSerp();
  if(activeTab==='structured-data')bindSdEvents();
  else if(activeTab==='images')bindImageEvents();
  else if(activeTab==='outgoing-links')bindLinkEvents();
  else if(activeTab==='settings')bindSettingsEvents();
}

/* Only update the links table, not the filter bar - preserves search focus */
/* The SERP preview is laid out at Google's 600px column width, then scaled to fit the popup */
function fitSerp(){const w=document.querySelector('.serp-wrap');if(!w)return;const inner=w.clientWidth-32;w.querySelector('.serp').style.zoom=String(Math.min(1,inner/600))}

function updateLinksTableOnly(){
  const wrap=document.getElementById('linksTableWrap');
  if(!wrap||!pageData)return;
  const links=filterLinks(pageData.links,linkFilters);
  wrap.innerHTML=renderLinksTable(links,pageData.links);
}

function updateImagesTableOnly(){
  const wrap=document.getElementById('imagesTableWrap');
  if(!wrap||!pageData)return;
  const images=filterImages(pageData.images,imageFilters);
  wrap.innerHTML=renderImagesTable(images,pageData.images,imageFilters.fullUrl);
}

/* Headers are captured when the page loads. Single-page apps (Next.js, PWA Studio, Nuxt…) change the URL without
   a new request, so the captured status and headers can belong to an earlier URL. Compare before trusting them. */
const noHashUrl=u=>String(u||'').split('#')[0];
function headerState(){
  if(!headerData||!pageData)return{stale:false};
  const p=noHashUrl(pageData.url);
  const match=p===noHashUrl(headerData.url)||p===noHashUrl(headerData.startUrl);
  return{stale:!match,pageUrl:pageData.url,loadedUrl:headerData.url,recheck:!!headerData.recheck,ts:headerData.ts,error:headerData.error,checking:!!recheckP,reason:staleReason(),recheckReason:headerData.reason||''};
}
/* Why the tab had no matching request for this URL, read from the page's own navigation entry */
let lastAutoReason='';
function staleReason(){
  const n=(pageData&&pageData.nav)||{};
  if(n.prerendered)return 'Chrome preloaded this page before you opened it (it does this for addresses you type or links it expects you to click), so the extension didn’t see a request for it.';
  if(n.url&&noHashUrl(n.url)!==noHashUrl(pageData.url))return 'The site changed the address with JavaScript without loading a new page (single-page navigation).';
  /* Stored headers newer than this page: the page is a copy Chrome kept in memory (back/forward cache) */
  if(headerData&&headerData.ts&&n.loadedAt&&headerData.ts>n.loadedAt+500)return 'Chrome showed a copy of this page it kept in memory (for example after Back or Forward), so no new request was made.';
  return 'The extension didn’t see a request for this URL, for example because the site’s service worker answered it or the extension was installed after the page loaded.';
}
/* Headers missing or belonging to another URL: fetch them for this URL straight away (one request) */
let autoRechecked=false;
function maybeAutoRecheck(){
  if(autoRechecked||!pageData||!headersLoaded||!/^https?:/.test(pageData.url))return;
  if(headerData&&!headerState().stale)return;
  autoRechecked=true;lastAutoReason=headerData?staleReason():'';
  updateStatusBadge();
  recheckHeaders();
}
function updateStatusBadge(){
  const b=document.getElementById('statusBadge');if(!headerData&&!recheckP)return;
  const st=headerState();
  const c=headerData.statusCode||0;b.className='nav-badge';b.title='';
  if(recheckP){b.textContent='…';b.title='Fetching headers for this URL';extras.xRobotsStale=true;return}
  if(st.stale){b.textContent='?';b.classList.add('s-stale');b.title='Status is from an earlier URL in this tab. Open HTTP headers to re-check.';extras.xRobotsTag=[];extras.xRobotsStale=true;return}
  extras.xRobotsStale=false;
  b.textContent=c||'—';
  if(c>=200&&c<300)b.classList.add('s2xx');else if(c>=300&&c<400)b.classList.add('s3xx');else if(c>=400&&c<500)b.classList.add('s4xx');else if(c>=500)b.classList.add('s5xx');
  /* A response can carry several X-Robots-Tag headers; keep every one */
  extras.xRobotsTag=(headerData.headers||[]).filter(h=>h.name.toLowerCase()==='x-robots-tag').map(h=>h.value);
}
/* Re-check: a fresh request for the current URL; the result replaces the stored headers for this tab */
let recheckP=null;
function recheckHeaders(){
  if(!pageData)return Promise.resolve();
  if(recheckP)return recheckP;
  document.querySelectorAll('[data-recheck]').forEach(b=>{b.classList.add('spinning');b.disabled=true});
  if(!autoRechecked)autoRechecked=true;
  if(activeTab==='http-headers'||activeTab==='indexability')setTimeout(renderActiveTab,0);
  recheckP=new Promise(res=>chrome.runtime.sendMessage({action:'recheckHeaders',url:pageData.url,tabId:currentTabId,reason:lastAutoReason},(r)=>{
    if(r){headerData=r;headerData.reason=lastAutoReason}recheckP=null;updateStatusBadge();
    if(activeTab==='http-headers'||activeTab==='indexability')renderActiveTab();
    res(r)}));
  return recheckP;
}

/* Indexability checks (raw <head>, robots.txt, canonical status, sitemaps) send requests to the site,
   so they run only when the Indexability tab opens or a report is exported, once per popup. */
const msgP=(m)=>new Promise(r=>chrome.runtime.sendMessage(m,r));
let extrasP=null;
function ensureExtras(){if(!extrasP&&pageData)extrasP=fetchExtras();return extrasP||Promise.resolve()}
const rerenderIdx=()=>{if(activeTab==='indexability')renderActiveTab()};
async function fetchExtras(){
  const origin=new URL(pageData.url).origin;
  /* Raw (pre-JavaScript) canonical: the background reads only the <head> and returns the values */
  const rawP=msgP({action:'fetchRawHead',url:pageData.url}).then(res=>{
    if(res&&res.ok){extras.rawCanonicalAttr=res.canonicalAttr;extras.rawCanonical=res.canonical}
    else{extras.rawCanonical=null;extras.rawError=res?(res.status||res.error||'failed'):'failed'}
    rerenderIdx();
    if(!pageData.canonical)return checkCanonicalStatus(extras.rawCanonical);
  });
  const canonP=pageData.canonical?checkCanonicalStatus(pageData.canonical):null;
  const robotsUrl=origin+'/robots.txt';
  const robotsP=msgP({action:'fetchRobotsTxt',url:robotsUrl}).then(res=>{
    extras.robotsTxt=classifyRobots(res,robotsUrl,pageData.url);rerenderIdx();
    return extras.robotsTxt.state==='ok'?parseSitemapsFromRobots(extras.robotsTxt.sitemaps,origin):checkDefaultSitemap(origin);
  });
  await Promise.all([rawP,canonP,robotsP]);
}

/* Status of the canonical target (HEAD, falls back to GET; redirects are followed and reported) */
function checkCanonicalStatus(url){
  if(!url){extras.canonStatus=null;return Promise.resolve()}
  extras.canonStatus=undefined;
  return msgP({action:'checkUrlStatus',url}).then(res=>{extras.canonStatus=res||{ok:false,status:0,error:'failed'};extras.canonStatus.url=url;rerenderIdx()});
}

/* How Google treats the robots.txt response (Google Search Central, robots.txt spec):
   2xx = parse rules; 4xx except 429 = no restrictions; 429/5xx = whole site treated as disallowed */
function classifyRobots(res,robotsUrl,pageUrl){
  const st=res?res.status:0;
  const base={url:robotsUrl,status:st,finalUrl:res&&res.finalUrl||robotsUrl};
  if(!res||st===0)return{...base,state:'unreachable',error:res&&res.error||'network error'};
  if(st>=200&&st<300){const parsed=parseRobotsTxt(res.text);const test=robotsTest(parsed,pageUrl,'googlebot');
    /* When a Googlebot group exists, Googlebot ignores the * group. Note it when the * rules would decide differently. */
    if(test.agent==='googlebot'){const star=robotsTest(parsed,pageUrl,'*');if(star.agent==='*'&&star.allowed!==test.allowed)test.starDiffers=star}
    return{...base,state:'ok',sitemaps:parsed.sitemaps,test}}
  if(st===429||st>=500)return{...base,state:'server-error',test:{allowed:false,rule:null,serverError:true}};
  if(st>=400)return{...base,state:'no-file',test:{allowed:true,rule:null,noFile:true}};
  return{...base,state:'unreachable',error:'unexpected status '+st};
}

function parseSitemapsFromRobots(urls,origin){
  if(!urls||!urls.length)return checkDefaultSitemap(origin);
  extras.sitemaps=[];
  return Promise.all(urls.map(url=>msgP({action:'fetchSitemap',url}).then(res=>{extras.sitemaps.push({url,ok:res&&res.ok})}))).then(rerenderIdx);
}

function checkDefaultSitemap(origin){
  const url=origin+'/sitemap.xml';
  return msgP({action:'fetchSitemap',url}).then(res=>{extras.sitemaps=[{url,ok:res&&res.ok}];rerenderIdx()});
}

/* Loads an extension script once, on first use (keeps the popup fast to open) */
const _scripts={};
function loadScript(src,ready){
  if(ready())return Promise.resolve();
  if(!_scripts[src])_scripts[src]=new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=()=>{delete _scripts[src];rej(new Error(src+' failed to load'))};document.head.appendChild(s)});
  return _scripts[src];
}
function withTimeout(p,ms){return Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),ms))])}

/* Raw vs rendered: fetched only when the tab or the report needs it */
function ensureRaw(){
  if(rawPromise)return rawPromise;
  rawState='loading';
  rawPromise=(async()=>{
    try{
      const wordsP=pageData.textWords!=null?null:chrome.scripting.executeScript({target:{tabId:currentTabId},func:countAllWords}).then(r=>{pageData.textWords=r&&r[0]?r[0].result:null}).catch(()=>{});
      const [res]=await Promise.all([new Promise(r=>chrome.runtime.sendMessage({action:'fetchRawHtml',url:pageData.url},r)),loadScript('compare.js',()=>typeof buildRawDiff==='function'),wordsP]);
      if(!res||(!res.status&&!res.text))rawState={error:res&&res.error||'request failed'};
      else rawState=buildRawDiff(pageData,rawData(res.text||'',res.finalUrl||pageData.url),res);
    }catch(e){rawState={error:e.message||'failed'}}
    if(activeTab==='raw-rendered')renderActiveTab();
    return rawState;
  })();
  return rawPromise;
}
function resetRaw(){rawState=undefined;rawPromise=null}

/* ---- Link highlighting on the page ----
   Attributes are set by an injected function; colours come from insertCSS (user origin, so page CSS and
   page CSP can't block or override it). Category on/off only changes one attribute on <html>. */
function hlSettings(){return settings.hl}
/* Broken goes first so a link that is e.g. nofollow AND broken keeps its nofollow colour; broken then adds a
   dashed outline and a strike-through, so both facts stay visible */
const hlRgb=c=>c.match(/\w\w/g).map(h=>parseInt(h,16)).join(',');
const HL_CSS=[...HL_TYPES.filter(t=>t[0]==='broken'),...HL_TYPES.filter(t=>t[0]!=='broken')].map(([k,,c])=>
  `html[data-seoext-hl~="${k}"] a[data-seoext-link~="${k}"]{outline:2px solid ${c} !important;outline-offset:1px !important;background-color:rgba(${hlRgb(c)},.14) !important}`).join('\n')+`
html[data-seoext-hl~="broken"] a[data-seoext-link~="broken"]{outline-style:dashed !important;text-decoration:line-through wavy #c2185b !important}
`+HL_TYPES.map(([k,,c])=>`#seoext-hl-legend .sx-dot-${k}{background:${c} !important}`).join('\n')+`
#seoext-hl-legend .sx-dot-broken{background:repeating-linear-gradient(45deg,#c2185b 0 2px,#fff 2px 4px) !important;box-shadow:inset 0 0 0 1px #c2185b !important}
#seoext-hl-legend,#seoext-hl-legend *{all:revert !important}
#seoext-hl-legend{position:fixed !important;right:16px !important;bottom:16px !important;z-index:2147483647 !important;display:block !important;box-sizing:border-box !important;min-width:170px !important;padding:10px 12px !important;background:#fff !important;color:#202124 !important;border-radius:8px !important;box-shadow:0 2px 12px rgba(0,0,0,.28) !important;font:12px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif !important;text-align:left !important}
#seoext-hl-legend .sx-head{display:flex !important;align-items:center !important;justify-content:space-between !important;gap:12px !important;font-weight:600 !important;margin:0 0 6px !important}
#seoext-hl-legend .sx-x{-webkit-appearance:none !important;appearance:none !important;border:0 !important;outline:0 !important;box-shadow:none !important;background:transparent !important;cursor:pointer !important;font:18px/1 system-ui,sans-serif !important;color:#5f6368 !important;padding:0 2px !important;margin:0 !important}
#seoext-hl-legend .sx-x:hover{color:#202124 !important}
#seoext-hl-legend .sx-row{display:flex !important;align-items:center !important;gap:8px !important;margin:2px 0 !important}
#seoext-hl-legend .sx-dot{display:inline-block !important;width:10px !important;height:10px !important;border-radius:2px !important;flex-shrink:0 !important}
#seoext-hl-legend .sx-n{margin-left:auto !important;padding-left:12px !important;color:#5f6368 !important;font-variant-numeric:tabular-nums !important}`;

/* Runs inside the page (isolated world). Must stay self-contained: it's serialised by executeScript. */
function pageHighlight(on,types,broken,brokenChecked,labels){
  const root=document.documentElement;
  const clear=()=>{document.querySelectorAll('[data-seoext-link]').forEach(a=>a.removeAttribute('data-seoext-link'));root.removeAttribute('data-seoext-hl');delete root.dataset.seoextSig;const l=document.getElementById('seoext-hl-legend');if(l)l.remove()};
  /* Already showing exactly these highlights (popup reopened): leave the page alone, no re-marking or restyle */
  const sig=JSON.stringify([types,broken,brokenChecked,labels.map(l=>l[0])]);
  if(on&&root.dataset.seoextSig===sig&&document.getElementById('seoext-hl-legend'))return{cssNeeded:false};
  clear();
  if(!on){window.__seoextHlCss=false;return{cssNeeded:false}}   /* the stylesheet is removed too, so add it again next time */
  root.dataset.seoextSig=sig;
  const brokenSet=new Set(broken),host=location.hostname,counts={};
  document.querySelectorAll('a[href]').forEach(a=>{
    let href=a.href;
    if(typeof href!=='string'){try{href=new URL(a.getAttribute('href'),document.baseURI).href}catch(e){return}}
    if(!href||href.startsWith('javascript:'))return;
    const rel=(a.getAttribute('rel')||'').toLowerCase().split(/\s+/),t=[];
    if(rel.includes('nofollow'))t.push('nofollow');
    if(rel.includes('sponsored'))t.push('sponsored');
    if(rel.includes('ugc'))t.push('ugc');
    if(!t.length){try{if(new URL(href).hostname!==host)t.push('external')}catch(e){}}
    if(brokenSet.has(href))t.push('broken');
    if(t.length){a.setAttribute('data-seoext-link',t.join(' '));t.forEach(k=>{counts[k]=(counts[k]||0)+1})}
  });
  root.setAttribute('data-seoext-hl',types.join(' '));
  const box=document.createElement('div');box.id='seoext-hl-legend';
  const head=document.createElement('div');head.className='sx-head';head.textContent='Link highlights';
  const x=document.createElement('button');x.className='sx-x';x.type='button';x.title='Remove highlights from this page';x.textContent='×';x.addEventListener('click',clear);
  head.appendChild(x);box.appendChild(head);
  labels.forEach(([k,label,color])=>{
    const r=document.createElement('div');r.className='sx-row';
    const dot=document.createElement('span');dot.className='sx-dot sx-dot-'+k;
    const name=document.createElement('span');name.textContent=label;
    const n=document.createElement('span');n.className='sx-n';n.textContent=k==='broken'&&!brokenChecked?'not checked':String(counts[k]||0);
    r.append(dot,name,n);box.appendChild(r);
  });
  (document.body||root).appendChild(box);
  const first=!window.__seoextHlCss;window.__seoextHlCss=true;
  return{cssNeeded:first};
}
async function applyHighlight(){
  if(currentTabId==null||!pageData)return;
  const hl=settings.hl,on=hl.types;
  const types=HL_TYPES.map(t=>t[0]).filter(k=>on[k]);
  const links=pageData.links||[];
  const brokenChecked=links.some(l=>l.status!==undefined);
  const broken=links.filter(l=>typeof l.status==='number'&&l.status>=400).map(l=>l.url);
  const labels=HL_TYPES.filter(t=>on[t[0]]);
  try{
    const [r]=await chrome.scripting.executeScript({target:{tabId:currentTabId},func:pageHighlight,args:[hl.on,types,broken,brokenChecked,labels]});
    if(hl.on&&r&&r.result&&r.result.cssNeeded)await chrome.scripting.insertCSS({target:{tabId:currentTabId},css:HL_CSS,origin:'USER'});
    else if(!hl.on)await chrome.scripting.removeCSS({target:{tabId:currentTabId},css:HL_CSS,origin:'USER'}).catch(()=>{});   /* off = nothing of ours left on the page */
  }catch(e){}
}

/* ---- Full report export ---- */
/* Files are handed to the background as a data URL and saved with chrome.downloads, so the download survives
   the popup closing (Save As dialog, incognito). Resolves to 'saved' | 'cancelled' | 'failed'. */
function saveBlob(blob,filename){
  return new Promise(resolve=>{
    const r=new FileReader();
    r.onerror=()=>resolve('failed');
    r.onload=()=>chrome.runtime.sendMessage({action:'download',dataUrl:r.result,filename},(res)=>{
      if(chrome.runtime.lastError||!res)return resolve('failed');
      resolve(res.ok?'saved':res.error==='USER_CANCELED'?'cancelled':'failed');
    });
    r.readAsDataURL(blob);
  });
}
/* Google Sans (bundled) is embedded in the HTML report so it looks the same on any computer */
let _fontB64=null;
async function reportFont(){
  if(_fontB64!==null)return _fontB64;
  try{const buf=await (await fetch(chrome.runtime.getURL('fonts/google-sans-latin-wght-normal.woff2'))).arrayBuffer();
    _fontB64=bytesToB64(new Uint8Array(buf))}
  catch(e){_fontB64=''}
  return _fontB64;
}
/* The site's favicon is embedded in the HTML report (data URI) so the snippet shows it offline too */
function bytesToB64(b){let s='';for(let i=0;i<b.length;i+=0x8000)s+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000));return btoa(s)}
async function reportFavicon(){
  const tries=[pageData.favicon];
  try{const ico=new URL(pageData.url).origin+'/favicon.ico';if(!tries.includes(ico))tries.push(ico)}catch(e){}
  for(const u of tries){
    if(!u||!/^https?:|^data:image\//i.test(u))continue;
    if(u.startsWith('data:'))return u;
    try{const r=await fetch(u,{signal:AbortSignal.timeout(4000),credentials:'omit'});
      const type=(r.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
      if(!r.ok||!/^image\//.test(type))continue;
      const b=new Uint8Array(await r.arrayBuffer());
      if(!b.length||b.length>150*1024)continue;
      return `data:${type};base64,${bytesToB64(b)}`;
    }catch(e){}
  }
  return '';
}
async function exportReport(kind){
  const btn=document.getElementById('exportBtn'),label=btn.querySelector('span');
  if(!pageData||btn.disabled)return;
  btn.disabled=true;btn.classList.add('busy');label.textContent='Preparing';
  try{
    await Promise.all([loadScript('compare.js',()=>typeof buildRawDiff==='function'),kind==='xlsx'?loadXlsx():Promise.resolve()]);
    await loadScript('report.js',()=>typeof buildHtmlReport==='function');
    /* Status and size of every link and image run alongside the raw-HTML fetch, so the report never leaves them blank */
    const prog={links:[0,0],images:[0,0]};
    const show=()=>{const d=prog.links[0]+prog.images[0],t=prog.links[1]+prog.images[1];if(t&&d<t)label.textContent=`Checking ${d} of ${t}`};
    const checksP=withTimeout(Promise.all([
      checkStatuses('links',(d,t)=>{prog.links=[d,t];show()}),
      checkStatuses('images',(d,t)=>{prog.images=[d,t];show()})
    ]),120000).catch(()=>{});
    const [rawRes,font,favicon]=await Promise.all([withTimeout(ensureRaw(),20000).catch(()=>({error:'timed out'})),kind==='html'?reportFont():'',kind==='html'?reportFavicon():'',withTimeout(ensureExtras(),20000).catch(()=>{})]);
    if(headerState().stale||!headerData)await withTimeout(recheckHeaders(),20000).catch(()=>{});
    await checksP;
    label.textContent='Preparing';
    const checks={links:summaryOf('links'),images:summaryOf('images'),at:new Date()};
    const ctx={d:pageData,x:extras,hd:headerState().stale?null:headerData,raw:rawRes,at:new Date(),font,favicon,checks};
    label.textContent='Saving';
    const blob=kind==='html'?new Blob([buildHtmlReport(ctx)],{type:'text/html'}):new Blob([await XL.write(buildWorkbook(ctx))],{type:XL.MIME});
    const result=await saveBlob(blob,reportFileName(ctx,kind));
    btn.classList.remove('busy');
    if(result==='saved'){btn.classList.add('done');label.textContent='Saved'}
    else if(result==='cancelled'){label.textContent='Cancelled'}
    else{btn.classList.add('failed');label.textContent='Not saved';btn.title='The file couldn’t be saved. Try again.'}
  }catch(e){btn.classList.remove('busy');btn.classList.add('failed');label.textContent='Export failed';btn.title=e.message||'Export failed'}
  setTimeout(()=>{btn.disabled=false;btn.classList.remove('busy','done','failed');label.textContent='Report';btn.title='Export full report'},2200);
}

function bindEvents(){
  document.getElementById('contentArea').addEventListener('click',e=>{const b=e.target.closest('[data-recheck]');if(b){e.preventDefault();recheckHeaders()}});
  /* Sidebar nav */
  document.getElementById('sidebarNav').addEventListener('click',e=>{const btn=e.target.closest('.nav-item');if(btn&&btn.dataset.tab)switchTab(btn.dataset.tab)});
  document.querySelector('.sidebar-footer').addEventListener('click',e=>{const btn=e.target.closest('.nav-item');if(btn&&btn.dataset.tab)switchTab(btn.dataset.tab)});
  /* Close open dropdowns on outside click (bound once, not on every links re-render) */
  document.addEventListener('click',()=>{document.querySelectorAll('.export-wrap.open').forEach(d=>d.classList.remove('open'));const eb=document.getElementById('exportBtn');if(eb)eb.setAttribute('aria-expanded','false')});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){const w=document.getElementById('exportWrap');if(w&&w.classList.contains('open')){w.classList.remove('open');document.getElementById('exportBtn').focus()}}});
  /* Export report menu */
  const exWrap=document.getElementById('exportWrap'),exBtn=document.getElementById('exportBtn');
  if(!pageData)exBtn.disabled=true;
  exBtn.addEventListener('click',e=>{e.stopPropagation();const open=exWrap.classList.toggle('open');exBtn.setAttribute('aria-expanded',String(open))});
  document.getElementById('exportMenu').addEventListener('click',e=>{const b=e.target.closest('[data-export]');if(!b)return;e.stopPropagation();exWrap.classList.remove('open');exBtn.setAttribute('aria-expanded','false');exportReport(b.dataset.export)});
  /* Hide image thumbnails that fail to load */
  document.getElementById('contentArea').addEventListener('error',e=>{const fi=e.target.dataset&&e.target.dataset.letter;if(fi){e.target.replaceWith(document.createTextNode(fi));return}if(e.target.classList&&e.target.classList.contains('img-thumb')){const s=document.createElement('span');s.className='img-thumb img-thumb-empty';s.title='Image could not be loaded';e.target.replaceWith(s)}},true);
  /* Copy URL */
  document.getElementById('copyUrlBtn').addEventListener('click',function(){navigator.clipboard.writeText(currentUrl);this.classList.add('copied');setTimeout(()=>this.classList.remove('copied'),1500)});
  /* Collapsible + JSON toggle (delegated) */
  document.getElementById('contentArea').addEventListener('click',e=>{
    const hdr=e.target.closest('.collapsible-header');
    if(hdr){hdr.classList.toggle('open');const b=document.getElementById(hdr.dataset.target);if(b)b.classList.toggle('open');return}
    const tgl=e.target.closest('.json-toggle');
    if(tgl){tgl.classList.toggle('open');const ch=tgl.nextElementSibling;if(ch&&ch.classList.contains('json-children'))ch.classList.toggle('collapsed');return}
    /* New-tab links open next to the analysed tab in the same window, so an incognito window keeps them incognito */
    const lnk=e.target.closest('a[target="_blank"]');
    if(lnk&&lnk.href&&/^https?:/i.test(lnk.href)&&currentWindowId!=null&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey){
      e.preventDefault();
      chrome.tabs.create({url:lnk.href,windowId:currentWindowId,index:currentTabIndex!=null?currentTabIndex+1:undefined,openerTabId:currentTabId,active:true}).catch(()=>window.open(lnk.href,'_blank','noopener'));
      return;
    }
    const cpBtn=e.target.closest('.copy-btn');
    if(cpBtn){const val=cpBtn.dataset.copy;if(val){navigator.clipboard.writeText(val);cpBtn.classList.add('copied');setTimeout(()=>cpBtn.classList.remove('copied'),1200)}}
  });
  /* Content events */
  document.getElementById('contentArea').addEventListener('click',e=>{
    /* Search preview is built only when the user switches it on; the choice is remembered */
    if(e.target.closest('#serpToggle')){
      const area=document.getElementById('contentArea'),top=area.scrollTop;
      contentFilters.serpOpen=!contentFilters.serpOpen;settings.serpOpen=contentFilters.serpOpen;saveSettings();
      renderActiveTab();area.scrollTop=top;
      const t=document.getElementById('serpToggle');if(t)t.focus();
      return;
    }
    if(e.target.closest('#rawOnlyDiff')){settings.rawOnlyDiff=!settings.rawOnlyDiff;saveSettings();renderActiveTab();return}
    if(e.target.closest('#rawRetry')){resetRaw();renderActiveTab();return}
    const ch=e.target.closest('#copyHeadingsBtn');
    if(ch&&pageData){
      let hdgs=pageData.headings||[];
      if(contentFilters.heading!=='all')hdgs=hdgs.filter(h=>h.tag===contentFilters.heading);
      const text=hdgs.map(h=>`${h.tag.toUpperCase()}: ${h.text}`).join('\n');
      navigator.clipboard.writeText(text);
      const orig=ch.innerHTML;
      ch.innerHTML='<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copied';
      ch.style.color='var(--green)';ch.style.borderColor='var(--green)';
      setTimeout(()=>{ch.innerHTML=orig;ch.style=''},2000);
    }
    const hBtn=e.target.closest('[data-filter="heading"]');
    if(hBtn){
      contentFilters.heading=hBtn.dataset.val;
      renderActiveTab();
    }
  });
}

/* Runs worker over items with at most `limit` in flight; worker calls done() when finished */
function runPool(items,limit,worker){let i=0;const next=()=>{if(i<items.length){const k=i++;worker(items[k],k,next)}};for(let n=Math.min(limit,items.length);n>0;n--)next()}
const STATUS_CONCURRENCY=8;
/* Status (and, for images, size) checks shared by the Check buttons and the report export.
   Only items not checked yet are requested; cells on screen update as answers arrive. */
const statusRuns={links:null,images:null};
function checkStatuses(kind,onProgress){
  if(!pageData)return Promise.resolve({checked:0,total:0});
  if(statusRuns[kind])return statusRuns[kind].p;   /* a check already running: wait for it */
  const all=(kind==='links'?pageData.links:pageData.images)||[];
  /* One request per URL: a page often links the same URL several times (menu, footer, rel variants) */
  const groups=new Map();
  all.forEach((l,i)=>{if(l.status!==undefined)return;const u=kind==='links'?l.url:(l.cur||l.url);if(!groups.has(u))groups.set(u,[]);groups.get(u).push([l,i])});
  const todo=[...groups.entries()];
  const btn=document.getElementById(kind==='links'?'refreshStatus':'refreshImageStatus');
  if(!todo.length)return Promise.resolve(summaryOf(kind));
  if(btn)btn.classList.add('spinning');
  let done=0;
  const run={p:null};statusRuns[kind]=run;
  run.p=new Promise(resolve=>{
    runPool(todo,STATUS_CONCURRENCY,([u,items],k,next)=>{
      chrome.runtime.sendMessage({action:'checkUrlStatus',url:u,image:kind==='images'},(res)=>{
        items.forEach(([l,i])=>{
          l.status=res&&res.status?res.status:'err';l.redirected=!!(res&&res.redirected);l.finalUrl=res&&res.finalUrl;
          l.error=res&&res.error||null;l.scheme=res&&res.scheme||null;
          if(kind==='images'&&res&&res.ok){if(l.bytes==null&&res.size)l.bytes=res.size;const f=fmtFromType(res.contentType);if(f)l.srvFmt=f;annotateImage(l,pageData.dpr)}
          const cell=document.querySelector(`${kind==='links'?'.link-status':'.img-status'}[data-idx="${i}"]`);
          if(cell)cell.innerHTML=statusChip(l);
          if(kind==='images'){const meta=document.querySelector(`.img-meta[data-idx="${i}"]`);if(meta)meta.innerHTML=imgMetaHtml(l)}
        });
        done++;
        if(onProgress)onProgress(done,todo.length);
        if(done>=todo.length){
          statusRuns[kind]=null;pageData[kind+'CheckedAt']=Date.now();
          const b=document.getElementById(kind==='links'?'refreshStatus':'refreshImageStatus');if(b)b.classList.remove('spinning');
          if(kind==='links'&&settings.hl.on&&settings.hl.types.broken)applyHighlight();
          if(activeTab===(kind==='links'?'outgoing-links':'images'))rerenderKeep(kind==='links'?'linkSearch':'imgSearch');
          resolve(summaryOf(kind));
        }
        next()})})
  });
  return run.p;
}
function summaryOf(kind){const all=(kind==='links'?pageData.links:pageData.images)||[];return{checked:all.filter(l=>l.status!==undefined).length,total:all.length,at:pageData[kind+'CheckedAt']||null}}

function bindSdEvents(){document.querySelectorAll('.sd-toggle-btn').forEach(b=>{b.addEventListener('click',()=>{sdView=b.dataset.view;renderActiveTab()})})}

/* Re-render the tab but keep the scroll position and, if the search box had focus, keep typing in it */
function rerenderKeep(searchId){
  const a=document.getElementById('contentArea'),top=a.scrollTop;
  const wasSearch=document.activeElement&&document.activeElement.id===searchId;
  renderActiveTab();a.scrollTop=top;
  if(wasSearch){const si=document.getElementById(searchId);if(si){si.focus();si.setSelectionRange(si.value.length,si.value.length)}}
}

function bindLinkEvents(){
  document.querySelectorAll('#linksFilterBar [data-filter]').forEach(btn=>{
    btn.addEventListener('click',()=>{linkFilters[btn.dataset.filter]=btn.dataset.val;rerenderKeep('linkSearch')});
  });
  const hlT=document.getElementById('hlToggle');
  if(hlT)hlT.addEventListener('click',()=>{settings.hl.on=!settings.hl.on;saveSettings();applyHighlight();rerenderKeep()});
  document.querySelectorAll('input[data-hl]').forEach(cb=>cb.addEventListener('change',()=>{settings.hl.types[cb.dataset.hl]=cb.checked;saveSettings();if(settings.hl.on)applyHighlight()}));
  /* Search - only update table, NOT the whole tab */
  const search=document.getElementById('linkSearch');
  if(search){let timer;search.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{linkFilters.search=search.value;updateLinksTableOnly()},150)})}
  /* Check status: re-checks every link (Check status means "check now") */
  const rb=document.getElementById('refreshStatus');
  if(rb)rb.addEventListener('click',()=>{if(rb.classList.contains('spinning')||statusRuns.links)return;(pageData.links||[]).forEach(l=>{delete l.status;delete l.redirected;delete l.error});checkStatuses('links')});
  const eb=document.getElementById('exportLinksBtn');
  if(eb){eb.addEventListener('click',()=>{
    const data=filterLinks(pageData.links,linkFilters).map(l=>({URL:l.url,'Anchor text':l.text||'',Type:l.isExternal?'External':'Internal',Attribute:l.rel,Status:statusText(l)}));
    downloadXlsx(data,'pure-seo-links.xlsx','Links',[70,36,10,12,16]);
  })}
}

function bindImageEvents(){
  const sel=document.getElementById('imgFilter');
  if(sel)sel.addEventListener('change',()=>{imageFilters.type=sel.value;rerenderKeep('imgSearch')});
  /* Full URL toggle lives in the table head, which is redrawn on search: delegate from the wrapper */
  const tw=document.getElementById('imagesTableWrap');
  if(tw)tw.addEventListener('change',e=>{if(e.target.id!=='imgFullUrl')return;imageFilters.fullUrl=e.target.checked;settings.imgFullUrl=e.target.checked;saveSettings();updateImagesTableOnly()});
  const search=document.getElementById('imgSearch');
  if(search){let timer;search.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{imageFilters.search=search.value;updateImagesTableOnly()},150)})}
  const rb=document.getElementById('refreshImageStatus');
  if(rb)rb.addEventListener('click',()=>{if(rb.classList.contains('spinning')||statusRuns.images)return;(pageData.images||[]).forEach(l=>{delete l.status;delete l.redirected;delete l.error});checkStatuses('images')});
  document.querySelectorAll('[data-qf]').forEach(b=>b.addEventListener('click',()=>{imageFilters.type=imageFilters.type===b.dataset.qf?'all':b.dataset.qf;rerenderKeep('imgSearch')}));
  const eb=document.getElementById('exportImagesBtn');
  if(eb){eb.addEventListener('click',()=>{
    const images=filterImages(pageData.images,imageFilters);
    const data=images.map(l=>({URL:l.url,Alt:l.alt==null?'(missing)':l.alt,Title:l.title||'',Format:l.fmt||'','Size (KB)':l.bytes!=null?Math.round(l.bytes/102.4)/10:'','Width/height attrs':l.sized?'Yes':'No',Intrinsic:l.nw?`${l.nw}×${l.nh}`:'','On screen':l.dw?`${l.dw}×${l.dh}`:'',Heavy:l.heavy?'Yes':'',Oversized:l.oversized?'Yes':'',Status:statusText(l)}));
    downloadXlsx(data,'pure-seo-images.xlsx','Images',[64,32,20,9,10,12,12,12,8,10,10]);
  })}
}

/* Spreadsheet writer (~10 KB) loads only when an export is clicked */
function loadXlsx(){return loadScript('xlsx-lite.js',()=>typeof XL!=='undefined')}
function quickStatusStyle(v){const t=String(v||'');if(/^No response/.test(t))return 'medium';if(/not checked/.test(t))return 'neutral';const n=parseInt(t,10);if(!n)return null;return n>=400?'high':n>=300?'low':'pass'}

async function downloadXlsx(data,filename,sheetName,cols){
  try{await loadXlsx()}catch(e){alert('Spreadsheet export failed to load (xlsx-lite.js).');return}
  const wb=XL.book();
  XL.table(wb,sheetName||'Sheet1',data,{cols,link:(k,v)=>k==='URL'&&/^https?:\/\//i.test(v)?v:null,style:(k,v)=>k==='Status'?quickStatusStyle(v):null});
  return saveBlob(new Blob([await XL.write(wb)],{type:XL.MIME}),filename);
}

function bindSettingsEvents(){
  document.querySelectorAll('.radio-option[data-theme]').forEach(b=>{b.addEventListener('click',()=>{settings.theme=b.dataset.theme;saveSettings();applyTheme();renderActiveTab()})});
  const sel=document.getElementById('defaultTabSelect');if(sel)sel.addEventListener('change',()=>{settings.defaultTab=sel.value;saveSettings()});
  const link=document.getElementById('shortcutLink');if(link)link.addEventListener('click',()=>{chrome.tabs.create({url:'chrome://extensions/shortcuts'})});
}