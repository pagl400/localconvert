import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseTime, formatSeconds, formatBytes } from '../unit-build/time.js';

describe('parseTime', () => {
  it('returns NaN on empty input', () => {
    assert.ok(Number.isNaN(parseTime('')));
    assert.ok(Number.isNaN(parseTime('   ')));
  });

  it('parses a plain seconds value', () => {
    assert.equal(parseTime('12'), 12);
    assert.equal(parseTime('12.5'), 12.5);
  });

  it('parses MM:SS', () => {
    assert.equal(parseTime('1:23'), 83);
    assert.equal(parseTime('0:30'), 30);
    assert.equal(parseTime('10:00'), 600);
  });

  it('parses HH:MM:SS', () => {
    assert.equal(parseTime('1:00:00'), 3600);
    assert.equal(parseTime('1:23:45'), 1 * 3600 + 23 * 60 + 45);
    assert.equal(parseTime('0:00:01'), 1);
  });

  it('returns NaN for malformed input', () => {
    assert.ok(Number.isNaN(parseTime('abc')));
    assert.ok(Number.isNaN(parseTime('1:abc')));
    assert.ok(Number.isNaN(parseTime('1:2:3:4')));
  });

  it('tolerates whitespace around parts', () => {
    assert.equal(parseTime(' 1 : 30 '), 90);
  });
});

describe('formatSeconds', () => {
  it('returns 0:00 for zero and invalid input', () => {
    assert.equal(formatSeconds(0), '0:00');
    assert.equal(formatSeconds(-1), '0:00');
    assert.equal(formatSeconds(NaN), '0:00');
    assert.equal(formatSeconds(Infinity), '0:00');
  });

  it('formats sub-minute durations', () => {
    assert.equal(formatSeconds(30), '0:30');
    assert.equal(formatSeconds(5), '0:05');
  });

  it('formats minute+ durations', () => {
    assert.equal(formatSeconds(60), '1:00');
    assert.equal(formatSeconds(125), '2:05');
    assert.equal(formatSeconds(3661), '61:01'); // overflow-into-minutes is intentional
  });

  it('floors fractional seconds', () => {
    assert.equal(formatSeconds(59.9), '0:59');
  });
});

describe('formatBytes', () => {
  it('returns dash for zero and invalid input', () => {
    assert.equal(formatBytes(0), '–');
    assert.equal(formatBytes(NaN), '–');
    assert.equal(formatBytes(Infinity), '–');
  });

  it('formats sub-KB values in bytes', () => {
    assert.equal(formatBytes(512), '512 B');
    assert.equal(formatBytes(1023), '1023 B');
  });

  it('formats KB values without decimals', () => {
    assert.equal(formatBytes(1024), '1 KB');
    assert.equal(formatBytes(2048), '2 KB');
  });

  it('formats MB with one decimal', () => {
    assert.equal(formatBytes(1024 * 1024), '1.0 MB');
    assert.equal(formatBytes(1.5 * 1024 * 1024), '1.5 MB');
  });

  it('formats GB with two decimals', () => {
    assert.equal(formatBytes(1024 ** 3), '1.00 GB');
    assert.equal(formatBytes(2.5 * 1024 ** 3), '2.50 GB');
  });
});
