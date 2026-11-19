import { useCallback, useMemo, useState, type FormEvent } from 'react';
import {
  AlertOctagon, Camera, CheckCircle2, PackageCheck,
  QrCode, Search, ShieldAlert, ShieldCheck, Tag, X,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { formatPence, type AdminSummary, type Order, type ScanLookupResult } from '../../shared/types';
import { AdminCameraScanner } from './AdminCameraScanner';
import { AdminPackingSlipsModal } from './AdminPackingSlipsModal';

interface AdminScannerTabProps {
  summary: AdminSummary;
  onReloadAll: () => Promise<void>;
}

/**
 * Saturday Campus Hub QR / Camera / PIN Scanner, Printable Bag Labels & Student Orders directory.
 */
export function AdminScannerTab({ summary, onReloadAll }: AdminScannerTabProps) {
  const [scanInput, setScanInput] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [packingSlipsOpen, setPackingSlipsOpen] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [scanResult, setScanResult] = useState<ScanLookupResult | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [orderSearch, setOrderSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'collected' | 'refunded'>('all');

  const runVerify = useCallback(async (rawValue: string) => {
    const trimmed = rawValue.trim();
    if (!trimmed) return;
    setVerifying(true);
    setActionError(null);
    try {
      const res = await apiFetch<ScanLookupResult>('/api/admin/scan/verify', {
        method: 'POST',
        body: JSON.stringify({ input: trimmed }),
      });
      setScanResult(res);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Verification request failed.');
    } finally {
      setVerifying(false);
    }
  }, []);

  const handleCameraDetected = useCallback(
    (qrValue: string) => {
      setCameraOpen(false);
      setScanInput(qrValue);
      void runVerify(qrValue);
    },
    [runVerify],
  );

  function handleSubmitVerify(e: FormEvent) {
    e.preventDefault();
    void runVerify(scanInput);
  }

  async function handleMarkCollected(orderId: string) {
    setCollecting(true);
    setActionError(null);
    try {
      const res = await apiFetch<{ order: Order }>('/api/admin/scan/collect', {
        method: 'POST',
        body: JSON.stringify({ orderId }),
      });
      setScanResult({ valid: false, alreadyCollected: true, reason: 'Collected just now!', order: res.order });
      await onReloadAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not mark order collected.');
    } finally {
      setCollecting(false);
    }
  }

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    return summary.orders.filter((o) => {
      if (statusFilter === 'active' && o.status !== 'paid_pooling' && o.status !== 'settled') return false;
      if (statusFilter === 'collected' && o.status !== 'collected') return false;
      if (statusFilter === 'refunded' && o.status !== 'refunded') return false;
      if (!q) return true;
      return (
        o.pickupCode.toLowerCase().includes(q) ||
        o.pickupPin.toLowerCase().includes(q) ||
        o.userEmail.toLowerCase().includes(q) ||
        o.userName.toLowerCase().includes(q)
      );
    });
  }, [summary.orders, orderSearch, statusFilter]);

  const scannedOrder = scanResult?.order;
  const handoverAllocations = scannedOrder?.allocations.filter((a) => a.status === 'fulfilled' || a.status === 'locked_box') ?? [];
  const excludedAllocations = scannedOrder?.allocations.filter((a) => a.status === 'auto_refunded' || a.status === 'pooling') ?? [];

  return (
    <div className="space-y-6">
      {/* Hub Pickup Scanner Card */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Saturday Hub Pass Scanner &amp; HMAC Verifier</h3>
              <p className="text-xs text-slate-500">
                Scan via camera or paste a <code className="font-mono text-slate-700">DV1…</code> QR token,{' '}
                <code className="font-mono text-slate-700">UOB-XXXXXX</code> code, 6-digit PIN, or student email.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setCameraOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
            >
              <Camera className="h-3.5 w-3.5 text-emerald-600" />
              {cameraOpen ? 'Close Camera' : '📷 Start Camera QR Scan'}
            </button>
            <button
              type="button"
              onClick={() => setPackingSlipsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-gray-50"
            >
              <Tag className="h-3.5 w-3.5 text-emerald-600" />
              🏷️ Print Saturday Bag Labels
            </button>
            {scanResult && (
              <button
                type="button"
                onClick={() => { setScanResult(null); setScanInput(''); setActionError(null); }}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-gray-50"
              >
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            )}
          </div>
        </div>

        <AdminCameraScanner
          open={cameraOpen}
          onDetected={handleCameraDetected}
          onClose={() => setCameraOpen(false)}
        />

        <form onSubmit={handleSubmitVerify} className="flex flex-col gap-2.5 sm:flex-row">
          <input
            type="text"
            placeholder="Paste DV1... QR token, UOB-XXXXXX code, 6-digit PIN, or @student.bham.ac.uk email"
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            className="flex-1 rounded-xl border border-gray-300 px-3.5 py-2.5 font-mono text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
          />
          <button
            type="submit"
            disabled={verifying || !scanInput.trim()}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            <ShieldCheck className="h-4 w-4" /> {verifying ? 'Verifying…' : 'Verify Pickup Pass'}
          </button>
        </form>

        {actionError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700">{actionError}</div>
        )}

        {scanResult && !scanResult.valid && !scanResult.alreadyCollected && (
          <div className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 p-4">
            <AlertOctagon className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-red-900">Verification Failed — Do Not Hand Over Goods</h4>
              <p className="mt-0.5 text-xs text-red-700">{scanResult.reason || 'Signature mismatch or unknown pass code.'}</p>
            </div>
          </div>
        )}

        {scanResult && (scanResult.valid || scanResult.alreadyCollected) && scannedOrder && (
          <div className={`rounded-xl border p-4 space-y-4 ${scanResult.alreadyCollected ? 'border-amber-300 bg-amber-50/70' : 'border-emerald-300 bg-emerald-50/60'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                {scanResult.alreadyCollected ? <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" /> : <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 mt-0.5" />}
                <div>
                  <h4 className={`text-sm font-bold ${scanResult.alreadyCollected ? 'text-amber-900' : 'text-emerald-950'}`}>
                    {scanResult.alreadyCollected ? 'Already Collected — Double-Collection Blocked' : 'HMAC Pass Verified — Ready to Hand Over'}
                  </h4>
                  <p className="text-xs text-slate-700">
                    <strong>{scannedOrder.userName}</strong> ({scannedOrder.userEmail}) · Pass <code className="font-mono font-bold">{scannedOrder.pickupCode}</code> · PIN <code className="font-mono font-bold">{scannedOrder.pickupPin}</code>
                  </p>
                  {scannedOrder.collectedAt && (
                    <p className="mt-0.5 text-xs font-medium text-amber-800">Collected at {new Date(scannedOrder.collectedAt).toLocaleString('en-GB')}</p>
                  )}
                </div>
              </div>

              {!scanResult.alreadyCollected && scannedOrder.status !== 'refunded' && (
                <button
                  type="button"
                  disabled={collecting || handoverAllocations.length === 0}
                  onClick={() => handleMarkCollected(scannedOrder.id)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  <PackageCheck className="h-4 w-4" /> {collecting ? 'Marking Collected…' : 'Mark Collected ✅'}
                </button>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-3.5 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
                Items to Hand Over ({handoverAllocations.length})
              </p>
              {handoverAllocations.length === 0 ? (
                <p className="text-xs text-slate-500">0 fulfilled/locked shares on this order.</p>
              ) : (
                <ul className="divide-y divide-gray-100 text-xs">
                  {handoverAllocations.map((a) => (
                    <li key={a.id} className="flex items-center justify-between py-2">
                      <span className="font-semibold text-slate-900">{a.imageEmoji} {a.productBrand} · {a.productName} ({a.unitDescription})</span>
                      <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                        Case #{a.boxNumber} · Slot {a.slotInBox}/{a.caseSize}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {excludedAllocations.length > 0 && (
                <div className="border-t border-gray-100 pt-2 text-[11px] font-semibold text-amber-800">
                  Do NOT hand over ({excludedAllocations.length} unfilled / auto-refunded):{' '}
                  {excludedAllocations.map((a) => `${a.productName} (Case #${a.boxNumber})`).join(', ')}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Searchable All Student Orders List */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-4">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="Search by UOB code, PIN, student name, or email…"
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {([['all', 'All'], ['active', 'Ready / Pooling'], ['collected', 'Collected'], ['refunded', 'Refunded']] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={`rounded-lg px-3 py-1.5 font-semibold ${statusFilter === key ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-slate-600 hover:bg-gray-200'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3">Student</th>
                <th className="px-4 py-3">Pass Code &amp; PIN</th>
                <th className="px-4 py-3">Shares</th>
                <th className="px-4 py-3 text-right">Paid / Refunded / Net</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-right">Scanner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-500">No matching student orders found.</td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const activeCount = order.allocations.filter((a) => a.status !== 'auto_refunded').length;
                  return (
                    <tr key={order.id} className="hover:bg-gray-50/70">
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-slate-900">{order.userName}</p>
                        <p className="text-[11px] text-slate-500">{order.userEmail}</p>
                      </td>
                      <td className="px-4 py-3.5 font-mono">
                        <span className="font-bold text-slate-900">{order.pickupCode}</span>
                        <span className="block text-[11px] text-slate-500">PIN {order.pickupPin}</span>
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">{activeCount}/{order.allocations.length} active</td>
                      <td className="px-4 py-3.5 text-right">
                        <span className="font-semibold text-slate-900">{formatPence(order.netChargedPence)}</span>
                        <span className="block text-[11px] text-slate-400">
                          Paid {formatPence(order.totalPaidPence)}{order.refundedPence > 0 ? ` · Ref -${formatPence(order.refundedPence)}` : ''}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="inline-block rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                          {order.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => { setScanInput(order.pickupCode); void runVerify(order.pickupCode); }}
                          className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 font-semibold text-emerald-700 hover:bg-emerald-50"
                        >
                          Inspect Pass
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AdminPackingSlipsModal
        open={packingSlipsOpen}
        summary={summary}
        onClose={() => setPackingSlipsOpen(false)}
      />
    </div>
  );
}
