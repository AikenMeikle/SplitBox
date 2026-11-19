/**
 * Student "Suggest & Upvote Next Week's Drop" community board.
 *
 * Lets UoB students vote on which bulk cases to stock next week (`POST /api/requests/:id/vote`)
 * and submit new item suggestions (`POST /api/requests`), auto-syncing via SSE (`divly:requests-updated`).
 */

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, MessageSquarePlus, Plus, ThumbsUp } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/api';
import type { ProductRequest } from '../shared/types';

const REQUEST_CATEGORIES = [
  'Rice & Noodles',
  'Drinks & Caffeine',
  'Protein & Snacks',
  'Toiletries & Laundry',
  'Cooking Staples',
];

export function RequestBoardSection() {
  const { user, setIsAuthModalOpen } = useApp();
  const [requests, setRequests] = useState<ProductRequest[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [itemName, setItemName] = useState('');
  const [brandOrSize, setBrandOrSize] = useState('');
  const [category, setCategory] = useState(REQUEST_CATEGORIES[0]);
  const [submitting, setSubmitting] = useState(false);
  const [votingId, setVotingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    try {
      const res = await apiFetch<{ requests: ProductRequest[] }>('/api/requests');
      setRequests(res.requests ?? []);
    } catch {
      // Keep existing list on transient network errors
    }
  }, []);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests, user?.id]);

  useEffect(() => {
    const onUpdated = () => void loadRequests();
    window.addEventListener('divly:requests-updated', onUpdated);
    return () => window.removeEventListener('divly:requests-updated', onUpdated);
  }, [loadRequests]);

  async function handleToggleVote(requestId: string) {
    if (!user) return setIsAuthModalOpen(true);
    setVotingId(requestId);
    setError(null);
    try {
      const res = await apiFetch<{ request: ProductRequest }>(
        `/api/requests/${encodeURIComponent(requestId)}/vote`,
        { method: 'POST' }
      );
      setRequests((prev) => prev.map((r) => (r.id === requestId ? res.request : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update vote.');
    } finally {
      setVotingId(null);
    }
  }

  async function handleSubmitRequest(e: FormEvent) {
    e.preventDefault();
    if (!user) return setIsAuthModalOpen(true);
    if (!itemName.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<{ request: ProductRequest }>('/api/requests', {
        method: 'POST',
        body: JSON.stringify({
          itemName: itemName.trim(),
          brandOrSize: brandOrSize.trim() || 'Wholesale multipack',
          category,
        }),
      });
      setRequests((prev) => [res.request, ...prev.filter((r) => r.id !== res.request.id)]);
      setItemName('');
      setBrandOrSize('');
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit request.');
    } finally {
      setSubmitting(false);
    }
  }

  const sortedRequests = [...requests].sort((a, b) =>
    a.status !== b.status ? (a.status === 'open' ? -1 : 1) : b.upvotesCount - a.upvotesCount
  );

  return (
    <section className="card p-4 sm:p-6 space-y-4" aria-label="Student bulk item requests">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-extrabold text-gray-900 flex items-center gap-2">
            <MessageSquarePlus className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>Suggest &amp; Upvote Next Week&apos;s Bulk Drop</span>
          </h2>
          <p className="text-xs sm:text-sm text-gray-600 mt-0.5">
            Want a wholesale box we don&apos;t stock yet? Upvote what your flat needs — top UoB picks get added weekly.
          </p>
        </div>
        <button
          type="button"
          onClick={() => (!user ? setIsAuthModalOpen(true) : setShowForm((prev) => !prev))}
          className="btn-secondary !py-2 !px-3.5 shrink-0 self-start sm:self-center"
        >
          <Plus className="w-4 h-4 text-emerald-600" />
          <span>{showForm ? 'Cancel' : 'Suggest Bulk Item'}</span>
        </button>
      </div>

      {error && (
        <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-700">{error}</div>
      )}

      {showForm && (
        <form
          onSubmit={(e) => void handleSubmitRequest(e)}
          className="p-4 rounded-xl bg-gray-50 border border-gray-200 grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end"
        >
          <div className="sm:col-span-2">
            <label htmlFor="req-item-name" className="block text-xs font-semibold text-gray-700 mb-1">Product name</label>
            <input
              id="req-item-name" type="text" required maxLength={80} value={itemName}
              onChange={(e) => setItemName(e.target.value)} placeholder="e.g. Indomie Spicy Chicken"
              className="w-full px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label htmlFor="req-brand-size" className="block text-xs font-semibold text-gray-700 mb-1">Pack / Case size</label>
            <input
              id="req-brand-size" type="text" maxLength={60} value={brandOrSize}
              onChange={(e) => setBrandOrSize(e.target.value)} placeholder="e.g. 40-Pack Case"
              className="w-full px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div className="flex gap-2">
            <select
              aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}
              className="flex-1 px-2.5 py-2 rounded-xl bg-white border border-gray-200 text-xs font-semibold text-gray-800 focus:outline-none focus:border-emerald-500"
            >
              {REQUEST_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button type="submit" disabled={submitting || !itemName.trim()} className="btn-primary !py-2 !px-3.5">
              {submitting ? 'Adding…' : 'Post'}
            </button>
          </div>
        </form>
      )}

      {sortedRequests.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {sortedRequests.map((req) => (
            <div key={req.id} className="p-3 rounded-xl bg-gray-50/80 border border-gray-200/80 flex items-center justify-between gap-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-gray-500 truncate">{req.category}</span>
                  {req.status === 'stocked' && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      <span>Stocked</span>
                    </span>
                  )}
                </div>
                <p className="text-xs sm:text-sm font-bold text-gray-900 truncate" title={req.itemName}>{req.itemName}</p>
                <p className="text-[11px] text-gray-500 truncate">{req.brandOrSize} · by {req.requestedByName}</p>
              </div>
              <button
                type="button" disabled={votingId === req.id || req.status === 'stocked'}
                onClick={() => void handleToggleVote(req.id)} aria-label={`Upvote ${req.itemName}`}
                className={`inline-flex flex-col items-center justify-center min-w-[48px] px-2 py-1.5 rounded-xl border text-xs font-bold tabular-nums cursor-pointer transition-colors shrink-0 ${
                  req.viewerHasVoted
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-emerald-300 hover:text-emerald-700'
                } disabled:opacity-60`}
              >
                <ThumbsUp className="w-3.5 h-3.5 mb-0.5" />
                <span>{req.upvotesCount}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
