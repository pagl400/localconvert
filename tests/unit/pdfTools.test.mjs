import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePageRanges, canHandle } from '../unit-build/pdfToolsLogic.js';

describe('parsePageRanges', () => {
  it('parses a single page', () => {
    assert.deepEqual(parsePageRanges('5', 10), [5]);
  });

  it('parses a range', () => {
    assert.deepEqual(parsePageRanges('1-5', 10), [1, 2, 3, 4, 5]);
  });

  it('parses mixed singletons and ranges', () => {
    assert.deepEqual(parsePageRanges('1-3, 5, 8-9', 10), [1, 2, 3, 5, 8, 9]);
  });

  it('deduplicates and sorts overlapping input', () => {
    assert.deepEqual(parsePageRanges('5, 1-3, 2, 4-6', 10), [1, 2, 3, 4, 5, 6]);
  });

  it('clamps to the document range', () => {
    assert.deepEqual(parsePageRanges('1-20', 5), [1, 2, 3, 4, 5]);
    assert.deepEqual(parsePageRanges('0, 6', 5), [6 > 5 ? null : 6].filter(Boolean));
    assert.deepEqual(parsePageRanges('6', 5), []);
  });

  it('treats reversed ranges as inclusive', () => {
    assert.deepEqual(parsePageRanges('5-3', 10), [3, 4, 5]);
  });

  it('ignores whitespace and garbage tokens', () => {
    assert.deepEqual(parsePageRanges(' 1 , 2 - 3 ,, , 5 ', 10), [1, 2, 3, 5]);
    assert.deepEqual(parsePageRanges('abc, 2', 10), [2]);
  });

  it('returns empty array for empty input', () => {
    assert.deepEqual(parsePageRanges('', 10), []);
    assert.deepEqual(parsePageRanges('   ', 10), []);
  });

  it('drops negative and zero pages', () => {
    assert.deepEqual(parsePageRanges('0, -1, 2', 10), [2]);
  });
});

describe('pdfTools.canHandle', () => {
  it('rejects non-pdf sources or non-pdf targets', () => {
    assert.equal(canHandle('docx', 'pdf', 'compress'), false);
    assert.equal(canHandle('pdf', 'docx', 'compress'), false);
  });

  it('requires a variant', () => {
    assert.equal(canHandle('pdf', 'pdf', undefined), false);
    assert.equal(canHandle('pdf', 'pdf', ''), false);
  });

  it('accepts every supported variant', () => {
    for (const v of ['compress', 'rotate90', 'rotate180', 'rotate270', 'split', 'delete']) {
      assert.equal(canHandle('pdf', 'pdf', v), true, `variant=${v}`);
    }
  });

  it('rejects unknown variants', () => {
    assert.equal(canHandle('pdf', 'pdf', 'shake'), false);
    assert.equal(canHandle('pdf', 'pdf', 'ocr'), false); // ocr is for pdf→txt
  });
});
