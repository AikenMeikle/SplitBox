import { Printer, Tag, X } from 'lucide-react';
import type { AdminSummary } from '../../shared/types';

interface AdminPackingSlipsModalProps {
  open: boolean;
  summary: AdminSummary;
  onClose: () => void;
}

/**
 * Print-ready Saturday Kraft Bag Packing Labels (`window.print()`) listing each
 * student's `UOB-XXXXXX` pass code, name, drop cycle, and item packing checkboxes.
 */
export function AdminPackingSlipsModal({ open, summary, onClose }: AdminPackingSlipsModalProps) {
  if (!open) return null;

  const packableOrders = summary.orders
    .filter((o) => o.status === 'settled' || o.status === 'paid_pooling')
    .map((order) => ({
      order,
      itemsToPack: order.allocations.filter(
        (a) => a.status === 'fulfilled' || a.status === 'locked_box',
      ),
    }))
    .filter(({ itemsToPack }) => itemsToPack.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:static print:block print:p-0">
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px] print:hidden"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl print:max-h-none print:w-full print:max-w-none print:border-0 print:shadow-none"
      >
        {/* Screen-only Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-4 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <Tag className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                🏷️ Saturday Kraft Bag Packing Labels ({packableOrders.length})
              </h3>
              <p className="text-xs text-slate-500">
                Cycle #{summary.settings.dropCycleNumber} · {summary.settings.hubShortLabel} ({summary.settings.pickupWindow})
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={packableOrders.length === 0}
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              <Printer className="h-4 w-4" /> Print Labels
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-gray-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Printable Grid of Tear-Off Bag Labels */}
        <div className="flex-1 overflow-y-auto p-5 print:overflow-visible print:p-0">
          {packableOrders.length === 0 ? (
            <p className="py-12 text-center text-xs text-slate-500">
              No active student orders have locked or fulfilled items ready to pack yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 print:grid-cols-2 print:gap-3">
              {packableOrders.map(({ order, itemsToPack }) => (
                <div
                  key={order.id}
                  className="break-inside-avoid rounded-xl border-2 border-dashed border-gray-300 bg-white p-4 space-y-3"
                >
                  <div className="flex items-start justify-between border-b border-gray-200 pb-2.5">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                        Divly · Cycle #{summary.settings.dropCycleNumber}
                      </p>
                      <p className="font-mono text-xl font-extrabold text-slate-900">
                        {order.pickupCode}
                      </p>
                      <p className="text-xs font-semibold text-slate-800">{order.userName}</p>
                      <p className="text-[11px] text-slate-500">{order.userEmail}</p>
                    </div>
                    <div className="text-right">
                      <span className="rounded-md border border-gray-300 bg-gray-50 px-2 py-1 font-mono text-xs font-bold text-slate-800">
                        PIN {order.pickupPin}
                      </span>
                      <p className="mt-1.5 text-[10px] text-slate-500">
                        {itemsToPack.length} item{itemsToPack.length === 1 ? '' : 's'} to pack
                      </p>
                    </div>
                  </div>

                  <ul className="space-y-1.5 text-xs">
                    {itemsToPack.map((item) => (
                      <li key={item.id} className="flex items-start gap-2 text-slate-900">
                        <span className="mt-0.5 inline-block h-3.5 w-3.5 shrink-0 rounded border border-slate-500" />
                        <span>
                          <strong>{item.productBrand} · {item.productName}</strong> ({item.unitDescription})
                          <span className="block text-[10px] text-slate-500">
                            Case #{item.boxNumber} · Slot {item.slotInBox}/{item.caseSize}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="border-t border-gray-100 pt-2 flex items-center justify-between text-[10px] text-slate-500">
                    <span>{summary.settings.hubShortLabel} · {summary.settings.pickupWindow}</span>
                    <span>Packed by: _________</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
