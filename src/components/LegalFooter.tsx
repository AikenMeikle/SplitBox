/**
 * Trustworthy UK Campus Startup Footer & Compliance Modals for Divly.
 *
 * Covers:
 * 1. Factory-Sealed Ambient Goods & Allergen Information (UK FIR 2014)
 * 2. Automatic Unfilled-Pool Refunds & UK Consumer Contracts Regulations 2013
 * 3. UoB Student Privacy, Data Minimisation & Hub Support Contact
 * Plus a direct link to `/flyer.html` (Printable A4 Hall Kitchen Poster).
 */

import { useState } from 'react';
import { FileText, Lock, Printer, RefreshCcw, ShieldAlert, X } from 'lucide-react';
import { BRAND_NAME, CAMPUS_NAME } from '../config/brand';
import { useApp } from '../context/AppContext';

type PolicyKey = 'allergens' | 'refunds' | 'privacy';

const POLICY_DETAILS: Record<
  PolicyKey,
  { title: string; subtitle: string; points: string[] }
> = {
  allergens: {
    title: 'Factory-Sealed Ambient Goods & Allergen Notice (UK FIR 2014)',
    subtitle: '100% manufacturer-sealed packs — zero loose repacking or chilled food handling.',
    points: [
      'Divly splits outer wholesale transit cases exclusively into intact, factory-sealed manufacturer retail packs or multipacks. Individual packs are never opened, decanted, or repackaged.',
      'In accordance with the UK Food Information Regulations 2014 (FIR), complete ingredient lists, nutritional tables, Best Before dates, and bolded allergen declarations appear directly on every manufacturer pack.',
      'Manufacturers occasionally update recipes; please always inspect the physical product label upon collection at the campus hub before consuming if you have food allergies or intolerances.',
    ],
  },
  refunds: {
    title: 'Automatic Pool Refunds & UK Consumer Contracts Regs 2013',
    subtitle: 'Guaranteed 100% automatic refund on any unfilled overflow slot.',
    points: [
      'At the weekly drop cutoff, every 100% filled bulk case (and any shelf-stable box underwritten by Divly) is locked for Saturday campus hub collection.',
      'Any share sitting in an unfilled overflow case at cutoff is automatically refunded in full — cash payments are refunded to your original payment method and any Divly Wallet Credit used is immediately restored.',
      'For sealed non-perishable ambient items and household toiletries, you also retain your statutory 14-day cancellation right under the UK Consumer Contracts Regulations 2013 provided factory seals remain unbroken.',
    ],
  },
  privacy: {
    title: 'UoB Student Privacy & Campus Contact (UK GDPR)',
    subtitle: 'Minimal campus data, encrypted sessions, and zero card storage.',
    points: [
      'We collect only your verified @student.bham.ac.uk / @bham.ac.uk email address, first name for your pickup bag label, and bulk pool order history.',
      'Card, Apple Pay, and Google Pay payments are processed via Stripe Checkout — Divly servers never see or store card numbers.',
      'Need help with a Saturday hub collection, missing item, or account deletion request? Speak to the hub team during your pickup window or email support@divly-uob.co.uk.',
    ],
  },
};

export function LegalFooter() {
  const { settings } = useApp();
  const [openPolicy, setOpenPolicy] = useState<PolicyKey | null>(null);

  const activePolicy = openPolicy ? POLICY_DETAILS[openPolicy] : null;

  return (
    <footer className="border-t border-gray-200 bg-white mt-auto">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs text-gray-600">
          <div>
            <span className="font-extrabold text-gray-900">{BRAND_NAME}</span> · {CAMPUS_NAME}{' '}
            Student Bulk-Buying Platform
            {settings && (
              <span className="block sm:inline sm:ml-2 text-gray-500">
                · Hub: <strong className="text-gray-700">{settings.hubName}</strong> (
                {settings.pickupWindow})
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              type="button"
              onClick={() => setOpenPolicy('allergens')}
              className="inline-flex items-center gap-1 text-gray-600 hover:text-emerald-700 font-medium cursor-pointer"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-emerald-600" />
              <span>Sealed Goods &amp; Allergens (FIR 2014)</span>
            </button>
            <button
              type="button"
              onClick={() => setOpenPolicy('refunds')}
              className="inline-flex items-center gap-1 text-gray-600 hover:text-emerald-700 font-medium cursor-pointer"
            >
              <RefreshCcw className="w-3.5 h-3.5 text-emerald-600" />
              <span>Auto-Refunds &amp; Terms</span>
            </button>
            <button
              type="button"
              onClick={() => setOpenPolicy('privacy')}
              className="inline-flex items-center gap-1 text-gray-600 hover:text-emerald-700 font-medium cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5 text-emerald-600" />
              <span>Student Privacy &amp; Contact</span>
            </button>
            <a
              href="/flyer.html"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800 font-semibold"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Hall Poster</span>
            </a>
          </div>
        </div>

        <p className="text-[11px] text-gray-400 border-t border-gray-100 pt-3">
          100% factory-sealed ambient multipacks &amp; household essentials. Always check manufacturer packaging for allergens before consumption. Independent student enterprise — not an official department of the {CAMPUS_NAME}.
        </p>
      </div>

      {activePolicy && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpenPolicy(null);
          }}
        >
          <div className="card max-w-lg w-full p-5 sm:p-6 bg-white shadow-xl space-y-3.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-extrabold text-gray-900 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{activePolicy.title}</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">{activePolicy.subtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpenPolicy(null)}
                aria-label="Close policy dialog"
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <ul className="space-y-2.5 text-xs sm:text-sm text-gray-700 list-disc pl-4">
              {activePolicy.points.map((point, idx) => (
                <li key={idx}>{point}</li>
              ))}
            </ul>

            <div className="pt-2 flex justify-end">
              <button type="button" onClick={() => setOpenPolicy(null)} className="btn-primary !py-1.5 !px-4">
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </footer>
  );
}
