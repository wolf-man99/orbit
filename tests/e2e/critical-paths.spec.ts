import { expect, test } from '@playwright/test'

/**
 * The paths that must never break. (PRD ENG-05)
 *
 * These assert the product's *promises*, not its markup: that money is grouped
 * the Indian way, that no score appears without its reasons, that a calm
 * portfolio does not manufacture alarm, and that the tone stays non-punitive.
 */

test.describe('dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard')
  })

  test('answers its question above the fold', async ({ page }) => {
    await expect(page.getByText('Portfolio value')).toBeVisible()
    // Indian grouping, no decimals on a hero figure. (PRD M-06)
    await expect(page.locator('text=/₹\\d{1,2},\\d{2},\\d{3}/').first()).toBeVisible()
  })

  test('never shows a health score without its factors', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Portfolio health' })).toBeVisible()
    // Scoped to the health card: "Collection rate" also appears in the
    // character tier, as the rate itself rather than as a factor score. An
    // unscoped locator matched both and failed — which is the test correctly
    // reporting that the dashboard says those words twice.
    const health = page.locator('section', { has: page.getByRole('heading', { name: 'Portfolio health' }) })
    for (const factor of [
      'Collection rate', 'Overdue exposure', 'Overdue borrowers', 'Concentration', 'Punctuality',
    ]) {
      await expect(health.getByText(factor, { exact: true })).toBeVisible()
    }
    // Each factor states its weight explicitly, so a weight cannot be misread
    // as the metric itself. 30% is collection's weight after the Q32 rebalance.
    await expect(health.getByText('30% weight', { exact: false }).first()).toBeVisible()
  })

  test('renders every factor score as an integer', async ({ page }) => {
    const scores = await page.locator('text=/\\d+\\/100 · \\d+% weight/').allTextContents()
    expect(scores.length).toBeGreaterThan(0)
    for (const text of scores) {
      expect(text).not.toMatch(/\d+\.\d+\/100/)
    }
  })

  test('dates every figure it shows', async ({ page }) => {
    await expect(page.getByText(/as of/i).first()).toBeVisible()
  })
})

test.describe('borrowers', () => {
  test('lists borrowers with status carried by a label, not colour alone', async ({ page }) => {
    await page.goto('/borrowers')
    await expect(page.getByRole('heading', { name: 'Borrowers' })).toBeVisible()
    await expect(page.getByText('Ravi Sharma')).toBeVisible()
    // ACC-06: status is a word, not merely a hue.
    await expect(page.getByText(/Overdue|Due soon|Active/).first()).toBeVisible()
  })

  test('reaches a borrower profile in one tap from the directory', async ({ page }) => {
    await page.goto('/borrowers')
    await page.getByText('Ravi Sharma').first().click()
    await expect(page).toHaveURL(/\/borrowers\/b1/)
    await expect(page.getByRole('heading', { name: 'Ravi Sharma' })).toBeVisible()
  })

  test('shows the accrual derivation for a split cycle', async ({ page }) => {
    await page.goto('/borrowers/b1')
    await expect(page.getByText('Accrual schedule')).toBeVisible()
    // A mid-cycle repayment splits the cycle; both bases must be visible. (E-12)
    await expect(page.getByText(/on ₹5,00,000/).first()).toBeVisible()
    await expect(page.getByText(/on ₹4,00,000/).first()).toBeVisible()
  })
})

test.describe('tone', () => {
  test('never uses punitive vocabulary anywhere in the product', async ({ page }) => {
    for (const path of ['/dashboard', '/borrowers', '/borrowers/b1']) {
      await page.goto(path)
      const text = ((await page.locator('body').textContent()) ?? '').toLowerCase()
      for (const banned of ['delinquent', 'debtor', 'bad debt', 'defaulter', 'in default']) {
        expect(text, `${banned} on ${path}`).not.toContain(banned)
      }
    }
  })
})

test.describe('navigation', () => {
  // Runs on BOTH projects. Q31 is closed: the desktop sidebar now carries the
  // same information architecture as the mobile bottom bar, so the same
  // assertions hold at either width.
  test('offers the same destinations plus a record action at every width', async ({ page }) => {
    await page.goto('/dashboard')
    const nav = page.getByRole('navigation', { name: 'Primary' })
    for (const label of ['Dashboard', 'Borrowers', 'Transactions', 'Analytics']) {
      await expect(nav.getByText(label, { exact: true })).toBeVisible()
    }
    await expect(page.getByRole('button', { name: /Record payment/ })).toBeVisible()
  })

  test('reaches every screen', async ({ page }) => {
    for (const [path, heading] of [
      ['/transactions', 'Transactions'],
      ['/analytics', 'Analytics'],
      ['/notifications', 'Notifications'],
      ['/settings', 'Settings'],
    ]) {
      await page.goto(path as string)
      await expect(page.getByRole('heading', { name: heading as string, level: 1 })).toBeVisible()
    }
  })
})

test.describe('analytics', () => {
  test('states its read in words above the chart, and offers a table', async ({ page }) => {
    await page.goto('/analytics')
    // A chart that needs interpretation has not finished its job.
    await expect(page.getByText(/% of interest due has been received|Nothing has fallen due/)).toBeVisible()
    // Every chart has an accessible table equivalent. (PRD A-13)
    await expect(page.getByText('View as table')).toBeVisible()
  })
})

test.describe('health model (Q32)', () => {
  test('reports overdue breadth, not only overdue value', async ({ page }) => {
    await page.goto('/dashboard')
    const health = page.locator('section', { has: page.getByRole('heading', { name: 'Portfolio health' }) })
    await expect(health.getByText('Overdue borrowers', { exact: true })).toBeVisible()
    await expect(health.getByText(/\d+ of \d+ borrowers are overdue/)).toBeVisible()
  })

  test('does not read Strong while most borrowers are overdue', async ({ page }) => {
    await page.goto('/dashboard')
    const health = page.locator('section', { has: page.getByRole('heading', { name: 'Portfolio health' }) })
    await expect(health.getByText('Strong', { exact: true })).toHaveCount(0)
  })
})
