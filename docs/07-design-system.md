# Orbit — Design System

**What Moves, Grows**

| Field | Value |
| --- | --- |
| Product | Orbit |
| Document | Phase 7 — Design System |
| Version | 1.0 |
| Status | Awaiting approval |
| Depends on | [Phase 1 — PRD §11](./01-product-requirements.md) · [Phase 2 — IA](./02-information-architecture.md) |
| Verified | 66/66 colour pairings meet WCAG 2.2 AA in both themes; checker exits 1 on regression |

---

## 1. What this phase delivers

| Artifact | Purpose |
| --- | --- |
| `src/styles/tokens.css` | Primitive and semantic token layers, dark and light |
| `src/styles/globals.css` | Tailwind v4 theme mapping, base layer, reduced-motion contract |
| `src/components/motion/primitives.ts` | Durations, easing, variants, haptics |
| `scripts/check-contrast.mjs` | WCAG verification, wired into CI |

---

## 2. Contrast was measured, not asserted

The PRD specifies exact hex values. Before building anything on them I computed every pairing the interface would actually produce. **Five combinations from the specified palette fail WCAG 2.2 AA**, and the design system is built around that fact rather than around the assumption that a good-looking palette is an accessible one.

| Finding | Measured | Required | Resolution |
| --- | --- | --- | --- |
| Blue `#2563EB` as text on `#09090B` | **3.85:1** | 4.5:1 | Text uses `blue-400` (7.83:1); `#2563EB` retained as a **fill**, where white on it measures 5.17:1 |
| White on danger `#EF4444` | **3.76:1** | 4.5:1 | Destructive fills use `red-600` with white (4.83:1) |
| Emerald `#059669` as text on white | **3.77:1** | 4.5:1 | Light-mode accent drops to `emerald-700` (5.48:1) |
| Amber `#F59E0B` as text on white | **2.15:1** | 4.5:1 | Light-mode warning drops to `amber-700` (5.02:1) |
| Border `#2A2A2A` on `#09090B` | **1.39:1** | 3:1 | Split into two tokens — see §3.2 |

The amber case is the classic accessibility trap: the colour that most clearly signals "warning" is nearly unreadable on white, and `amber-600` still only reaches 3.19:1. Anything short of `amber-700` fails.

**No brand colour was discarded.** Each PRD hue is retained for the role where it measures correctly, with a usage rule recorded on the token. This is what a design system is for — a colour is not a value, it is a value *plus the contexts it is valid in*.

---

## 3. Token architecture

### 3.1 Two layers, one of them off-limits

```
PRIMITIVE   --zinc-900  --emerald-500  --blue-600      raw values, no meaning
     ↓
SEMANTIC    --surface   --accent       --info-fill     meaning, no raw values
     ↓
COMPONENT   bg-surface  text-accent    border-border-interactive
```

Components may only touch the semantic layer. The Tailwind theme is mapped so that `bg-zinc-900` **does not exist** as a utility — only `bg-surface`. A component that could reach a primitive has hard-coded an appearance, and light mode stops being a derived output (PRD DS-02, DS-03, ENG-06).

### 3.2 Two border tokens, because WCAG asks two questions

WCAG 1.4.11 requires 3:1 only for boundaries **needed to identify a control**. A decorative rule between two rows carries no information and is exempt.

Collapsing both into one token forces a choice between an inaccessible control and a harsh, over-ruled interface. So there are two:

| Token | Ratio | Use |
| --- | --- | --- |
| `--border` | 1.39:1 dark · 1.27:1 light | Separators, card edges — decorative only, documented exemption |
| `--border-interactive` | 4.12:1 dark · 4.83:1 light | Inputs, toggles, any control boundary |
| `--border-strong` | 7.76:1 dark · 7.73:1 light | Hover and active states |

The PRD's `#2A2A2A` is preserved exactly where it belongs — quiet separators — while controls get an edge that can actually be seen.

### 3.3 Light mode is derived, not inverted

Every hue moves to a **darker** step in light mode. A value that reads on near-black is unreadable on white; the relationship is not symmetric, and inverting a dark palette produces exactly the five failures in §2.

| Role | Dark | Light |
| --- | --- | --- |
| Accent | `emerald-500` 7.84:1 | `emerald-700` 5.48:1 |
| Info | `blue-400` 7.83:1 | `blue-600` 5.17:1 |
| Warning | `amber-500` 9.26:1 | `amber-700` 5.02:1 |
| Danger | `red-400` 7.19:1 | `red-600` 4.83:1 |

### 3.4 `--text-muted` is restricted

At 4.12:1 on dark, muted text **fails AA at body size** and is checked at the large-text bar (3:1) instead. The token comment records the restriction: ≥24px, or ≥18.66px bold. It exists for timestamps and captions set large, not for prose.

This is the honest handling. The alternative — quietly listing it as a body colour — would put a failure into every screen.

---

## 4. Typography

Five sizes, capped. Hierarchy comes from weight and space, not from size proliferation (PRD DS-07).

| Token | Size | Use |
| --- | --- | --- |
| `--text-display` | `clamp(40px → 56px)` | Hero figures. The one fluid size. |
| `--text-title` | 24px | Section and screen titles |
| `--text-body` | 15px | Everything else |
| `--text-label` | 13px | Field labels, metadata |
| `--text-caption` | 11px | Timestamps, footnotes |

Only the display size is fluid, because a portfolio value is the single number a screen exists to show and should scale with the viewport. Body text scaling with the viewport is a readability regression, not a feature.

**Every monetary figure carries `.tabular`.** Without tabular figures, digit widths differ and a column of amounts cannot be scanned — the specific reason PRD M-07 exists. Enforced as a utility rather than left to memory.

---

## 5. Spacing, radius, elevation

**Spacing** is 8-point with a single 4px half-step. The half-step exists for optical adjustments inside controls; anything larger is a multiple of 8.

**Radius** follows the PRD exactly: cards and charts 20px, buttons and inputs 16px, sheets 24px, pills 999px.

**Elevation** in dark mode comes primarily from surface lightness (`--bg` → `--surface` → `--surface-elevated`), with shadow as a supporting cue. Shadows on near-black surfaces are nearly invisible; treating them as the mechanism produces a flat interface. Light mode inverts this — shadow does the work, surfaces stay close in value.

---

## 6. Motion

All motion comes from `src/components/motion/primitives.ts`. Ad-hoc durations are how an interface stops feeling like one piece of software.

| Token | Value |
| --- | --- |
| `--duration-fast` | 150ms |
| `--duration-base` | 175ms |
| `--duration-slow` | 200ms |
| `--ease-out` | `cubic-bezier(0.2, 0, 0, 1)` |

The easing curve decelerates without overshoot. A spring that settles past its target reads as playful, and this product is not playful — it is calm (PRD UX-10).

**List stagger is capped at 8 items.** Beyond that the last row arrives late enough to read as sluggishness rather than polish.

**Reduced motion is handled globally**, in `globals.css` and again in the token layer, rather than remembered at each animation. An animation that forgets it is a vestibular trigger, not a style bug (PRD UX-15).

**Haptics** fire on exactly three moments — payment success, loan closure, swipe-action commit — and are silently absent where unsupported, so callers never feature-detect.

---

## 7. Charts

Seven series colours, each verified ≥3:1 against the background in both themes, because a chart series distinguishable only to full-colour vision fails PRD ACC-06.

| Series | Dark | Light |
| --- | --- | --- |
| 1 | `emerald-400` 10.35:1 | `emerald-600` 3.77:1 |
| 2 | `blue-400` 7.83:1 | `blue-600` 5.17:1 |
| 3 | `amber-400` 11.92:1 | `amber-600` 3.19:1 |
| 4 | `violet-400` 7.31:1 | `violet-600` 5.70:1 |
| 5 | `cyan-400` 11.01:1 | `cyan-700` 5.36:1 |
| 6 | `pink-400` 7.51:1 | `pink-600` 4.60:1 |
| 7 | `red-400` 7.19:1 | `red-600` 4.83:1 |

**Projections are visually distinguished from actuals** by dedicated tokens — `--chart-projected-opacity: 0.45` and a dashed stroke — satisfying PRD A-14 and principle 3 ("never present a projection as a certainty") at the token level, so a chart cannot accidentally render a forecast as fact.

Colour is never the only channel. Status carries a glyph or label alongside its hue (PRD ACC-06), and every chart offers an accessible data table (A-13).

---

## 8. Verification

```
✓ pnpm check:contrast   66/66 pairings meet WCAG 2.2 AA (33 dark, 33 light)
✓ regression detected   --info reverted to blue-600 → 2 failures, exit 1
✓ pnpm typecheck        clean
✓ pnpm boundaries       clean (40 modules)
```

The checker reads token values from `tokens.css` and resolves them through their `var()` chains, so it verifies **what the application renders** — not a table copied into a document that drifts the first time a token changes. It runs in CI alongside typecheck, lint, and boundaries.

Proving it fails is as important as proving it passes: reverting `--info` to the PRD's `#2563EB` produces two failures and exit code 1. This is the standing rule from Phase 5 — a check that has never been seen to fail is not known to work.

---

## 9. Open questions

| # | Question | Needed by | Default |
| --- | --- | --- | --- |
| Q24 | Ship an Inter subset as a self-hosted fallback, or rely on system stacks? | Phase 8 | Self-host a Latin + Devanagari subset; a font swap on the hero number is very visible |
| Q25 | Should `--text-muted` exist at all, given its size restriction? | Phase 8 | Keep it, restricted; review after building real screens |
| Q26 | Does the increased-contrast preference (PRD S-11) need a third token set, or is raising `--text-secondary` to `--text-primary` enough? | Phase 9 | A small override block, not a full theme |

---

## 10. Amendments to earlier phases

| Ref | Change | Rationale |
| --- | --- | --- |
| PRD §11 palette | Blue `#2563EB`, amber `#F59E0B`, and emerald `#10B981` carry **usage rules** rather than being universally valid. Each measures below AA in at least one role or theme; each is retained where it measures correctly. | Measured, not assumed. §2 records every ratio. |
| PRD §11 border | `#2A2A2A` splits into `--border` (decorative, exempt) and `--border-interactive` (4.12:1). | WCAG 1.4.11 applies to control boundaries, not separators. One token cannot serve both without failing one of them. |

No palette was replaced and no requirement was dropped.

---

*End of Phase 7.*
