/**
 * Shared HTTP plumbing for real (non-mock) providers: rate limiting and retry
 * with backoff. Server-only — nothing here is meant to run in the browser.
 */

import { ProviderRateLimited, type ProviderName } from "./types";

/** Retry a fetch on 429/5xx with exponential backoff plus jitter. */
export async function fetchWithBackoff(
  provider: ProviderName,
  input: string,
  init: RequestInit,
  options: { maxRetries?: number; baseDelayMs?: number } = {},
): Promise<Response> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 250;

  let attempt = 0;
  for (;;) {
    const response = await fetch(input, init);
    if (response.ok || (response.status < 500 && response.status !== 429)) {
      return response;
    }

    attempt++;
    if (attempt > maxRetries) {
      const retryAfterHeader = response.headers.get("Retry-After");
      const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : null;
      throw new ProviderRateLimited(provider, retryAfterMs);
    }

    const retryAfterHeader = response.headers.get("Retry-After");
    const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : null;
    const backoff = baseDelayMs * 2 ** (attempt - 1);
    const jitter = Math.random() * backoff * 0.25;
    const delay = retryAfterMs ?? backoff + jitter;

    await sleep(delay);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A simple token bucket for outbound rate limiting.
 *
 * One instance per provider per isolate — good enough for a single Worker
 * instance's outbound rate, which is the thing providers actually cap. It
 * resets on cold start, which just means the first request after a cold start
 * gets a full bucket; harmless.
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly ratePerSecond: number,
    private readonly capacity: number = ratePerSecond,
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.ratePerSecond);
    this.lastRefill = now;
  }

  /** Wait until a token is available, then consume it. */
  async take(): Promise<void> {
    for (;;) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const deficit = 1 - this.tokens;
      const waitMs = (deficit / this.ratePerSecond) * 1000;
      await sleep(Math.max(10, waitMs));
    }
  }
}
