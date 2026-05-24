import { describe, it, expect } from 'vitest';
import { splitMatch } from '../src/classify';
import type { Shares, SignedShares } from '@jet/shared';

const ss = (n: number) => n as SignedShares;
const sh = (n: number) => n as Shares;

function totalSize(segments: ReturnType<typeof splitMatch>): number {
  return segments.reduce((acc, s) => acc + (s.size as number), 0);
}

describe('splitMatch', () => {
  it('no crossing: OPEN, buyer flat, seller flat', () => {
    const segs = splitMatch(ss(0), ss(0), sh(5));
    expect(segs).toHaveLength(1);
    expect(segs[0]!.kind).toBe('OPEN');
    expect(segs[0]!.size).toBe(5);
    expect(totalSize(segs)).toBe(5);
  });

  it('no crossing: CLOSE stays CLOSE', () => {
    const segs = splitMatch(ss(-3), ss(2), sh(2));
    expect(segs).toHaveLength(1);
    expect(segs[0]!.kind).toBe('CLOSE');
    expect(totalSize(segs)).toBe(2);
  });

  it('buyer crosses zero: -2 -> +3 on 5-share buy', () => {
    // First 2 shares: buyer at -2 (TRANSFER_NO), then 3 shares: buyer at 0 (OPEN)
    const segs = splitMatch(ss(-2), ss(-1), sh(5));
    expect(segs).toHaveLength(2);
    expect(segs[0]!.kind).toBe('TRANSFER_NO');
    expect(segs[0]!.size).toBe(2);
    expect(segs[1]!.kind).toBe('OPEN');
    expect(segs[1]!.size).toBe(3);
    expect(totalSize(segs)).toBe(5);
  });

  it('buyer crosses zero with CLOSE then OPEN (seller long YES)', () => {
    const segs = splitMatch(ss(-2), ss(5), sh(5));
    expect(segs).toHaveLength(2);
    expect(segs[0]!.kind).toBe('CLOSE');
    expect(segs[0]!.size).toBe(2);
    expect(segs[1]!.kind).toBe('TRANSFER_YES');
    expect(segs[1]!.size).toBe(3);
    expect(totalSize(segs)).toBe(5);
  });

  it('seller crosses zero: +1 -> -2 on 3-share sell', () => {
    // First 1 share: seller at +1 (TRANSFER_YES), then 2 shares: seller at 0 (OPEN)
    const segs = splitMatch(ss(3), ss(1), sh(3));
    expect(segs).toHaveLength(2);
    expect(segs[0]!.kind).toBe('TRANSFER_YES');
    expect(segs[0]!.size).toBe(1);
    expect(segs[1]!.kind).toBe('OPEN');
    expect(segs[1]!.size).toBe(2);
    expect(totalSize(segs)).toBe(3);
  });

  it('both cross zero simultaneously', () => {
    // buyer at -2, seller at +2, size 4: first 2 = CLOSE (both cross at same chunk), then 2 = OPEN
    const segs = splitMatch(ss(-2), ss(2), sh(4));
    expect(totalSize(segs)).toBe(4);
    expect(segs[0]!.kind).toBe('CLOSE');
    expect(segs[0]!.size).toBe(2);
    expect(segs[1]!.kind).toBe('OPEN');
    expect(segs[1]!.size).toBe(2);
  });

  it('segments have correct buyerPreAtSegment and sellerPreAtSegment', () => {
    const segs = splitMatch(ss(-2), ss(-1), sh(5));
    expect(segs[0]!.buyerPreAtSegment).toBe(-2);
    expect(segs[0]!.sellerPreAtSegment).toBe(-1);
    expect(segs[1]!.buyerPreAtSegment).toBe(0);
    expect(segs[1]!.sellerPreAtSegment).toBe(-3);
  });
});
