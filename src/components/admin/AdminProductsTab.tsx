import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Edit3, Globe, PackagePlus, Search, Trash2 } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { formatPence, type AdminSummary, type ProductRequest } from '../../shared/types';
import {
  AdminProductFormModal,
  EMPTY_PRODUCT_FORM,
  productToForm,
  type ProductFormState,
} from './AdminProductFormModal';
import { AdminRequestsPanel } from './AdminRequestsPanel';
import { AdminSupplierImportModal } from './AdminSupplierImportModal';

interface AdminProductsTabProps {
  summary: AdminSummary;
  onReloadAll: () => Promise<void>;
}

/**
 * No-Code Product, EAN Barcode, Shelf-Life & Benchmark Price Manager,
 * including Live UK Wholesale Import & Student Item Requests triage.
 */
export function AdminProductsTab({ summary, onReloadAll }: AdminProductsTabProps) {
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [form, setForm] = useState<ProductFormState>(EMPTY_PRODUCT_FORM);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return summary.products;
    return summary.products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.eanBarcode ?? '').toLowerCase().includes(q),
    );
  }, [summary.products, query]);

  async function handleConfirmDelete(id: string, name: string) {
    setBanner(null);
    try {
      await apiFetch<{ ok: boolean }>(`/api/admin/products/${id}`, { method: 'DELETE' });
      setDeletingId(null);
      await onReloadAll();
      setBanner({ type: 'ok', text: `Removed "${name}".` });
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : 'Failed to remove product.' });
    }
  }

  function handleDraftFromRequest(req: ProductRequest) {
    setForm({
      ...EMPTY_PRODUCT_FORM,
      name: req.itemName,
      brand: req.brandOrSize || 'Wholesale UK',
      category: req.category || 'Cooking Staples',
      unitDescription: req.brandOrSize || 'Multipack share',
      caseDescription: 'Wholesale outer case',
    });
    setModalOpen(true);
  }

  return (
    <div className="space-y-4">
      {banner && (
        <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-medium ${banner.type === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {banner.type === 'ok' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />}
          <span>{banner.text}</span>
        </div>
      )}

      <AdminRequestsPanel
        requests={summary.productRequests ?? []}
        onReloadAll={onReloadAll}
        onDraftFromRequest={handleDraftFromRequest}
        onNotify={setBanner}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Search products, brands, categories, or EAN…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setImportModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
          >
            <Globe className="h-4 w-4 text-emerald-600" />
            🔍 Import from Live UK Wholesale / Barcode API
          </button>
          <button
            type="button"
            onClick={() => { setForm(EMPTY_PRODUCT_FORM); setModalOpen(true); }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            <PackagePlus className="h-4 w-4" /> Add Bulk Product
          </button>
        </div>
      </div>

      {/* Product Catalog Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3">Item, EAN &amp; Shelf Life</th>
                <th className="px-4 py-3">Share / Case Split</th>
                <th className="px-4 py-3 text-right">Divly vs Benchmark</th>
                <th className="px-4 py-3 text-right">Wholesale &amp; Margin</th>
                <th className="px-4 py-3 text-center">Live Pool</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredProducts.map((p) => {
                const marginPerCase = p.sharePricePence * p.caseSize - p.wholesaleCaseCostPence;
                return (
                  <tr key={p.id} className="hover:bg-gray-50/70">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-100 bg-gray-50 text-lg">{p.imageEmoji}</span>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-900">{p.name}</span>
                            {!p.isActive && <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">Hidden</span>}
                          </div>
                          <p className="text-[11px] text-slate-500">
                            {p.brand} · {p.category} · {p.shelfLifeWeeks ?? 26}w shelf
                            {p.eanBarcode ? ` · EAN ${p.eanBarcode}` : ''}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">
                      <p className="font-medium text-slate-800">{p.unitDescription}</p>
                      <p className="text-[11px] text-slate-400">{p.caseSize} shares / {p.caseDescription}</p>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <p className="font-bold text-slate-900">
                        {formatPence(p.sharePricePence)} <span className="font-normal text-slate-400 line-through">{formatPence(p.aldiPricePence)}</span>
                      </p>
                      <span className="inline-block rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        Save {p.savingsPercent}%
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <p className="font-medium text-slate-800">{formatPence(p.wholesaleCaseCostPence)}/case</p>
                      <p className={`text-[11px] font-semibold ${marginPerCase >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                        {marginPerCase >= 0 ? '+' : ''}{formatPence(marginPerCase)} margin
                      </p>
                    </td>
                    <td className="px-4 py-3.5 text-center text-slate-600">
                      <p className="font-semibold text-slate-800">{p.lockedCasesCount} locked</p>
                      <p className="text-[11px] text-slate-400">
                        {p.openCaseClaimedSlots}/{p.caseSize} open
                        {(p.carryoverStockSlots ?? 0) > 0 ? ` · ${p.carryoverStockSlots} held` : ''}
                      </p>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {deletingId === p.id ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button type="button" onClick={() => handleConfirmDelete(p.id, p.name)} className="rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-red-700">Confirm</button>
                          <button type="button" onClick={() => setDeletingId(null)} className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] text-slate-600">Cancel</button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5">
                          <button type="button" onClick={() => { setForm(productToForm(p, p.id)); setModalOpen(true); }} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-gray-50">
                            <Edit3 className="h-3.5 w-3.5" /> Edit
                          </button>
                          <button type="button" onClick={() => setDeletingId(p.id)} className="rounded-lg border border-gray-200 bg-white p-1.5 text-slate-400 hover:border-red-200 hover:text-red-600" aria-label={`Delete ${p.name}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <AdminSupplierImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImported={async (name) => {
          await onReloadAll();
          setBanner({ type: 'ok', text: `Imported "${name}" from live UK catalog!` });
        }}
        onCustomiseDraft={(draft) => {
          setForm(productToForm(draft, null));
          setModalOpen(true);
        }}
      />

      <AdminProductFormModal
        open={modalOpen}
        form={form}
        setForm={setForm}
        onClose={() => setModalOpen(false)}
        onSaved={async (msg) => {
          await onReloadAll();
          setBanner({ type: 'ok', text: msg });
        }}
        onError={(msg) => setBanner({ type: 'err', text: msg })}
      />
    </div>
  );
}
