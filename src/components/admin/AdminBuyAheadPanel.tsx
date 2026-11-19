import { useState } from 'react';
import { Brain, CheckSquare, ExternalLink, Sparkles, Truck } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import {
  formatPence,
  type AdminSummary,
  type BuyAheadDecision,
  type WholesalePurchaseOrder,
} from '../../shared/types';

interface AdminBuyAheadPanelProps {
  summary: AdminSummary;
  selectedBuyAheadIds: string[];
  onToggleBuyAhead: (productId: string) => void;
  onSelectSafeDefaults: () => void;
  onReloadAll: () => Promise<void>;
  onNotify: (banner: { type: 'ok' | 'err'; text: string }) => void;
}

function getDecisionMeta(decision: BuyAheadDecision): { label: string; className: string } {
  switch (decision) {
    case 'SAFE_BUY_AHEAD':
      return {
        label: 'SAFE TO BUY AHEAD',
        className: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      };
    case 'BORDERLINE_REVIEW':
      return {
        label: 'BORDERLINE',
        className: 'bg-amber-100 text-amber-800 border-amber-300',
      };
    default:
      return {
        label: 'AUTO-REFUND',
        className: 'bg-red-50 text-red-700 border-red-200',
      };
  }
}

/**
 * Bayesian Incomplete-Box Buy-Ahead Safety Predictor & Live Supplier Wholesale PO Panel.
 * Lets the student founder safely underwrite high-probability shelf-stable partial boxes
 * (rolling unsold shares into next week) and dispatch 1-click wholesale orders.
 */
export function AdminBuyAheadPanel({
  summary,
  selectedBuyAheadIds,
  onToggleBuyAhead,
  onSelectSafeDefaults,
  onReloadAll,
  onNotify,
}: AdminBuyAheadPanelProps) {
  const [submittingPo, setSubmittingPo] = useState(false);

  const predictions = summary.buyAheadPredictions ?? [];
  const wholesaleOrders = summary.wholesaleOrders ?? [];
  const dropClosed = summary.settings.dropStatus === 'closed';
  const lockedCasesCount = summary.totals.lockedCasesTotal;
  const totalCasesToOrder = lockedCasesCount + selectedBuyAheadIds.length;

  async function handlePlaceWholesaleOrder() {
    setSubmittingPo(true);
    try {
      const raw = await apiFetch<
        WholesalePurchaseOrder | { order?: WholesalePurchaseOrder }
      >('/api/admin/wholesale/order', {
        method: 'POST',
        body: JSON.stringify({
          includeBuyAheadProductIds: selectedBuyAheadIds,
          buyAheadProductIds: selectedBuyAheadIds,
        }),
      });
      const created = 'id' in raw ? raw : raw.order;
      await onReloadAll();
      onNotify({
        type: 'ok',
        text: created
          ? `Wholesale PO ${created.externalOrderRef} created (${created.totalCasesCount} cases · ${formatPence(created.totalSpendPence)})!`
          : 'Wholesale bulk purchase order generated!',
      });
    } catch (err) {
      onNotify({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to create wholesale purchase order.',
      });
    } finally {
      setSubmittingPo(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. Smart Incomplete-Box Buy-Ahead Predictor */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-emerald-50/40 px-5 py-4">
          <div className="flex items-start gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <Brain className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                🧠 Smart Incomplete-Box Buy-Ahead Predictor (Shelf-Stable Rollover)
              </h3>
              <p className="text-xs text-slate-600">
                Gamma-Poisson Bayesian model scores open boxes on shelf life, sell-through odds &amp; upfront cash float.
                Checked boxes are <strong>fulfilled at cutoff</strong> (unsold shares carry over to next week).
              </p>
            </div>
          </div>
          {predictions.length > 0 && !dropClosed && (
            <button
              type="button"
              onClick={onSelectSafeDefaults}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
            >
              <Sparkles className="h-3.5 w-3.5" /> Select Safe Recommendations
            </button>
          )}
        </div>

        {predictions.length === 0 ? (
          <div className="px-5 py-7 text-center text-xs text-slate-500">
            No incomplete open boxes right now — every active case is either 100% locked or empty!
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {predictions.map((pred) => {
              const badge = getDecisionMeta(pred.decision);
              const checked = selectedBuyAheadIds.includes(pred.productId);
              const sellPct = Math.round(pred.sellThroughProbability * 100);
              const coveragePct = Math.round(pred.upfrontCashCoverageRatio * 100);

              return (
                <div
                  key={pred.productId}
                  className={`p-4 transition-colors ${checked ? 'bg-emerald-50/30' : 'hover:bg-gray-50/60'}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <label className="flex items-start gap-3 cursor-pointer min-w-0 flex-1">
                      <input
                        type="checkbox"
                        disabled={dropClosed}
                        checked={checked}
                        onChange={() => onToggleBuyAhead(pred.productId)}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50"
                      />
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-100 bg-gray-50 text-lg">
                        {pred.imageEmoji}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-slate-900">
                            {pred.brand} · {pred.productName}
                          </span>
                          <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${badge.className}`}>
                            {badge.label}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-800">
                            Safety {pred.safetyScore}/100
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-600">{pred.explanation}</p>
                      </div>
                    </label>

                    {/* Key Bayesian & Float Metrics */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs shrink-0 w-full lg:w-auto">
                      <div className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5">
                        <p className="text-[10px] text-slate-400 uppercase font-semibold">Open Fill / Shelf</p>
                        <p className="font-bold text-slate-900">
                          {pred.openCaseClaimedSlots}/{pred.caseSize} · {pred.shelfLifeWeeks} wks
                        </p>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5">
                        <p className="text-[10px] text-slate-400 uppercase font-semibold">
                          Sell-Through ({pred.safeHorizonWeeks}w)
                        </p>
                        <p className="font-bold text-emerald-700">
                          {sellPct}% ({pred.estimatedWeeklyDemand.toFixed(1)}/wk)
                        </p>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5">
                        <p className="text-[10px] text-slate-400 uppercase font-semibold">Float Needed</p>
                        <p className="font-bold text-slate-900">
                          {formatPence(pred.netOutOfPocketFloatPence)}{' '}
                          <span className="text-[10px] font-medium text-slate-500">({coveragePct}% covered)</span>
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {formatPence(pred.immediateStudentCashPence)} cash / {formatPence(pred.wholesaleCaseCostPence)} case
                        </p>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5">
                        <p className="text-[10px] text-slate-400 uppercase font-semibold">Expected Net</p>
                        <p className={`font-bold ${pred.expectedNetProfitPence >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                          {pred.expectedNetProfitPence >= 0 ? '+' : ''}
                          {formatPence(pred.expectedNetProfitPence)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Place Wholesale Bulk Order (Live Supplier API & Direct SKU Links) */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="flex items-start gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  🚚 Place Wholesale Bulk Order (Live Supplier API)
                </h3>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                    summary.wholesaleApiConfigured
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-sky-200 bg-sky-50 text-sky-700'
                  }`}
                >
                  {summary.wholesaleApiConfigured
                    ? 'Qogita / Webhook EDI Live'
                    : 'Direct UK Supplier Portal Mode'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Submits locked cases ({lockedCasesCount}) + checked buy-ahead cases ({selectedBuyAheadIds.length}) and generates 1-click Qogita, Booker &amp; Bestway SKU links.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={submittingPo || totalCasesToOrder === 0}
            onClick={handlePlaceWholesaleOrder}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            <CheckSquare className="h-4 w-4" />
            {submittingPo
              ? 'Dispatching PO…'
              : `Generate & Send Wholesale PO (${totalCasesToOrder} case${totalCasesToOrder === 1 ? '' : 's'})`}
          </button>
        </div>

        {wholesaleOrders.length === 0 ? (
          <div className="px-5 py-6 text-center text-xs text-slate-500">
            No wholesale purchase orders generated yet for Cycle #{summary.settings.dropCycleNumber}.
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {wholesaleOrders.map((po) => (
              <div key={po.id} className="p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-slate-900">{po.externalOrderRef}</span>
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      {po.status.toUpperCase()} · {po.mode}
                    </span>
                    <span className="text-slate-500">
                      Cycle #{po.dropCycleNumber} · {po.totalCasesCount} cases ·{' '}
                      <strong className="text-slate-900">{formatPence(po.totalSpendPence)}</strong>
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {new Date(po.createdAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </div>

                {po.portalLinks.length > 0 && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {po.portalLinks.map((line) => (
                      <div
                        key={`${po.id}-${line.productId}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50/70 px-3 py-2 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900">
                            {line.casesToBuy}× {line.productName}
                          </p>
                          <p className="font-mono text-[10px] text-slate-500">
                            EAN {line.eanBarcode || 'N/A'} · {formatPence(line.lineCostPence)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <a
                            href={line.qogitaUrl.startsWith('https://') ? line.qogitaUrl : '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 rounded border border-gray-200 bg-white px-2 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-50"
                          >
                            Qogita <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                          <a
                            href={line.bookerUrl.startsWith('https://') ? line.bookerUrl : '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 rounded border border-gray-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-gray-100"
                          >
                            Booker <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                          <a
                            href={line.bestwayUrl.startsWith('https://') ? line.bestwayUrl : '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 rounded border border-gray-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-gray-100"
                          >
                            Bestway <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
