import { useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, CheckCircle2, Edit3, PackagePlus, Search, Trash2, X } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import {
  formatPence,
  type AdminSummary,
  type Product,
  type ProductCategory,
  type ProductWithPool,
} from '../../shared/types';

interface AdminProductsTabProps {
  summary: AdminSummary;
  onReloadAll: () => Promise<void>;
}

const CATEGORIES: ProductCategory[] = [
  'Rice & Noodles', 'Drinks & Caffeine', 'Protein & Snacks', 'Toiletries & Laundry', 'Cooking Staples',
];

interface ProductFormState {
  id: string | null;
  name: string;
  brand: string;
  category: string;
  imageEmoji: string;
  unitDescription: string;
  caseDescription: string;
  caseSize: string;
  sharePriceGbp: string;
  aldiPriceGbp: string;
  aldiUnitLabel: string;
  wholesaleCaseCostGbp: string;
  isActive: boolean;
}

const EMPTY_FORM: ProductFormState = {
  id: null, name: '', brand: '', category: 'Rice & Noodles', imageEmoji: '🛒',
  unitDescription: '', caseDescription: '', caseSize: '4', sharePriceGbp: '2.50',
  aldiPriceGbp: '3.49', aldiUnitLabel: 'equiv. at Aldi', wholesaleCaseCostGbp: '8.50', isActive: true,
};

function productToForm(p: ProductWithPool): ProductFormState {
  return {
    id: p.id, name: p.name, brand: p.brand, category: p.category, imageEmoji: p.imageEmoji,
    unitDescription: p.unitDescription, caseDescription: p.caseDescription, caseSize: String(p.caseSize),
    sharePriceGbp: (p.sharePricePence / 100).toFixed(2), aldiPriceGbp: (p.aldiPricePence / 100).toFixed(2),
    aldiUnitLabel: p.aldiUnitLabel, wholesaleCaseCostGbp: (p.wholesaleCaseCostPence / 100).toFixed(2), isActive: p.isActive,
  };
}

/**
 * No-Code Product & Aldi Price Manager allowing the student founder to create,
 * re-price, hide, or delete wholesale bulk items in seconds.
 */
export function AdminProductsTab({ summary, onReloadAll }: AdminProductsTabProps) {
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return summary.products;
    return summary.products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q) || p.category.toLowerCase().includes(q),
    );
  }, [summary.products, query]);

  const previewSharePence = Math.max(0, Math.round((parseFloat(form.sharePriceGbp) || 0) * 100));
  const previewAldiPence = Math.max(0, Math.round((parseFloat(form.aldiPriceGbp) || 0) * 100));
  const previewCaseCostPence = Math.max(0, Math.round((parseFloat(form.wholesaleCaseCostGbp) || 0) * 100));
  const previewCaseSize = Math.max(1, Math.round(parseInt(form.caseSize, 10) || 1));
  const previewSavingsPct = previewAldiPence > 0 ? Math.round(((previewAldiPence - previewSharePence) / previewAldiPence) * 100) : 0;
  const previewCaseMarginPence = previewSharePence * previewCaseSize - previewCaseCostPence;

  async function handleSaveProduct(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setBanner(null);

    const payload: Omit<Product, 'id'> = {
      name: form.name.trim(),
      brand: form.brand.trim(),
      category: form.category,
      imageEmoji: form.imageEmoji.trim() || '📦',
      unitDescription: form.unitDescription.trim(),
      caseDescription: form.caseDescription.trim(),
      caseSize: previewCaseSize,
      sharePricePence: previewSharePence,
      aldiPricePence: previewAldiPence,
      aldiUnitLabel: form.aldiUnitLabel.trim() || 'at Aldi',
      wholesaleCaseCostPence: previewCaseCostPence,
      isActive: form.isActive,
    };

    try {
      if (form.id) {
        await apiFetch<{ product: ProductWithPool }>(`/api/admin/products/${form.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setBanner({ type: 'ok', text: `Updated "${payload.name}".` });
      } else {
        await apiFetch<{ product: ProductWithPool }>('/api/admin/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setBanner({ type: 'ok', text: `Added "${payload.name}" to the storefront!` });
      }
      setModalOpen(false);
      await onReloadAll();
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : 'Failed to save product.' });
    } finally {
      setSaving(false);
    }
  }

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

  const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none';

  return (
    <div className="space-y-4">
      {banner && (
        <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-medium ${banner.type === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {banner.type === 'ok' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />}
          <span>{banner.text}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Search products, brands, or categories…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => { setForm(EMPTY_FORM); setModalOpen(true); }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
        >
          <PackagePlus className="h-4 w-4" /> Add Bulk Product
        </button>
      </div>

      {/* Product Catalog Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3">Item &amp; Category</th>
                <th className="px-4 py-3">Share / Case Split</th>
                <th className="px-4 py-3 text-right">Divly vs Aldi</th>
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
                          <p className="text-[11px] text-slate-500">{p.brand} · {p.category}</p>
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
                        Save {p.savingsPercent}% vs Aldi
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
                      <p className="text-[11px] text-slate-400">{p.openCaseClaimedSlots}/{p.caseSize} open</p>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {deletingId === p.id ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button type="button" onClick={() => handleConfirmDelete(p.id, p.name)} className="rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-red-700">Confirm</button>
                          <button type="button" onClick={() => setDeletingId(null)} className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] text-slate-600">Cancel</button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5">
                          <button type="button" onClick={() => { setForm(productToForm(p)); setModalOpen(true); }} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-gray-50">
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

      {/* Add / Edit Product Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px]" onClick={() => !saving && setModalOpen(false)} />
          <form role="dialog" aria-modal="true" onSubmit={handleSaveProduct} className="relative z-10 w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl border border-gray-200 bg-white p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {form.id ? 'Edit Bulk Product & Aldi Comparison' : 'Add New Bulk Product'}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-gray-100 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-6">
              <div className="sm:col-span-1">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Emoji</label>
                <input type="text" required value={form.imageEmoji} onChange={(e) => setForm({ ...form, imageEmoji: e.target.value })} className={`${inputCls} text-center text-base`} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Brand</label>
                <input type="text" required placeholder="e.g. Nongshim" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} className={inputCls} />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Product Name</label>
                <input type="text" required placeholder="e.g. Shin Ramyun Multipack" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={`${inputCls} bg-white`}>
                  {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Splits per Case (Case Size)</label>
                <input type="number" min="1" max="48" required value={form.caseSize} onChange={(e) => setForm({ ...form, caseSize: e.target.value })} className={inputCls} />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Student Share Size</label>
                <input type="text" required placeholder="e.g. 5 × 120g packs" value={form.unitDescription} onChange={(e) => setForm({ ...form, unitDescription: e.target.value })} className={inputCls} />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Wholesale Case Spec</label>
                <input type="text" required placeholder="e.g. 20-pack outer box" value={form.caseDescription} onChange={(e) => setForm({ ...form, caseDescription: e.target.value })} className={inputCls} />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Divly Share Price (£)</label>
                <input type="number" step="0.01" min="0.01" required value={form.sharePriceGbp} onChange={(e) => setForm({ ...form, sharePriceGbp: e.target.value })} className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Aldi Price (£)</label>
                <input type="number" step="0.01" min="0.01" required value={form.aldiPriceGbp} onChange={(e) => setForm({ ...form, aldiPriceGbp: e.target.value })} className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Wholesale Case Cost (£)</label>
                <input type="number" step="0.01" min="0" required value={form.wholesaleCaseCostGbp} onChange={(e) => setForm({ ...form, wholesaleCaseCostGbp: e.target.value })} className={inputCls} />
              </div>

              <div className="sm:col-span-4">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Aldi Unit Comparison Label</label>
                <input type="text" required placeholder="e.g. 5-pack equiv. at Aldi" value={form.aldiUnitLabel} onChange={(e) => setForm({ ...form, aldiUnitLabel: e.target.value })} className={inputCls} />
              </div>
              <div className="sm:col-span-2 flex items-end pb-1.5">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-emerald-600" />
                  Visible in Shop
                </label>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-2.5 text-xs">
              <span className="font-semibold text-emerald-800">Student Saving: {previewSavingsPct}% vs Aldi</span>
              <span className="font-semibold text-slate-800">
                Case Revenue: {formatPence(previewSharePence * previewCaseSize)} · Margin:{' '}
                <strong className={previewCaseMarginPence >= 0 ? 'text-emerald-700' : 'text-red-600'}>{formatPence(previewCaseMarginPence)}/case</strong>
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={saving} className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">
                {saving ? 'Saving…' : form.id ? 'Save Changes' : 'Create Product'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
