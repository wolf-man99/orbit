/**
 * Ports — the interfaces `application` depends on and `infrastructure` implements.
 *
 * These are the seams PRD §12 relies on: adding compound interest, an AI risk
 * model, or a bank feed means adding an adapter, never editing a service.
 *
 * Implementation: Phase 10.
 */

export interface Clock {
  /** The only sanctioned source of current time. Injected so tests can freeze it. */
  today(timeZone: string): string
}

export interface IdGenerator {
  /** Monotonic ULID — client-generated for idempotency keys. (Phase 4 §9.3) */
  next(): string
}

export interface DocumentStorage {
  signedUrl(path: string, ttlSeconds: number): Promise<string>
  remove(path: string): Promise<void>
}

export interface PushSender {
  send(subscriptionId: string, payload: unknown): Promise<{ readonly delivered: boolean }>
}
