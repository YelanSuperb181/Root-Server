// Every Root API call goes through here. Root allows about 5 state-changing
// calls per second (create/edit/delete, role changes) and ~20 reads, and
// answers TooManyRequests with no retry hint. Writes share one token bucket
// so a busy moment (setup, a spam wave) queues instead of failing, and
// transient errors are retried with backoff and jitter.

import { ErrorCodeType, RootApiException } from "@rootsdk/server-bot";
import { log } from "./log";

const CAPACITY = 5;
const REFILL_PER_SEC = 5;
const MAX_QUEUE = 1000;

let tokens = CAPACITY;
let lastRefill = Date.now();
const waiting: Array<() => void> = [];
let timer: ReturnType<typeof setTimeout> | undefined;

function refill(): void {
  const now = Date.now();
  tokens = Math.min(CAPACITY, tokens + ((now - lastRefill) / 1000) * REFILL_PER_SEC);
  lastRefill = now;
}

function drain(): void {
  timer = undefined;
  refill();
  while (tokens >= 1 && waiting.length > 0) {
    tokens -= 1;
    waiting.shift()!();
  }
  if (waiting.length > 0) {
    timer = setTimeout(drain, Math.max(1, Math.ceil(((1 - tokens) / REFILL_PER_SEC) * 1000)));
  }
}

function takeToken(): Promise<void> {
  refill();
  if (tokens >= 1 && waiting.length === 0) {
    tokens -= 1;
    return Promise.resolve();
  }
  if (waiting.length >= MAX_QUEUE) return Promise.reject(new Error("Too many queued Root API calls"));
  return new Promise((resolve) => {
    waiting.push(resolve);
    if (!timer) drain();
  });
}

const RETRYABLE = new Set<ErrorCodeType>([
  ErrorCodeType.TooManyRequests,
  ErrorCodeType.ServerError,
  ErrorCodeType.Timeout,
  ErrorCodeType.StillProcessing,
  ErrorCodeType.ServiceUnavailable,
]);

async function withRetry<T>(label: string, op: () => Promise<T>, retries = 3): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await op();
    } catch (err) {
      if (attempt >= retries || !(err instanceof RootApiException) || !RETRYABLE.has(err.errorCode)) throw err;
      const delay = Math.random() * Math.min(1000 * 2 ** attempt, 15_000);
      log("warn", `${label}: retry ${attempt + 1}/${retries}`, { error: ErrorCodeType[err.errorCode] });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

/** A state-changing call: rate limited and retried. */
export function write<T>(label: string, op: () => Promise<T>): Promise<T> {
  return withRetry(label, async () => {
    await takeToken();
    return op();
  });
}

/** A read-only call: retried, not queued. */
export function read<T>(label: string, op: () => Promise<T>): Promise<T> {
  return withRetry(label, op);
}

export function errorCode(err: unknown): ErrorCodeType | undefined {
  return err instanceof RootApiException ? err.errorCode : undefined;
}

export function isPermissionError(err: unknown): boolean {
  const code = errorCode(err);
  return code !== undefined && code >= ErrorCodeType.NoPermissionToCreate && code <= ErrorCodeType.NoPermissionToBan;
}

/** Turns a failure into a sentence a community admin can act on. */
export function describeError(err: unknown): string {
  if (!(err instanceof RootApiException)) {
    return err instanceof Error ? err.message : "Something went wrong.";
  }
  if (isPermissionError(err)) {
    return "I don't have permission to do that. Check my role and the channel's permissions.";
  }
  switch (err.errorCode) {
    case ErrorCodeType.NotFound:
      return "I couldn't find that. It may have been deleted.";
    case ErrorCodeType.TooManyRequests:
      return "Root is rate limiting me. Try again in a few seconds.";
    case ErrorCodeType.RequestValidationFailed: {
      const details = err.payload?.requestValidatorList?.errors.map((e) => e.errorMessage).join("; ");
      return `Root rejected the request${details ? `: ${details}` : "."}`;
    }
    case ErrorCodeType.LimitExceeded:
      return "That would go over one of Root's limits.";
    default:
      return `Root returned an error (${ErrorCodeType[err.errorCode] ?? err.errorCode}).`;
  }
}
