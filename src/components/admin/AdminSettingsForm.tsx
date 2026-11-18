import { useEffect, useState, type FormEvent } from 'react';
import { Save, Settings } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import type { DropSettings } from '../../shared/types';

interface AdminSettingsFormProps {
  settings: DropSettings;
  onReloadAll: () => Promise<void>;
  onNotify: (banner: { type: 'ok' | 'err'; text: string }) => void;
}

function isoToLocalDateTimeInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** No-code Hub Location, Weekly Cutoff & Small-Order Fee settings editor. */
export function AdminSettingsForm({ settings, onReloadAll, onNotify }: AdminSettingsFormProps) {
  const [hubName, setHubName] = useState(settings.hubName);
  const [hubShortLabel, setHubShortLabel] = useState(settings.hubShortLabel);
  const [hubAddress, setHubAddress] = useState(settings.hubAddress);
  const [pickupWindow, setPickupWindow] = useState(settings.pickupWindow);
  const [cutoffLocal, setCutoffLocal] = useState(isoToLocalDateTimeInput(settings.cutoffAtIso));
  const [freeThresholdGbp, setFreeThresholdGbp] = useState((settings.freeDeliveryThresholdPence / 100).toFixed(2));
  const [smallFeeGbp, setSmallFeeGbp] = useState((settings.smallOrderFeePence / 100).toFixed(2));
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    setHubName(settings.hubName);
    setHubShortLabel(settings.hubShortLabel);
    setHubAddress(settings.hubAddress);
    setPickupWindow(settings.pickupWindow);
    setCutoffLocal(isoToLocalDateTimeInput(settings.cutoffAtIso));
    setFreeThresholdGbp((settings.freeDeliveryThresholdPence / 100).toFixed(2));
    setSmallFeeGbp((settings.smallOrderFeePence / 100).toFixed(2));
  }, [settings]);

  async function handleSaveSettings(e: FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const parsedCutoff = cutoffLocal ? new Date(cutoffLocal) : new Date(settings.cutoffAtIso);
      const payload: Partial<DropSettings> = {
        hubName: hubName.trim(),
        hubShortLabel: hubShortLabel.trim(),
        hubAddress: hubAddress.trim(),
        pickupWindow: pickupWindow.trim(),
        cutoffAtIso: Number.isNaN(parsedCutoff.getTime()) ? settings.cutoffAtIso : parsedCutoff.toISOString(),
        freeDeliveryThresholdPence: Math.max(0, Math.round((parseFloat(freeThresholdGbp) || 0) * 100)),
        smallOrderFeePence: Math.max(0, Math.round((parseFloat(smallFeeGbp) || 0) * 100)),
      };
      await apiFetch<{ settings: DropSettings }>('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      await onReloadAll();
      onNotify({ type: 'ok', text: 'Campus hub, cutoff, and fee thresholds updated!' });
    } catch (err) {
      onNotify({ type: 'err', text: err instanceof Error ? err.message : 'Could not save settings.' });
    } finally {
      setSavingSettings(false);
    }
  }

  const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none';

  return (
    <form onSubmit={handleSaveSettings} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
      <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
        <Settings className="h-4 w-4 text-emerald-600" />
        <div>
          <h3 className="text-sm font-bold text-slate-900">Hub Location, Cutoff &amp; Fee Settings</h3>
          <p className="text-xs text-slate-500">Edit campus pickup details or small-order fee thresholds live without touching code.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Hub Name</label>
          <input type="text" required value={hubName} onChange={(e) => setHubName(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Navbar Short Label</label>
          <input type="text" required value={hubShortLabel} onChange={(e) => setHubShortLabel(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Pickup Window</label>
          <input type="text" required value={pickupWindow} onChange={(e) => setPickupWindow(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Hub Address</label>
          <input type="text" required value={hubAddress} onChange={(e) => setHubAddress(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Weekly Cutoff Date/Time</label>
          <input type="datetime-local" required value={cutoffLocal} onChange={(e) => setCutoffLocal(e.target.value)} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Free Fee Threshold (£)</label>
            <input type="number" step="0.01" min="0" required value={freeThresholdGbp} onChange={(e) => setFreeThresholdGbp(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Small-Order Fee (£)</label>
            <input type="number" step="0.01" min="0" required value={smallFeeGbp} onChange={(e) => setSmallFeeGbp(e.target.value)} className={inputCls} />
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <button type="submit" disabled={savingSettings} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">
          <Save className="h-3.5 w-3.5" /> {savingSettings ? 'Saving Settings…' : 'Save Hub & Fee Settings'}
        </button>
      </div>
    </form>
  );
}
