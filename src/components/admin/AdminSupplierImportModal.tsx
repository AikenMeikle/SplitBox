import { useState, type FormEvent } from 'react';
import { ExternalLink, Globe, PlusCircle, Search, SlidersHorizontal, X } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import {
  formatPence,
  type LiveSupplierProductResult,
  type Product,
  type ProductCategory,
  type ProductWithPool,
} from '../../shared/types';

interface AdminSupplierImportModalProps {
  open: boolean;
  onClose: () => void;
  onImported: (productName: string) => Promise<void>;
  onCustomiseDraft: (draft: Omit<Product, 'id'>) => void;
}

const CATEGORY_EMOJI: Record<ProductCategory, string> = {
  'Rice & Noodles': '🍜',
  'Drinks & Caffeine': '🥤',
  'Protein & Snacks': '🍫',
  'Toiletries & Laundry': '🧻',
  'Cooking Staples': '🥫',
};

function mapSupplierItemToProduct(item: LiveSupplierProductResult): Omit<Product, 'id'> {
  const caseSize = Math.max(2, item.suggestedCaseSize || 4);
  const unitDesc = item.packSizeLabel || '1 multipack share';
  return {
    name: item.name,
    brand: item.brand || 'Wholesale UK',
    category: item.category || 'Cooking Staples',
    imageEmoji: CATEGORY_EMOJI[item.category] || '🛒',
    unitDescription: unitDesc,
    caseDescription: `${caseSize} × ${unitDesc} wholesale case`,
    caseSize,
    sharePricePence: item.suggestedSharePricePence,
    aldiPricePence: item.estimatedAldiPricePence,
    aldiUnitLabel: `${unitDesc} equiv. at Aldi`,
    wholesaleCaseCostPence: item.estimatedWholesaleCaseCostPence,
    isActive: true,
    eanBarcode: item.eanBarcode,
    supplierName: item.source === 'qogita_live' ? 'Qogita B2B' : 'UK Wholesale / Open Food Facts',
    shelfLifeWeeks: item.shelfLifeWeeks || 26,
  };
}

/**
 * Live UK Wholesale / Open Food Facts Barcode Search & 1-Click Catalog Import Modal.
 */
export function AdminSupplierImportModal({
  open,
  onClose,
  onImported,
  onCustomiseDraft,
}: AdminSupplierImportModalProps) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [results, setResults] = useState<LiveSupplierProductResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!open) return null;

  async function runSearch(term: string) {
    const q = term.trim();
    if (!q) return;
    setSearching(true);
    setErrorMsg(null);
    setHasSearched(true);
    try {
      const raw = await apiFetch<
        | LiveSupplierProductResult[]
        | { results?: LiveSupplierProductResult[]; products?: LiveSupplierProductResult[] }
      >(`/api/admin/wholesale/search?q=${encodeURIComponent(q)}`);
      const list = Array.isArray(raw) ? raw : raw.results ?? raw.products ?? [];
      setResults(list);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Live UK supplier search failed.');
    } finally {
      setSearching(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void runSearch(query);
  }

  async function handleOneClickImport(item: LiveSupplierProductResult) {
    setImportingId(item.externalId);
    setErrorMsg(null);
    try {
      const payload = mapSupplierItemToProduct(item);
      await apiFetch<{ product: ProductWithPool }>('/api/admin/products', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await onImported(item.name);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not import product.');
    } finally {
      setImportingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px]" onClick={() => !importingId && onClose()} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <Globe className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                🔍 Import from Live UK Wholesale / Barcode API
              </h3>
              <p className="text-xs text-slate-500">
                Searches live Open Food Facts UK &amp; Qogita B2B catalog by product name or 13-digit EAN barcode.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-gray-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search Bar + Quick Chips */}
        <div className="border-b border-gray-100 bg-gray-50/70 px-5 py-3.5 space-y-2.5">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                autoFocus
                placeholder="Search UK products or EAN-13 barcode (e.g. Oatly, Nongshim, 7394376616228)…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-xl border border-gray-300 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={searching || !query.trim()}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              {searching ? 'Searching UK API…' : 'Search Live API'}
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-slate-400">Try:</span>
            {['Oatly', 'Shin Ramyun', 'Basmati Rice', 'Monster Ultra', 'Heinz Baked Beans'].map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => { setQuery(chip); void runSearch(chip); }}
                className="rounded-full border border-gray-200 bg-white px-2.5 py-0.5 font-medium text-slate-600 hover:border-emerald-300 hover:text-emerald-700"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {errorMsg && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
              {errorMsg}
            </div>
          )}

          {!hasSearched ? (
            <p className="py-10 text-center text-xs text-slate-500">
              Enter a UK grocery brand, item name, or EAN-13 barcode above to fetch live wholesale &amp; shelf-life specs.
            </p>
          ) : searching ? (
            <p className="py-10 text-center text-xs font-medium text-emerald-700">
              Querying live UK product &amp; barcode endpoints…
            </p>
          ) : results.length === 0 ? (
            <p className="py-10 text-center text-xs text-slate-500">
              No UK wholesale matches found for &ldquo;{query}&rdquo;. Try another brand or barcode.
            </p>
          ) : (
            results.map((item) => (
              <div
                key={item.externalId}
                className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm space-y-2.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                        {item.source === 'qogita_live' ? 'Qogita B2B Live' : 'Open Food Facts UK Live'}
                      </span>
                      <span className="font-mono text-[10px] text-slate-500">EAN {item.eanBarcode}</span>
                      <span className="text-[10px] text-slate-400">· {item.shelfLifeWeeks} wks shelf life</span>
                    </div>
                    <h4 className="mt-1 text-sm font-bold text-slate-900">
                      {item.brand} · {item.name}
                    </h4>
                    <p className="text-xs text-slate-500">
                      {item.packSizeLabel} · {item.category} · Case of {item.suggestedCaseSize}
                    </p>
                  </div>

                  <div className="text-right shrink-0 text-xs">
                    <p className="font-bold text-emerald-700">
                      Share {formatPence(item.suggestedSharePricePence)}{' '}
                      <span className="font-normal text-slate-400 line-through">
                        Aldi {formatPence(item.estimatedAldiPricePence)}
                      </span>
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Est. Case {formatPence(item.estimatedWholesaleCaseCostPence)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-2.5">
                  <a
                    href={item.supplierPortalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-emerald-700"
                  >
                    View Supplier Listing <ExternalLink className="h-3 w-3" />
                  </a>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onCustomiseDraft(mapSupplierItemToProduct(item));
                        onClose();
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-gray-50"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" /> Customise
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(importingId)}
                      onClick={() => handleOneClickImport(item)}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <PlusCircle className="h-3.5 w-3.5" />
                      {importingId === item.externalId ? 'Importing…' : '1-Click Import to Catalog'}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
