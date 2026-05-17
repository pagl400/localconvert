// ODT (OpenDocument Text) ↔ DOCX / HTML / MD / TXT converter.
//
// Two-way bridge between Microsoft's DOCX and the ISO-standard ODT format that
// LibreOffice / OpenOffice / Pages all read. The implementation goes through
// a normalized HTML representation in both directions:
//
//   ODT  ──parse-content.xml──▶  HTML  ──emit-content.xml──▶  ODT
//   DOCX ──mammoth──▶  HTML  ──emit-document.xml──▶  DOCX
//
// We don't pull in a heavy DOCX-generator dependency; instead we craft the
// minimal OOXML / OpenDocument packages by hand. This keeps the bundle small
// and avoids any DOM-dependent libraries (everything has to run in Hermes).

import { File } from 'expo-file-system';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

import type { ConversionJob } from '../../types/conversion';

const SUPPORTED_SOURCES = new Set(['odt', 'docx', 'html', 'htm', 'md', 'markdown', 'txt']);
const SUPPORTED_TARGETS_FROM_ODT = new Set(['html', 'md', 'txt', 'docx', 'odt']);

export function canHandle(sourceExt: string, targetExt: string): boolean {
  if (sourceExt === 'odt') return SUPPORTED_TARGETS_FROM_ODT.has(targetExt);
  if (targetExt === 'odt') return SUPPORTED_SOURCES.has(sourceExt);
  // ODT-only converter. Other source→docx routing happens elsewhere.
  return false;
}

export function odtSupportedTargets(sourceExt: string): string[] {
  if (sourceExt === 'odt') {
    return Array.from(SUPPORTED_TARGETS_FROM_ODT).filter((t) => t !== 'odt');
  }
  if (SUPPORTED_SOURCES.has(sourceExt) && sourceExt !== 'odt') return ['odt'];
  return [];
}

// ---------- HTML helpers ----------

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unescapeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

// Tiny event-driven HTML tokenizer. Handles the subset of tags mammoth /
// marked emit (p, h1-6, ul, ol, li, strong, em, span, a, img, table, tr, td,
// th, br, blockquote, code, pre). Self-closing detection covers both
// `<br />` and HTML5 void elements.
const VOID_ELEMENTS = new Set(['br', 'hr', 'img', 'meta', 'link', 'input', 'wbr']);

type Token =
  | { type: 'open'; tag: string; attrs: Record<string, string>; selfClosing: boolean }
  | { type: 'close'; tag: string }
  | { type: 'text'; text: string };

function tokenizeHtml(html: string): Token[] {
  const tokens: Token[] = [];
  // Strip <!DOCTYPE>, comments, head/style/script blocks.
  html = html.replace(/<!doctype[^>]*>/gi, '');
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  html = html.replace(/<head[\s\S]*?<\/head>/gi, '');
  html = html.replace(/<style[\s\S]*?<\/style>/gi, '');
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  // Extract body content if present.
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) html = bodyMatch[1];

  let i = 0;
  while (i < html.length) {
    if (html[i] === '<') {
      const end = html.indexOf('>', i);
      if (end === -1) break;
      const raw = html.slice(i, end + 1);
      i = end + 1;
      if (raw.startsWith('</')) {
        const m = raw.match(/^<\/([a-zA-Z][a-zA-Z0-9]*)/);
        if (m) tokens.push({ type: 'close', tag: m[1].toLowerCase() });
        continue;
      }
      const tagMatch = raw.match(/^<([a-zA-Z][a-zA-Z0-9]*)([^>]*)>$/);
      if (!tagMatch) continue;
      const tag = tagMatch[1].toLowerCase();
      const attrsRaw = tagMatch[2] ?? '';
      const selfClosing = attrsRaw.endsWith('/') || VOID_ELEMENTS.has(tag);
      const attrs: Record<string, string> = {};
      const attrRegex = /([a-zA-Z_:][a-zA-Z0-9_:-]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      let am: RegExpExecArray | null;
      while ((am = attrRegex.exec(attrsRaw)) !== null) {
        const name = am[1].toLowerCase();
        const val = am[3] ?? am[4] ?? am[5] ?? '';
        attrs[name] = unescapeHtmlEntities(val);
      }
      tokens.push({ type: 'open', tag, attrs, selfClosing });
      if (selfClosing) tokens.push({ type: 'close', tag });
    } else {
      const next = html.indexOf('<', i);
      const end = next === -1 ? html.length : next;
      const text = html.slice(i, end);
      if (text.length > 0) {
        const cleaned = unescapeHtmlEntities(text);
        tokens.push({ type: 'text', text: cleaned });
      }
      i = end;
    }
  }
  return tokens;
}

// Parse `style="color:red;font-weight:bold"` into a key/value bag.
function parseStyleAttr(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of s.split(';')) {
    const idx = rule.indexOf(':');
    if (idx < 0) continue;
    const key = rule.slice(0, idx).trim().toLowerCase();
    const val = rule.slice(idx + 1).trim();
    if (key && val) out[key] = val;
  }
  return out;
}

// ---------- ODT writer ----------

interface InlineState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color?: string;
  background?: string;
  fontSizePt?: number;
  fontFamily?: string;
}

function emptyInline(): InlineState {
  return { bold: false, italic: false, underline: false, strike: false };
}

// ODT runs are written as `<text:span text:style-name="…">`. We collect the
// distinct combinations of inline properties as we go, allocate an automatic
// style name per combination, and write the `<office:automatic-styles>` block
// up front. This matches how LibreOffice produces ODT output.
interface OdtBuilder {
  styles: Map<string, InlineState>;
  styleNameFor: (state: InlineState) => string;
  imageDataUris: Map<string, { mime: string; bytes: Uint8Array }>;
}

function makeOdtBuilder(): OdtBuilder {
  const styles = new Map<string, InlineState>();
  return {
    styles,
    styleNameFor(state) {
      // Skip the default state — no span needed.
      if (
        !state.bold &&
        !state.italic &&
        !state.underline &&
        !state.strike &&
        !state.color &&
        !state.background &&
        state.fontSizePt === undefined &&
        !state.fontFamily
      ) {
        return '';
      }
      const key = JSON.stringify(state);
      if (!styles.has(key)) styles.set(key, state);
      return `T${Array.from(styles.keys()).indexOf(key) + 1}`;
    },
    imageDataUris: new Map(),
  };
}

function odtSpanWrap(text: string, state: InlineState, b: OdtBuilder): string {
  const name = b.styleNameFor(state);
  if (!name) return text;
  return `<text:span text:style-name="${name}">${text}</text:span>`;
}

// Walk HTML tokens and emit the inner body of ODT content.xml.
function htmlToOdtBody(html: string, builder: OdtBuilder): string {
  const tokens = tokenizeHtml(html);
  const out: string[] = [];
  const inlineStack: InlineState[] = [emptyInline()];
  const listStack: { tag: 'ul' | 'ol'; depth: number }[] = [];
  let inListItem = false;
  let blockOpen: { tag: string; level?: number } | null = null;
  let blockBuffer: string[] = [];

  // Push effective inline state by extending the top of the stack.
  const top = () => inlineStack[inlineStack.length - 1];
  const pushInline = (mut: Partial<InlineState>) => {
    inlineStack.push({ ...top(), ...mut });
  };
  const popInline = () => {
    inlineStack.pop();
    if (inlineStack.length === 0) inlineStack.push(emptyInline());
  };

  const closeBlock = () => {
    if (!blockOpen) return;
    const content = blockBuffer.join('');
    if (blockOpen.tag === 'h') {
      out.push(
        `<text:h text:style-name="Heading_20_${blockOpen.level}" text:outline-level="${blockOpen.level}">${content}</text:h>`,
      );
    } else if (blockOpen.tag === 'p') {
      out.push(`<text:p text:style-name="Standard">${content}</text:p>`);
    } else if (blockOpen.tag === 'blockquote') {
      out.push(`<text:p text:style-name="Quotations">${content}</text:p>`);
    } else if (blockOpen.tag === 'li') {
      out.push(`<text:list-item><text:p text:style-name="Standard">${content}</text:p></text:list-item>`);
    }
    blockOpen = null;
    blockBuffer = [];
  };

  for (const tok of tokens) {
    if (tok.type === 'text') {
      const txt = escapeXml(tok.text.replace(/\s+/g, ' '));
      if (blockOpen) {
        blockBuffer.push(odtSpanWrap(txt, top(), builder));
      } else if (txt.trim()) {
        // Loose text outside any block — wrap in <text:p>.
        out.push(`<text:p text:style-name="Standard">${odtSpanWrap(txt, top(), builder)}</text:p>`);
      }
      continue;
    }
    if (tok.type === 'open') {
      const t = tok.tag;
      switch (t) {
        case 'p':
          closeBlock();
          blockOpen = { tag: 'p' };
          break;
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6':
          closeBlock();
          blockOpen = { tag: 'h', level: parseInt(t[1], 10) };
          break;
        case 'blockquote':
          closeBlock();
          blockOpen = { tag: 'blockquote' };
          break;
        case 'br':
          if (blockOpen) blockBuffer.push('<text:line-break/>');
          break;
        case 'strong':
        case 'b':
          pushInline({ bold: true });
          break;
        case 'em':
        case 'i':
          pushInline({ italic: true });
          break;
        case 'u':
          pushInline({ underline: true });
          break;
        case 's':
        case 'strike':
        case 'del':
          pushInline({ strike: true });
          break;
        case 'span': {
          const cssStyle = parseStyleAttr(tok.attrs.style ?? '');
          const mut: Partial<InlineState> = {};
          if (cssStyle.color) mut.color = cssStyle.color;
          if (cssStyle['background-color']) mut.background = cssStyle['background-color'];
          if (cssStyle['font-family']) mut.fontFamily = cssStyle['font-family'].split(',')[0].replace(/['"]/g, '');
          if (cssStyle['font-size']) {
            const m = cssStyle['font-size'].match(/([\d.]+)\s*(pt|px)?/);
            if (m) {
              const v = parseFloat(m[1]);
              mut.fontSizePt = m[2] === 'px' ? v * 0.75 : v;
            }
          }
          if (cssStyle['font-weight'] && /^(bold|[6-9]00)$/i.test(cssStyle['font-weight'])) {
            mut.bold = true;
          }
          if (cssStyle['font-style'] === 'italic') mut.italic = true;
          if (cssStyle['text-decoration']?.includes('underline')) mut.underline = true;
          if (cssStyle['text-decoration']?.includes('line-through')) mut.strike = true;
          pushInline(mut);
          break;
        }
        case 'a':
          if (blockOpen) {
            const href = tok.attrs.href ?? '#';
            blockBuffer.push(
              `<text:a xlink:type="simple" xlink:href="${escapeXml(href)}">`,
            );
          }
          break;
        case 'ul':
        case 'ol':
          closeBlock();
          listStack.push({ tag: t, depth: listStack.length });
          out.push(
            `<text:list text:style-name="${t === 'ul' ? 'List_20_Bullet' : 'Numbering_20_123'}">`,
          );
          break;
        case 'li':
          closeBlock();
          blockOpen = { tag: 'li' };
          inListItem = true;
          break;
        case 'table':
          closeBlock();
          out.push('<table:table table:name="Table">');
          break;
        case 'tr':
          out.push('<table:table-row>');
          break;
        case 'th':
        case 'td':
          out.push('<table:table-cell office:value-type="string">');
          blockOpen = { tag: 'p' };
          if (t === 'th') pushInline({ bold: true });
          break;
        case 'img': {
          // Inline image — write a placeholder. Real image embedding requires
          // adding the file to the zip; we'll handle data: URIs in the wrapper.
          const src = tok.attrs.src ?? '';
          const m = src.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
          if (m && blockOpen) {
            const mime = m[1];
            const b64 = m[2];
            const ext = mime.split('/')[1].replace('+xml', '');
            const filename = `Pictures/image${builder.imageDataUris.size + 1}.${ext}`;
            const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
            builder.imageDataUris.set(filename, { mime, bytes });
            blockBuffer.push(
              `<draw:frame text:anchor-type="as-char" draw:name="img${builder.imageDataUris.size}" svg:width="3in" svg:height="2in"><draw:image xlink:href="${escapeXml(filename)}" xlink:type="simple"/></draw:frame>`,
            );
          }
          break;
        }
      }
    } else if (tok.type === 'close') {
      const t = tok.tag;
      switch (t) {
        case 'p':
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6':
        case 'blockquote':
          closeBlock();
          break;
        case 'strong':
        case 'b':
        case 'em':
        case 'i':
        case 'u':
        case 's':
        case 'strike':
        case 'del':
        case 'span':
          popInline();
          break;
        case 'a':
          if (blockOpen) blockBuffer.push('</text:a>');
          break;
        case 'ul':
        case 'ol':
          closeBlock();
          listStack.pop();
          out.push('</text:list>');
          break;
        case 'li':
          closeBlock();
          inListItem = false;
          break;
        case 'table':
          closeBlock();
          out.push('</table:table>');
          break;
        case 'tr':
          out.push('</table:table-row>');
          break;
        case 'th':
        case 'td':
          closeBlock();
          out.push('</table:table-cell>');
          if (t === 'th') popInline();
          break;
      }
    }
  }
  closeBlock();
  // Force-close any still-open lists in pathological inputs.
  while (listStack.length) {
    out.push('</text:list>');
    listStack.pop();
  }
  void inListItem;
  return out.join('');
}

function odtAutoStyles(builder: OdtBuilder): string {
  const lines: string[] = [];
  let n = 0;
  for (const state of builder.styles.values()) {
    n++;
    const propsTextParts: string[] = [];
    if (state.bold) propsTextParts.push('fo:font-weight="bold" style:font-weight-asian="bold" style:font-weight-complex="bold"');
    if (state.italic) propsTextParts.push('fo:font-style="italic" style:font-style-asian="italic" style:font-style-complex="italic"');
    if (state.underline) propsTextParts.push('style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"');
    if (state.strike) propsTextParts.push('style:text-line-through-style="solid"');
    if (state.color) propsTextParts.push(`fo:color="${escapeXml(state.color)}"`);
    if (state.background) propsTextParts.push(`fo:background-color="${escapeXml(state.background)}"`);
    if (state.fontFamily) {
      const ff = escapeXml(state.fontFamily);
      propsTextParts.push(`fo:font-family="${ff}" style:font-family-asian="${ff}" style:font-family-complex="${ff}"`);
    }
    if (state.fontSizePt !== undefined) {
      const sz = `${state.fontSizePt.toFixed(1)}pt`;
      propsTextParts.push(`fo:font-size="${sz}" style:font-size-asian="${sz}" style:font-size-complex="${sz}"`);
    }
    lines.push(
      `<style:style style:name="T${n}" style:family="text"><style:text-properties ${propsTextParts.join(' ')}/></style:style>`,
    );
  }
  return lines.join('');
}

const ODT_CONTENT_XMLNS =
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ' +
  'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" ' +
  'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" ' +
  'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" ' +
  'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" ' +
  'xmlns:xlink="http://www.w3.org/1999/xlink" ' +
  'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" ' +
  'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"';

const ODT_STYLES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles ${ODT_CONTENT_XMLNS} office:version="1.2">
  <office:styles>
    <style:style style:name="Standard" style:family="paragraph" style:class="text"/>
    <style:style style:name="Heading_20_1" style:display-name="Heading 1" style:family="paragraph" style:parent-style-name="Standard"><style:text-properties fo:font-size="20pt" fo:font-weight="bold"/></style:style>
    <style:style style:name="Heading_20_2" style:display-name="Heading 2" style:family="paragraph" style:parent-style-name="Standard"><style:text-properties fo:font-size="16pt" fo:font-weight="bold"/></style:style>
    <style:style style:name="Heading_20_3" style:display-name="Heading 3" style:family="paragraph" style:parent-style-name="Standard"><style:text-properties fo:font-size="14pt" fo:font-weight="bold"/></style:style>
    <style:style style:name="Heading_20_4" style:display-name="Heading 4" style:family="paragraph" style:parent-style-name="Standard"><style:text-properties fo:font-size="12pt" fo:font-weight="bold"/></style:style>
    <style:style style:name="Heading_20_5" style:display-name="Heading 5" style:family="paragraph" style:parent-style-name="Standard"><style:text-properties fo:font-size="11pt" fo:font-weight="bold"/></style:style>
    <style:style style:name="Heading_20_6" style:display-name="Heading 6" style:family="paragraph" style:parent-style-name="Standard"><style:text-properties fo:font-size="10pt" fo:font-weight="bold"/></style:style>
    <style:style style:name="Quotations" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-left="1cm" fo:margin-right="1cm" fo:margin-top="0.1cm" fo:margin-bottom="0.1cm"/><style:text-properties fo:font-style="italic"/></style:style>
    <style:style style:name="List_20_Bullet" style:family="paragraph" style:parent-style-name="Standard" style:list-style-name="List_20_Bullet"/>
    <style:style style:name="Numbering_20_123" style:family="paragraph" style:parent-style-name="Standard" style:list-style-name="Numbering_20_123"/>
    <text:list-style style:name="List_20_Bullet">
      <text:list-level-style-bullet text:level="1" text:bullet-char="•"/>
    </text:list-style>
    <text:list-style style:name="Numbering_20_123">
      <text:list-level-style-number text:level="1" style:num-format="1" style:num-suffix="."/>
    </text:list-style>
  </office:styles>
</office:document-styles>`;

async function htmlToOdtZip(html: string, title: string): Promise<Uint8Array> {
  const builder = makeOdtBuilder();
  const body = htmlToOdtBody(html, builder);
  const autoStyles = odtAutoStyles(builder);

  const contentXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content ${ODT_CONTENT_XMLNS} office:version="1.2">
  <office:automatic-styles>${autoStyles}</office:automatic-styles>
  <office:body><office:text>${body}</office:text></office:body>
</office:document-content>`;

  const metaXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta ${ODT_CONTENT_XMLNS} xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.2">
  <office:meta><dc:title>${escapeXml(title)}</dc:title><meta:generator>LocalConvert</meta:generator></office:meta>
</office:document-meta>`;

  const manifestEntries: string[] = [
    '<manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="application/vnd.oasis.opendocument.text"/>',
    '<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>',
    '<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>',
    '<manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>',
  ];
  for (const [path, info] of builder.imageDataUris.entries()) {
    manifestEntries.push(
      `<manifest:file-entry manifest:full-path="${escapeXml(path)}" manifest:media-type="${escapeXml(info.mime)}"/>`,
    );
  }
  const manifestXml = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
${manifestEntries.join('\n')}
</manifest:manifest>`;

  const zip = new JSZip();
  // The mimetype file MUST be the first entry in the zip, uncompressed.
  zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' });
  zip.file('META-INF/manifest.xml', manifestXml);
  zip.file('content.xml', contentXml);
  zip.file('styles.xml', ODT_STYLES_XML);
  zip.file('meta.xml', metaXml);
  for (const [path, info] of builder.imageDataUris.entries()) {
    zip.file(path, info.bytes);
  }

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

// ---------- DOCX writer ----------

function docxRunProps(state: InlineState): string {
  const parts: string[] = [];
  if (state.bold) parts.push('<w:b/>');
  if (state.italic) parts.push('<w:i/>');
  if (state.underline) parts.push('<w:u w:val="single"/>');
  if (state.strike) parts.push('<w:strike/>');
  if (state.color) {
    const hex = state.color.replace(/^#/, '').toUpperCase();
    if (/^[0-9A-F]{6}$/.test(hex)) parts.push(`<w:color w:val="${hex}"/>`);
  }
  if (state.background) {
    const hex = state.background.replace(/^#/, '').toUpperCase();
    if (/^[0-9A-F]{6}$/.test(hex)) {
      parts.push(`<w:highlight w:val="yellow"/>`); // fall-back; OOXML highlight is enum
      parts.push(`<w:shd w:val="clear" w:color="auto" w:fill="${hex}"/>`);
    }
  }
  if (state.fontSizePt !== undefined) {
    const halfPt = Math.round(state.fontSizePt * 2);
    parts.push(`<w:sz w:val="${halfPt}"/><w:szCs w:val="${halfPt}"/>`);
  }
  if (state.fontFamily) {
    const ff = escapeXml(state.fontFamily);
    parts.push(`<w:rFonts w:ascii="${ff}" w:hAnsi="${ff}" w:cs="${ff}"/>`);
  }
  return parts.length ? `<w:rPr>${parts.join('')}</w:rPr>` : '';
}

function docxRun(text: string, state: InlineState): string {
  if (!text) return '';
  const rPr = docxRunProps(state);
  // <w:t xml:space="preserve"> preserves leading/trailing whitespace.
  return `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

interface DocxBuilder {
  imageRels: Map<string, { rId: string; ext: string; bytes: Uint8Array }>;
  nextRelId: number;
}

function makeDocxBuilder(): DocxBuilder {
  return { imageRels: new Map(), nextRelId: 100 };
}

function htmlToDocxBody(html: string, builder: DocxBuilder): string {
  const tokens = tokenizeHtml(html);
  const out: string[] = [];
  const inlineStack: InlineState[] = [emptyInline()];
  const top = () => inlineStack[inlineStack.length - 1];
  const push = (m: Partial<InlineState>) => inlineStack.push({ ...top(), ...m });
  const pop = () => {
    inlineStack.pop();
    if (!inlineStack.length) inlineStack.push(emptyInline());
  };

  let pendingStyle: string | null = null; // pStyle val for next paragraph
  let runBuffer: string[] = [];
  let inListLevel = -1; // numId 1=bullet, 2=number; -1 = no list
  let listType: 'ul' | 'ol' | null = null;
  const closeParagraph = () => {
    const styleXml = pendingStyle
      ? `<w:pPr><w:pStyle w:val="${pendingStyle}"/></w:pPr>`
      : inListLevel >= 0
      ? `<w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="${inListLevel}"/><w:numId w:val="${listType === 'ul' ? 1 : 2}"/></w:numPr></w:pPr>`
      : '';
    out.push(`<w:p>${styleXml}${runBuffer.join('')}</w:p>`);
    runBuffer = [];
    pendingStyle = null;
  };

  for (const tok of tokens) {
    if (tok.type === 'text') {
      const txt = tok.text.replace(/\s+/g, ' ');
      if (txt) runBuffer.push(docxRun(txt, top()));
      continue;
    }
    if (tok.type === 'open') {
      const t = tok.tag;
      switch (t) {
        case 'p':
        case 'div':
          break; // will close on </p>
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6':
          pendingStyle = `Heading${t[1]}`;
          break;
        case 'blockquote':
          pendingStyle = 'Quote';
          break;
        case 'br':
          runBuffer.push('<w:r><w:br/></w:r>');
          break;
        case 'strong':
        case 'b':
          push({ bold: true });
          break;
        case 'em':
        case 'i':
          push({ italic: true });
          break;
        case 'u':
          push({ underline: true });
          break;
        case 's':
        case 'strike':
        case 'del':
          push({ strike: true });
          break;
        case 'span': {
          const css = parseStyleAttr(tok.attrs.style ?? '');
          const mut: Partial<InlineState> = {};
          if (css.color) mut.color = css.color;
          if (css['background-color']) mut.background = css['background-color'];
          if (css['font-family']) mut.fontFamily = css['font-family'].split(',')[0].replace(/['"]/g, '');
          if (css['font-size']) {
            const m = css['font-size'].match(/([\d.]+)\s*(pt|px)?/);
            if (m) {
              const v = parseFloat(m[1]);
              mut.fontSizePt = m[2] === 'px' ? v * 0.75 : v;
            }
          }
          if (css['font-weight'] && /^(bold|[6-9]00)$/i.test(css['font-weight'])) mut.bold = true;
          if (css['font-style'] === 'italic') mut.italic = true;
          if (css['text-decoration']?.includes('underline')) mut.underline = true;
          if (css['text-decoration']?.includes('line-through')) mut.strike = true;
          push(mut);
          break;
        }
        case 'ul':
        case 'ol':
          inListLevel += 1;
          listType = t;
          break;
        case 'li':
          break;
        case 'table':
          closeParagraph();
          out.push('<w:tbl>');
          break;
        case 'tr':
          out.push('<w:tr>');
          break;
        case 'th':
        case 'td':
          out.push('<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>');
          if (t === 'th') push({ bold: true });
          break;
        case 'img': {
          const src = tok.attrs.src ?? '';
          const m = src.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
          if (m) {
            const mime = m[1];
            const b64 = m[2];
            const ext = mime.split('/')[1].replace('+xml', '');
            const id = `R${builder.nextRelId++}`;
            const filename = `media/image${builder.imageRels.size + 1}.${ext}`;
            const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
            builder.imageRels.set(filename, { rId: id, ext, bytes });
            // Inline drawing element is verbose; for MVP we just leave a
            // placeholder paragraph. Most word processors will surface the
            // image via the relationship even without the drawing markup, but
            // that's not strictly conformant. Skip for now.
          }
          break;
        }
      }
    } else if (tok.type === 'close') {
      const t = tok.tag;
      switch (t) {
        case 'p':
        case 'div':
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6':
        case 'blockquote':
          closeParagraph();
          break;
        case 'strong':
        case 'b':
        case 'em':
        case 'i':
        case 'u':
        case 's':
        case 'strike':
        case 'del':
        case 'span':
          pop();
          break;
        case 'ul':
        case 'ol':
          inListLevel -= 1;
          if (inListLevel < 0) listType = null;
          break;
        case 'li':
          closeParagraph();
          break;
        case 'table':
          out.push('</w:tbl>');
          break;
        case 'tr':
          out.push('</w:tr>');
          break;
        case 'th':
        case 'td':
          closeParagraph();
          out.push('</w:tc>');
          if (t === 'th') pop();
          break;
      }
    }
  }
  if (runBuffer.length) closeParagraph();
  return out.join('');
}

const DOCX_NUMBERING_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/></w:lvl>
    <w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/></w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="1">
    <w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/></w:lvl>
    <w:lvl w:ilvl="1"><w:numFmt w:val="decimal"/><w:lvlText w:val="%2."/><w:lvlJc w:val="left"/></w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;

const DOCX_STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:pPr><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading4"><w:name w:val="heading 4"/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading5"><w:name w:val="heading 5"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading6"><w:name w:val="heading 6"/><w:rPr><w:b/><w:sz w:val="20"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:pPr><w:ind w:left="720" w:right="720"/></w:pPr><w:rPr><w:i/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/></w:style>
</w:styles>`;

async function htmlToDocxZip(html: string, title: string): Promise<Uint8Array> {
  const builder = makeDocxBuilder();
  const body = htmlToDocxBody(html, builder);

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body>
</w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`;

  const docRelsEntries = [
    '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
    '<Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>',
  ];
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${docRelsEntries.join('')}</Relationships>`;

  const coreProps = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>${escapeXml(title)}</dc:title>
  <dc:creator>LocalConvert</dc:creator>
</cp:coreProperties>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypes);
  zip.file('_rels/.rels', rootRels);
  zip.file('word/document.xml', documentXml);
  zip.file('word/_rels/document.xml.rels', docRels);
  zip.file('word/styles.xml', DOCX_STYLES_XML);
  zip.file('word/numbering.xml', DOCX_NUMBERING_XML);
  zip.file('docProps/core.xml', coreProps);

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

// ---------- ODT parser ----------

type XmlNode = Record<string, unknown> & { ':@'?: Record<string, string> };

function tagOf(node: XmlNode): string | null {
  for (const k of Object.keys(node)) {
    if (k !== ':@') return k;
  }
  return null;
}

function childrenOf(node: XmlNode): XmlNode[] {
  const tag = tagOf(node);
  if (!tag) return [];
  const c = node[tag];
  return Array.isArray(c) ? (c as XmlNode[]) : [];
}

function attrOf(node: XmlNode, key: string): string | undefined {
  return node[':@']?.[`@_${key}`];
}

function findFirstByTag(roots: XmlNode[], target: string): XmlNode | null {
  for (const r of roots) {
    if (tagOf(r) === target) return r;
    const found = findFirstByTag(childrenOf(r), target);
    if (found) return found;
  }
  return null;
}

interface OdtStyleInfo {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  background?: string;
  fontSize?: string;
  fontFamily?: string;
  parent?: string;
}

function readOdtStyle(node: XmlNode): OdtStyleInfo {
  const out: OdtStyleInfo = {};
  out.parent = attrOf(node, 'style:parent-style-name');
  for (const c of childrenOf(node)) {
    if (tagOf(c) === 'style:text-properties') {
      const weight = attrOf(c, 'fo:font-weight');
      const italic = attrOf(c, 'fo:font-style');
      const ul = attrOf(c, 'style:text-underline-style');
      const strike = attrOf(c, 'style:text-line-through-style');
      const color = attrOf(c, 'fo:color');
      const bg = attrOf(c, 'fo:background-color');
      const size = attrOf(c, 'fo:font-size');
      const family = attrOf(c, 'fo:font-family');
      if (weight && weight !== 'normal') out.bold = true;
      if (italic === 'italic') out.italic = true;
      if (ul && ul !== 'none') out.underline = true;
      if (strike && strike !== 'none') out.strike = true;
      if (color) out.color = color;
      if (bg) out.background = bg;
      if (size) out.fontSize = size;
      if (family) out.fontFamily = family;
    }
  }
  return out;
}

function renderOdtInline(node: XmlNode, styles: Map<string, OdtStyleInfo>): string {
  let out = '';
  for (const c of childrenOf(node)) {
    const t = tagOf(c);
    const direct = (c as { '#text'?: unknown })['#text'];
    if (direct !== undefined && direct !== null) {
      out += escapeXml(String(direct));
      continue;
    }
    if (t === 'text:span') {
      const styleName = attrOf(c, 'text:style-name');
      const style = styleName ? styles.get(styleName) : undefined;
      const inner = renderOdtInline(c, styles);
      if (!style) {
        out += inner;
        continue;
      }
      const cssParts: string[] = [];
      if (style.color) cssParts.push(`color:${style.color}`);
      if (style.background) cssParts.push(`background-color:${style.background}`);
      if (style.fontFamily) cssParts.push(`font-family:${style.fontFamily}`);
      if (style.fontSize) cssParts.push(`font-size:${style.fontSize}`);
      let wrapped = inner;
      if (style.bold) wrapped = `<strong>${wrapped}</strong>`;
      if (style.italic) wrapped = `<em>${wrapped}</em>`;
      if (style.underline)
        wrapped = `<span style="text-decoration:underline">${wrapped}</span>`;
      if (style.strike) wrapped = `<s>${wrapped}</s>`;
      if (cssParts.length) wrapped = `<span style="${cssParts.join(';')}">${wrapped}</span>`;
      out += wrapped;
    } else if (t === 'text:line-break') {
      out += '<br />';
    } else if (t === 'text:tab') {
      out += '    ';
    } else if (t === 'text:a') {
      const href = attrOf(c, 'xlink:href') ?? '#';
      out += `<a href="${escapeXml(href)}">${renderOdtInline(c, styles)}</a>`;
    } else if (t === 'draw:frame') {
      const image = findFirstByTag(childrenOf(c), 'draw:image');
      if (image) {
        const href = attrOf(image, 'xlink:href');
        if (href) {
          out += `<img src="${escapeXml(href)}" alt="" />`;
        }
      }
    } else if (t) {
      // Walk through unknown wrappers — e.g. nested text:span variants.
      out += renderOdtInline(c, styles);
    }
  }
  return out;
}

function renderOdtTable(
  node: XmlNode,
  styles: Map<string, OdtStyleInfo>,
): string {
  const rows: string[] = [];
  for (const child of childrenOf(node)) {
    if (tagOf(child) !== 'table:table-row') continue;
    const cells: string[] = [];
    for (const cellNode of childrenOf(child)) {
      if (tagOf(cellNode) !== 'table:table-cell') continue;
      let cellHtml = '';
      for (const inner of childrenOf(cellNode)) {
        const t = tagOf(inner);
        if (t === 'text:p' || t === 'text:h') cellHtml += renderOdtInline(inner, styles);
        else if (t === 'table:table') cellHtml += renderOdtTable(inner, styles);
      }
      cells.push(`<td>${cellHtml || '&nbsp;'}</td>`);
    }
    rows.push(`<tr>${cells.join('')}</tr>`);
  }
  return `<table>${rows.join('')}</table>`;
}

function renderOdtList(
  node: XmlNode,
  styles: Map<string, OdtStyleInfo>,
  ordered: boolean,
): string {
  const items: string[] = [];
  for (const child of childrenOf(node)) {
    if (tagOf(child) !== 'text:list-item') continue;
    let itemHtml = '';
    for (const sub of childrenOf(child)) {
      const t = tagOf(sub);
      if (t === 'text:p') itemHtml += renderOdtInline(sub, styles);
      else if (t === 'text:list') itemHtml += renderOdtList(sub, styles, ordered);
    }
    items.push(`<li>${itemHtml}</li>`);
  }
  return ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`;
}

async function parseOdtToHtml(arrayBuffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const contentFile = zip.files['content.xml'];
  if (!contentFile) throw new Error('ODT is missing content.xml');
  const contentXml = await contentFile.async('text');

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
  const parsed = parser.parse(contentXml) as XmlNode[];

  // Collect styles from content.xml (automatic-styles) and styles.xml.
  const styles = new Map<string, OdtStyleInfo>();
  const collectStyles = (xml: string) => {
    const parsedXml = parser.parse(xml) as XmlNode[];
    const walk = (nodes: XmlNode[]) => {
      for (const n of nodes) {
        if (tagOf(n) === 'style:style') {
          const name = attrOf(n, 'style:name');
          if (name) styles.set(name, readOdtStyle(n));
        } else {
          walk(childrenOf(n));
        }
      }
    };
    walk(parsedXml);
  };
  collectStyles(contentXml);
  if (zip.files['styles.xml']) {
    collectStyles(await zip.files['styles.xml'].async('text'));
  }

  // Resolve style parents (single level — for our purposes that's enough).
  for (const [name, s] of styles.entries()) {
    let cur = s;
    while (cur.parent) {
      const parent = styles.get(cur.parent);
      if (!parent) break;
      for (const k of Object.keys(parent) as (keyof OdtStyleInfo)[]) {
        if (cur[k] === undefined && parent[k] !== undefined) {
          (cur as any)[k] = parent[k];
        }
      }
      cur = parent;
    }
    void name;
  }

  const officeText = findFirstByTag(parsed, 'office:text');
  if (!officeText) return '';

  // Walk children of office:text, grouping consecutive list elements.
  const html: string[] = [];
  for (const child of childrenOf(officeText)) {
    const t = tagOf(child);
    if (t === 'text:h') {
      const lvl = parseInt(attrOf(child, 'text:outline-level') ?? '1', 10);
      const lvlClamped = Math.min(6, Math.max(1, lvl));
      html.push(`<h${lvlClamped}>${renderOdtInline(child, styles) || '&nbsp;'}</h${lvlClamped}>`);
    } else if (t === 'text:p') {
      const inner = renderOdtInline(child, styles);
      html.push(`<p>${inner || '&nbsp;'}</p>`);
    } else if (t === 'text:list') {
      // Detect ordered vs bullet by looking at the referenced list-style.
      const styleName = attrOf(child, 'text:style-name') ?? '';
      const ordered = /[Nn]umbering|[Oo]rdered/.test(styleName);
      html.push(renderOdtList(child, styles, ordered));
    } else if (t === 'table:table') {
      html.push(renderOdtTable(child, styles));
    }
  }
  return html.join('\n');
}

// ---------- Public entry point ----------

const HTML_WRAPPER_STYLE = `body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 820px; margin: 2rem auto; padding: 2rem 2.5rem; color: #1f1f1f; line-height: 1.6; background: #fff; }
table { border-collapse: collapse; margin: 1em 0; }
table td, table th { border: 1px solid #d0d0d0; padding: 0.4em 0.6em; }
img { max-width: 100%; height: auto; }`;

function wrapAsHtml(inner: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeXml(title)}</title>
<style>${HTML_WRAPPER_STYLE}</style></head>
<body>${inner}</body></html>`;
}

async function sourceToHtml(job: ConversionJob): Promise<string> {
  const src = new File(job.source.uri);
  const ext = job.source.ext;

  if (ext === 'odt') {
    const bytes = await src.bytes();
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return parseOdtToHtml(buf);
  }
  if (ext === 'docx') {
    // @ts-expect-error - mammoth has no types for the browser bundle
    const mammothModule = await import('mammoth/mammoth.browser.js');
    const mammoth = mammothModule.default ?? mammothModule;
    const bytes = await src.bytes();
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const result = await mammoth.convertToHtml(
      { arrayBuffer: buf },
      { convertImage: mammoth.images.dataUri },
    );
    return result.value as string;
  }
  if (ext === 'html' || ext === 'htm') return await src.text();
  if (ext === 'md' || ext === 'markdown') {
    const text = await src.text();
    const { marked } = await import('marked');
    return marked.parse(text, { async: false }) as string;
  }
  if (ext === 'txt') {
    const text = await src.text();
    const paragraphs = text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p>${escapeXml(p).replace(/\n/g, '<br />')}</p>`);
    return paragraphs.join('');
  }
  throw new Error(`Cannot read .${ext} for ODT conversion`);
}

export async function convertOdt(
  job: ConversionJob,
  outputPath: string,
): Promise<{ uri: string; size: number }> {
  const dest = new File(outputPath);
  if (dest.exists) dest.delete();

  // Source ODT routes
  if (job.source.ext === 'odt') {
    const src = new File(job.source.uri);
    const bytes = await src.bytes();
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const innerHtml = await parseOdtToHtml(buf);

    if (job.targetExt === 'html') {
      dest.create();
      dest.write(wrapAsHtml(innerHtml, job.outputName));
      return { uri: dest.uri, size: dest.size };
    }
    if (job.targetExt === 'md') {
      const { default: TurndownService } = await import('turndown');
      const t = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
      dest.create();
      dest.write(t.turndown(innerHtml));
      return { uri: dest.uri, size: dest.size };
    }
    if (job.targetExt === 'txt') {
      const text = innerHtml
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|h[1-6]|li|tr)>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\n{3,}/g, '\n\n');
      dest.create();
      dest.write(unescapeHtmlEntities(text));
      return { uri: dest.uri, size: dest.size };
    }
    if (job.targetExt === 'docx') {
      const docxBytes = await htmlToDocxZip(innerHtml, job.outputName);
      dest.create();
      dest.write(docxBytes);
      return { uri: dest.uri, size: dest.size };
    }
  }

  // Target ODT routes
  if (job.targetExt === 'odt') {
    const innerHtml = await sourceToHtml(job);
    const odtBytes = await htmlToOdtZip(innerHtml, job.outputName);
    dest.create();
    dest.write(odtBytes);
    return { uri: dest.uri, size: dest.size };
  }

  throw new Error(
    `ODT converter doesn't support ${job.source.ext.toUpperCase()} → ${job.targetExt.toUpperCase()}`,
  );
}
