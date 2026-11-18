import { useCallback, useEffect, useState } from 'react';
import {
  ClipboardList,
  Package,
  QrCode,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/api';
import type { AdminSummary } from '../shared/types';
import { AdminWholesaleTab } from './admin/AdminWholesaleTab';
import { AdminProductsTab } from './admin/AdminProductsTab';
import { AdminScannerTab } from './admin/AdminScannerTab';

type AdminSubTab = 'wholesale' | 'products' | 'scanner';

/**
 * Founder & Hub Coordinator dashboard combining:
 * 1. Wholesale 100%-locked shopping list, weekly cutoff, new drop cycle & hub settings
 * 2. No-code Product & Aldi price comparison manager
 * 3. Saturday Hub HMAC QR/PIN pass scanner & all student orders directory
 */
export function AdminView() {
  const { user, setIsAuthModalOpen, refreshState, refreshOrders, products, settings } = useApp();

  const [subTab, setSubTab] = useState<AdminSubTab>('wholesale');
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isAdmin = user?.role === 'admin';

  const loadSummary = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingSummary(true);
    setErrorMsg(null);
    try {
      const data = await apiFetch<AdminSummary>('/api/admin/summary');
      setSummary(data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load admin summary.');
    } finally {
      setLoadingSummary(false);
    }
  }, [isAdmin]);

  // Reload summary on initial mount AND whenever global SSE state changes
  useEffect(() => {
    if (isAdmin) {
      void loadSummary();
    } else {
      setSummary(null);
    }
  }, [isAdmin, loadSummary, products, settings?.dropStatus, settings?.dropCycleNumber]);

  const handleReloadAll = useCallback(async () => {
    await Promise.all([loadSummary(), refreshState(), refreshOrders()]);
  }, [loadSummary, refreshState, refreshOrders]);

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Founder &amp; Hub Coordinator Access</h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-600">
            Sign in with your Admin PIN to manage wholesale case manifests, weekly cutoffs, Aldi
            product prices, and Saturday hub QR pass verification.
          </p>
          <button
            type="button"
            onClick={() => setIsAuthModalOpen(true)}
            className="mt-6 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors"
          >
            Sign In as Admin
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8 space-y-6">
      {/* Header & Sub-Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
              Divly Hub Operations &amp; Admin
            </h1>
            {summary && (
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                  summary.settings.dropStatus === 'open'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-amber-200 bg-amber-50 text-amber-800'
                }`}
              >
                Cycle #{summary.settings.dropCycleNumber} ·{' '}
                {summary.settings.dropStatus === 'open' ? 'Open' : 'Closed'}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs sm:text-sm text-slate-500">
            Wholesale case manifest, no-code product pricing, and HMAC pickup verification.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleReloadAll()}
          disabled={loadingSummary}
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-gray-50 disabled:opacity-60 transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loadingSummary ? 'animate-spin' : ''}`} />
          Refresh Data
        </button>
      </div>

      {/* Sub-Tab Selector */}
      <div className="flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm">
        <button
          type="button"
          onClick={() => setSubTab('wholesale')}
          className={`flex flex-1 min-w-[180px] items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold transition-colors ${
            subTab === 'wholesale'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-gray-50 hover:text-slate-900'
          }`}
        >
          <ClipboardList className="h-4 w-4" />
          Wholesale &amp; Drop Controls
        </button>
        <button
          type="button"
          onClick={() => setSubTab('products')}
          className={`flex flex-1 min-w-[180px] items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold transition-colors ${
            subTab === 'products'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-gray-50 hover:text-slate-900'
          }`}
        >
          <Package className="h-4 w-4" />
          Products &amp; Aldi Prices ({summary?.products.length ?? 0})
        </button>
        <button
          type="button"
          onClick={() => setSubTab('scanner')}
          className={`flex flex-1 min-w-[180px] items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold transition-colors ${
            subTab === 'scanner'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-gray-50 hover:text-slate-900'
          }`}
        >
          <QrCode className="h-4 w-4" />
          Hub Scanner &amp; Orders ({summary?.orders.length ?? 0})
        </button>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
          {errorMsg}
        </div>
      )}

      {!summary ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
          Loading admin operations summary…
        </div>
      ) : subTab === 'wholesale' ? (
        <AdminWholesaleTab
          summary={summary}
          onSummaryChange={setSummary}
          onReloadAll={handleReloadAll}
        />
      ) : subTab === 'products' ? (
        <AdminProductsTab summary={summary} onReloadAll={handleReloadAll} />
      ) : (
        <AdminScannerTab summary={summary} onReloadAll={handleReloadAll} />
      )}
    </div>
  );
}
