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
    for (const factor of ['Collection rate', 'Overdue exposure', 'Concentration', 'Punctuality']) {
      await expect(health.getByText(factor, { exact: true })).toBeVisible()
    }
    // Each factor states its weight explicitly, so a weight cannot be misread
    // as the metric itself.
    await expect(page.getByText('35% weight', { exact: false })).toBeVisible()
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
  // Mobile only. Phase 2 §3.2 specifies a desktop sidebar carrying the same
  // information architecture; it is NOT yet built, and this test failing on the
  // desktop project is how that gap was found. Tracked as Q31.
  test('offers four destinations plus a centred action', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'desktop sidebar not yet built — Q31')
    await page.goto('/dashboard')
    const nav = page.getByRole('navigation', { name: 'Primary' })
    for (const label of ['Dashboard', 'Borrowers', 'Transactions', 'Analytics']) {
      await expect(nav.getByText(label, { exact: true })).toBeVisible()
    }
    await expect(page.getByRole('button', { name: 'Record payment' })).toBeVisible()
  })
})
