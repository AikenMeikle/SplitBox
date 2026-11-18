/**
 * Student OTP & Admin PIN authentication modal for Divly.
 *
 * Supports:
 * 1. UoB Student 6-digit email OTP (`@student.bham.ac.uk` / `@bham.ac.uk`),
 *    automatically showing a clickable `devOtpCode` helper box in local dev mode!
 * 2. Founder / Admin PIN login (`POST /api/auth/admin-login`).
 * 3. Instant 1-click Dev Student / Dev Admin buttons when `devMode === true`.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, KeyRound, Mail, ShieldCheck, X, Zap } from 'lucide-react';
import { ALLOWED_EMAIL_DOMAINS, BRAND_NAME, CAMPUS_NAME } from '../config/brand';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/api';
import type { AuthUser } from '../shared/types';

type AuthMode = 'student' | 'admin';

export function AuthModal() {
  const {
    isAuthModalOpen,
    setIsAuthModalOpen,
    devMode,
    loginWithToken,
    setActiveTab,
  } = useApp();

  const [mode, setMode] = useState<AuthMode>('student');

  // Student OTP state
  const [studentName, setStudentName] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Admin PIN state
  const [adminPin, setAdminPin] = useState('');
  const [adminEmail, setAdminEmail] = useState('');

  // Shared UI status
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Allow Navbar's "Admin" button to pre-select the Admin tab before opening
  useEffect(() => {
    const handleTabSwitch = (event: Event) => {
      const custom = event as CustomEvent<AuthMode>;
      if (custom.detail === 'admin' || custom.detail === 'student') {
        setMode(custom.detail);
        setError(null);
      }
    };
    window.addEventListener('divly:auth-tab', handleTabSwitch);
    return () => window.removeEventListener('divly:auth-tab', handleTabSwitch);
  }, []);

  // Close modal on Escape key
  useEffect(() => {
    if (!isAuthModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsAuthModalOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isAuthModalOpen, setIsAuthModalOpen]);

  if (!isAuthModalOpen) return null;

  async function handleRequestOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setBusy(true);

    try {
      const res = await apiFetch<{ ok: boolean; message: string; devOtpCode?: string }>(
        '/api/auth/request-otp',
        {
          method: 'POST',
          body: JSON.stringify({
            email: studentEmail.trim(),
            name: studentName.trim() || undefined,
          }),
        }
      );
      setOtpRequested(true);
      setInfoMessage(res.message);
      if (res.devOtpCode) {
        setDevOtpHint(res.devOtpCode);
        setOtpCode(res.devOtpCode);
      } else {
        setDevOtpHint(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send verification code.');
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const res = await apiFetch<{ token: string; user: AuthUser }>('/api/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({
          email: studentEmail.trim(),
          code: otpCode.trim(),
          name: studentName.trim() || undefined,
        }),
      });
      loginWithToken(res.token, res.user);
      resetStudentFlow();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid verification code.');
    } finally {
      setBusy(false);
    }
  }

  async function handleAdminLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const res = await apiFetch<{ token: string; user: AuthUser }>('/api/auth/admin-login', {
        method: 'POST',
        body: JSON.stringify({
          pin: adminPin.trim(),
          email: adminEmail.trim() || undefined,
        }),
      });
      loginWithToken(res.token, res.user);
      setAdminPin('');
      setActiveTab('admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid Admin PIN.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDevLogin(role: 'student' | 'admin') {
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch<{ token: string; user: AuthUser }>('/api/auth/dev-login', {
        method: 'POST',
        body: JSON.stringify({ role }),
      });
      loginWithToken(res.token, res.user);
      if (role === 'admin') {
        setActiveTab('admin');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dev login failed.');
    } finally {
      setBusy(false);
    }
  }

  function resetStudentFlow() {
    setOtpRequested(false);
    setOtpCode('');
    setDevOtpHint(null);
    setInfoMessage(null);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="divly-auth-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) setIsAuthModalOpen(false);
      }}
    >
      <div className="card w-full max-w-md p-5 sm:p-6 space-y-4 bg-white shadow-xl">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="divly-auth-title" className="text-lg font-extrabold text-gray-900">
              Sign in to {BRAND_NAME}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {CAMPUS_NAME} campus bulk grocery pooling
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsAuthModalOpen(false)}
            aria-label="Close sign-in modal"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-gray-100">
          <button
            type="button"
            onClick={() => {
              setMode('student');
              setError(null);
            }}
            className={`inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
              mode === 'student'
                ? 'bg-white text-gray-900 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Mail className="w-3.5 h-3.5 text-emerald-600" />
            <span>UoB Student OTP</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('admin');
              setError(null);
            }}
            className={`inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
              mode === 'admin'
                ? 'bg-white text-gray-900 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Admin Login</span>
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-700">
            {error}
          </div>
        )}

        {/* TAB 1: Student Email + 6-Digit OTP Flow */}
        {mode === 'student' ? (
          !otpRequested ? (
            <form onSubmit={(e) => void handleRequestOtp(e)} className="space-y-3">
              <div>
                <label htmlFor="student-name" className="block text-xs font-semibold text-gray-700 mb-1">
                  First name (for your Saturday pickup label)
                </label>
                <input
                  id="student-name"
                  type="text"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="e.g. Alex"
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label htmlFor="student-email" className="block text-xs font-semibold text-gray-700 mb-1">
                  University email address
                </label>
                <input
                  id="student-email"
                  type="email"
                  required
                  value={studentEmail}
                  onChange={(e) => setStudentEmail(e.target.value)}
                  placeholder={`alex${ALLOWED_EMAIL_DOMAINS[0]}`}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Accepted domains: {ALLOWED_EMAIL_DOMAINS.join(' or ')}
                </p>
              </div>

              <button type="submit" disabled={busy || !studentEmail.trim()} className="btn-primary w-full">
                {busy ? 'Sending 6-digit code…' : 'Send 6-Digit Login Code'}
              </button>
            </form>
          ) : (
            <form onSubmit={(e) => void handleVerifyOtp(e)} className="space-y-3">
              {infoMessage && (
                <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-700">
                  {infoMessage}
                </div>
              )}

              {/* Local Dev Helper Box when server returns devOtpCode */}
              {devOtpHint && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-2">
                  <div className="text-xs text-emerald-900">
                    <span className="font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Local Dev OTP Code:</span>
                    </span>
                    <span className="font-mono-code text-base font-extrabold tracking-widest text-emerald-800">
                      {devOtpHint}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOtpCode(devOtpHint)}
                    className="btn-secondary !py-1 !px-2.5 !text-xs"
                  >
                    Use Code
                  </button>
                </div>
              )}

              <div>
                <label htmlFor="otp-code" className="block text-xs font-semibold text-gray-700 mb-1">
                  6-digit verification code sent to <span className="text-gray-900">{studentEmail}</span>
                </label>
                <input
                  id="otp-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-center font-mono-code text-lg font-bold tracking-widest focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={resetStudentFlow}
                  className="btn-secondary flex-1"
                >
                  Change Email
                </button>
                <button
                  type="submit"
                  disabled={busy || otpCode.length !== 6}
                  className="btn-primary flex-1"
                >
                  {busy ? 'Verifying…' : 'Verify & Sign In'}
                </button>
              </div>
            </form>
          )
        ) : (
          /* TAB 2: Admin PIN Login */
          <form onSubmit={(e) => void handleAdminLogin(e)} className="space-y-3">
            <div>
              <label htmlFor="admin-pin" className="block text-xs font-semibold text-gray-700 mb-1">
                Founder / Hub Admin PIN
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="admin-pin"
                  type="password"
                  required
                  value={adminPin}
                  onChange={(e) => setAdminPin(e.target.value)}
                  placeholder="Enter ADMIN_PIN"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label htmlFor="admin-email" className="block text-xs font-semibold text-gray-700 mb-1">
                Admin email (optional)
              </label>
              <input
                id="admin-email"
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="founder@student.bham.ac.uk"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>

            <button type="submit" disabled={busy || !adminPin.trim()} className="btn-primary w-full">
              {busy ? 'Signing in…' : 'Unlock Admin Ops'}
            </button>
          </form>
        )}

        {/* Instant 1-Click Dev Sign-In (strictly visible ONLY when devMode === true) */}
        {devMode && (
          <div className="pt-3 border-t border-gray-100 space-y-2">
            <p className="text-[11px] font-semibold text-gray-500 flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-emerald-600" />
              <span>Local Dev Mode — Instant 1-Click Sign In:</span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleDevLogin('student')}
                className="btn-secondary !py-1.5 !text-xs"
              >
                1-Click Dev Student
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleDevLogin('admin')}
                className="btn-secondary !py-1.5 !text-xs"
              >
                1-Click Dev Admin
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
