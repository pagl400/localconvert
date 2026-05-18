import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getExtension,
  detectFormat,
  targetFormatsFor,
  findFormat,
  allGroups,
} from '../unit-build/formats.js';

describe('getExtension', () => {
  it('returns lowercased extension', () => {
    assert.equal(getExtension('document.PDF'), 'pdf');
    assert.equal(getExtension('photo.JPG'), 'jpg');
  });

  it('returns empty for no extension', () => {
    assert.equal(getExtension('Makefile'), '');
    assert.equal(getExtension(''), '');
    assert.equal(getExtension('trailing.'), '');
  });

  it('handles multi-dot filenames by taking the last segment', () => {
    assert.equal(getExtension('archive.tar.gz'), 'gz');
    assert.equal(getExtension('test.case.docx'), 'docx');
  });
});

describe('detectFormat', () => {
  it('detects known formats by extension', () => {
    assert.equal(detectFormat('foo.pdf').ext, 'pdf');
    assert.equal(detectFormat('foo.pdf').group, 'document');
    assert.equal(detectFormat('cat.jpg').group, 'image');
    assert.equal(detectFormat('cat.heic').group, 'image');
  });

  it('falls back to mime when ext is unknown', () => {
    const f = detectFormat('foo.unknown', 'application/pdf');
    assert.equal(f.group, 'document');
  });

  it('returns unknown group for fully-unrecognised files', () => {
    const f = detectFormat('foo.xyz');
    assert.equal(f.group, 'unknown');
    assert.equal(f.ext, 'xyz');
  });
});

describe('targetFormatsFor', () => {
  it('returns same-group formats minus the source ext', () => {
    const source = findFormat('jpg');
    const targets = targetFormatsFor(source);
    assert.ok(targets.length > 0);
    assert.ok(!targets.some((t) => t.ext === 'jpg'));
    assert.ok(targets.every((t) => t.group === 'image'));
  });

  it('returns empty for unknown sources', () => {
    const f = detectFormat('foo.xyz');
    assert.deepEqual(targetFormatsFor(f), []);
  });
});

describe('findFormat', () => {
  it('finds known formats by extension', () => {
    assert.ok(findFormat('mp4'));
    assert.ok(findFormat('docx'));
    assert.ok(findFormat('gif'));
  });

  it('is case-insensitive', () => {
    assert.equal(findFormat('PDF')?.ext, 'pdf');
  });

  it('returns null for unknown', () => {
    assert.equal(findFormat('xyz'), null);
  });
});

describe('allGroups', () => {
  it('lists the eight known groups in display order', () => {
    const groups = allGroups();
    assert.deepEqual(groups, ['image', 'audio', 'video', 'document', 'ebook', 'data', 'archive', 'font']);
  });
});
