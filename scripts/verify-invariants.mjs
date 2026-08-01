#!/usr/bin/env node
/**
 * Runs the ledger invariant suite and fails on any FAIL.
 *
 * The suite wraps itself in a transaction that rolls back, so it is safe
 * against any database — including, deliberately, production. (Phase 3 §9)
 *
 * Note: psql writes RAISE NOTICE to stderr, not stdout, so both streams are
 * captured and combined. Reading stdout alone silently sees no results.
 */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL
if (!url) {
  console.error('DIRECT_URL or DATABASE_URL must be set')
  process.exit(1)
}

const file = join(process.cwd(), 'prisma', 'sql', 'tests', 'ledger_invariants.sql')
const run = spawnSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-q', '-f', file], {
  encoding: 'utf8',
})

const output = `${run.stdout ?? ''}\n${run.stderr ?? ''}`
const passes = (output.match(/PASS/g) ?? []).length
const failures = output.match(/FAIL[^\n]*/g) ?? []

if (run.status !== 0 || failures.length > 0 || !output.includes('ALL LEDGER INVARIANTS HOLD')) {
  console.error(output.trim())
  console.error(`\nledger invariants FAILED (${passes} passed, ${failures.length} failed)`)
  process.exit(1)
}

console.log(`${passes} ledger invariants hold`)
