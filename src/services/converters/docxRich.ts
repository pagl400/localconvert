// Custom DOCX → styled-HTML renderer.
//
// Mammoth produces clean semantic HTML but throws away every direct character
// formatting attribute (color, highlight, underline, font, size, table cell
// shading, paragraph borders). The "styled" variant we expose in the UI needs
// the *visual* result to look like the source, so we walk document.xml
// ourselves, resolve style inheritance against styles.xml, and emit inline
// CSS for every formatting property we recognise.
//
// We use jszip and fast-xml-parser (both already in deps). The parser runs in
// preserveOrder mode so runs within a paragraph come out in the same order
// they appear in the source — essential for inline content.

import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

// ---- XML helpers --------------------------------------------------------

// fast-xml-parser preserve-order shape: each element is `{ tagName: children[], ":@": attrs? }`.
type XmlNode = Record<string, unknown> & { ':@'?: Record<string, string> };

function tagOf(node: XmlNode): string | null {
  for (const key of Object.keys(node)) {
    if (key !== ':@') return key;
  }
  return null;
}

function childrenOf(node: XmlNode): XmlNode[] {
  const tag = tagOf(node);
  if (!tag) return [];
  const c = node[tag];
  return Array.isArray(c) ? (c as XmlNode[]) : [];
}

function attr(node: XmlNode, key: string): string | undefined {
  const attrs = node[':@'];
  if (!attrs) return undefined;
  return attrs[`@_${key}`];
}

function findChild(node: XmlNode, tagName: string): XmlNode | undefined {
  for (const c of childrenOf(node)) {
    if (tagOf(c) === tagName) return c;
  }
  return undefined;
}

function findAllChildren(node: XmlNode, tagName: string): XmlNode[] {
  return childrenOf(node).filter((c) => tagOf(c) === tagName);
}

function textOf(node: XmlNode): string {
  // w:t / w:delText / etc. have children of the form `{ "#text": "..." }`. The
  // value may be string OR number (fast-xml-parser auto-detects numeric text
  // like "1", "3", "2" → JS numbers even with parseTagValue:false in some
  // versions), so we coerce to string explicitly. Without this, integer-only
  // table cells came out empty.
  const kids = childrenOf(node);
  let out = '';
  for (const k of kids) {
    const t = (k as { '#text'?: unknown })['#text'];
    if (t !== undefined && t !== null) out += String(t);
  }
  return out;
}

function parseXml(content: string): XmlNode[] {
  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    allowBooleanAttributes: true,
    parseAttributeValue: false,
    parseTagValue: false,
    trimValues: false,
    processEntities: true,
  });
  return parser.parse(content) as XmlNode[];
}

// ---- Style resolution ---------------------------------------------------

interface RunProps {
  bold?: boolean;
  italic?: boolean;
  underline?: string; // value of w:u (single, double, etc.) or undefined
  strike?: boolean;
  color?: string; // hex without #
  highlight?: string; // named color
  shading?: string; // hex
  fontFamily?: string;
  fontSizeHalfPt?: number;
  vertAlign?: 'baseline' | 'superscript' | 'subscript';
  smallCaps?: boolean;
  allCaps?: boolean;
}

interface ParaProps {
  alignment?: string; // left, center, right, both
  shading?: string; // bg hex
  indentLeftDxa?: number;
  indentRightDxa?: number;
  indentFirstLineDxa?: number;
  spacingBeforeDxa?: number;
  spacingAfterDxa?: number;
  numId?: string;
  ilvl?: number;
  styleId?: string;
  outlineLvl?: number;
}

interface StyleDef {
  id: string;
  type: string; // paragraph / character / table
  name?: string;
  basedOn?: string;
  pPr?: ParaProps;
  rPr?: RunProps;
}

interface Ctx {
  zip: JSZip;
  styles: Map<string, StyleDef>;
  rels: Map<string, string>; // rId → relative target
  numFmts: Map<string, { format: string; text: string; lvl: number }[]>; // numId → list of {format, text, lvl}
  numIdToAbstractId: Map<string, string>;
  imageDataUris: Map<string, string>; // rId → data:image/...
  docDefaults: { pPr?: ParaProps; rPr?: RunProps };
}

function parseHalfPt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

function parseDxa(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

// Convert a `<w:rPr>` node into our normalized RunProps.
function readRPr(rPr: XmlNode | undefined): RunProps {
  const out: RunProps = {};
  if (!rPr) return out;
  for (const child of childrenOf(rPr)) {
    switch (tagOf(child)) {
      case 'w:b':
        out.bold = attr(child, 'w:val') !== '0' && attr(child, 'w:val') !== 'false';
        break;
      case 'w:i':
        out.italic = attr(child, 'w:val') !== '0' && attr(child, 'w:val') !== 'false';
        break;
      case 'w:strike':
      case 'w:dstrike':
        out.strike = attr(child, 'w:val') !== '0' && attr(child, 'w:val') !== 'false';
        break;
      case 'w:u': {
        const v = attr(child, 'w:val');
        if (v && v !== 'none') out.underline = v;
        break;
      }
      case 'w:color': {
        const v = attr(child, 'w:val');
        if (v && v !== 'auto') out.color = v;
        break;
      }
      case 'w:highlight': {
        const v = attr(child, 'w:val');
        if (v && v !== 'none') out.highlight = v;
        break;
      }
      case 'w:shd': {
        const fill = attr(child, 'w:fill');
        if (fill && fill !== 'auto') out.shading = fill;
        break;
      }
      case 'w:rFonts': {
        out.fontFamily =
          attr(child, 'w:ascii') ||
          attr(child, 'w:hAnsi') ||
          attr(child, 'w:cs') ||
          attr(child, 'w:eastAsia');
        break;
      }
      case 'w:sz':
      case 'w:szCs': {
        const v = parseHalfPt(attr(child, 'w:val'));
        if (v !== undefined) out.fontSizeHalfPt = v;
        break;
      }
      case 'w:vertAlign': {
        const v = attr(child, 'w:val');
        if (v === 'superscript' || v === 'subscript' || v === 'baseline') out.vertAlign = v;
        break;
      }
      case 'w:caps':
        out.allCaps = attr(child, 'w:val') !== '0' && attr(child, 'w:val') !== 'false';
        break;
      case 'w:smallCaps':
        out.smallCaps = attr(child, 'w:val') !== '0' && attr(child, 'w:val') !== 'false';
        break;
    }
  }
  return out;
}

function readPPr(pPr: XmlNode | undefined): ParaProps {
  const out: ParaProps = {};
  if (!pPr) return out;
  for (const child of childrenOf(pPr)) {
    switch (tagOf(child)) {
      case 'w:pStyle':
        out.styleId = attr(child, 'w:val');
        break;
      case 'w:outlineLvl': {
        const v = attr(child, 'w:val');
        if (v) out.outlineLvl = parseInt(v, 10);
        break;
      }
      case 'w:jc':
        out.alignment = attr(child, 'w:val');
        break;
      case 'w:shd': {
        const fill = attr(child, 'w:fill');
        if (fill && fill !== 'auto') out.shading = fill;
        break;
      }
      case 'w:ind': {
        out.indentLeftDxa = parseDxa(attr(child, 'w:left') ?? attr(child, 'w:start'));
        out.indentRightDxa = parseDxa(attr(child, 'w:right') ?? attr(child, 'w:end'));
        out.indentFirstLineDxa = parseDxa(attr(child, 'w:firstLine'));
        break;
      }
      case 'w:spacing': {
        out.spacingBeforeDxa = parseDxa(attr(child, 'w:before'));
        out.spacingAfterDxa = parseDxa(attr(child, 'w:after'));
        break;
      }
      case 'w:numPr': {
        const ilvl = findChild(child, 'w:ilvl');
        const numId = findChild(child, 'w:numId');
        if (ilvl) {
          const v = attr(ilvl, 'w:val');
          if (v) out.ilvl = parseInt(v, 10);
        }
        if (numId) {
          out.numId = attr(numId, 'w:val');
        }
        break;
      }
    }
  }
  return out;
}

function mergeRunProps(...sources: (RunProps | undefined)[]): RunProps {
  const out: RunProps = {};
  for (const s of sources) {
    if (!s) continue;
    Object.assign(out, s);
  }
  return out;
}

function mergeParaProps(...sources: (ParaProps | undefined)[]): ParaProps {
  const out: ParaProps = {};
  for (const s of sources) {
    if (!s) continue;
    Object.assign(out, s);
  }
  return out;
}

// Resolve a style chain back to root, merging properties (ancestor first, then current).
function resolveStyle(
  styleId: string | undefined,
  ctx: Ctx,
): { pPr: ParaProps; rPr: RunProps } {
  let pPr: ParaProps = { ...(ctx.docDefaults.pPr ?? {}) };
  let rPr: RunProps = { ...(ctx.docDefaults.rPr ?? {}) };
  if (!styleId) return { pPr, rPr };

  const chain: StyleDef[] = [];
  let current: StyleDef | undefined = ctx.styles.get(styleId);
  while (current) {
    chain.unshift(current);
    current = current.basedOn ? ctx.styles.get(current.basedOn) : undefined;
  }
  for (const s of chain) {
    pPr = mergeParaProps(pPr, s.pPr);
    rPr = mergeRunProps(rPr, s.rPr);
  }
  return { pPr, rPr };
}

// ---- CSS generation -----------------------------------------------------

const HIGHLIGHT_COLORS: Record<string, string> = {
  yellow: '#ffff00',
  green: '#00ff00',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  blue: '#0000ff',
  red: '#ff0000',
  darkBlue: '#00008b',
  darkCyan: '#008b8b',
  darkGreen: '#006400',
  darkMagenta: '#8b008b',
  darkRed: '#8b0000',
  darkYellow: '#8b8b00',
  darkGray: '#a9a9a9',
  lightGray: '#d3d3d3',
  black: '#000000',
  white: '#ffffff',
};

function hexColor(v: string | undefined): string | null {
  if (!v) return null;
  const m = v.match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return null;
  return '#' + m[1].toUpperCase();
}

function runCss(rPr: RunProps): string {
  const styles: string[] = [];
  const color = hexColor(rPr.color);
  if (color) styles.push(`color:${color}`);
  if (rPr.shading) {
    const c = hexColor(rPr.shading);
    if (c) styles.push(`background-color:${c}`);
  }
  if (rPr.highlight && !rPr.shading) {
    const c = HIGHLIGHT_COLORS[rPr.highlight] ?? rPr.highlight;
    styles.push(`background-color:${c}`);
  }
  if (rPr.fontFamily) {
    // Quote font names that contain spaces.
    const ff = /[\s'"]/.test(rPr.fontFamily) ? `"${rPr.fontFamily.replace(/"/g, '')}"` : rPr.fontFamily;
    styles.push(`font-family:${ff},inherit`);
  }
  if (rPr.fontSizeHalfPt) {
    styles.push(`font-size:${(rPr.fontSizeHalfPt / 2).toFixed(1)}pt`);
  }
  const decorations: string[] = [];
  if (rPr.underline) decorations.push('underline');
  if (rPr.strike) decorations.push('line-through');
  if (decorations.length) {
    styles.push(`text-decoration:${decorations.join(' ')}`);
    if (rPr.underline === 'double') styles.push('text-decoration-style:double');
    else if (rPr.underline === 'dotted' || rPr.underline === 'dottedHeavy')
      styles.push('text-decoration-style:dotted');
    else if (rPr.underline === 'dashed' || rPr.underline === 'dashedHeavy')
      styles.push('text-decoration-style:dashed');
    else if (rPr.underline === 'wave' || rPr.underline === 'wavyHeavy')
      styles.push('text-decoration-style:wavy');
  }
  if (rPr.allCaps) styles.push('text-transform:uppercase');
  if (rPr.smallCaps) styles.push('font-variant:small-caps');
  return styles.join(';');
}

function paraCss(pPr: ParaProps): string {
  const styles: string[] = [];
  if (pPr.alignment) {
    const map: Record<string, string> = {
      left: 'left',
      start: 'left',
      right: 'right',
      end: 'right',
      center: 'center',
      both: 'justify',
      distribute: 'justify',
    };
    if (map[pPr.alignment]) styles.push(`text-align:${map[pPr.alignment]}`);
  }
  if (pPr.shading) {
    const c = hexColor(pPr.shading);
    if (c) styles.push(`background-color:${c};padding:0.2em 0.4em;border-radius:2px`);
  }
  // DXA = 1/20 of a point. CSS pt is fine.
  if (pPr.indentLeftDxa) styles.push(`margin-left:${(pPr.indentLeftDxa / 20).toFixed(1)}pt`);
  if (pPr.indentRightDxa) styles.push(`margin-right:${(pPr.indentRightDxa / 20).toFixed(1)}pt`);
  if (pPr.indentFirstLineDxa) styles.push(`text-indent:${(pPr.indentFirstLineDxa / 20).toFixed(1)}pt`);
  if (pPr.spacingBeforeDxa) styles.push(`margin-top:${(pPr.spacingBeforeDxa / 20).toFixed(1)}pt`);
  if (pPr.spacingAfterDxa !== undefined)
    styles.push(`margin-bottom:${(pPr.spacingAfterDxa / 20).toFixed(1)}pt`);
  return styles.join(';');
}

// ---- HTML escaping ------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escAttr(s: string): string {
  return s.replace(/"/g, '&quot;');
}

// ---- Renderers ----------------------------------------------------------

function renderRun(rNode: XmlNode, ctx: Ctx, inheritedRPr: RunProps): string {
  // Build effective rPr: inherited (from paragraph style + run style) merged
  // with the run's direct rPr.
  const rPrNode = findChild(rNode, 'w:rPr');
  const rStyleId = rPrNode
    ? attr(findChild(rPrNode, 'w:rStyle') ?? ({} as XmlNode), 'w:val')
    : undefined;
  const rStyleResolved = rStyleId ? resolveStyle(rStyleId, ctx).rPr : undefined;
  const directRPr = readRPr(rPrNode);
  const effectiveRPr = mergeRunProps(inheritedRPr, rStyleResolved, directRPr);

  // Gather text and inline elements.
  let inner = '';
  for (const child of childrenOf(rNode)) {
    const t = tagOf(child);
    if (t === 'w:t') {
      inner += escapeHtml(textOf(child));
    } else if (t === 'w:tab') {
      inner += '    ';
    } else if (t === 'w:br') {
      const type = attr(child, 'w:type');
      inner += type === 'page' ? '<br /><!-- page break -->' : '<br />';
    } else if (t === 'w:noBreakHyphen') {
      inner += '‑';
    } else if (t === 'w:softHyphen') {
      inner += '';
    } else if (t === 'w:sym') {
      const charHex = attr(child, 'w:char');
      if (charHex) {
        const code = parseInt(charHex, 16);
        if (Number.isFinite(code)) inner += String.fromCharCode(code);
      }
    } else if (t === 'w:drawing' || t === 'w:pict' || t === 'w:object') {
      inner += renderDrawing(child, ctx, effectiveRPr);
    }
  }

  if (!inner) return '';

  const css = runCss(effectiveRPr);
  let html = inner;

  // Wrap in inline tags for semantics where appropriate, plus a span for
  // inline styles. Order matters for readability of the output.
  if (effectiveRPr.bold) html = `<strong>${html}</strong>`;
  if (effectiveRPr.italic) html = `<em>${html}</em>`;
  if (effectiveRPr.vertAlign === 'superscript') html = `<sup>${html}</sup>`;
  else if (effectiveRPr.vertAlign === 'subscript') html = `<sub>${html}</sub>`;

  if (css) html = `<span style="${escAttr(css)}">${html}</span>`;
  return html;
}

function renderDrawing(node: XmlNode, ctx: Ctx, _runProps: RunProps): string {
  // Find the blip with r:embed.
  const findBlip = (n: XmlNode): XmlNode | undefined => {
    for (const c of childrenOf(n)) {
      if (tagOf(c) === 'a:blip') return c;
      const found = findBlip(c);
      if (found) return found;
    }
    return undefined;
  };
  const blip = findBlip(node);
  const rId = blip ? attr(blip, 'r:embed') : undefined;
  if (!rId) return '';
  const dataUri = ctx.imageDataUris.get(rId);
  if (!dataUri) return '';

  // Find extent for sizing. EMU = 1/914400 inch, 1pt = 1/72 inch.
  const findExtent = (n: XmlNode): XmlNode | undefined => {
    for (const c of childrenOf(n)) {
      if (tagOf(c) === 'wp:extent' || tagOf(c) === 'wp:posOffset') return c;
      const found = findExtent(c);
      if (found) return found;
    }
    return undefined;
  };
  const extent = findExtent(node);
  let style = 'max-width:100%;height:auto;vertical-align:middle';
  if (extent) {
    const cx = parseInt(attr(extent, 'cx') ?? '0', 10);
    const cy = parseInt(attr(extent, 'cy') ?? '0', 10);
    if (cx > 0 && cy > 0) {
      const widthPt = (cx / 914400) * 72;
      const heightPt = (cy / 914400) * 72;
      style = `width:${widthPt.toFixed(1)}pt;height:${heightPt.toFixed(1)}pt;max-width:100%;vertical-align:middle`;
    }
  }
  return `<img src="${dataUri}" style="${escAttr(style)}" alt="" />`;
}

function renderHyperlink(node: XmlNode, ctx: Ctx, inheritedRPr: RunProps): string {
  const rId = attr(node, 'r:id') ?? attr(node, 'r:href');
  const anchor = attr(node, 'w:anchor');
  let href = '#';
  if (rId && ctx.rels.has(rId)) {
    href = ctx.rels.get(rId)!;
  } else if (anchor) {
    href = `#${anchor}`;
  }
  let inner = '';
  for (const child of childrenOf(node)) {
    if (tagOf(child) === 'w:r') inner += renderRun(child, ctx, inheritedRPr);
  }
  if (!inner) return '';
  return `<a href="${escAttr(href)}" style="color:inherit;text-decoration:underline">${inner}</a>`;
}

function renderParagraphContent(
  pNode: XmlNode,
  ctx: Ctx,
  inheritedRPr: RunProps,
): string {
  let html = '';
  for (const child of childrenOf(pNode)) {
    const t = tagOf(child);
    if (t === 'w:r') html += renderRun(child, ctx, inheritedRPr);
    else if (t === 'w:hyperlink') html += renderHyperlink(child, ctx, inheritedRPr);
    // Bookmarks, deletions, insertions, etc. are silently ignored.
  }
  return html;
}

// Decide the outer HTML tag for a paragraph.
function paragraphTag(effectivePPr: ParaProps, ctx: Ctx): {
  tag: string;
  classes: string[];
} {
  const classes: string[] = [];
  const styleId = effectivePPr.styleId;
  const styleDef = styleId ? ctx.styles.get(styleId) : undefined;
  const styleName = styleDef?.name ?? '';

  // Heading detection: by style name "heading 1".."heading 6" or by outline level.
  const headingMatch = styleName.match(/^heading\s*(\d)/i);
  if (headingMatch) {
    const lvl = Math.min(6, Math.max(1, parseInt(headingMatch[1], 10)));
    return { tag: `h${lvl}`, classes };
  }
  if (/^title$/i.test(styleName)) return { tag: 'h1', classes: ['title'] };
  if (/^subtitle$/i.test(styleName)) return { tag: 'p', classes: ['subtitle'] };
  if (/^toc\s*\d/i.test(styleName)) {
    const m = styleName.match(/(\d)/);
    const lvl = m ? parseInt(m[1], 10) : 1;
    return { tag: 'p', classes: [`toc${lvl}`] };
  }
  if (effectivePPr.outlineLvl !== undefined && effectivePPr.outlineLvl < 6) {
    return { tag: `h${effectivePPr.outlineLvl + 1}`, classes };
  }
  return { tag: 'p', classes };
}

function renderParagraph(pNode: XmlNode, ctx: Ctx): string {
  const pPrNode = findChild(pNode, 'w:pPr');
  const directPPr = readPPr(pPrNode);
  const rPrInPPr = pPrNode ? findChild(pPrNode, 'w:rPr') : undefined;
  const pPrRPr = readRPr(rPrInPPr);

  const styleResolved = resolveStyle(directPPr.styleId, ctx);
  const effectivePPr = mergeParaProps(styleResolved.pPr, directPPr);
  const effectiveRPr = mergeRunProps(styleResolved.rPr, pPrRPr);

  const inner = renderParagraphContent(pNode, ctx, effectiveRPr);

  const { tag, classes } = paragraphTag(effectivePPr, ctx);
  const css = paraCss(effectivePPr);
  const classAttr = classes.length ? ` class="${classes.join(' ')}"` : '';
  const styleAttr = css ? ` style="${escAttr(css)}"` : '';

  // Empty paragraphs: emit a <br>-equivalent so vertical rhythm matches.
  if (!inner.trim()) return `<${tag}${classAttr}${styleAttr}>&nbsp;</${tag}>`;

  return `<${tag}${classAttr}${styleAttr}>${inner}</${tag}>`;
}

// ---- Tables -------------------------------------------------------------

function readCellShading(tcPr: XmlNode | undefined): string | undefined {
  if (!tcPr) return undefined;
  const shd = findChild(tcPr, 'w:shd');
  if (!shd) return undefined;
  const fill = attr(shd, 'w:fill');
  return fill && fill !== 'auto' ? fill : undefined;
}

function renderTableCell(tcNode: XmlNode, ctx: Ctx): string {
  const tcPr = findChild(tcNode, 'w:tcPr');
  const shading = readCellShading(tcPr);
  const widthEl = tcPr ? findChild(tcPr, 'w:tcW') : undefined;
  const widthVal = widthEl ? attr(widthEl, 'w:w') : undefined;
  const widthType = widthEl ? attr(widthEl, 'w:type') : undefined;
  const gridSpan = tcPr ? findChild(tcPr, 'w:gridSpan') : undefined;
  const colspan = gridSpan ? attr(gridSpan, 'w:val') : undefined;

  const styles: string[] = ['border:1px solid #ccc', 'padding:0.4em 0.6em', 'vertical-align:top'];
  if (shading) {
    const c = hexColor(shading);
    if (c) styles.push(`background-color:${c}`);
  }
  if (widthVal && widthType === 'dxa') {
    const pt = parseInt(widthVal, 10) / 20;
    styles.push(`width:${pt.toFixed(0)}pt`);
  }

  let inner = '';
  for (const child of childrenOf(tcNode)) {
    const t = tagOf(child);
    if (t === 'w:p') inner += renderParagraph(child, ctx);
    else if (t === 'w:tbl') inner += renderTable(child, ctx);
  }
  const spanAttr = colspan && colspan !== '1' ? ` colspan="${escAttr(colspan)}"` : '';
  return `<td style="${escAttr(styles.join(';'))}"${spanAttr}>${inner}</td>`;
}

function renderTableRow(trNode: XmlNode, ctx: Ctx): string {
  let inner = '';
  for (const child of childrenOf(trNode)) {
    if (tagOf(child) === 'w:tc') inner += renderTableCell(child, ctx);
  }
  return `<tr>${inner}</tr>`;
}

function renderTable(tblNode: XmlNode, ctx: Ctx): string {
  let inner = '';
  for (const child of childrenOf(tblNode)) {
    if (tagOf(child) === 'w:tr') inner += renderTableRow(child, ctx);
  }
  return `<table style="border-collapse:collapse;margin:1em 0;max-width:100%">${inner}</table>`;
}

// ---- Lists --------------------------------------------------------------
// Word uses numPr (numId + ilvl) on paragraphs. Reconstructing the exact
// list structure requires walking sibling paragraphs and grouping by numId.
// We render runs of consecutive list paragraphs as a single <ul> or <ol>.

function isListParagraph(pNode: XmlNode, ctx: Ctx): { numId: string; ilvl: number } | null {
  const pPr = findChild(pNode, 'w:pPr');
  if (!pPr) return null;
  const numPr = findChild(pPr, 'w:numPr');
  if (!numPr) return null;
  const numIdEl = findChild(numPr, 'w:numId');
  const ilvlEl = findChild(numPr, 'w:ilvl');
  const numId = numIdEl ? attr(numIdEl, 'w:val') : undefined;
  if (!numId || numId === '0') return null;
  const ilvl = ilvlEl ? parseInt(attr(ilvlEl, 'w:val') ?? '0', 10) : 0;
  // We don't have the abstractNum here; default to <ul> unless detected as ordered.
  void ctx;
  return { numId, ilvl };
}

// ---- Top-level body walk ------------------------------------------------

function renderBody(bodyNode: XmlNode, ctx: Ctx): string {
  const kids = childrenOf(bodyNode);
  const out: string[] = [];
  let i = 0;
  while (i < kids.length) {
    const node = kids[i];
    const t = tagOf(node);
    if (t === 'w:p') {
      const list = isListParagraph(node, ctx);
      if (list) {
        // Determine ordered vs bullet via the numbering id mapped to abstractNum.
        const abstractId = ctx.numIdToAbstractId.get(list.numId);
        const levels = abstractId ? ctx.numFmts.get(abstractId) : undefined;
        const fmt = levels?.find((l) => l.lvl === list.ilvl)?.format ?? 'bullet';
        const tag = fmt === 'bullet' ? 'ul' : 'ol';
        let listHtml = `<${tag} style="margin:0.5em 0;padding-left:2em">`;
        while (i < kids.length) {
          const sibling = kids[i];
          if (tagOf(sibling) !== 'w:p') break;
          const sibList = isListParagraph(sibling, ctx);
          if (!sibList || sibList.numId !== list.numId) break;
          const inner = renderParagraphContent(sibling, ctx, ctx.docDefaults.rPr ?? {});
          listHtml += `<li>${inner || '&nbsp;'}</li>`;
          i++;
        }
        listHtml += `</${tag}>`;
        out.push(listHtml);
        continue;
      }
      out.push(renderParagraph(node, ctx));
    } else if (t === 'w:tbl') {
      out.push(renderTable(node, ctx));
    } else if (t === 'w:sectPr') {
      // ignore
    }
    i++;
  }
  return out.join('\n');
}

// ---- Loading ------------------------------------------------------------

async function loadStyles(zip: JSZip): Promise<{
  styles: Map<string, StyleDef>;
  docDefaults: { pPr?: ParaProps; rPr?: RunProps };
}> {
  const styles = new Map<string, StyleDef>();
  const docDefaults: { pPr?: ParaProps; rPr?: RunProps } = {};
  const file = zip.files['word/styles.xml'];
  if (!file) return { styles, docDefaults };
  const xml = await file.async('text');
  const parsed = parseXml(xml);
  // Find the root w:styles node
  const root = parsed.find((n) => tagOf(n) === 'w:styles');
  if (!root) return { styles, docDefaults };

  for (const child of childrenOf(root)) {
    const tag = tagOf(child);
    if (tag === 'w:docDefaults') {
      const rPrDef = findChild(child, 'w:rPrDefault');
      const pPrDef = findChild(child, 'w:pPrDefault');
      if (rPrDef) {
        const inner = findChild(rPrDef, 'w:rPr');
        docDefaults.rPr = readRPr(inner);
      }
      if (pPrDef) {
        const inner = findChild(pPrDef, 'w:pPr');
        docDefaults.pPr = readPPr(inner);
      }
    } else if (tag === 'w:style') {
      const id = attr(child, 'w:styleId') ?? '';
      const type = attr(child, 'w:type') ?? 'paragraph';
      const nameEl = findChild(child, 'w:name');
      const basedOnEl = findChild(child, 'w:basedOn');
      const name = nameEl ? attr(nameEl, 'w:val') : undefined;
      const basedOn = basedOnEl ? attr(basedOnEl, 'w:val') : undefined;
      const pPr = readPPr(findChild(child, 'w:pPr'));
      const rPr = readRPr(findChild(child, 'w:rPr'));
      styles.set(id, { id, type, name, basedOn, pPr, rPr });
    }
  }
  return { styles, docDefaults };
}

async function loadRels(zip: JSZip): Promise<Map<string, string>> {
  const rels = new Map<string, string>();
  const file = zip.files['word/_rels/document.xml.rels'];
  if (!file) return rels;
  const xml = await file.async('text');
  const parsed = parseXml(xml);
  const root = parsed.find((n) => tagOf(n) === 'Relationships');
  if (!root) return rels;
  for (const child of childrenOf(root)) {
    if (tagOf(child) !== 'Relationship') continue;
    const id = attr(child, 'Id');
    const target = attr(child, 'Target');
    if (id && target) rels.set(id, target);
  }
  return rels;
}

async function loadNumbering(zip: JSZip): Promise<{
  numFmts: Map<string, { format: string; text: string; lvl: number }[]>;
  numIdToAbstractId: Map<string, string>;
}> {
  const numFmts = new Map<string, { format: string; text: string; lvl: number }[]>();
  const numIdToAbstractId = new Map<string, string>();
  const file = zip.files['word/numbering.xml'];
  if (!file) return { numFmts, numIdToAbstractId };
  const xml = await file.async('text');
  const parsed = parseXml(xml);
  const root = parsed.find((n) => tagOf(n) === 'w:numbering');
  if (!root) return { numFmts, numIdToAbstractId };
  for (const child of childrenOf(root)) {
    const tag = tagOf(child);
    if (tag === 'w:abstractNum') {
      const aId = attr(child, 'w:abstractNumId');
      if (!aId) continue;
      const levels: { format: string; text: string; lvl: number }[] = [];
      for (const lvlNode of findAllChildren(child, 'w:lvl')) {
        const ilvl = parseInt(attr(lvlNode, 'w:ilvl') ?? '0', 10);
        const numFmtEl = findChild(lvlNode, 'w:numFmt');
        const lvlTextEl = findChild(lvlNode, 'w:lvlText');
        levels.push({
          lvl: ilvl,
          format: numFmtEl ? attr(numFmtEl, 'w:val') ?? 'bullet' : 'bullet',
          text: lvlTextEl ? attr(lvlTextEl, 'w:val') ?? '' : '',
        });
      }
      numFmts.set(aId, levels);
    } else if (tag === 'w:num') {
      const numId = attr(child, 'w:numId');
      const aIdRef = findChild(child, 'w:abstractNumId');
      const aIdVal = aIdRef ? attr(aIdRef, 'w:val') : undefined;
      if (numId && aIdVal) numIdToAbstractId.set(numId, aIdVal);
    }
  }
  return { numFmts, numIdToAbstractId };
}

async function loadImages(
  zip: JSZip,
  rels: Map<string, string>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const mimes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    bmp: 'image/bmp',
    tiff: 'image/tiff',
    webp: 'image/webp',
    svg: 'image/svg+xml',
  };
  for (const [rId, target] of rels.entries()) {
    const m = target.toLowerCase().match(/\.([a-z0-9]+)$/);
    if (!m) continue;
    const mime = mimes[m[1]];
    if (!mime) continue;
    // Word relationships are relative to word/.
    const normalized = target.startsWith('/') ? target.slice(1) : `word/${target}`;
    const file = zip.files[normalized.replace(/^word\/\.\.\//, '')] ?? zip.files[normalized];
    if (!file) continue;
    const b64 = await file.async('base64');
    out.set(rId, `data:${mime};base64,${b64}`);
  }
  return out;
}

// ---- Public entry point -------------------------------------------------

export async function renderDocxToStyledHtml(arrayBuffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(arrayBuffer);

  const [stylesResult, rels, numbering] = await Promise.all([
    loadStyles(zip),
    loadRels(zip),
    loadNumbering(zip),
  ]);
  const imageDataUris = await loadImages(zip, rels);

  const ctx: Ctx = {
    zip,
    styles: stylesResult.styles,
    docDefaults: stylesResult.docDefaults,
    rels,
    numFmts: numbering.numFmts,
    numIdToAbstractId: numbering.numIdToAbstractId,
    imageDataUris,
  };

  const docFile = zip.files['word/document.xml'];
  if (!docFile) throw new Error('DOCX is missing word/document.xml');
  const xml = await docFile.async('text');
  const parsed = parseXml(xml);
  const root = parsed.find((n) => tagOf(n) === 'w:document');
  if (!root) throw new Error('DOCX document.xml has no w:document root');
  const body = findChild(root, 'w:body');
  if (!body) throw new Error('DOCX has no w:body');

  return renderBody(body, ctx);
}
