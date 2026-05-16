import { File } from 'expo-file-system';
import * as XLSX from 'xlsx';

import type { ConversionJob } from '../../types/conversion';

const SUPPORTED_SOURCES = new Set(['xlsx', 'xls', 'ods']);
const SUPPORTED_TARGETS = new Set(['csv', 'json', 'html', 'xlsx']);

export function canHandle(sourceExt: string, targetExt: string): boolean {
  return SUPPORTED_SOURCES.has(sourceExt) && SUPPORTED_TARGETS.has(targetExt);
}

export function spreadsheetSupportedTargets(sourceExt: string): string[] {
  if (!SUPPORTED_SOURCES.has(sourceExt)) return [];
  return Array.from(SUPPORTED_TARGETS).filter((t) => t !== sourceExt);
}

export async function convertSpreadsheet(
  job: ConversionJob,
  outputPath: string,
): Promise<{ uri: string; size: number }> {
  const source = new File(job.source.uri);
  const bytes = await source.bytes();
  const workbook = XLSX.read(bytes, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error('Spreadsheet has no sheets.');
  const firstSheet = workbook.Sheets[firstSheetName];

  const dest = new File(outputPath);
  if (dest.exists) dest.delete();

  if (job.targetExt === 'csv') {
    const csv = XLSX.utils.sheet_to_csv(firstSheet);
    dest.create();
    dest.write(`${csv}\n`);
  } else if (job.targetExt === 'json') {
    if (workbook.SheetNames.length === 1) {
      const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: null });
      dest.create();
      dest.write(`${JSON.stringify(rows, null, 2)}\n`);
    } else {
      const all = Object.fromEntries(
        workbook.SheetNames.map((name) => [name, XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: null })]),
      );
      dest.create();
      dest.write(`${JSON.stringify(all, null, 2)}\n`);
    }
  } else if (job.targetExt === 'html') {
    const html = XLSX.utils.sheet_to_html(firstSheet);
    dest.create();
    dest.write(html);
  } else if (job.targetExt === 'xlsx') {
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as Uint8Array;
    dest.create();
    dest.write(buffer);
  } else {
    throw new Error(`Unsupported spreadsheet target: ${job.targetExt}`);
  }

  return { uri: dest.uri, size: dest.size };
}
