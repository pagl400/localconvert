import { File } from 'expo-file-system';

import type { ConversionJob } from '../../types/conversion';

const TEXT_EXTS = new Set(['txt', 'md', 'html', 'json', 'csv', 'xml', 'yaml', 'yml']);

interface Edge {
  from: string;
  to: string;
  transform: (input: string) => string | Promise<string>;
}

function stripTags(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function txtToHtml(input: string): string {
  const escaped = escapeHtml(input);
  return `<!DOCTYPE html>\n<html><body><pre>${escaped}</pre></body></html>\n`;
}

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cur.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  return rows.filter((r) => r.length > 0 && !(r.length === 1 && r[0] === ''));
}

function csvToJson(input: string): string {
  const rows = parseCsv(input);
  if (rows.length === 0) return '[]\n';
  const [header, ...body] = rows;
  const records = body.map((row) => {
    const obj: Record<string, string> = {};
    header.forEach((key, i) => {
      obj[key] = row[i] ?? '';
    });
    return obj;
  });
  return `${JSON.stringify(records, null, 2)}\n`;
}

function jsonToCsv(input: string): string {
  const data = JSON.parse(input);
  const rows: unknown[] = Array.isArray(data) ? data : [data];
  if (rows.length === 0) return '';
  const keys = Array.from(
    rows.reduce<Set<string>>((acc, row) => {
      if (row && typeof row === 'object') {
        for (const k of Object.keys(row as object)) acc.add(k);
      }
      return acc;
    }, new Set<string>()),
  );
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [keys.join(',')];
  for (const row of rows) {
    if (row && typeof row === 'object') {
      lines.push(keys.map((k) => escape((row as Record<string, unknown>)[k])).join(','));
    } else {
      lines.push(escape(row));
    }
  }
  return `${lines.join('\n')}\n`;
}

async function mdToHtml(s: string): Promise<string> {
  const { marked } = await import('marked');
  return `${marked.parse(s, { async: false }) as string}\n`;
}

async function htmlToMd(s: string): Promise<string> {
  const { default: TurndownService } = await import('turndown');
  return `${new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' }).turndown(s)}\n`;
}

async function mdToTxt(s: string): Promise<string> {
  const { marked } = await import('marked');
  return `${stripTags(marked.parse(s, { async: false }) as string)}\n`;
}

async function jsonToYaml(s: string): Promise<string> {
  const YAML = await import('yaml');
  return `${YAML.stringify(JSON.parse(s))}`;
}

async function yamlToJson(s: string): Promise<string> {
  const YAML = await import('yaml');
  return `${JSON.stringify(YAML.parse(s), null, 2)}\n`;
}

async function jsonToXml(s: string): Promise<string> {
  const { XMLBuilder } = await import('fast-xml-parser');
  const data = JSON.parse(s);
  const root = Array.isArray(data) ? { items: { item: data } } : data;
  const builder = new XMLBuilder({ format: true, indentBy: '  ' });
  return `<?xml version="1.0" encoding="UTF-8"?>\n${builder.build(root)}`;
}

async function xmlToJson(s: string): Promise<string> {
  const { XMLParser } = await import('fast-xml-parser');
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  return `${JSON.stringify(parser.parse(s), null, 2)}\n`;
}

const EDGES: Edge[] = [
  { from: 'md', to: 'html', transform: mdToHtml },
  { from: 'html', to: 'md', transform: htmlToMd },
  { from: 'html', to: 'txt', transform: (s) => `${stripTags(s)}\n` },
  { from: 'md', to: 'txt', transform: mdToTxt },
  { from: 'txt', to: 'html', transform: txtToHtml },
  { from: 'txt', to: 'md', transform: (s) => s },
  { from: 'csv', to: 'json', transform: csvToJson },
  { from: 'json', to: 'csv', transform: jsonToCsv },
  { from: 'json', to: 'yaml', transform: jsonToYaml },
  { from: 'yaml', to: 'json', transform: yamlToJson },
  { from: 'json', to: 'xml', transform: jsonToXml },
  { from: 'xml', to: 'json', transform: xmlToJson },
  { from: 'yaml', to: 'xml', transform: async (s) => jsonToXml(await yamlToJson(s)) },
  { from: 'xml', to: 'yaml', transform: async (s) => jsonToYaml(await xmlToJson(s)) },
];

function alias(ext: string): string {
  if (ext === 'jpeg') return 'jpg';
  if (ext === 'yml') return 'yaml';
  return ext;
}

function findEdge(from: string, to: string): Edge | null {
  return EDGES.find((e) => e.from === from && e.to === to) ?? null;
}

export function canHandle(sourceExt: string, targetExt: string): boolean {
  const from = alias(sourceExt);
  const to = alias(targetExt);
  if (!TEXT_EXTS.has(from) || !TEXT_EXTS.has(to)) return false;
  if (from === to) return true;
  return findEdge(from, to) !== null;
}

export async function convertText(
  job: ConversionJob,
  outputPath: string,
): Promise<{ uri: string; size: number }> {
  const from = alias(job.source.ext);
  const to = alias(job.targetExt);
  const source = new File(job.source.uri);
  const input = await source.text();

  let output: string;
  if (from === to) {
    output = input;
  } else {
    const edge = findEdge(from, to);
    if (!edge) throw new Error(`No text converter from ${from} to ${to}.`);
    output = await edge.transform(input);
  }

  const dest = new File(outputPath);
  if (dest.exists) dest.delete();
  dest.create();
  dest.write(output);
  return { uri: dest.uri, size: dest.size };
}

export function textSupportedTargets(sourceExt: string): string[] {
  const from = alias(sourceExt);
  if (!TEXT_EXTS.has(from)) return [];
  const targets = new Set<string>();
  for (const edge of EDGES) {
    if (edge.from === from) targets.add(edge.to);
  }
  return Array.from(targets);
}
