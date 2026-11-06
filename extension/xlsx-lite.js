/* Pure SEO – minimal styled .xlsx writer (loaded on demand, replaces SheetJS)
   Writes inline strings, numbers, a fixed style set, column widths, frozen header, autofilter,
   merged cells and hyperlinks. Compressed with the browser's CompressionStream (deflate-raw).

   Usage:
     const wb = XL.book();
     XL.sheet(wb, 'Links', { cols: [60, 12], rows: [[{v:'URL',s:'head'}, ...], ...], freeze: 1, filter: true });
     const bytes = await XL.write(wb);   // Uint8Array
   A cell is a string, a number, null, or { v, s: styleName, l: hyperlinkUrl }. */
const XL = (() => {
  /* ---- styles ---- */
  const C = { ink: '1F2328', ink2: '57606A', link: '0B57D0', line: 'D0D7DE', headBg: '1F3A5F',
    high: 'B42318', highBg: 'FDECEA', med: '8A5300', medBg: 'FFF1D6', low: '2F5A8A', lowBg: 'E7F0FB',
    pass: '1A7F37', passBg: 'E6F4EA', soft: 'F3F5F8' };
  const STYLES = {
    default: {},
    wrap: { wrap: true },
    head: { font: { b: 1, color: 'FFFFFF' }, fill: C.headBg, wrap: true },
    title: { font: { b: 1, sz: 18, color: C.ink } },
    section: { font: { b: 1, sz: 13, color: C.ink }, border: 1 },
    sub: { font: { color: C.ink2 } },
    key: { font: { b: 1, color: C.ink2 }, wrap: true },
    bold: { font: { b: 1 }, wrap: true },
    num: { font: { b: 1, sz: 14, color: C.ink } },
    link: { font: { u: 1, color: C.link }, wrap: true },
    mono: { font: { name: 'Consolas', sz: 10 }, wrap: true },
    high: { font: { b: 1, color: C.high }, fill: C.highBg, center: true },
    medium: { font: { b: 1, color: C.med }, fill: C.medBg, center: true },
    low: { font: { b: 1, color: C.low }, fill: C.lowBg, center: true },
    pass: { font: { b: 1, color: C.pass }, fill: C.passBg, center: true },
    neutral: { font: { color: C.ink2 }, fill: C.soft, center: true }
  };
  const fonts = [], fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'], xfs = [], ID = {};
  const fontXml = (f = {}) => `<font>${f.b ? '<b/>' : ''}${f.u ? '<u/>' : ''}<sz val="${f.sz || 11}"/><color rgb="FF${f.color || C.ink}"/><name val="${f.name || 'Calibri'}"/><family val="${f.name ? 3 : 2}"/></font>`;
  const idx = (arr, x) => { let i = arr.indexOf(x); if (i < 0) { i = arr.length; arr.push(x); } return i; };
  fonts.push(fontXml());
  for (const [name, st] of Object.entries(STYLES)) {
    const fontId = idx(fonts, fontXml(st.font));
    const fillId = st.fill ? idx(fills, `<fill><patternFill patternType="solid"><fgColor rgb="FF${st.fill}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
    const borderId = st.border ? 1 : 0;
    const al = `<alignment vertical="top"${st.wrap ? ' wrapText="1"' : ''}${st.center ? ' horizontal="center"' : ''}/>`;
    ID[name] = xfs.length;
    xfs.push(`<xf numFmtId="0" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"${fontId ? ' applyFont="1"' : ''}${fillId ? ' applyFill="1"' : ''}${borderId ? ' applyBorder="1"' : ''} applyAlignment="1">${al}</xf>`);
  }
  const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FF${C.line}"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

  /* ---- helpers ---- */
  const BAD = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
  const x = (s) => String(s).replace(BAD, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const colName = (n) => { let s = ''; n++; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; };
  const ref = (r, c) => colName(c) + (r + 1);
  const MAX_TEXT = 32000, MAX_LINKS = 60000;

  function book() { return { sheets: [] }; }
  function sheet(wb, name, opt) {
    let n = String(name).replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31).trim() || 'Sheet';
    const base = n; let k = 2;
    while (wb.sheets.some((s) => s.name.toLowerCase() === n.toLowerCase())) n = base.slice(0, 28) + ' ' + k++;
    wb.sheets.push({ name: n, ...opt });
    return n;
  }
  /* Table helper: objects → header row + rows. style(col, value, rowObject) may return a style name;
     link(col, value) may return a URL to make that cell a hyperlink. */
  function table(wb, name, objs, o = {}) {
    if (!objs.length) return sheet(wb, name, { cols: [80], rows: [[{ v: o.empty || 'Nothing to show', s: 'sub' }]] });
    const keys = o.keys || Object.keys(objs[0]);
    const rows = [keys.map((k) => ({ v: k, s: 'head' }))];
    objs.forEach((ob) => rows.push(keys.map((k) => {
      const v = ob[k] == null ? '' : ob[k];
      const s = (o.style && o.style(k, v, ob)) || (typeof v === 'string' && v.length > 40 ? 'wrap' : 'default');
      const l = o.link && o.link(k, v, ob);
      return l ? { v, s: 'link', l } : { v, s };
    })));
    return sheet(wb, name, { cols: o.cols || keys.map(() => 20), rows, freeze: 1, filter: true });
  }

  function sheetXml(sh, i) {
    const links = [];
    let maxC = 0;
    const body = (sh.rows || []).map((row, r) => {
      maxC = Math.max(maxC, row.length);
      const cells = row.map((cell, c) => {
        if (cell == null || cell === '') return '';
        const o = typeof cell === 'object' ? cell : { v: cell };
        if (o.v == null || o.v === '') return o.s ? `<c r="${ref(r, c)}" s="${ID[o.s] || 0}"/>` : '';
        const s = ID[o.s] || 0, rf = ref(r, c);
        if (o.l && links.length < MAX_LINKS && /^https?:\/\//i.test(o.l) && o.l.length < 2000) links.push([rf, o.l]);
        if (typeof o.v === 'number' && isFinite(o.v)) return `<c r="${rf}" s="${s}"><v>${o.v}</v></c>`;
        let t = String(o.v); if (t.length > MAX_TEXT) t = t.slice(0, MAX_TEXT) + ' …(truncated)';
        return `<c r="${rf}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${x(t)}</t></is></c>`;
      }).join('');
      return `<row r="${r + 1}">${cells}</row>`;
    }).join('');
    const nR = Math.max(1, (sh.rows || []).length), nC = Math.max(1, maxC);
    const dim = `A1:${ref(nR - 1, nC - 1)}`;
    const freeze = sh.freeze ? `<pane ySplit="${sh.freeze}" topLeftCell="A${sh.freeze + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${sh.freeze + 1}" sqref="A${sh.freeze + 1}"/>` : '';
    const cols = sh.cols && sh.cols.length ? `<cols>${sh.cols.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
    const filter = sh.filter && nR > 1 ? `<autoFilter ref="${dim}"/>` : '';
    const merges = sh.merges && sh.merges.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
    const hl = links.length ? `<hyperlinks>${links.map(([rf], k) => `<hyperlink ref="${rf}" r:id="rId${k + 1}"/>`).join('')}</hyperlinks>` : '';
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="${dim}"/><sheetViews><sheetView workbookViewId="0"${i === 0 ? ' tabSelected="1"' : ''}${sh.grid === false ? ' showGridLines="0"' : ''}>${freeze}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${body}</sheetData>${filter}${merges}${hl}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/></worksheet>`;
    const rels = links.length ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${links.map(([, u], k) => `<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${x(u)}" TargetMode="External"/>`).join('')}</Relationships>` : null;
    return { xml, rels, filterRef: filter ? dim : null };
  }

  /* ---- zip ---- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  async function deflate(b) {
    if (typeof CompressionStream === 'undefined') return null;
    const cs = new CompressionStream('deflate-raw');
    const out = new Response(new Blob([b]).stream().pipeThrough(cs)).arrayBuffer();
    return new Uint8Array(await out);
  }
  async function zip(files) {
    const enc = new TextEncoder(), parts = [], central = [];
    const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    let offset = 0;
    for (const [name, text] of files) {
      const raw = enc.encode(text), nm = enc.encode(name), crc = crc32(raw);
      let data = await deflate(raw), method = 8;
      if (!data) { data = raw; method = 0; }
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, method, true);
      h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, raw.length, true);
      h.setUint16(26, nm.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), nm, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, method, true);
      c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, raw.length, true);
      c.setUint16(28, nm.length, true); c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), nm);
      offset += 30 + nm.length + data.length;
    }
    const cSize = central.reduce((a, p) => a + p.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cSize, true); e.setUint32(16, offset, true);
    const all = [...parts, ...central, new Uint8Array(e.buffer)];
    const out = new Uint8Array(all.reduce((a, p) => a + p.length, 0));
    let o = 0; all.forEach((p) => { out.set(p, o); o += p.length; });
    return out;
  }

  async function write(wb) {
    if (!wb.sheets.length) sheet(wb, 'Sheet1', { rows: [] });
    const files = [], defs = [];
    const sheets = wb.sheets.map((sh, i) => sheetXml(sh, i));
    files.push(['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`]);
    files.push(['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`]);
    sheets.forEach((s, i) => { if (s.filterRef) defs.push(`<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${x(wb.sheets[i].name.replace(/'/g, "''"))}'!${s.filterRef.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2')}</definedName>`); });
    files.push(['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${wb.sheets.map((sh, i) => `<sheet name="${x(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${defs.length ? `<definedNames>${defs.join('')}</definedNames>` : ''}</workbook>`]);
    files.push(['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`]);
    files.push(['xl/styles.xml', STYLES_XML]);
    sheets.forEach((s, i) => {
      files.push([`xl/worksheets/sheet${i + 1}.xml`, s.xml]);
      if (s.rels) files.push([`xl/worksheets/_rels/sheet${i + 1}.xml.rels`, s.rels]);
    });
    return zip(files);
  }

  return { book, sheet, table, write, MIME: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
})();
if (typeof module !== 'undefined') module.exports = { XL };
