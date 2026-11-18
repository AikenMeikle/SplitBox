import { CheckCircle2, RotateCcw } from 'lucide-react';
import { formatGbp } from '../../data/catalog';
import type { UserOrderSliceDetail } from '../../types';

export interface SettlementReceiptProps {
  initialEscrowHoldGbp: number;
  finalChargedGbp: number;
  totalRefundedGbp: number;
  userSlices: UserOrderSliceDetail[];
}

/**
 * Perforated wholesale receipt block proving fulfilled slices stay active
 * even when overflow slices in the same order auto-refund.
 */
export function SettlementReceipt({
  initialEscrowHoldGbp,
  finalChargedGbp,
  totalRefundedGbp,
  userSlices,
}: SettlementReceiptProps) {
  const fulfilledSlices = userSlices.filter((s) => s.status === 'fulfilled');
  const refundedSlices = userSlices.filter((s) => s.status === 'auto_refunded');

  return (
    <section
      aria-label="Final Drop Settlement Receipt"
      className="sb-card__receipt border-2 border-[var(--sb-ink-primary)] shadow-[2px_2px_0px_#0B241C] p-4 sm:p-5"
    >
      {/* Receipt Top Header */}
      <div className="flex items-center justify-between pb-2.5 border-b-2 border-dashed border-[var(--sb-ink-primary)]">
        <div>
          <span className="text-[0.68rem] uppercase tracking-widest font-mono font-bold text-[var(--sb-ink-secondary)] block">
            SplitBox Escrow Settlement
          </span>
          <h3 className="sb-h2 text-base sm:text-lg text-[var(--sb-ink-primary)] m-0">
            Final Settlement Receipt
          </h3>
        </div>
        <span className="sb-badge sb-badge--mint text-[0.68rem]">
          ✓ ESCROW RECONCILED
        </span>
      </div>

      {/* Main Numbers Breakdown */}
      <div className="space-y-2 py-3">
        {/* Initial Upfront Escrow Hold */}
        <div className="sb-receipt-row">
          <span className="text-[var(--sb-ink-primary)] font-medium">
            Initial Upfront Escrow Payment Hold
          </span>
          <span className="sb-mono font-bold text-[var(--sb-ink-primary)] text-sm">
            {formatGbp(initialEscrowHoldGbp)}
          </span>
        </div>

        {/* Auto-Refunded Overflow Slices Highlight */}
        {totalRefundedGbp > 0 ? (
          <div className="sb-receipt-row bg-rose-50 border border-[var(--sb-danger-600)] p-2 rounded text-[var(--sb-danger-600)]">
            <div className="flex items-center gap-1.5 font-bold">
              <RotateCcw className="w-4 h-4 shrink-0" />
              <span>
                Auto-Refunded Overflow ({refundedSlices.length} slice
                {refundedSlices.length !== 1 ? 's' : ''})
              </span>
            </div>
            <span className="sb-mono font-extrabold text-sm sm:text-base">
              -{formatGbp(totalRefundedGbp)}
            </span>
          </div>
        ) : (
          <div className="sb-receipt-row text-[var(--sb-ink-secondary)] text-xs">
            <span>Auto-Refunded Overflow (0 slices)</span>
            <span className="sb-mono font-bold">£0.00</span>
          </div>
        )}

        {/* Guaranteed Fulfilled Slices */}
        <div className="sb-receipt-row">
          <span className="text-[var(--sb-ink-primary)] font-medium">
            Guaranteed Fulfilled Slices ({fulfilledSlices.length} slice
            {fulfilledSlices.length !== 1 ? 's' : ''})
          </span>
          <span className="sb-mono font-bold text-[var(--sb-ink-primary)] text-sm">
            +{formatGbp(finalChargedGbp)}
          </span>
        </div>

        {/* Transparent £0.00 Fees */}
        <div className="sb-receipt-row">
          <span className="text-[var(--sb-ink-secondary)]">
            SplitBox Packaging &amp; Platform Fee
          </span>
          <span className="sb-mono font-bold text-[var(--sb-mint-700)]">
            £0.00 (FREE)
          </span>
        </div>

        <div className="sb-receipt-row">
          <span className="text-[var(--sb-ink-secondary)]">
            Birmingham Campus Hub Logistics Fee
          </span>
          <span className="sb-mono font-bold text-[var(--sb-mint-700)]">
            £0.00 (FREE)
          </span>
        </div>

        {/* Final Net Charged Total */}
        <div className="sb-receipt-row sb-receipt-row--highlight my-2 pt-2.5 pb-2.5 border-t-2 border-b-2 border-dashed border-[var(--sb-ink-primary)]">
          <div>
            <span className="text-xs sm:text-sm font-extrabold tracking-wider text-[var(--sb-ink-primary)] block">
              FINAL NET CHARGED TOTAL
            </span>
            <span className="text-[0.7rem] text-[var(--sb-ink-secondary)] block font-normal">
              Final amount captured from escrow card hold
            </span>
          </div>
          <span className="sb-receipt-price sb-mono text-xl sm:text-2xl text-[var(--sb-ink-primary)] font-extrabold">
            {formatGbp(finalChargedGbp)}
          </span>
        </div>
      </div>

      {/* Proof Banner */}
      <div className="p-2.5 bg-white border border-[var(--sb-ink-primary)] rounded flex items-start gap-2 text-[0.72rem] text-[var(--sb-ink-primary)]">
        <CheckCircle2 className="w-4 h-4 text-[var(--sb-mint-700)] shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-bold block">
            Guaranteed Slice Active Protection
          </span>
          <p className="m-0 leading-relaxed text-[var(--sb-ink-secondary)]">
            All fulfilled slices in 100% full wholesale cases remain active and ready for Saturday
            campus collection, even if other overflow slices in the same order auto-refunded.
          </p>
        </div>
      </div>
    </section>
  );
}
