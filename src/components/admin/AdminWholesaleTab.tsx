import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Download, Lock,
  PlayCircle, ShoppingCart, TrendingUp,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { formatPence, type AdminSummary } from '../../shared/types';
import { AdminBuyAheadPanel } from './AdminBuyAheadPanel';
import { AdminSettingsForm } from './AdminSettingsForm';

interface AdminWholesaleTabProps {
  summary: AdminSummary;
  onSummaryChange: (next: AdminSummary) => void;
  onReloadAll: () => Promise<void>;
}

/**
 * Founder Wholesale Shopping List, Bayesian Buy-Ahead underwriting controls,
 * Live Wholesale Supplier PO integration, CSV export, and Hub & Fee settings.
 */
export function AdminWholesaleTab({ summary, onSummaryChange, onReloadAll }: AdminWholesaleTabProps) {
  const { settings, shoppingList, totals } = summary;
  const predictions = summary.buyAheadPredictions ?? [];

  const [confirmAction, setConfirmAction] = useState<'cutoff' | 'new-drop' | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Pre-select SAFE_BUY_AHEAD recommendations on cycle init while preserving manual toggles
  const [selectedBuyAheadIds, setSelectedBuyAheadIds] = useState<string[]>(() =>
    predictions.filter((p) => p.decision === 'SAFE_BUY_AHEAD').map((p) => p.productId),
  );
  const initializedCycleRef = useRef<number>(settings.dropCycleNumber);

  useEffect(() => {
    const validIds = new Set(predictions.map((p) => p.productId));
    if (initializedCycleRef.current !== settings.dropCycleNumber) {
      initializedCycleRef.current = settings.dropCycleNumber;
      setSelectedBuyAheadIds(
        predictions.filter((p) => p.decision === 'SAFE_BUY_AHEAD').map((p) => p.productId),
      );
      return;
    }
    setSelectedBuyAheadIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [predictions, settings.dropCycleNumber]);

  const lockedLines = shoppingList.filter((line) => line.lockedCasesCount > 0);
  const partialOnlyCount = shoppingList.filter((l) => l.lockedCasesCount === 0 && l.overflowSlotsCount > 0).length;

  function toggleBuyAhead(productId: string) {
    setSelectedBuyAheadIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId],
    );
  }

  function selectSafeDefaults() {
    setSelectedBuyAheadIds(
      predictions.filter((p) => p.decision === 'SAFE_BUY_AHEAD').map((p) => p.productId),
    );
  }

  function handleExportCsv() {
    const headers = [
      'Product', 'Brand', 'Case Description', 'Case Size', 'Locked Full Cases To Buy',
      'Unfilled Overflow Slots', 'Wholesale Case Cost (GBP)', 'Total Wholesale Cost (GBP)',
      'Student Case Revenue (GBP)', 'Gross Profit (GBP)',
    ];
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = lockedLines.map((l) =>
      [
        l.productName, l.brand, l.caseDescription, l.caseSize, l.lockedCasesCount, l.overflowSlotsCount,
        (l.wholesaleCaseCostPence / 100).toFixed(2), (l.totalWholesaleCostPence / 100).toFixed(2),
        (l.totalRevenuePence / 100).toFixed(2), (l.grossProfitPence / 100).toFixed(2),
      ].map(esc).join(','),
    );
    const blob = new Blob([[headers.map(esc).join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `divly-wholesale-cycle-${settings.dropCycleNumber}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleRunLifecycleAction(kind: 'cutoff' | 'new-drop') {
    setBusyAction(true);
    setBanner(null);
    try {
      const updated =
        kind === 'cutoff'
          ? await apiFetch<AdminSummary>('/api/admin/cutoff', {
              method: 'POST',
              body: JSON.stringify({ buyAheadProductIds: selectedBuyAheadIds }),
            })
          : await apiFetch<AdminSummary>('/api/admin/new-drop', { method: 'POST' });
      onSummaryChange(updated);
      await onReloadAll();
      setConfirmAction(null);
      setBanner({
        type: 'ok',
        text: kind === 'cutoff'
          ? `Weekly cutoff settled! Locked cases + ${selectedBuyAheadIds.length} buy-ahead box(es) marked Fulfilled; remaining overflow auto-refunded.`
          : `Started fresh Drop Cycle #${updated.settings.dropCycleNumber}! Carryover stock applied while keeping past order history.`,
      });
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : 'Action failed.' });
    } finally {
      setBusyAction(false);
    }
  }

  return (
    <div className="space-y-6">
      {banner && (
        <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-medium ${banner.type === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {banner.type === 'ok' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />}
          <span>{banner.text}</span>
        </div>
      )}

      {/* 4 Summary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Locked Full Cases</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{totals.lockedCasesTotal}</p>
          <p className="mt-1 text-xs text-slate-500">{totals.paidStudentsCount} students · {totals.totalOrdersCount} orders</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Total Wholesale Spend</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{formatPence(totals.totalWholesaleSpendPence)}</p>
          <p className="mt-1 text-xs text-slate-500">100% locked cases</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Student Revenue</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{formatPence(totals.totalGrossRevenuePence)}</p>
          <p className="mt-1 text-xs text-slate-500">Incl. {formatPence(totals.totalFeeRevenuePence)} small-order fees</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
          <p className="flex items-center gap-1 text-xs font-semibold text-emerald-800"><TrendingUp className="h-3.5 w-3.5" /> Estimated Net Profit</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{formatPence(totals.estimatedGrossProfitPence)}</p>
          <p className="mt-1 text-xs text-emerald-700/80">Bayesian buy-ahead protected</p>
        </div>
      </div>

      {/* Drop Lifecycle Controls */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Weekly Drop Controls · Cycle #{settings.dropCycleNumber}</h3>
            <p className="text-xs text-slate-500">
              Cutoff settles locked cases + {selectedBuyAheadIds.length} checked Buy-Ahead incomplete box(es) and auto-refunds risky overflow.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={settings.dropStatus === 'closed' || busyAction}
              onClick={() => setConfirmAction('cutoff')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-amber-700 disabled:opacity-50"
            >
              <Lock className="h-3.5 w-3.5" />
              {settings.dropStatus === 'closed' ? 'Drop Cutoff Settled' : 'Trigger Weekly Cutoff & Auto-Refunds'}
            </button>
            <button
              type="button"
              disabled={busyAction}
              onClick={() => setConfirmAction('new-drop')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              <PlayCircle className="h-3.5 w-3.5 text-emerald-600" /> Start New Weekly Drop
            </button>
          </div>
        </div>

        {confirmAction && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs">
            <span className="font-medium text-amber-900">
              {confirmAction === 'cutoff'
                ? `Confirm weekly cutoff? Locked cases + ${selectedBuyAheadIds.length} checked Buy-Ahead box(es) become Fulfilled; unchecked incomplete slots will be Auto-Refunded.`
                : `Start Drop Cycle #${settings.dropCycleNumber + 1}? Carryover stock rolls forward while keeping past student orders intact.`}
            </span>
            <div className="flex items-center gap-2">
              <button type="button" disabled={busyAction} onClick={() => handleRunLifecycleAction(confirmAction)} className="rounded-lg bg-slate-900 px-3 py-1.5 font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
                {busyAction ? 'Processing…' : 'Confirm'}
              </button>
              <button type="button" disabled={busyAction} onClick={() => setConfirmAction(null)} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bayesian Buy-Ahead Predictor + Live Supplier PO Panel */}
      <AdminBuyAheadPanel
        summary={summary}
        selectedBuyAheadIds={selectedBuyAheadIds}
        onToggleBuyAhead={toggleBuyAhead}
        onSelectSafeDefaults={selectSafeDefaults}
        onReloadAll={onReloadAll}
        onNotify={setBanner}
      />

      {/* Wholesale Shopping List Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-emerald-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">Wholesaler Purchase List (Locked &amp; Underwritten Cases)</h3>
              <p className="text-xs text-slate-500">Exact full cases to purchase at the wholesaler or via Supplier PO above.</p>
            </div>
          </div>
          <button
            type="button"
            disabled={lockedLines.length === 0}
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5 text-emerald-600" /> Export CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3">Product</th>
                <th className="px-4 py-3">Wholesale Case Spec</th>
                <th className="px-4 py-3 text-center">Locked Cases to Buy</th>
                <th className="px-4 py-3 text-center">Overflow Slots</th>
                <th className="px-4 py-3 text-right">Wholesale Cost</th>
                <th className="px-4 py-3 text-right">Case Revenue</th>
                <th className="px-5 py-3 text-right">Gross Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lockedLines.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-500">
                    No locked wholesale cases yet in Cycle #{settings.dropCycleNumber}.
                  </td>
                </tr>
              ) : (
                lockedLines.map((line) => (
                  <tr key={line.productId} className="hover:bg-gray-50/70">
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-slate-900">{line.productName}</p>
                      <p className="text-[11px] text-slate-500">{line.brand}</p>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">{line.caseDescription} ({line.caseSize} shares)</td>
                    <td className="px-4 py-3.5 text-center">
                      <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 font-bold text-emerald-700">
                        {line.lockedCasesCount} × case
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center text-slate-500">
                      {line.overflowSlotsCount > 0 ? (
                        <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                          {line.overflowSlotsCount}/{line.caseSize} open
                        </span>
                      ) : '0'}
                    </td>
                    <td className="px-4 py-3.5 text-right font-medium text-slate-900">
                      {formatPence(line.totalWholesaleCostPence)}
                      <span className="block text-[10px] text-slate-400">{formatPence(line.wholesaleCaseCostPence)}/case</span>
                    </td>
                    <td className="px-4 py-3.5 text-right font-medium text-slate-900">{formatPence(line.totalRevenuePence)}</td>
                    <td className="px-5 py-3.5 text-right font-bold text-emerald-700">+{formatPence(line.grossProfitPence)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {partialOnlyCount > 0 && (
          <div className="border-t border-gray-100 bg-gray-50/60 px-5 py-2.5 text-[11px] text-slate-500">
            Note: {partialOnlyCount} product pool(s) have partial slots only — review them in the Buy-Ahead Predictor above!
          </div>
        )}
      </div>

      <AdminSettingsForm settings={settings} onReloadAll={onReloadAll} onNotify={setBanner} />
    </div>
  );
}
