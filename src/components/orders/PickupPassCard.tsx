import { QRCodeSVG } from 'qrcode.react';
import {
  AlertTriangle,
  Building2,
  Calendar,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import type { CampusHub, PickupPass } from '../../types';

export interface PickupPassCardProps {
  pass: PickupPass;
  hub: CampusHub;
  totalFulfilledCount: number;
}

/**
 * High-craft tactile campus collection pass with offline client-rendered SVG QR code,
 * bold check-in PIN, Birmingham hub details, and explicit grace-window forfeiture notice.
 */
export function PickupPassCard({
  pass,
  hub,
  totalFulfilledCount,
}: PickupPassCardProps) {
  // Deterministic local QR payload without any network requests
  const qrData =
    pass.qrPayload ||
    JSON.stringify({
      app: 'SplitBox-UoB',
      code: pass.pickupCode,
      pin: pass.pin,
      hub: hub.shortLabel,
      window: hub.pickupWindow,
      fulfilled: totalFulfilledCount,
    });

  return (
    <article
      aria-label="SplitBox Campus Pickup Pass"
      className="sb-card sb-card--static border-2 border-[var(--sb-ink-primary)] bg-[var(--sb-bg-surface)] p-5 sm:p-6 relative overflow-hidden"
    >
      {/* Decorative Crate Corner Accent */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-[var(--sb-bg-mint-tint)] pointer-events-none -mr-8 -mt-8 rounded-full border-2 border-[var(--sb-ink-primary)] opacity-40" />

      {/* Pass Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b-2 border-[var(--sb-ink-primary)]">
        <div>
          <span className="sb-badge sb-badge--mint mb-1">
            ★ VERIFIED FOR SATURDAY COLLECTION
          </span>
          <h2 className="sb-h2 text-xl sm:text-2xl text-[var(--sb-ink-primary)]">
            UoB Campus Pickup Pass
          </h2>
          <p className="text-xs text-[var(--sb-ink-secondary)] mt-0.5">
            Present this client-authenticated pass at the student crate collection bay.
          </p>
        </div>

        <div className="text-right">
          <span className="text-[0.7rem] uppercase tracking-wider font-bold text-[var(--sb-ink-secondary)] block">
            Fulfilled Slices
          </span>
          <span className="sb-mono text-xl sm:text-2xl font-bold text-[var(--sb-ink-primary)]">
            {totalFulfilledCount} {totalFulfilledCount === 1 ? 'Slice' : 'Slices'}
          </span>
        </div>
      </div>

      {/* Main Pass Content: QR Code + Pickup Code & PIN */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 my-6 items-center">
        {/* QR Code Container (Zero External APIs) */}
        <div className="md:col-span-5 flex flex-col items-center justify-center p-4 bg-white border-2 border-[var(--sb-ink-primary)] rounded-[var(--sb-radius-control)] shadow-[2px_2px_0px_#0B241C]">
          <div className="p-2 bg-white rounded border border-[var(--sb-border-subtle)] flex items-center justify-center">
            <QRCodeSVG
              value={qrData}
              size={152}
              level="M"
              marginSize={1}
              bgColor="#FFFFFF"
              fgColor="#0B241C"
              aria-label={`Offline QR Code for ${pass.pickupCode}`}
            />
          </div>
          <div className="mt-2 text-center">
            <span className="text-[0.68rem] uppercase tracking-widest font-mono font-bold text-[var(--sb-ink-secondary)] block">
              Offline Client QR Pass
            </span>
            <span className="text-[0.72rem] text-[var(--sb-ink-primary)] font-medium">
              Scan at Birmingham Crate Bay
            </span>
          </div>
        </div>

        {/* Pickup Code & 4-Digit Check-In PIN Block */}
        <div className="md:col-span-7 flex flex-col justify-center space-y-4">
          {/* Pickup Code */}
          <div className="bg-[var(--sb-bg-cobalt-tint)] border-2 border-[var(--sb-ink-primary)] rounded-[var(--sb-radius-control)] p-3.5 shadow-[2px_2px_0px_#0B241C]">
            <span className="text-[0.7rem] uppercase tracking-wider font-bold text-[var(--sb-cobalt-600)] block mb-0.5">
              Unique Pickup Identifier
            </span>
            <span className="sb-mono text-2xl sm:text-3xl font-extrabold tracking-wider text-[var(--sb-ink-primary)] block">
              {pass.pickupCode}
            </span>
            <span className="text-[0.72rem] text-[var(--sb-ink-secondary)] mt-0.5 block">
              Show this code to the hub volunteer marshall
            </span>
          </div>

          {/* 4-Digit Check-In PIN */}
          <div className="bg-[var(--sb-mint-500)] border-2 border-[var(--sb-ink-primary)] rounded-[var(--sb-radius-control)] p-3.5 shadow-[2px_2px_0px_#0B241C]">
            <span className="text-[0.7rem] uppercase tracking-wider font-bold text-[var(--sb-ink-primary)] block mb-0.5">
              4-Digit Check-In PIN
            </span>
            <div className="flex items-center gap-3">
              <span className="sb-mono text-3xl sm:text-4xl font-extrabold tracking-widest text-[var(--sb-ink-primary)]">
                {pass.pin}
              </span>
              <span className="sb-badge sb-badge--ink text-[0.68rem] ml-auto">
                SECURE PIN
              </span>
            </div>
            <span className="text-[0.72rem] font-medium text-[var(--sb-ink-primary)] mt-1 block">
              Required at desk to release sealed multi-pack wholesale units
            </span>
          </div>
        </div>
      </div>

      {/* Hub Location & Time Details Box */}
      <div className="bg-[var(--sb-bg-canvas)] border-2 border-[var(--sb-ink-primary)] rounded-[var(--sb-radius-control)] p-4 space-y-2.5">
        <div className="flex items-start gap-2.5">
          <MapPin className="w-5 h-5 text-[var(--sb-tangerine-500)] shrink-0 mt-0.5" />
          <div className="min-w-0">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--sb-ink-secondary)] block">
              Selected Campus Hub
            </span>
            <h4 className="font-bold text-sm sm:text-base text-[var(--sb-ink-primary)] m-0">
              {hub.name}
            </h4>
            <p className="text-xs text-[var(--sb-ink-secondary)] m-0 mt-0.5">
              {hub.addressNote}
            </p>
            <p className="text-[0.72rem] font-medium text-[var(--sb-ink-primary)] mt-1 flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-[var(--sb-cobalt-600)]" />
              <span>{hub.walkingNote}</span>
            </p>
          </div>
        </div>

        <div className="pt-2 border-t border-dashed border-[var(--sb-border-subtle)] flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[var(--sb-cobalt-600)]" />
            <span className="font-bold text-[var(--sb-ink-primary)]">
              Saturday Collection Window:
            </span>
            <span className="sb-mono font-bold bg-white px-2 py-0.5 rounded border border-[var(--sb-ink-primary)]">
              {hub.pickupWindow}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[var(--sb-ink-secondary)]">
            <ShieldCheck className="w-4 h-4 text-[var(--sb-mint-700)]" />
            <span>ID verification required at pickup</span>
          </div>
        </div>
      </div>

      {/* Explicit Grace-Window Forfeiture Notice (Brief §2.5 & §3.3) */}
      <div className="mt-4 p-3.5 bg-amber-50 border-2 border-[var(--sb-ink-primary)] rounded-[var(--sb-radius-control)] flex items-start gap-3 text-xs text-[var(--sb-ink-primary)] shadow-[1px_1px_0px_#0B241C]">
        <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-bold uppercase tracking-wider text-[0.7rem] text-amber-900 block">
            Campus Collection Grace-Window &amp; Forfeiture Notice
          </span>
          <p className="m-0 leading-relaxed font-medium text-[0.78rem]">
            Hub marshals hold crates during the scheduled Saturday window plus a strict{' '}
            <strong>30-minute grace window</strong>. Uncollected orders after the hub collection
            grace window are forfeited and donated to the campus community pantry without refund.
          </p>
        </div>
      </div>
    </article>
  );
}
