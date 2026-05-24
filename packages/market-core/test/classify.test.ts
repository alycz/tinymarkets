import { describe, it, expect } from 'vitest';
import { classifyKind } from '../src/classify';
import type { SignedShares } from '@jet/shared';

const ss = (n: number) => n as SignedShares;

describe('classifyKind', () => {
  it('OPEN: buyer flat, seller flat', () => {
    expect(classifyKind(ss(0), ss(0))).toBe('OPEN');
  });

  it('OPEN: buyer long YES, seller short YES', () => {
    expect(classifyKind(ss(5), ss(-3))).toBe('OPEN');
  });

  it('OPEN: buyer flat, seller short YES', () => {
    expect(classifyKind(ss(0), ss(-2))).toBe('OPEN');
  });

  it('OPEN: buyer long YES, seller flat', () => {
    expect(classifyKind(ss(2), ss(0))).toBe('OPEN');
  });

  it('TRANSFER_YES: buyer long YES, seller long YES', () => {
    expect(classifyKind(ss(3), ss(5))).toBe('TRANSFER_YES');
  });

  it('TRANSFER_YES: buyer flat, seller long YES', () => {
    expect(classifyKind(ss(0), ss(1))).toBe('TRANSFER_YES');
  });

  it('TRANSFER_NO: buyer long NO, seller short YES', () => {
    expect(classifyKind(ss(-3), ss(-2))).toBe('TRANSFER_NO');
  });

  it('TRANSFER_NO: buyer long NO, seller flat', () => {
    expect(classifyKind(ss(-1), ss(0))).toBe('TRANSFER_NO');
  });

  it('CLOSE: buyer long NO, seller long YES', () => {
    expect(classifyKind(ss(-2), ss(4))).toBe('CLOSE');
  });

  it('CLOSE: buyer -1, seller +1', () => {
    expect(classifyKind(ss(-1), ss(1))).toBe('CLOSE');
  });
});
