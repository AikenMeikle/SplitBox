import { useCallback, useEffect, useState } from 'react';
import {
  ClipboardList,
  DatabaseBackup,
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
 * 1. Wholesale shopping list, Bayesian Buy-Ahead predictor, Supplier POs & Hub settings
 * 2. No-code Product / Barcode manager & Student Item Requests triage
 * 3. Saturday Hub Camera QR / PIN scanner, Printable Bag Labels & JSON DB Backup
 */
export function AdminView() {
  const { user, setIsAuthModalOpen, refreshState, refreshOrders, products, settings } = useApp();

  const [subTab, setSubTab] = useState<AdminSubTab>('wholesale');
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [downloadingBackup, setDownloadingBackup] = useState(false);
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

  async function handleDownloadBackup() {
    setDownloadingBackup(true);
    setErrorMsg(null);
    try {
      const backupPayload = await apiFetch<Record<string, unknown>>('/api/admin/backup');
      const json = JSON.stringify(backupPayload, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const dateStamp = new Date().toISOString().slice(0, 10);
      const link = document.createElement('a');
      link.href = url;
      link.download = `divly-backup-${dateStamp}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to export JSON backup.');
    } finally {
      setDownloadingBackup(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Founder &amp; Hub Coordinator Access</h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-600">
            Sign in with your Admin PIN to manage wholesale case manifests, weekly cutoffs, catalog
            pricing, database backups, and Saturday hub QR pass verification.
          </p>
          <button
            type="button"
            onClick={() => setIsAuthModalOpen(true)}
            className="mt-6 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            Sign In as Admin
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
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

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadBackup}
            disabled={downloadingBackup}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
          >
            <DatabaseBackup className="h-3.5 w-3.5 text-emerald-600" />
            {downloadingBackup ? 'Exporting…' : '💾 Download DB Backup'}
          </button>
          <button
            type="button"
            onClick={() => void handleReloadAll()}
            disabled={loadingSummary}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-gray-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingSummary ? 'animate-spin' : ''}`} />
            Refresh Data
          </button>
        </div>
      </div>

      {/* Sub-Tab Selector */}
      <div className="flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm print:hidden">
        <button
          type="button"
          onClick={() => setSubTab('wholesale')}
          className={`flex flex-1 min-w-[180px] items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold ${
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
          className={`flex flex-1 min-w-[180px] items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold ${
            subTab === 'products'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-gray-50 hover:text-slate-900'
          }`}
        >
          <Package className="h-4 w-4" />
          Products &amp; Requests ({summary?.products.length ?? 0})
        </button>
        <button
          type="button"
          onClick={() => setSubTab('scanner')}
          className={`flex flex-1 min-w-[180px] items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold ${
            subTab === 'scanner'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-gray-50 hover:text-slate-900'
          }`}
        >
          <QrCode className="h-4 w-4" />
          Hub Scanner &amp; Labels ({summary?.orders.length ?? 0})
        </button>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700 print:hidden">
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
