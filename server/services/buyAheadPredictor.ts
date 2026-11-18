import type { DatabaseSync } from 'node:sqlite';
import type { BuyAheadDecision, BuyAheadPrediction } from '../../src/shared/types.ts';
import { getSettings } from '../db.ts';

/**
 * Exact Poisson cumulative tail probability P(D >= u) where D ~ Poisson(mu),
 * alongside exact expected carryover units sold E[min(D, u)] over the safe horizon.
 */
function computePoissonSellThrough(
  mu: number,
  unsoldSlots: number
): { sellThroughProb: number; expectedUnitsSold: number } {
  if (unsoldSlots <= 0) {
    return { sellThroughProb: 1, expectedUnitsSold: 0 };
  }
  if (mu <= 0) {
    return { sellThroughProb: 0, expectedUnitsSold: 0 };
  }

  let cumulativeLess = 0;
  let weightedPartialUnits = 0;
  let term = Math.exp(-mu);

  for (let k = 0; k < unsoldSlots; k++) {
    if (k > 0) {
      term = (term * mu) / k;
    }
    cumulativeLess += term;
    weightedPartialUnits += k * term;
  }

  const sellThroughProb = Math.max(0, Math.min(1, 1 - cumulativeLess));
  const expectedUnitsSold = weightedPartialUnits + unsoldSlots * sellThroughProb;

  return { sellThroughProb, expectedUnitsSold };
}

/**
 * Gamma-Poisson Bayesian Incomplete-Box Buy-Ahead Safety Predictor.
 *
 * Evaluates every currently incomplete open box (`pooling` slots > 0) to advise
 * the student founder whether it is mathematically safe to buy the full wholesale
 * case anyway (fulfilling current students and rolling leftover shelf-stable units
 * into next week's hub stock) versus auto-refunding.
 */
export function computeBuyAheadPredictions(db: DatabaseSync): BuyAheadPrediction[] {
  const settings = getSettings(db);
  if (settings.dropStatus !== 'open') {
    return [];
  }

  const rows = db
    .prepare(`
      SELECT
        p.id AS product_id,
        p.name AS product_name,
        p.brand,
        p.image_emoji,
        p.case_size,
        p.share_price_pence,
        p.wholesale_case_cost_pence,
        p.shelf_life_weeks,
        COALESCE(SUM(CASE WHEN a.drop_cycle_number = ? AND a.status = 'pooling' THEN 1 ELSE 0 END), 0) AS open_claimed_slots,
        COALESCE(SUM(CASE WHEN a.drop_cycle_number = ? AND a.status = 'pooling' THEN a.share_price_pence ELSE 0 END), 0) AS open_student_cash_pence,
        COUNT(a.id) AS historical_total_slots
      FROM products p
      LEFT JOIN pool_allocations a ON a.product_id = p.id
      WHERE p.deleted_at IS NULL AND p.is_active = 1
      GROUP BY p.id
      HAVING open_claimed_slots > 0
    `)
    .all(settings.dropCycleNumber, settings.dropCycleNumber) as Array<Record<string, unknown>>;

  const observedWeeks = Math.max(1, settings.dropCycleNumber);
  // Mild campus prior Gamma(alpha0 = 2.0, beta0 = 1.0) -> ~2 shares/week baseline
  const alpha0 = 2.0;
  const beta0 = 1.0;

  const predictions: BuyAheadPrediction[] = rows.map((row) => {
    const caseSize = Math.max(1, Number(row.case_size));
    const openCaseClaimedSlots = Number(row.open_claimed_slots);
    const unsoldSlotsCount = Math.max(1, caseSize - openCaseClaimedSlots);
    const shelfLifeWeeks = Math.max(1, Number(row.shelf_life_weeks || 26));
    const sharePricePence = Number(row.share_price_pence);
    const wholesaleCaseCostPence = Number(row.wholesale_case_cost_pence);
    const immediateStudentCashPence = Number(row.open_student_cash_pence);
    const historicalTotalSlots = Number(row.historical_total_slots);

    // Safe rollover window: never exceed half of shelf life or 6 campus weeks; 0 if <4 weeks.
    const safeHorizonWeeks =
      shelfLifeWeeks < 4 ? 0 : Math.min(Math.floor(shelfLifeWeeks / 2), 6);

    // Gamma-Poisson posterior mean weekly demand rate (shares/week)
    const lambdaWeekly = (alpha0 + historicalTotalSlots) / (beta0 + observedWeeks);
    const estimatedWeeklyDemand = Number(lambdaWeekly.toFixed(2));

    const horizonMeanDemand = lambdaWeekly * safeHorizonWeeks;
    const { sellThroughProb, expectedUnitsSold } = computePoissonSellThrough(
      horizonMeanDemand,
      unsoldSlotsCount
    );
    const sellThroughProbability = Number(sellThroughProb.toFixed(4));

    const upfrontCashCoverageRatio =
      wholesaleCaseCostPence > 0
        ? Number((immediateStudentCashPence / wholesaleCaseCostPence).toFixed(4))
        : 1;
    const netOutOfPocketFloatPence = Math.max(
      0,
      wholesaleCaseCostPence - immediateStudentCashPence
    );

    const expectedFutureCarryoverCashPence = Math.round(expectedUnitsSold * sharePricePence);
    const expectedNetProfitPence =
      immediateStudentCashPence + expectedFutureCarryoverCashPence - wholesaleCaseCostPence;

    let safetyScore = 0;
    if (shelfLifeWeeks < 4) {
      // Perishable / short-dated bakery items (<4 weeks) risk spoilage -> cap low score.
      safetyScore = Math.min(25, Math.round(upfrontCashCoverageRatio * 25));
    } else {
      const sellScore = sellThroughProbability * 45;
      const cashCoverageScore = Math.min(1, upfrontCashCoverageRatio) * 35;
      const durabilityScore = (Math.min(shelfLifeWeeks, 52) / 52) * 10;
      const profitBonus = expectedNetProfitPence > 0 ? 10 : 0;
      safetyScore = Math.max(
        0,
        Math.min(100, Math.round(sellScore + cashCoverageScore + durabilityScore + profitBonus))
      );
    }

    let decision: BuyAheadDecision = 'AUTO_REFUND';
    if (shelfLifeWeeks >= 4 && safetyScore >= 70 && sellThroughProbability >= 0.65) {
      decision = 'SAFE_BUY_AHEAD';
    } else if (shelfLifeWeeks >= 4 && safetyScore >= 45) {
      decision = 'BORDERLINE_REVIEW';
    }

    const coveragePct = Math.round(upfrontCashCoverageRatio * 100);
    const sellProbPct = Math.round(sellThroughProbability * 100);
    const floatGbp = `£${(netOutOfPocketFloatPence / 100).toFixed(2)}`;

    let explanation: string;
    if (shelfLifeWeeks < 4) {
      explanation = `Short ${shelfLifeWeeks}-week shelf life risks spoilage before carryover clears. Auto-refunding avoids perished stock.`;
    } else if (decision === 'SAFE_BUY_AHEAD') {
      explanation = `Students already fund ${coveragePct}% of case cost (${floatGbp} float). ${sellProbPct}% Bayesian chance of clearing ${unsoldSlotsCount} leftover unit(s) within ${safeHorizonWeeks} wks (${shelfLifeWeeks}w shelf life).`;
    } else if (decision === 'BORDERLINE_REVIEW') {
      explanation = `${coveragePct}% student cash coverage (${floatGbp} float) and ${sellProbPct}% sell-through probability over ${safeHorizonWeeks} wks. Underwrite only if hub storage is free.`;
    } else {
      explanation = `Low fill (${openCaseClaimedSlots}/${caseSize}, ${floatGbp} upfront float) with ${sellProbPct}% sell-through odds. Safer to auto-refund and pool again next week.`;
    }

    return {
      productId: String(row.product_id),
      productName: String(row.product_name),
      brand: String(row.brand),
      imageEmoji: String(row.image_emoji),
      caseSize,
      openCaseClaimedSlots,
      unsoldSlotsCount,
      shelfLifeWeeks,
      safeHorizonWeeks,
      estimatedWeeklyDemand,
      sellThroughProbability,
      wholesaleCaseCostPence,
      immediateStudentCashPence,
      upfrontCashCoverageRatio,
      netOutOfPocketFloatPence,
      expectedNetProfitPence,
      safetyScore,
      decision,
      explanation,
    };
  });

  return predictions.sort((a, b) => b.safetyScore - a.safetyScore);
}
