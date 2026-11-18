import React, { useState, useRef, useEffect } from 'react';
import { MapPin, ChevronDown, ShoppingBag, Clock, Lock, Check, PackageCheck, Store } from 'lucide-react';
import { useDrop } from '../../store/DropContext';
import type { HubId } from '../../types';

export const Navbar: React.FC = () => {
  const {
    hubs,
    selectedHubId,
    selectedHub,
    setSelectedHub,
    activeView,
    setActiveView,
    dropStatus,
    setBasketOpen,
    totalBasketSlices,
    totalUserEscrowSlices,
    pickupPass,
  } = useDrop();

  const [isHubDropdownOpen, setIsHubDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close hub dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsHubDropdownOpen(false);
      }
    }
    if (isHubDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isHubDropdownOpen]);

  const handleHubSelect = (hubId: HubId) => {
    setSelectedHub(hubId);
    setIsHubDropdownOpen(false);
  };

  const isDropOpen = dropStatus === 'open';

  return (
    <header className="sticky top-0 z-40 bg-[var(--sb-bg-surface)] border-b-2 border-[var(--sb-ink-primary)] w-full">
      <div className="sb-container">
        {/* Desktop & Tablet Navigation Row */}
        <div className="hidden md:flex items-center justify-between gap-3 h-[72px]">
          {/* Brand Lockup */}
          <button
            type="button"
            onClick={() => setActiveView('storefront')}
            className="flex items-center gap-3 text-left focus:outline-none group cursor-pointer"
            aria-label="SplitBox Home - University of Birmingham"
          >
            <img
              src="/assets/splitbox-icon.svg"
              alt="SplitBox Icon"
              width="40"
              height="40"
              className="shrink-0 transition-transform group-hover:scale-105"
            />
            <div className="flex flex-col">
              <span className="font-['Space_Grotesk'] font-bold text-2xl tracking-tight text-[var(--sb-ink-primary)] leading-tight">
                Split<span className="text-[var(--sb-cobalt-600)]">Box</span>
              </span>
              <span className="sb-mono text-[10px] uppercase font-bold tracking-wider text-[var(--sb-ink-secondary)]">
                Univ of Birmingham Drop
              </span>
            </div>
          </button>

          {/* Center / Right Utility Group */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Interactive UoB Hub Selector */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsHubDropdownOpen((prev) => !prev)}
                className="sb-btn sb-btn--secondary sb-btn--sm flex items-center gap-2 !py-2 !px-3"
                aria-expanded={isHubDropdownOpen}
                aria-haspopup="listbox"
                aria-label={`Current campus hub: ${selectedHub.shortLabel}`}
              >
                <MapPin className="w-3.5 h-3.5 text-[var(--sb-cobalt-600)] shrink-0" />
                <span className="sb-mono text-xs font-bold tracking-tight text-[var(--sb-ink-primary)]">
                  {selectedHub.shortLabel}
                </span>
                <span className="sb-mono text-[10px] text-[var(--sb-ink-secondary)] hidden lg:inline">
                  ({selectedHub.pickupWindow})
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-[var(--sb-ink-primary)] transition-transform duration-150 ${
                    isHubDropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Hub Selector Popover Menu */}
              {isHubDropdownOpen && (
                <div
                  role="listbox"
                  className="absolute left-0 mt-2 w-80 bg-white border-2 border-[var(--sb-ink-primary)] rounded-[var(--sb-radius-box)] shadow-[4px_4px_0px_var(--sb-ink-primary)] p-2.5 z-50 animate-in fade-in zoom-in-95 duration-100"
                >
                  <div className="px-2 py-1 mb-1 border-b border-[var(--sb-border-subtle)]">
                    <span className="sb-mono text-[10px] font-bold uppercase text-[var(--sb-ink-secondary)]">
                      Select Campus Pickup Hub
                    </span>
                    <p className="text-[11px] text-[var(--sb-ink-secondary)] leading-snug">
                      Each hub runs independent wholesale pools and collection queues.
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5 mt-1">
                    {hubs.map((hub) => {
                      const isSelected = hub.id === selectedHubId;
                      return (
                        <button
                          key={hub.id}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => handleHubSelect(hub.id)}
                          className={`text-left p-2 rounded-[var(--sb-radius-control)] border transition-all cursor-pointer flex items-start justify-between gap-2 ${
                            isSelected
                              ? 'bg-[var(--sb-bg-mint-tint)] border-[var(--sb-mint-700)] shadow-[1px_1px_0px_var(--sb-ink-primary)]'
                              : 'bg-white border-transparent hover:border-[var(--sb-ink-primary)] hover:bg-[var(--sb-bg-canvas)]'
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="sb-mono font-bold text-xs text-[var(--sb-ink-primary)]">
                                {hub.shortLabel}
                              </span>
                              {isSelected && (
                                <span className="sb-badge sb-badge--mint text-[9px] !py-0.5 !px-1">
                                  ACTIVE
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-[var(--sb-ink-secondary)] line-clamp-1 mt-0.5">
                              {hub.addressNote}
                            </div>
                            <div className="sb-mono text-[10px] font-bold text-[var(--sb-cobalt-600)] mt-0.5">
                              Pickup: {hub.pickupWindow}
                            </div>
                          </div>
                          {isSelected && (
                            <Check className="w-4 h-4 text-[var(--sb-mint-700)] shrink-0 mt-0.5" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Drop Countdown / Status Badge */}
            {isDropOpen ? (
              <span
                className="sb-badge sb-badge--mint flex items-center gap-1.5"
                title="Current drop cutoff: Wednesday 23:59. Saturday hub pickup."
              >
                <Clock className="w-3.5 h-3.5 text-[var(--sb-ink-primary)]" />
                <span>CLOSES IN 14H 22M</span>
              </span>
            ) : (
              <span
                className="sb-badge sb-badge--ink flex items-center gap-1.5"
                title="Cutoff has passed. Completed boxes are locked; unfilled shares auto-refunded."
              >
                <Lock className="w-3.5 h-3.5 text-white" />
                <span>DROP CLOSED</span>
              </span>
            )}

            {/* View Switcher: Browse Drop vs. My Orders */}
            <div className="flex items-center border-1.5 border-[var(--sb-ink-primary)] rounded-[var(--sb-radius-control)] bg-[var(--sb-bg-canvas)] p-0.5 shadow-[1px_1px_0px_var(--sb-ink-primary)]">
              <button
                type="button"
                onClick={() => setActiveView('storefront')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--sb-radius-pill)] font-['Space_Grotesk'] text-xs font-bold transition-all cursor-pointer ${
                  activeView === 'storefront'
                    ? 'bg-[var(--sb-ink-primary)] text-white shadow-sm'
                    : 'text-[var(--sb-ink-primary)] hover:bg-white'
                }`}
              >
                <Store className="w-3.5 h-3.5" />
                <span>Browse Drop</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveView('orders')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--sb-radius-pill)] font-['Space_Grotesk'] text-xs font-bold transition-all cursor-pointer ${
                  activeView === 'orders'
                    ? 'bg-[var(--sb-cobalt-600)] text-white shadow-sm'
                    : 'text-[var(--sb-ink-primary)] hover:bg-white'
                }`}
              >
                <PackageCheck className="w-3.5 h-3.5" />
                <span>My Orders / Pass</span>
                {pickupPass && (
                  <span className="w-2 h-2 rounded-full bg-[var(--sb-mint-500)] animate-pulse" />
                )}
              </button>
            </div>

            {/* My Locked Slices / Basket Trigger Button */}
            <button
              type="button"
              onClick={() => setBasketOpen(true)}
              className="sb-btn sb-btn--secondary sb-btn--sm flex items-center gap-2 !py-2 !px-3 cursor-pointer"
              aria-label={`Open basket: ${totalBasketSlices} items in basket, ${totalUserEscrowSlices} slices locked`}
            >
              <ShoppingBag className="w-4 h-4 text-[var(--sb-ink-primary)]" />
              <span className="font-bold text-xs">My Locked Slices</span>
              <span
                className={`sb-btn__mono !text-xs !py-0.5 !px-1.5 ${
                  totalBasketSlices > 0
                    ? '!bg-[var(--sb-tangerine-500)] !text-[var(--sb-ink-primary)] font-bold'
                    : totalUserEscrowSlices > 0
                    ? '!bg-[var(--sb-mint-500)] !text-[var(--sb-ink-primary)] font-bold'
                    : '!bg-gray-100 !text-[var(--sb-ink-secondary)]'
                }`}
              >
                {totalBasketSlices > 0 ? totalBasketSlices : totalUserEscrowSlices}
              </span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Layout (375px & small devices) */}
        <div className="flex md:hidden flex-col py-2.5 gap-2 max-w-full overflow-x-clip">
          {/* Mobile Row 1: Brand & Drop Status & Basket */}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setActiveView('storefront')}
              className="flex items-center gap-2 focus:outline-none cursor-pointer"
            >
              <img
                src="/assets/splitbox-icon.svg"
                alt="SplitBox Icon"
                width="32"
                height="32"
                className="shrink-0"
              />
              <span className="font-['Space_Grotesk'] font-bold text-xl tracking-tight text-[var(--sb-ink-primary)]">
                Split<span className="text-[var(--sb-cobalt-600)]">Box</span>
              </span>
            </button>

            <div className="flex items-center gap-1.5 shrink-0">
              {isDropOpen ? (
                <span className="sb-badge sb-badge--mint !text-[10px] !py-0.5 !px-1.5">
                  ⏱ 14H 22M
                </span>
              ) : (
                <span className="sb-badge sb-badge--ink !text-[10px] !py-0.5 !px-1.5">
                  ⛔ DROP CLOSED
                </span>
              )}

              <button
                type="button"
                onClick={() => setBasketOpen(true)}
                className="sb-btn sb-btn--secondary !py-1 !px-2 text-xs flex items-center gap-1.5 cursor-pointer"
                aria-label="Open basket"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span className="sb-btn__mono !text-[10px] !py-0 !px-1 !bg-[var(--sb-mint-500)]">
                  {totalBasketSlices > 0 ? totalBasketSlices : totalUserEscrowSlices}
                </span>
              </button>
            </div>
          </div>

          {/* Mobile Row 2: Hub Selector & View Switcher */}
          <div className="flex items-center gap-1.5 justify-between w-full pt-1 border-t border-[var(--sb-border-subtle)]">
            {/* Hub Selector Button */}
            <div className="relative flex-1 min-w-0" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsHubDropdownOpen((prev) => !prev)}
                className="w-full sb-btn sb-btn--secondary !py-1 !px-2 flex items-center justify-between text-xs"
                aria-label={`Select hub: currently ${selectedHub.shortLabel}`}
              >
                <div className="flex items-center gap-1 min-w-0 truncate">
                  <MapPin className="w-3 h-3 text-[var(--sb-cobalt-600)] shrink-0" />
                  <span className="sb-mono text-[11px] font-bold truncate">
                    {selectedHub.shortLabel}
                  </span>
                </div>
                <ChevronDown className="w-3 h-3 shrink-0 ml-1" />
              </button>

              {/* Mobile Hub Dropdown */}
              {isHubDropdownOpen && (
                <div className="absolute left-0 right-0 mt-1 bg-white border-2 border-[var(--sb-ink-primary)] rounded-[var(--sb-radius-box)] shadow-[3px_3px_0px_var(--sb-ink-primary)] p-2 z-50">
                  <div className="px-1 py-1 mb-1 border-b border-[var(--sb-border-subtle)]">
                    <span className="sb-mono text-[9px] font-bold uppercase text-[var(--sb-ink-secondary)]">
                      UoB Pickup Hubs
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
                    {hubs.map((hub) => (
                      <button
                        key={hub.id}
                        type="button"
                        onClick={() => handleHubSelect(hub.id)}
                        className={`text-left p-1.5 rounded-[var(--sb-radius-pill)] border text-xs cursor-pointer ${
                          hub.id === selectedHubId
                            ? 'bg-[var(--sb-bg-mint-tint)] border-[var(--sb-mint-700)] font-bold'
                            : 'bg-white border-transparent hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="sb-mono text-[11px]">{hub.shortLabel}</span>
                          {hub.id === selectedHubId && (
                            <Check className="w-3.5 h-3.5 text-[var(--sb-mint-700)]" />
                          )}
                        </div>
                        <div className="text-[10px] text-[var(--sb-ink-secondary)]">
                          {hub.pickupWindow}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Mobile View Switcher */}
            <div className="flex items-center border border-[var(--sb-ink-primary)] rounded-[var(--sb-radius-control)] bg-[var(--sb-bg-canvas)] p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setActiveView('storefront')}
                className={`px-2 py-1 rounded-[var(--sb-radius-pill)] text-[11px] font-bold transition-all cursor-pointer ${
                  activeView === 'storefront'
                    ? 'bg-[var(--sb-ink-primary)] text-white'
                    : 'text-[var(--sb-ink-primary)]'
                }`}
              >
                Browse
              </button>
              <button
                type="button"
                onClick={() => setActiveView('orders')}
                className={`px-2 py-1 rounded-[var(--sb-radius-pill)] text-[11px] font-bold transition-all cursor-pointer ${
                  activeView === 'orders'
                    ? 'bg-[var(--sb-cobalt-600)] text-white'
                    : 'text-[var(--sb-ink-primary)]'
                }`}
              >
                Orders {pickupPass ? '★' : ''}
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
