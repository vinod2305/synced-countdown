import { describe, expect, it } from 'vitest';
import { computeCountdown, toEpochMs } from '../src/core/countdown.js';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('toEpochMs', () => {
  it('passes numbers through', () => {
    expect(toEpochMs(1234)).toBe(1234);
  });
  it('converts Date to epoch ms', () => {
    const d = new Date(1_700_000_000_000);
    expect(toEpochMs(d)).toBe(1_700_000_000_000);
  });
});

describe('computeCountdown — breakdown', () => {
  it('breaks remaining into days/hours/minutes/seconds', () => {
    const target = 2 * DAY + 3 * HOUR + 4 * MINUTE + 5 * SECOND;
    const r = computeCountdown(target, 0);
    expect(r.days).toBe(2);
    expect(r.hours).toBe(3);
    expect(r.minutes).toBe(4);
    expect(r.seconds).toBe(5);
    expect(r.isComplete).toBe(false);
    expect(r.remaining).toBe(target);
  });

  it('recomputes from the current clock (advance clock => remaining drops)', () => {
    const target = 10 * SECOND;
    const a = computeCountdown(target, 0);
    const b = computeCountdown(target, 4 * SECOND);
    expect(a.remaining).toBe(10 * SECOND);
    expect(b.remaining).toBe(6 * SECOND);
    expect(b.seconds).toBe(6);
  });

  it('clamps at 0 and reports isComplete', () => {
    const r = computeCountdown(1000, 5000);
    expect(r.remaining).toBe(0);
    expect(r.days).toBe(0);
    expect(r.hours).toBe(0);
    expect(r.minutes).toBe(0);
    expect(r.seconds).toBe(0);
    expect(r.isComplete).toBe(true);
  });

  it('reports total when supplied', () => {
    const r = computeCountdown(10 * SECOND, 3 * SECOND, 10 * SECOND);
    expect(r.total).toBe(10 * SECOND);
    expect(r.remaining).toBe(7 * SECOND);
  });

  it('defaults total to remaining when not supplied', () => {
    const r = computeCountdown(10 * SECOND, 3 * SECOND);
    expect(r.total).toBe(7 * SECOND);
  });

  it('marks complete exactly at target', () => {
    const r = computeCountdown(1000, 1000);
    expect(r.remaining).toBe(0);
    expect(r.isComplete).toBe(true);
  });
});
