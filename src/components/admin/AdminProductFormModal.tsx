import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import {
  formatPence,
  type Product,
  type ProductCategory,
  type ProductWithPool,
} from '../../shared/types';

export interface ProductFormState {
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
  eanBarcode: string;
  shelfLifeWeeks: string;
  isActive: boolean;
}

export const EMPTY_PRODUCT_FORM: ProductFormState = {
  id: null, name: '', brand: '', category: 'Rice & Noodles', imageEmoji: '🛒',
  unitDescription: '', caseDescription: '', caseSize: '4', sharePriceGbp: '2.50',
  aldiPriceGbp: '3.49', aldiUnitLabel: 'equiv. at Aldi', wholesaleCaseCostGbp: '8.50',
  eanBarcode: '', shelfLifeWeeks: '26', isActive: true,
};

export function productToForm(
  p: ProductWithPool | Omit<Product, 'id'>,
  existingId: string | null = null,
): ProductFormState {
  return {
    id: existingId,
    name: p.name,
    brand: p.brand,
    category: p.category,
    imageEmoji: p.imageEmoji,
    unitDescription: p.unitDescription,
    caseDescription: p.caseDescription,
    caseSize: String(p.caseSize),
    sharePriceGbp: (p.sharePricePence / 100).toFixed(2),
    aldiPriceGbp: (p.aldiPricePence / 100).toFixed(2),
    aldiUnitLabel: p.aldiUnitLabel,
    wholesaleCaseCostGbp: (p.wholesaleCaseCostPence / 100).toFixed(2),
    eanBarcode: p.eanBarcode ?? '',
    shelfLifeWeeks: String(p.shelfLifeWeeks ?? 26),
    isActive: p.isActive,
  };
}

const CATEGORIES: ProductCategory[] = [
  'Rice & Noodles', 'Drinks & Caffeine', 'Protein & Snacks', 'Toiletries & Laundry', 'Cooking Staples',
];

interface AdminProductFormModalProps {
  open: boolean;
  form: ProductFormState;
  setForm: (next: ProductFormState) => void;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
  onError: (message: string) => void;
}

/** Modal form for adding or editing bulk products, EAN barcodes, shelf life, and Aldi prices. */
export function AdminProductFormModal({
  open,
  form,
  setForm,
  onClose,
  onSaved,
  onError,
}: AdminProductFormModalProps) {
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const sharePence = Math.max(0, Math.round((parseFloat(form.sharePriceGbp) || 0) * 100));
  const aldiPence = Math.max(0, Math.round((parseFloat(form.aldiPriceGbp) || 0) * 100));
  const caseCostPence = Math.max(0, Math.round((parseFloat(form.wholesaleCaseCostGbp) || 0) * 100));
  const caseSize = Math.max(1, Math.round(parseInt(form.caseSize, 10) || 1));
  const savingsPct = aldiPence > 0 ? Math.round(((aldiPence - sharePence) / aldiPence) * 100) : 0;
  const caseMarginPence = sharePence * caseSize - caseCostPence;
  const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none';

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload: Omit<Product, 'id'> = {
      name: form.name.trim(),
      brand: form.brand.trim(),
      category: form.category,
      imageEmoji: form.imageEmoji.trim() || '📦',
      unitDescription: form.unitDescription.trim(),
      caseDescription: form.caseDescription.trim(),
      caseSize,
      sharePricePence: sharePence,
      aldiPricePence: aldiPence,
      aldiUnitLabel: form.aldiUnitLabel.trim() || 'at Aldi',
      wholesaleCaseCostPence: caseCostPence,
      eanBarcode: form.eanBarcode.trim() || undefined,
      shelfLifeWeeks: Math.max(1, Math.round(parseInt(form.shelfLifeWeeks, 10) || 26)),
      isActive: form.isActive,
    };

    try {
      if (form.id) {
        await apiFetch<{ product: ProductWithPool }>(`/api/admin/products/${form.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        await onSaved(`Updated "${payload.name}".`);
      } else {
        await apiFetch<{ product: ProductWithPool }>('/api/admin/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        await onSaved(`Added "${payload.name}" to the storefront!`);
      }
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save product.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px]" onClick={() => !saving && onClose()} />
      <form role="dialog" aria-modal="true" onSubmit={handleSave} className="relative z-10 w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl border border-gray-200 bg-white p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <h3 className="text-base font-bold text-slate-900">
            {form.id ? 'Edit Bulk Product & Aldi Comparison' : 'Add New Bulk Product'}
          </h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-gray-100 hover:text-slate-600">
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

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={`${inputCls} bg-white`}>
              {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Case Size (Splits)</label>
            <input type="number" min="1" max="48" required value={form.caseSize} onChange={(e) => setForm({ ...form, caseSize: e.target.value })} className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Shelf Life (Wks)</label>
            <input type="number" min="1" max="156" required value={form.shelfLifeWeeks} onChange={(e) => setForm({ ...form, shelfLifeWeeks: e.target.value })} className={inputCls} />
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
            <label className="block text-xs font-semibold text-slate-700 mb-1">Divly Share (£)</label>
            <input type="number" step="0.01" min="0.01" required value={form.sharePriceGbp} onChange={(e) => setForm({ ...form, sharePriceGbp: e.target.value })} className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Aldi Price (£)</label>
            <input type="number" step="0.01" min="0.01" required value={form.aldiPriceGbp} onChange={(e) => setForm({ ...form, aldiPriceGbp: e.target.value })} className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Wholesale Case (£)</label>
            <input type="number" step="0.01" min="0" required value={form.wholesaleCaseCostGbp} onChange={(e) => setForm({ ...form, wholesaleCaseCostGbp: e.target.value })} className={inputCls} />
          </div>

          <div className="sm:col-span-3">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Aldi Comparison Label</label>
            <input type="text" required placeholder="e.g. 5-pack equiv. at Aldi" value={form.aldiUnitLabel} onChange={(e) => setForm({ ...form, aldiUnitLabel: e.target.value })} className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">EAN-13 Barcode</label>
            <input type="text" placeholder="e.g. 8801043150620" value={form.eanBarcode} onChange={(e) => setForm({ ...form, eanBarcode: e.target.value })} className={`${inputCls} font-mono`} />
          </div>
          <div className="sm:col-span-1 flex items-end pb-2">
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-emerald-600" />
              Active
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-2.5 text-xs">
          <span className="font-semibold text-emerald-800">Student Saving: {savingsPct}% vs Aldi</span>
          <span className="font-semibold text-slate-800">
            Case Revenue: {formatPence(sharePence * caseSize)} · Margin:{' '}
            <strong className={caseMarginPence >= 0 ? 'text-emerald-700' : 'text-red-600'}>{formatPence(caseMarginPence)}/case</strong>
          </span>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saving} className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">
            {saving ? 'Saving…' : form.id ? 'Save Changes' : 'Create Product'}
          </button>
        </div>
      </form>
    </div>
  );
}
