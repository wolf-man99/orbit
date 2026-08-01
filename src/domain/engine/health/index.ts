/**
 * Portfolio health and borrower risk. (PRD D-10, BP-05)
 *
 * Both are deterministic composites that publish their factors. PRD principle 8
 * forbids a black-box score attached to a real relationship, so neither model
 * returns a bare number — the breakdown is part of the return type, which makes
 * displaying the score without its reasons impossible by construction.
 */
import { type Minor } from '../../money'

export interface Factor {
  readonly key: string
  readonly label: string
  /** 0–100, where 100 is best. */
  readonly score: number
  /** Share of the composite, in percent. */
  readonly weight: number
  /** Plain-language statement of the underlying figure. */
  readonly detail: string
}

export interface Composite {
  readonly score: number
  readonly band: string
  readonly factors: readonly Factor[]
}

const clamp = (value: number, low = 0, high = 100) => Math.max(low, Math.min(high, value))

const weightedScore = (factors: readonly Factor[]): number =>
  Math.round(factors.reduce((total, f) => total + f.score * (f.weight / 100), 0))

// ---------------------------------------------------------------------------
// Portfolio health
// ---------------------------------------------------------------------------

export interface HealthInput {
  /** Interest received ÷ interest due over the trailing window, in bps. */
  readonly collectionRateBps: number
  readonly overdueMinor: Minor
  readonly outstandingMinor: Minor
  /** Herfindahl index across borrower exposure, 0–10000. */
  readonly concentrationHhi: number
  /** Mean days between due and settled across the window. */
  readonly avgDaysToSettle: number
  /** Weighted mean age of active loans, in months. */
  readonly portfolioAgeMonths: number
}

export function portfolioHealth(input: HealthInput): Composite {
  const overdueShare =
    input.outstandingMinor > 0n
      ? Number((input.overdueMinor * 10_000n) / input.outstandingMinor) / 10_000
      : 0

  const factors: Factor[] = [
    {
      key: 'collection',
      label: 'Collection rate',
      weight: 35,
      score: clamp(input.collectionRateBps / 100),
      detail: `${(input.collectionRateBps / 100).toFixed(0)}% of interest due was received`,
    },
    {
      key: 'overdue',
      label: 'Overdue exposure',
      weight: 25,
      score: clamp(100 - overdueShare * 300),
      detail: `${(overdueShare * 100).toFixed(1)}% of outstanding capital is overdue`,
    },
    {
      key: 'concentration',
      label: 'Concentration',
      weight: 20,
      // HHI: 10000 is a single borrower, ~1000 is well spread.
      score: clamp(100 - (input.concentrationHhi - 1000) / 90),
      detail: `Largest exposures give a Herfindahl index of ${input.concentrationHhi}`,
    },
    {
      key: 'punctuality',
      label: 'Punctuality',
      weight: 15,
      score: clamp(100 - input.avgDaysToSettle * 4),
      detail: `Payments settle ${input.avgDaysToSettle.toFixed(0)} days after falling due on average`,
    },
    {
      key: 'stability',
      label: 'Portfolio age',
      weight: 5,
      score: clamp(input.portfolioAgeMonths * 4),
      detail: `Active loans average ${input.portfolioAgeMonths.toFixed(0)} months old`,
    },
  ]

  const score = weightedScore(factors)
  return { score, band: healthBand(score), factors }
}

export const healthBand = (score: number): string =>
  score >= 80 ? 'Strong' : score >= 60 ? 'Steady' : score >= 40 ? 'Watch' : 'Strained'

// ---------------------------------------------------------------------------
// Borrower risk
// ---------------------------------------------------------------------------

export interface RiskInput {
  readonly avgDaysLate: number
  readonly missedPeriods: number
  readonly totalPeriods: number
  readonly exposureMinor: Minor
  readonly portfolioOutstandingMinor: Minor
  readonly relationshipMonths: number
  readonly partialPayments: number
  readonly totalPayments: number
}

/**
 * Risk is reported 0–100 where HIGHER MEANS MORE RISK, the inverse of health.
 * Bands are deliberately non-punitive: a person who is late is "Strained", not
 * "high risk" or "delinquent". (Phase 2 §15.1)
 */
export function borrowerRisk(input: RiskInput): Composite {
  const missedRatio = input.totalPeriods > 0 ? input.missedPeriods / input.totalPeriods : 0
  const exposureShare =
    input.portfolioOutstandingMinor > 0n
      ? Number((input.exposureMinor * 10_000n) / input.portfolioOutstandingMinor) / 10_000
      : 0
  const partialRatio = input.totalPayments > 0 ? input.partialPayments / input.totalPayments : 0

  const factors: Factor[] = [
    {
      key: 'punctuality',
      label: 'Payment punctuality',
      weight: 30,
      score: clamp(input.avgDaysLate * 5),
      detail: `Payments arrive ${input.avgDaysLate.toFixed(0)} days after falling due on average`,
    },
    {
      key: 'missed',
      label: 'Missed cycles',
      weight: 25,
      score: clamp(missedRatio * 200),
      detail: `${input.missedPeriods} of ${input.totalPeriods} cycles are unsettled`,
    },
    {
      key: 'exposure',
      label: 'Share of portfolio',
      weight: 20,
      score: clamp(exposureShare * 250),
      detail: `${(exposureShare * 100).toFixed(1)}% of capital is with this borrower`,
    },
    {
      key: 'tenure',
      label: 'Relationship length',
      weight: 15,
      score: clamp(100 - input.relationshipMonths * 3),
      detail: `${input.relationshipMonths} months of history`,
    },
    {
      key: 'partial',
      label: 'Partial payments',
      weight: 10,
      score: clamp(partialRatio * 150),
      detail: `${input.partialPayments} of ${input.totalPayments} payments fell short of the amount due`,
    },
  ]

  const score = weightedScore(factors)
  return { score, band: riskBand(score), factors }
}

export const riskBand = (score: number): string =>
  score < 25 ? 'Strong' : score < 50 ? 'Steady' : score < 75 ? 'Watch' : 'Strained'

/** Herfindahl index over exposures, scaled to 0–10000. */
export function concentrationIndex(exposures: readonly Minor[]): number {
  const total = exposures.reduce((sum, value) => sum + (value as bigint), 0n)
  if (total <= 0n) return 0
  let hhi = 0
  for (const exposure of exposures) {
    const share = Number((exposure * 10_000n) / total) / 10_000
    hhi += share * share
  }
  return Math.round(hhi * 10_000)
}
