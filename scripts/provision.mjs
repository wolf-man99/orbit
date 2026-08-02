#!/usr/bin/env node
/**
 * Provisions a database for Orbit, in the one order that is safe.
 *
 * Each step depends on the last, and each is a gate: a failure stops the run
 * rather than letting a later step report success on a broken foundation.
 *
 *   1  migrations                    schema exists
 *   2  integrity / RLS / indexes     guarantees exist
 *   3  ledger invariants             guarantees actually hold        GATE
 *   4  application role              a non-owner login exists
 *   5  RLS runtime check             the app connection is governed  GATE
 *
 * Usage:
 *   DIRECT_URL=postgres://postgres:...@host:5432/postgres \
 *   node scripts/provision.mjs [--password <secret>]
 *
 * With no --password one is generated and printed ONCE. It is never written to
 * a file and never appears in a psql argument list, where `ps` would expose it
 * to every process on the host.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const directUrl = process.env.DIRECT_URL
if (!directUrl) {
  console.error('DIRECT_URL must be set to the OWNER connection (unpooled, port 5432).')
  process.exit(1)
}

const args = process.argv.slice(2)
const passwordIndex = args.indexOf('--password')
const generated = passwordIndex === -1
const password = generated
  ? randomBytes(24).toString('base64url')
  : (args[passwordIndex + 1] ?? '')

if (!password) {
  console.error('--password was given without a value.')
  process.exit(1)
}

/** Masks anything password-shaped before a URL reaches a log. */
const safe = (url) => url.replace(/:\/\/([^:]+):[^@]*@/, '://$1:***@')

let step = 0
const heading = (title) => {
  step += 1
  console.log(`\n[${step}/5] ${title}`)
}
const fail = (message) => {
  console.error(`\n  ✗ ${message}`)
  console.error('    Provisioning stopped. Nothing after this point has run.')
  process.exit(1)
}

// ---------------------------------------------------------------------------

console.log(`Provisioning ${safe(directUrl)}`)

heading('Applying migrations')
try {
  execFileSync('pnpm', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: { ...process.env, DIRECT_URL: directUrl },
  })
} catch {
  fail('prisma migrate deploy failed')
}

heading('Applying integrity, security, and index layers')
const sqlDir = join(process.cwd(), 'prisma', 'sql')
for (const file of readdirSync(sqlDir).filter((f) => /^00[1-4]_.*\.sql$/.test(f)).sort()) {
  process.stdout.write(`      ${file} … `)
  const run = spawnSync('psql', [directUrl, '-v', 'ON_ERROR_STOP=1', '-q', '-f', join(sqlDir, file)], {
    encoding: 'utf8',
    env: { ...process.env, PGOPTIONS: '-c client_min_messages=warning' },
  })
  if (run.status !== 0) {
    console.log('failed')
    console.error(run.stderr)
    fail(`${file} did not apply`)
  }
  console.log('ok')
}

heading('Verifying ledger invariants')
{
  const run = spawnSync('node', [join('scripts', 'verify-invariants.mjs')], {
    encoding: 'utf8',
    env: { ...process.env, DIRECT_URL: directUrl },
  })
  console.log(`      ${(run.stdout ?? '').trim()}`)
  if (run.status !== 0) {
    console.error(run.stderr)
    fail('ledger invariants do not hold — the schema is not safe to use')
  }
}

heading('Provisioning the application role')
{
  // The password is passed via stdin, not argv: a psql argument list is visible
  // in `ps` to every process on the host.
  const sql = `\\set ON_ERROR_STOP on\n\\set password '${password.replace(/'/g, "''")}'\n` +
    `\\i ${join(sqlDir, '005_app_role.sql')}\n`
  const run = spawnSync('psql', [directUrl, '-v', 'ON_ERROR_STOP=1', '-q'], {
    input: sql,
    encoding: 'utf8',
  })
  if (run.status !== 0) {
    console.error(run.stderr)
    fail('could not provision orbit_app')
  }
  console.log('      orbit_app provisioned: no BYPASSRLS, owns no tables')
}

heading('Verifying RLS governs the runtime connection')
{
  const runtimeUrl = new URL(directUrl)
  runtimeUrl.username = 'orbit_app'
  runtimeUrl.password = password

  const run = spawnSync('node', [join('scripts', 'verify-rls.mjs')], {
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: runtimeUrl.toString() },
  })
  console.log((run.stdout ?? '').trimEnd())
  if (run.status !== 0) {
    console.error(run.stderr)
    fail('RLS does NOT apply to the runtime connection')
  }
}

// ---------------------------------------------------------------------------

const runtime = new URL(directUrl)
runtime.username = 'orbit_app'
runtime.password = password
// Supabase serves the transaction pooler on 6543; the owner connection is 5432.
if (runtime.port === '5432') runtime.port = '6543'
runtime.searchParams.set('pgbouncer', 'true')
runtime.searchParams.set('connection_limit', '1')

console.log('\n──────────────────────────────────────────────────────────────')
console.log('Provisioned. Set this as DATABASE_URL — it is shown once:\n')
console.log(`  DATABASE_URL="${runtime.toString()}"\n`)
if (generated) {
  console.log('  The password was generated and is not stored anywhere.')
  console.log('  Losing it means re-running with --password to set a new one.')
}
console.log('  Keep DIRECT_URL pointed at the owner connection for migrations.')
console.log('──────────────────────────────────────────────────────────────')
