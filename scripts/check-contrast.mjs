#!/usr/bin/env node
/**
 * Verifies every colour pairing in the design system against WCAG 2.2 AA.
 *
 * Token values are read from src/styles/tokens.css and resolved through their
 * var() chains, so this checks what the application actually renders — not a
 * table copied into a document that drifts the first time a token changes.
 *
 * Contrast is the one design property that is objectively checkable, so it is
 * checked rather than asserted. (PRD ACC-01, ACC-02)
 *
 *   pnpm check:contrast
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const AA_BODY = 4.5 // WCAG 1.4.3 — normal text
const AA_LARGE = 3.0 // WCAG 1.4.3 — ≥24px, or ≥18.66px bold
const AA_NON_TEXT = 3.0 // WCAG 1.4.11 — UI component boundaries, graphics

// ---------------------------------------------------------------------------
// Token parsing
// ---------------------------------------------------------------------------

const css = readFileSync(join(process.cwd(), 'src', 'styles', 'tokens.css'), 'utf8')

/** Splits the file into the `:root` (dark) and `:root.light` blocks. */
function blockFor(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`, 'g')
  return [...css.matchAll(re)].map((m) => m[1]).join('\n')
}

function declarationsIn(source) {
  const out = new Map()
  for (const [, name, value] of source.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out.set(name, value.trim())
  }
  return out
}

const darkDecls = declarationsIn(blockFor(':root'))
const lightDecls = new Map([...darkDecls, ...declarationsIn(blockFor(':root.light'))])

/** Resolves a token through its var() chain to a literal colour. */
function resolve(token, decls, depth = 0) {
  if (depth > 12) throw new Error(`circular token reference at ${token}`)
  const raw = decls.get(token)
  if (raw === undefined) throw new Error(`unknown token ${token}`)
  const ref = raw.match(/^var\((--[\w-]+)\)$/)
  return ref ? resolve(ref[1], decls, depth + 1) : raw
}

// ---------------------------------------------------------------------------
// Contrast maths (WCAG 2.x relative luminance)
// ---------------------------------------------------------------------------

function toRgb(value) {
  const hex = value.trim().match(/^#([0-9a-f]{6})$/i)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  throw new Error(`only opaque hex colours can be checked, got "${value}"`)
}

const channel = (c) => {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function luminance(value) {
  const [r, g, b] = toRgb(value)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// ---------------------------------------------------------------------------
// The pairings the interface actually produces
// ---------------------------------------------------------------------------

/** [foreground, background, minimum, description] */
const PAIRS = [
  ['--text-primary', '--bg', AA_BODY, 'primary text on background'],
  ['--text-primary', '--surface', AA_BODY, 'primary text on surface'],
  ['--text-primary', '--surface-elevated', AA_BODY, 'primary text on elevated surface'],
  ['--text-secondary', '--bg', AA_BODY, 'secondary text on background'],
  ['--text-secondary', '--surface', AA_BODY, 'secondary text on surface'],
  ['--text-secondary', '--surface-elevated', AA_BODY, 'secondary text on elevated surface'],
  // Restricted to ≥24px by the token comment; checked at the large-text bar.
  ['--text-muted', '--bg', AA_LARGE, 'muted text on background (large only)'],
  ['--text-muted', '--surface', AA_LARGE, 'muted text on surface (large only)'],

  ['--accent', '--bg', AA_BODY, 'accent text on background'],
  ['--accent', '--surface', AA_BODY, 'accent text on surface'],
  ['--info', '--bg', AA_BODY, 'info text on background'],
  ['--info', '--surface', AA_BODY, 'info text on surface'],
  ['--warning', '--bg', AA_BODY, 'warning text on background'],
  ['--warning', '--surface', AA_BODY, 'warning text on surface'],
  ['--danger', '--bg', AA_BODY, 'danger text on background'],
  ['--danger', '--surface', AA_BODY, 'danger text on surface'],

  ['--accent-on-fill', '--accent-fill', AA_BODY, 'label on accent fill'],
  ['--info-on-fill', '--info-fill', AA_BODY, 'label on info fill'],
  ['--warning-on-fill', '--warning-fill', AA_BODY, 'label on warning fill'],
  ['--danger-on-fill', '--danger-fill', AA_BODY, 'label on danger fill'],
  ['--text-inverse', '--text-primary', AA_BODY, 'inverse text on inverted surface'],

  ['--border-interactive', '--bg', AA_NON_TEXT, 'control boundary on background'],
  ['--border-interactive', '--surface', AA_NON_TEXT, 'control boundary on surface'],
  ['--border-strong', '--bg', AA_NON_TEXT, 'strong boundary on background'],
  ['--focus-ring', '--bg', AA_NON_TEXT, 'focus ring on background'],
  ['--focus-ring', '--surface', AA_NON_TEXT, 'focus ring on surface'],

  ['--chart-1', '--bg', AA_NON_TEXT, 'chart series 1'],
  ['--chart-2', '--bg', AA_NON_TEXT, 'chart series 2'],
  ['--chart-3', '--bg', AA_NON_TEXT, 'chart series 3'],
  ['--chart-4', '--bg', AA_NON_TEXT, 'chart series 4'],
  ['--chart-5', '--bg', AA_NON_TEXT, 'chart series 5'],
  ['--chart-6', '--bg', AA_NON_TEXT, 'chart series 6'],
  ['--chart-7', '--bg', AA_NON_TEXT, 'chart series 7'],
]

/**
 * Tokens deliberately below a threshold, with the reason recorded.
 *
 * WCAG 1.4.11 requires 3:1 only for boundaries needed to IDENTIFY a control.
 * A decorative rule between two rows carries no information and is exempt —
 * forcing it to 3:1 would produce the harsh, over-ruled look the PRD's calm
 * principle exists to avoid. Interactive edges use --border-interactive, which
 * IS checked above.
 */
const DOCUMENTED_EXEMPTIONS = [
  ['--border', 'decorative separator only; controls use --border-interactive'],
]

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

let failures = 0
let checks = 0

for (const [themeName, decls] of [
  ['dark', darkDecls],
  ['light', lightDecls],
]) {
  console.log(`\n  ${themeName.toUpperCase()}`)
  for (const [fgToken, bgToken, min, label] of PAIRS) {
    const fg = resolve(fgToken, decls)
    const bg = resolve(bgToken, decls)
    const ratio = contrast(fg, bg)
    const ok = ratio >= min
    checks += 1
    if (!ok) failures += 1
    console.log(
      `  ${ok ? '✓' : '✗'} ${ratio.toFixed(2).padStart(6)}:1  (min ${min.toFixed(1)})  ${label}`,
    )
    if (!ok) {
      console.log(`      ${fgToken} ${fg} on ${bgToken} ${bg}`)
    }
  }
}

console.log('\n  EXEMPT (documented)')
for (const [token, reason] of DOCUMENTED_EXEMPTIONS) {
  console.log(`  – ${token}: ${reason}`)
}

console.log(
  `\n  ${checks - failures}/${checks} pairings meet WCAG 2.2 AA` +
    (failures ? ` — ${failures} FAILED` : ''),
)
process.exit(failures ? 1 : 0)
