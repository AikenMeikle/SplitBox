import { useState } from 'react';
import { ArrowBigUp, CheckCircle2, MessageSquarePlus, Plus } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import type { ProductRequest } from '../../shared/types';

interface AdminRequestsPanelProps {
  requests: ProductRequest[];
  onReloadAll: () => Promise<void>;
  onDraftFromRequest: (req: ProductRequest) => void;
  onNotify: (banner: { type: 'ok' | 'err'; text: string }) => void;
}

/**
 * Founder triage list of student-upvoted bulk item requests (`PUT /api/admin/requests/:id`),
 * letting the founder mark items Stocked or pre-fill a new catalog product in 1 click.
 */
export function AdminRequestsPanel({
  requests,
  onReloadAll,
  onDraftFromRequest,
  onNotify,
}: AdminRequestsPanelProps) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  if (requests.length === 0) return null;

  const sorted = [...requests].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    return b.upvotesCount - a.upvotesCount;
  });

  async function handleToggleStatus(req: ProductRequest) {
    const nextStatus = req.status === 'stocked' ? 'open' : 'stocked';
    setUpdatingId(req.id);
    try {
      await apiFetch<{ request: ProductRequest }>(`/api/admin/requests/${req.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus }),
      });
      await onReloadAll();
      onNotify({
        type: 'ok',
        text:
          nextStatus === 'stocked'
            ? `Marked "${req.itemName}" as Stocked!`
            : `Reopened request "${req.itemName}".`,
      });
    } catch (err) {
      onNotify({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to update request status.',
      });
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50/70 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <MessageSquarePlus className="h-4 w-4 text-emerald-600" />
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Student-Upvoted Item Requests ({requests.length})
            </h3>
            <p className="text-xs text-slate-500">
              Top campus demand signals — launch high-vote items into Drop #2 in 1 click.
            </p>
          </div>
        </div>
      </div>

      <div className="divide-y divide-gray-100">
        {sorted.map((req) => (
          <div
            key={req.id}
            className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-xs hover:bg-gray-50/60"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-bold text-emerald-700 shrink-0">
                <ArrowBigUp className="h-3.5 w-3.5" /> {req.upvotesCount}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-slate-900">{req.itemName}</span>
                  {req.status === 'stocked' && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                      Stocked ✅
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  {req.brandOrSize} · {req.category} · Requested by {req.requestedByName}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {req.status !== 'stocked' && (
                <button
                  type="button"
                  onClick={() => onDraftFromRequest(req)}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-gray-50"
                >
                  <Plus className="h-3.5 w-3.5" /> Draft Product
                </button>
              )}
              <button
                type="button"
                disabled={updatingId === req.id}
                onClick={() => handleToggleStatus(req)}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-semibold ${
                  req.status === 'stocked'
                    ? 'border border-gray-200 bg-gray-100 text-slate-600 hover:bg-gray-200'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                } disabled:opacity-50`}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {req.status === 'stocked' ? 'Reopen' : '✓ Mark Stocked'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
