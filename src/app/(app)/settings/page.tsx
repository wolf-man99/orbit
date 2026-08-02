import { Card } from '@/components'

/** Settings — "How does Orbit behave?" (Phase 2 §6, PRD S-01 … S-11) */
export const dynamic = 'force-static'

const GROUPS = [
  {
    title: 'Appearance',
    rows: [
      ['Theme', 'Dark'],
      ['Reduced motion', 'Follow system'],
      ['Increased contrast', 'Off'],
    ],
  },
  {
    title: 'Financial defaults',
    rows: [
      ['Currency', 'INR — ₹'],
      ['Interest convention', 'Reducing balance'],
      ['Rate period', 'Per month'],
      ['Day count', 'Actual/365'],
      ['Grace window', '5 days'],
      ['Accrual anchor', "Loan's start day"],
    ],
  },
  {
    title: 'Notifications',
    rows: [
      ['Push notifications', 'Off'],
      ['Daily digest', 'Off'],
      ['Quiet hours', 'Not set'],
    ],
  },
  {
    title: 'Security',
    rows: [
      ['App lock', 'Off'],
      ['Auto-lock', 'After 5 minutes'],
    ],
  },
  {
    title: 'Data',
    rows: [
      ['Export', 'JSON · CSV · Excel'],
      ['Import', 'JSON · CSV'],
      ['Engine version', 'accrual-1.0.0'],
    ],
  },
] as const

export default function SettingsPage() {
  return (
    <>
      <header className="mb-6">
        <h1 className="text-title">Settings</h1>
      </header>

      <div className="space-y-6">
        {GROUPS.map((group) => (
          <section key={group.title} aria-labelledby={`s-${group.title}`}>
            <h2 id={`s-${group.title}`} className="mb-2 px-1 text-label text-secondary">
              {group.title}
            </h2>
            <Card className="p-0">
              {group.rows.map(([label, value], index) => (
                <div key={label}
                  className={`flex min-h-[44px] items-center justify-between gap-4 px-4 py-3 ${
                    index > 0 ? 'border-t border-border' : ''}`}>
                  <span className="text-body text-primary">{label}</span>
                  <span className="text-body text-secondary tabular">{value}</span>
                </div>
              ))}
            </Card>
          </section>
        ))}

        {/*
          Engine version is surfaced deliberately: every accrual figure is
          stamped with it, so a user querying an old statement can be told which
          version produced it. (PRD E-14)
        */}
        <p className="px-1 text-caption text-muted">
          Orbit · every figure is recomputable from the ledger.
        </p>
      </div>
    </>
  )
}
