#!/usr/bin/env node
/**
 * Captures the component gallery in both themes and at mobile width.
 *
 * Run against a running production build:
 *   pnpm build && pnpm start -p 3211 &
 *   pnpm gallery
 *
 * Rendering the library is how two Phase 8 defects were found that typecheck,
 * lint, and unit tests all passed over: an inert `size` variant, and a status
 * chip that reflowed onto two lines.
 */
import { chromium } from '@playwright/test'

const PORT = process.env.PORT ?? 3211

// The pinned Playwright expects a browser build this image does not carry, so
// point at the pre-installed Chromium rather than downloading one.
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })

const shots = [
  ['dark', { width: 1100, height: 2400 }, false],
  ['light', { width: 1100, height: 2400 }, true],
  ['mobile', { width: 390, height: 1600 }, false],
]

for (const [name, viewport, light] of shots) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 })
  await page.goto(`http://localhost:${PORT}/gallery`, { waitUntil: 'networkidle' })
  if (light) await page.evaluate(() => document.documentElement.classList.add('light'))
  await page.waitForTimeout(500)
  await page.screenshot({ path: `docs/assets/gallery-${name}.png`, fullPage: true })
  console.log('captured', name)
  await page.close()
}

await browser.close()
