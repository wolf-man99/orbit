/**
 * The offline write queue. (Phase 4 §10)
 *
 * Offline sync is normally the hardest part of a system like this, because
 * concurrent edits conflict. Orbit's ledger is APPEND-ONLY, so there is nothing
 * to merge — two devices appending events produce a union, never a
 * contradiction. Sync reduces to two mechanical problems, both already solved
 * by the data model: ORDERING (occurredOn) and DE-DUPLICATION (idempotencyKey).
 *
 * This is a dividend of the Phase 1 ledger decision, not cleverness here.
 */
import { openDB, type IDBPDatabase } from 'idb'

export type QueueStatus = 'PENDING' | 'SENDING' | 'PARKED'

export interface QueuedMutation {
  readonly id: string
  readonly endpoint: string
  readonly method: 'POST'
  readonly body: unknown
  readonly idempotencyKey: string
  /** Drives replay order, so events land in the sequence they happened. */
  readonly occurredOn: string
  readonly attempts: number
  readonly status: QueueStatus
  readonly lastError?: string
  readonly createdAt: number
}

const DB_NAME = 'orbit-offline'
const STORE = 'mutations'

/** Retry ceiling. Beyond this an item is PARKED for the user to review. */
export const MAX_ATTEMPTS = 5

/** Exponential backoff: 2s, 4s, 8s, 16s, 32s. */
export const backoffMs = (attempt: number): number => 2 ** (attempt + 1) * 1000

async function db(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, 1, {
    upgrade(database) {
      const store = database.createObjectStore(STORE, { keyPath: 'id' })
      store.createIndex('byOccurredOn', 'occurredOn')
      store.createIndex('byStatus', 'status')
    },
  })
}

export async function enqueue(mutation: Omit<QueuedMutation, 'attempts' | 'status' | 'createdAt'>) {
  const database = await db()
  await database.put(STORE, {
    ...mutation,
    attempts: 0,
    status: 'PENDING' satisfies QueueStatus,
    createdAt: Date.now(),
  })
}

export async function pending(): Promise<readonly QueuedMutation[]> {
  const database = await db()
  const all = (await database.getAll(STORE)) as QueuedMutation[]
  return all
    .filter((item) => item.status !== 'PARKED')
    // Ascending by occurredOn, then by enqueue order — the replay sequence the
    // server needs to reconstruct history faithfully.
    .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.createdAt - b.createdAt)
}

export async function parked(): Promise<readonly QueuedMutation[]> {
  const database = await db()
  const all = (await database.getAll(STORE)) as QueuedMutation[]
  return all.filter((item) => item.status === 'PARKED')
}

export async function remove(id: string): Promise<void> {
  const database = await db()
  await database.delete(STORE, id)
}

/**
 * Classifies a response into the next queue action.
 *
 * Note 200 and 201 are BOTH success. A replayed idempotency key returns 200
 * with the original event — a timeout after a successful write is
 * indistinguishable from a failure at the client, so retry is inevitable and
 * must be uneventful. Treating that as an error would show a failure for a
 * payment that was in fact recorded. (Phase 4 §9.3)
 */
export function classify(status: number | 'network-error'): 'DROP' | 'RETRY' | 'PARK' {
  if (status === 'network-error') return 'RETRY'
  if (status >= 200 && status < 300) return 'DROP'
  if (status >= 500) return 'RETRY'
  // Any 4xx is a client bug that retrying cannot fix — including 409, which
  // means the same key was replayed with a different payload.
  return 'PARK'
}

export async function markAttempt(item: QueuedMutation, error: string): Promise<void> {
  const database = await db()
  const attempts = item.attempts + 1
  await database.put(STORE, {
    ...item,
    attempts,
    // Unbounded retry against a permanent failure hides a real problem from
    // the user. Park it and surface it instead. (Phase 4 §19)
    status: attempts >= MAX_ATTEMPTS ? 'PARKED' : 'PENDING',
    lastError: error,
  } satisfies QueuedMutation)
}

export async function park(item: QueuedMutation, error: string): Promise<void> {
  const database = await db()
  await database.put(STORE, { ...item, status: 'PARKED', lastError: error } satisfies QueuedMutation)
}

/**
 * Flushes the queue in replay order.
 *
 * Injected `send` so the flush logic is testable without a network.
 */
export async function flush(
  send: (item: QueuedMutation) => Promise<number | 'network-error'>,
): Promise<{ readonly sent: number; readonly parked: number; readonly remaining: number }> {
  const items = await pending()
  let sent = 0
  let parkedCount = 0

  for (const item of items) {
    const status = await send(item)
    const action = classify(status)
    if (action === 'DROP') {
      await remove(item.id)
      sent += 1
    } else if (action === 'PARK') {
      await park(item, `HTTP ${String(status)}`)
      parkedCount += 1
    } else {
      await markAttempt(item, `HTTP ${String(status)}`)
      // Stop on the first retryable failure: the queue is ordered, and sending
      // a later event past a stalled earlier one would reorder history.
      break
    }
  }

  return { sent, parked: parkedCount, remaining: (await pending()).length }
}
