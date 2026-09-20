# SEO Extension by MakashibK

**A free, one-click SEO toolbar for Chrome. Audit any page's meta tags, indexability, structured data, social tags, HTTP headers, images, and links without leaving the tab.**

![Manifest V3](https://img.shields.io/badge/Manifest-V3-4285f4?logo=googlechrome&logoColor=white)
![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Privacy](https://img.shields.io/badge/data%20collection-none-brightgreen)

</div>

---

## Overview

SEO Extension is a lightweight Chrome extension for SEOs, developers, and content teams who need fast answers about a page's on-page and technical SEO. Click the toolbar icon and a side-navigation popup shows everything in seven focused tabs. There is no account, no sign-up, and no data leaves your browser.

It compares **rendered DOM vs. raw HTML** for canonical tags, checks `robots.txt` and sitemaps for you, parses JSON-LD, Microdata and RDFa, and lets you export filtered link and image tables to Excel.

## Features

### Content
- Word count, meta title and meta description with live **character counts** (and one-click copy)
- `<html lang>` attribute
- Published and modified dates, read from meta tags and JSON-LD (`datePublished` / `dateModified`)
- Full heading outline (H1–H6) with per-level counts, filtering, and **Copy Headings**

### Indexability
- **Canonical URL, rendered vs. raw HTML.** Spot canonicals that are injected or changed by JavaScript
- `meta robots` directives and the `X-Robots-Tag` HTTP header
- `robots.txt` detection and a crawl-allowed / blocked check for the current path
- Sitemap discovery from `robots.txt` (falls back to `/sitemap.xml`) with a found / missing status
- All `hreflang` alternate tags with their target URLs

### Schema (Structured Data)
- Detects **JSON-LD**, **Microdata**, and **RDFa**
- **Normal view:** collapsible, syntax-highlighted JSON tree per schema block
- **Graph view:** relationships between entities shown as a tree
- Handles `@graph` structures and multi-type entities

### Social Tags
- **Open Graph** (`og:title`, `og:type`, `og:image`, `og:url`, `og:description`, `og:site_name`, plus any extras found)
- **Twitter Card** (`twitter:card`, `twitter:site`, `twitter:title`, `twitter:description`, `twitter:image`, `twitter:creator`, plus extras)
- Missing recommended tags are flagged so gaps are easy to see

### HTTP Headers
- Final **status code** (color-coded badge in the sidebar: 2xx / 3xx / 4xx / 5xx)
- Complete response header list for the main document request

### Images
- Every image on the page, including lazy-loaded ones (`data-src`, `data-lazy-src`)
- Filter by **with alt / no alt / with title / no title**, plus text search
- **Refresh Status** checks each image URL's HTTP status
- **Export to Excel** (respects your active filters)

### Links
- All page links, classified as **dofollow, nofollow, UGC, or sponsored**
- Filter by **internal / external**, by rel attribute, or by search text
- **Refresh Status** checks each link's HTTP status
- **Export to Excel** (respects your active filters)

### Settings
- Theme: System, Light, or Dark
- Choose which tab opens by default, or reopen the last one you used
- Shortcut to Chrome's keyboard-shortcut page so you can bind the extension to a hotkey

## Installation

The extension isn't on the Chrome Web Store yet, so install it in developer mode:

1. **Download the code.** Click **Code → Download ZIP** and unzip it, or clone the repo:
   ```bash
   git clone https://github.com/makashibk/seo-extension.git
   ```
2. Open **`chrome://extensions`** in Chrome.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the project folder (the one containing `manifest.json`).
5. Click the puzzle-piece icon in the toolbar and **pin** SEO Extension for quick access.

> Chromium-based browsers such as Edge and Brave should also work using the same steps on their extensions page.

## Usage

1. Open any `http://` or `https://` page.
2. Click the SEO Extension icon.
3. Use the left sidebar to switch between tabs.
4. On **Images** and **Links**, click **Refresh Status** to check HTTP status codes, then **Export** to download an `.xlsx` file.

> **Tip:** the HTTP Headers tab reads data captured while the page loads. If it says "No headers captured", reload the page and open the extension again.

## Permissions Explained

| Permission | Why it's needed |
|---|---|
| `activeTab` | Access the tab you're currently viewing when you click the icon |
| `scripting` | Inject the extraction script that reads the page's DOM |
| `storage` | Save your theme, default-tab, and last-tab preferences locally |
| `webRequest` | Read the main document's status code and response headers |
| `webNavigation` | Reserved for navigation-aware features |
| Host access (`<all_urls>`) | Fetch the page's raw HTML, `robots.txt`, sitemaps, and to check link and image status codes on any domain |

## Privacy

- **No analytics, tracking, or telemetry.**
- **No external servers.** The extension has no backend and sends your data nowhere.
- Network requests are made **from your browser only**, to the site you are analyzing (raw HTML, `robots.txt`, sitemaps) and, when you click **Refresh Status**, to the link and image URLs on that page.
- Settings are stored locally with `chrome.storage.local`.
- The popup UI loads the *Inter* and *JetBrains Mono* fonts from Google Fonts.

## How It Works

| File | Role |
|---|---|
| `manifest.json` | Manifest V3 configuration, permissions, and icons |
| `background.js` | Service worker. Captures main-frame headers and status codes, and performs cross-origin fetches (`robots.txt`, sitemaps, raw HTML, URL status checks) for the popup |
| `extract.js` | Injected into the active page with `chrome.scripting.executeScript`. Collects meta tags, headings, schema, links, images, and more |
| `popup.html` / `popup.css` | Popup shell, sidebar layout, and light/dark theming |
| `popup.js` | Popup controller: tab routing, filters, status checks, settings, and Excel export |
| `renderers.js` | Renders each tab's HTML from the extracted data |
| `xlsx.mini.min.js` | Bundled [SheetJS](https://sheetjs.com) (v0.20.1) for `.xlsx` export |

### Project structure

```
.
├── manifest.json
├── background.js
├── extract.js
├── popup.html
├── popup.css
├── popup.js
├── renderers.js
├── xlsx.mini.min.js
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Known Limitations

- **Restricted pages:** Chrome blocks extensions on `chrome://` pages, the Chrome Web Store, and similar internal pages, so these can't be analyzed.
- **Robots.txt check is simplified.** It evaluates `Disallow` rules under `User-agent: *` using path-prefix matching. It does not process `Allow` rules, wildcards (`*`, `$`), or bot-specific groups. Treat it as a quick signal, and confirm in Google Search Console for critical pages.
- **Status checks use `HEAD` requests.** Some servers reject `HEAD` or rate-limit rapid requests, which can show a misleading status. Very large pages with thousands of links may take a while to check.
- **Headers are held in the service worker's memory.** If Chrome has suspended the worker, reload the page to capture them again.
- **Word count** is based on the page's visible body text and may differ from other tools.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Cannot analyze this page" | The page is a restricted Chrome page. Try a regular website |
| Headers tab is empty | Reload the page, then reopen the extension |
| Excel export shows "XLSX library not loaded" | Make sure `xlsx.mini.min.js` sits next to `popup.html` with exactly that filename |
| Icons missing or extension won't load | Confirm the icons are inside an `icons/` folder as listed in `manifest.json` |
| Changes not showing after editing code | Click the reload icon on the extension's card in `chrome://extensions` |

## Contributing

Bug reports, feature ideas, and pull requests are welcome.

1. Fork the repo and create a branch: `git checkout -b feature/my-improvement`
2. Make your changes and test them by loading the unpacked extension
3. Commit and push, then open a pull request describing what changed and why

For bugs, please include your Chrome version, the URL type you were testing (if shareable), and steps to reproduce.

## License

Released under the [MIT License](LICENSE).

## Author

Built by **MakashibK**. If this tool saves you time, a ⭐ on the repo is much appreciated.
