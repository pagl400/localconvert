import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { kindFor } from '../unit-build/conversionKind.js';

describe('kindFor', () => {
  it('routes PDF→PDF to pdf-tool', () => {
    assert.equal(kindFor('pdf', 'pdf'), 'pdf-tool');
    assert.equal(kindFor('pdf', 'pdf', 'compress'), 'pdf-tool');
  });

  it('routes video→video to video', () => {
    assert.equal(kindFor('mp4', 'mov'), 'video');
    assert.equal(kindFor('mkv', 'mp4'), 'video');
    assert.equal(kindFor('webm', 'm4v'), 'video');
  });

  it('routes video→gif to gif', () => {
    assert.equal(kindFor('mp4', 'gif'), 'gif');
    assert.equal(kindFor('mov', 'gif'), 'gif');
  });

  it('routes video→audio container to audio-extract', () => {
    assert.equal(kindFor('mp4', 'm4a'), 'audio-extract');
    assert.equal(kindFor('mov', 'wav'), 'audio-extract');
  });

  it('routes audio→audio to audio', () => {
    assert.equal(kindFor('mp3', 'm4a'), 'audio');
    assert.equal(kindFor('wav', 'aiff'), 'audio');
  });

  it('routes image→image to image', () => {
    assert.equal(kindFor('jpg', 'png'), 'image');
    assert.equal(kindFor('heic', 'jpg'), 'image');
    assert.equal(kindFor('webp', 'png'), 'image');
  });

  it('routes image→pdf to image-to-pdf', () => {
    assert.equal(kindFor('jpg', 'pdf'), 'image-to-pdf');
    assert.equal(kindFor('heic', 'pdf'), 'image-to-pdf');
  });

  it('routes docx→pdf to docx-to-pdf', () => {
    assert.equal(kindFor('docx', 'pdf'), 'docx-to-pdf');
  });

  it('falls back to other for unknown pairings', () => {
    assert.equal(kindFor('foo', 'bar'), 'other');
    assert.equal(kindFor('docx', 'html'), 'other'); // handled by docx converter directly
    assert.equal(kindFor('xlsx', 'csv'), 'other');
  });

  it('respects ocr variant on pdf→txt', () => {
    // OCR variant explicitly routes to "other" so the simple-quality flow runs.
    assert.equal(kindFor('pdf', 'txt', 'ocr'), 'other');
  });
});
