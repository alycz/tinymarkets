export class TokenBucket {
  private tokens: number;
  private lastRefillMs: number;

  constructor(
    private readonly tokensPerSecond: number,
    private readonly capacity = Math.max(1, tokensPerSecond),
    nowMs = Date.now(),
  ) {
    this.tokens = capacity;
    this.lastRefillMs = nowMs;
  }

  tryTake(nowMs = Date.now()): boolean {
    this.refill(nowMs);
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }

  available(nowMs = Date.now()): number {
    this.refill(nowMs);
    return this.tokens;
  }

  private refill(nowMs: number): void {
    const elapsedMs = Math.max(0, nowMs - this.lastRefillMs);
    if (elapsedMs === 0) return;
    this.tokens = Math.min(
      this.capacity,
      this.tokens + (elapsedMs / 1_000) * this.tokensPerSecond,
    );
    this.lastRefillMs = nowMs;
  }
}
