import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Clock,
  QrCode,
  RotateCcw,
  Sparkles,
  Users,
  X,
  Sliders,
} from 'lucide-react';
import { useDrop } from '../../store/DropContext';

/**
 * Collapsible reviewer Demo Controls toolbar for SplitBox (UoB Prototype).
 * Positioned dock-style at the top of the viewport so it never collides
 * with or blocks the 375px mobile sticky bottom basket bar.
 */
export function DemoControlsBar() {
  const {
    dropStatus,
    lastDemoBanner,
    dismissDemoBanner,
    simulateStrangers,
    triggerCutoff,
    resetDrop,
    setActiveView,
    activeView,
    orders,
  } = useDrop();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [localFeedback, setLocalFeedback] = useState<string | null>(null);

  const handleSimulateStrangers = () => {
    if (dropStatus === 'closed') return;
    setIsSimulating(true);
    try {
      const result = simulateStrangers();
      setLocalFeedback(result.summary);
    } finally {
      setTimeout(() => setIsSimulating(false), 250);
    }
  };

  const handleTriggerCutoff = () => {
    const pass = triggerCutoff();
    const feedback = `Cutoff resolved! Pass: ${pass.pickupCode} · ${pass.fulfilledSliceCount} fulfilled, ${pass.refundedSliceCount} auto-refunded`;
    setLocalFeedback(feedback);
  };

  const handleResetPrototype = () => {
    resetDrop();
    setLocalFeedback('Prototype state reset to initial Wednesday UoB seed pools.');
  };

  const handleJumpToOrders = () => {
    setActiveView('orders');
  };

  const activeBanner = localFeedback || lastDemoBanner;

  return (
    <aside
      aria-label="Reviewer Demo Controls"
      className="w-full bg-[var(--sb-bg-canvas)] border-b-2 border-[var(--sb-ink-primary)] shadow-[0_2px_0_#0B241C] relative z-30 transition-all duration-150"
    >
      <div className="sb-container py-2.5">
        {/* Top bar: Status indicator + Title + Toggle */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[0.7rem] font-bold tracking-wider font-mono border border-[var(--sb-ink-primary)] bg-white text-[var(--sb-ink-primary)] uppercase">
              <Sliders className="w-3.5 h-3.5 text-[var(--sb-cobalt-600)] shrink-0" />
              <span className="hidden sm:inline">UoB Reviewer</span> Controls
            </span>

            {/* Live Drop Status Pill */}
            {dropStatus === 'open' ? (
              <span className="sb-badge sb-badge--mint text-[0.68rem] py-0.5">
                <span className="w-2 h-2 rounded-full bg-[var(--sb-mint-700)] animate-pulse" />
                DROP OPEN · POOLS ACTIVE
              </span>
            ) : (
              <span className="sb-badge sb-badge--cobalt-solid text-[0.68rem] py-0.5">
                <span className="w-2 h-2 rounded-full bg-white" />
                CUTOFF RESOLVED · DROP CLOSED
              </span>
            )}

            {/* Compact banner preview when collapsed */}
            {isCollapsed && activeBanner && (
              <p className="text-xs text-[var(--sb-ink-secondary)] truncate max-w-[200px] sm:max-w-md hidden md:block m-0">
                {activeBanner}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {dropStatus === 'closed' && activeView !== 'orders' && (
              <button
                type="button"
                onClick={handleJumpToOrders}
                className="sb-btn sb-btn--mint sb-btn--sm py-1 px-2.5 text-xs shadow-none hover:shadow-none"
                title="View pickup pass"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Pickup Pass</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsCollapsed((prev) => !prev)}
              className="inline-flex items-center gap-1 text-xs font-bold text-[var(--sb-ink-primary)] hover:text-[var(--sb-cobalt-600)] px-2 py-1 rounded hover:bg-black/5 transition-colors"
              aria-expanded={!isCollapsed}
            >
              <span>{isCollapsed ? 'Expand Controls' : 'Collapse'}</span>
              {isCollapsed ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronUp className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Expanded body with buttons & toast feedback banner */}
        {!isCollapsed && (
          <div className="mt-2.5 pt-2.5 border-t border-dashed border-[var(--sb-border-subtle)] space-y-2.5">
            {/* Feedback / Toast Banner */}
            {activeBanner && (
              <div className="bg-[var(--sb-bg-mint-tint)] border border-[var(--sb-ink-primary)] rounded px-3 py-2 text-xs flex items-center justify-between gap-2 shadow-[1px_1px_0px_#0B241C]">
                <div className="flex items-center gap-2 min-w-0">
                  <Sparkles className="w-4 h-4 text-[var(--sb-tangerine-500)] shrink-0" />
                  <span className="font-semibold text-[var(--sb-ink-primary)] truncate">
                    {activeBanner}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {dropStatus === 'closed' && activeView !== 'orders' && (
                    <button
                      type="button"
                      onClick={handleJumpToOrders}
                      className="text-xs font-bold underline text-[var(--sb-cobalt-600)] hover:text-[var(--sb-ink-primary)]"
                    >
                      View Pass →
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setLocalFeedback(null);
                      dismissDemoBanner();
                    }}
                    className="p-0.5 rounded hover:bg-black/10 text-[var(--sb-ink-primary)]"
                    aria-label="Dismiss banner"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Action buttons row */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Button 1: Simulate Strangers */}
              <button
                type="button"
                onClick={handleSimulateStrangers}
                disabled={dropStatus === 'closed' || isSimulating}
                className="sb-btn sb-btn--secondary sb-btn--sm flex-1 sm:flex-initial"
                title={
                  dropStatus === 'closed'
                    ? 'Drop cutoff has passed; campus pools are closed'
                    : 'Add 1-2 stranger slices across active UoB campus pools'
                }
              >
                <Users className="w-4 h-4 text-[var(--sb-cobalt-600)] shrink-0" />
                <span>Simulate Strangers Joining</span>
                <span className="sb-btn__mono text-[0.72rem] hidden md:inline">
                  +1–2 Slices
                </span>
              </button>

              {/* Button 2: Trigger Cutoff */}
              <button
                type="button"
                onClick={handleTriggerCutoff}
                disabled={dropStatus === 'closed'}
                className="sb-btn sb-btn--primary sb-btn--sm flex-1 sm:flex-initial"
                title={
                  dropStatus === 'closed'
                    ? 'Cutoff has already been triggered'
                    : 'Simulate Wednesday cutoff: 100% boxes fulfill, <100% overflow slices auto-refund'
                }
              >
                <Clock className="w-4 h-4 text-[var(--sb-ink-primary)] shrink-0" />
                <span>Trigger Drop Cutoff</span>
                <span className="sb-btn__mono text-[0.72rem] hidden md:inline">
                  Resolve Pools
                </span>
              </button>

              {/* Button 3: Reset Prototype */}
              <button
                type="button"
                onClick={handleResetPrototype}
                className="sb-btn sb-btn--secondary sb-btn--sm flex-1 sm:flex-initial"
                title="Clear localStorage and restore initial Birmingham campus seed pools"
              >
                <RotateCcw className="w-4 h-4 text-[var(--sb-danger-600)] shrink-0" />
                <span>Reset Prototype</span>
              </button>

              {/* Quick Jump to Pickup Pass if cutoff has been triggered */}
              {dropStatus === 'closed' && (
                <button
                  type="button"
                  onClick={handleJumpToOrders}
                  className="sb-btn sb-btn--cobalt sb-btn--sm flex-1 sm:flex-initial ml-auto"
                >
                  <QrCode className="w-4 h-4 shrink-0" />
                  <span>
                    {orders.length > 0 ? 'View Pickup Pass & Receipt' : 'View Orders View'}
                  </span>
                </button>
              )}
            </div>

            {/* Quick reviewer micro-guide */}
            <div className="flex items-center justify-between text-[0.7rem] text-[var(--sb-ink-secondary)] pt-1 flex-wrap gap-1">
              <span>
                💡 <strong>Reviewer Test Loop:</strong> Order slices at 3/4 full → click{' '}
                <em>Simulate Strangers</em> or <em>Trigger Drop Cutoff</em> to verify sequential case
                allocation &amp; auto-refund resolution.
              </span>
              <span className="sb-mono font-medium">UoB Sprint v1.0</span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
