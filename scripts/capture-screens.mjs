#!/usr/bin/env node
/**
 * Captures the product screens for review.
 *
 * Run against a running production build:
 *   pnpm build && pnpm start -p 3212 &
 *   pnpm screens
 */
import { chromium } from '@playwright/test'

const PORT = process.env.PORT ?? 3212
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })

const screens = [
  ['dashboard', '/dashboard', { width: 430, height: 1400 }],
  ['dashboard-wide', '/dashboard', { width: 1100, height: 1500 }],
  ['borrowers', '/borrowers', { width: 430, height: 1100 }],
  ['borrower-profile', '/borrowers/b1', { width: 430, height: 1500 }],
]

for (const [name, path, viewport] of screens) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 })
  await page.goto(`http://localhost:${PORT}${path}`, { waitUntil: 'load' })
  // 'load' rather than 'networkidle': Next prefetches route payloads in the
  // background, so the network never idles and networkidle times out.
  await page.waitForTimeout(1200) // let the hero count-up settle
  await page.screenshot({ path: `docs/assets/screen-${name}.png`, fullPage: true })
  console.log('captured', name)
  await page.close()
}

await browser.close()
