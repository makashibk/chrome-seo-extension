"""Regenerates the README screenshots.

Runs the real popup code from ../../extension in Chromium, with chrome.* APIs replaced by mock.js and a
demo product page (site/) served on shop.example.com through Playwright request routing. Nothing goes
to the network.

    pip install playwright && playwright install chromium
    python tools/screenshots/shoot.py      # writes PNGs to tools/screenshots/out/
"""
import asyncio, json, mimetypes, os, sys, base64
from pathlib import Path
from playwright.async_api import async_playwright

HERE = Path(__file__).resolve().parent
EXT = HERE.parents[1] / 'extension'
SITE = HERE / 'site'
MOCK = HERE / 'mock.js'
OUT = HERE / 'out'; OUT.mkdir(exist_ok=True)
ORIGIN = 'https://shop.example.com'
DEMO = ORIGIN + '/trail-running-shoes/ridgeline/'
mimetypes.add_type('image/webp', '.webp')
CORS = {'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-length, content-type'}

# status table for link targets
STATUS = {
    ORIGIN + '/size-guide-old/': (301, ORIGIN + '/size-guide/'),
    ORIGIN + '/shipping-policy/': (404, None),
    'https://old-partner.example.net/northpeak': (410, None),
}
ABORT = {'https://www.instagram.example/northpeak'}

def popup_html():
    s = (EXT / 'popup.html').read_text()
    return s.replace('<script src="extract.js"></script>', '<script src="mock.js"></script>\n  <script src="extract.js"></script>')

async def route(r):
    url = r.request.url.split('#')[0]
    path = url[len(ORIGIN):] if url.startswith(ORIGIN) else None
    if url in ABORT:
        return await r.abort('namenotresolved')
    if url in STATUS:
        code, loc = STATUS[url]
        h = dict(CORS, **({'location': loc} if loc else {}))
        return await r.fulfill(status=code, headers=h, body='' if loc else '<h1>Not found</h1>', content_type='text/html')
    if path is not None:
        if path.startswith('/__ext/'):
            rel = path[len('/__ext/'):].split('?')[0]
            if rel == 'popup.html':
                return await r.fulfill(status=200, body=popup_html(), content_type='text/html', headers=CORS)
            if rel == 'mock.js':
                return await r.fulfill(status=200, body=MOCK.read_text(), content_type='text/javascript', headers=CORS)
            f = EXT / rel
            return await r.fulfill(status=200, body=f.read_bytes(), content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream', headers=CORS)
        p = path.split('?')[0]
        if p in ('/trail-running-shoes/ridgeline/',):
            return await r.fulfill(status=200, body=(SITE / 'page.html').read_text(), content_type='text/html; charset=utf-8', headers=CORS)
        f = SITE / p.lstrip('/')
        if p != '/' and f.is_file():
            return await r.fulfill(status=200, body=f.read_bytes(), content_type=mimetypes.guess_type(str(f))[0], headers=CORS)
        return await r.fulfill(status=200, body='<html><body>ok</body></html>', content_type='text/html', headers=CORS)
    # any other external host: 200
    return await r.fulfill(status=200, body='<html><body>ok</body></html>', content_type='text/html', headers=CORS)

async def open_popup(ctx, settings=None, scheme='light'):
    page = await ctx.new_page()
    await page.emulate_media(color_scheme=scheme)
    store = {'seoext_settings': settings or {}}
    await page.add_init_script(f'window.__initStore = {json.dumps(store)};')
    await page.goto(ORIGIN + '/__ext/popup.html')
    await page.wait_for_function('pageData !== null && headersLoaded')
    await page.wait_for_timeout(600)
    return page

async def shot(page, name, wait=500):
    await page.wait_for_timeout(wait)
    await page.screenshot(path=str(OUT / name))
    print('saved', name)

async def main(which):
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 780, 'height': 560}, device_scale_factor=2)
        await ctx.route('**/*', route)
        base = {'theme': 'system', 'defaultTab': 'content', 'serpOpen': True}
        pg = await open_popup(ctx, base)
        await shot(pg, '01-content.png', 900)
        await pg.evaluate("(() => { const a=document.getElementById('contentArea'); const t=[...a.querySelectorAll('.section-title')].find(e=>/^Headings/.test(e.textContent)); a.scrollTop = t.getBoundingClientRect().top - a.getBoundingClientRect().top + a.scrollTop - 12; })()")
        await shot(pg, '01b-content-headings.png', 500)
        await pg.evaluate("document.getElementById('contentArea').scrollTop = 0")
        await pg.evaluate("switchTab('indexability')")
        await pg.wait_for_function("extras.sitemaps !== undefined && extras.robotsTxt !== undefined && extras.canonStatus !== undefined")
        await shot(pg, '02-indexability.png', 800)
        await pg.evaluate("switchTab('outgoing-links')")
        await pg.wait_for_timeout(300)
        await pg.click('#refreshStatus')
        await pg.wait_for_function("pageData.links.every(l => l.status !== undefined)")
        await shot(pg, '03-links.png', 900)
        await pg.locator('#linksFilterBar button', has_text='External').first.click()
        await pg.wait_for_timeout(300)
        await pg.evaluate("document.getElementById('contentArea').scrollTop = 250")
        await shot(pg, '03b-links-external.png', 500)
        await pg.evaluate("switchTab('images')")
        await pg.wait_for_timeout(300)
        await pg.click('#refreshImageStatus')
        await pg.wait_for_function("pageData.images.every(l => l.status !== undefined)")
        await shot(pg, '04-images.png', 900)
        await pg.evaluate("document.getElementById('contentArea').scrollTop = 470")
        await shot(pg, '04b-images-table.png', 500)
        await pg.evaluate("switchTab('raw-rendered')")
        await pg.wait_for_function("rawState && rawState !== 'loading'")
        await shot(pg, '05-raw-vs-rendered.png', 900)
        await pg.evaluate("switchTab('http-headers')")
        await shot(pg, '06-http-headers.png', 700)
        await pg.evaluate("switchTab('structured-data')")
        await pg.locator('.collapsible-header').nth(1).click()
        await shot(pg, '07-structured-data.png', 700)
        await pg.evaluate("sdView='graph'; renderActiveTab()")
        await pg.evaluate("(() => { const a=document.getElementById('contentArea'); const c=[...a.querySelectorAll('.sg-head')].find(e=>/^Product/.test(e.textContent.trim())); if(c) a.scrollTop = c.getBoundingClientRect().top - a.getBoundingClientRect().top + a.scrollTop - 16; })()")
        await shot(pg, '08-structured-data-graph.png', 900)
        await pg.evaluate("document.getElementById('contentArea').scrollTop = 0; switchTab('social-tags'); document.getElementById('contentArea').scrollTop = 0")
        await shot(pg, '09-social-tags.png', 700)
        await pg.evaluate("switchTab('settings'); document.getElementById('contentArea').scrollTop = 0")
        await shot(pg, '10-settings.png', 500)
        # export menu
        await pg.evaluate("switchTab('content')")
        await pg.click('#exportBtn')
        await shot(pg, '11-export-menu.png', 500)
        await pg.keyboard.press('Escape')
        # html report via the real export code
        await pg.evaluate("exportReport('html')")
        await pg.wait_for_function("window.__downloads.length > 0", timeout=60000)
        d = await pg.evaluate("window.__downloads[0]")
        html = base64.b64decode(d['dataUrl'].split(',', 1)[1]).decode('utf-8')
        (OUT / d['filename']).write_text(html)
        print('report file', d['filename'])
        await pg.wait_for_timeout(2600)
        await pg.evaluate("exportReport('xlsx')")
        await pg.wait_for_function("window.__downloads.length > 1", timeout=60000)
        d2 = await pg.evaluate("window.__downloads[1]")
        (OUT / d2['filename']).write_bytes(base64.b64decode(d2['dataUrl'].split(',', 1)[1]))
        print('xlsx file', d2['filename'])
        # link highlighting on the real page
        hl_css = await pg.evaluate("HL_CSS")
        fn = await pg.evaluate("pageHighlight.toString()")
        broken = await pg.evaluate("pageData.links.filter(l=>typeof l.status==='number'&&l.status>=400).map(l=>l.url)")
        labels = await pg.evaluate("HL_TYPES.filter(t=>({nofollow:1,sponsored:1,ugc:1,external:1,broken:1})[t[0]])")
        types = [l[0] for l in labels]
        # dark mode popup
        dk = await open_popup(ctx, dict(base, theme='dark', defaultTab='indexability'))
        await dk.wait_for_function("extras.sitemaps !== undefined && extras.robotsTxt !== undefined")
        await shot(dk, '12-dark-mode.png', 900)
        await dk.evaluate("switchTab('content')")
        await shot(dk, '13-dark-content.png', 900)

        ctx2 = await b.new_context(viewport={'width': 1280, 'height': 860}, device_scale_factor=2)
        await ctx2.route('**/*', route)
        pp = await ctx2.new_page()
        await pp.goto(DEMO)
        await pp.wait_for_timeout(400)
        await pp.evaluate(f"(() => {{ const f = ({fn}); f(true, {json.dumps(types)}, {json.dumps(broken)}, true, {json.dumps(labels)}); const s=document.createElement('style'); s.textContent={json.dumps(hl_css)}; document.head.appendChild(s); }})()")
        await pp.wait_for_timeout(600)
        await pp.screenshot(path=str(OUT / '14-link-highlights.png'), full_page=True)
        print('saved 14')
        # report screenshot
        rp = await ctx2.new_page()
        await rp.goto('about:blank')
        await rp.set_content(html, wait_until='load')
        await shot(rp, '15-html-report.png', 800)
        await rp.evaluate("document.querySelector('#issues, [id*=issue]') && document.querySelector('#issues, [id*=issue]').scrollIntoView()")
        await shot(rp, '16-html-report-issues.png', 600)
        await b.close()

asyncio.run(main(sys.argv[1:] if len(sys.argv) > 1 else None))
