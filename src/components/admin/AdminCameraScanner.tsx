import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, X } from 'lucide-react';

interface BarcodeDetectorInstance {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
}

interface BarcodeDetectorConstructor {
  new (options: { formats: string[] }): BarcodeDetectorInstance;
}

interface AdminCameraScannerProps {
  open: boolean;
  onDetected: (rawQrValue: string) => void;
  onClose: () => void;
}

/**
 * Live rear-camera QR scanner using the browser's native `BarcodeDetector` API.
 * Gracefully explains fallback PIN/code entry when opened on unsupported desktop browsers.
 */
export function AdminCameraScanner({ open, onDetected, onClose }: AdminCameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [statusMsg, setStatusMsg] = useState<string>('Starting camera…');
  const [unsupportedMsg, setUnsupportedMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    let stream: MediaStream | null = null;
    let timerId: number | null = null;

    async function startScanner() {
      setUnsupportedMsg(null);
      setStatusMsg('Requesting camera access…');

      if (!navigator.mediaDevices?.getUserMedia) {
        setUnsupportedMsg(
          'Camera access is unavailable in this browser context (HTTPS or localhost required). Enter the UOB-XXXXXX pass code or 6-digit PIN below instead.',
        );
        return;
      }

      const DetectorCtor = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor })
        .BarcodeDetector;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }

        if (!DetectorCtor) {
          setUnsupportedMsg(
            'Camera preview active, but native BarcodeDetector is not enabled in this desktop browser. Scan using Chrome on Android/macOS or enter the 6-digit PIN below.',
          );
          return;
        }

        const detector = new DetectorCtor({ formats: ['qr_code'] });
        setStatusMsg('Point camera at student Divly QR pass…');

        const scanTick = async () => {
          if (cancelled || !videoRef.current) return;
          if (videoRef.current.readyState >= 2) {
            try {
              const codes = await detector.detect(videoRef.current);
              const hit = codes.find((c) => c.rawValue && c.rawValue.trim().length > 0);
              if (hit?.rawValue) {
                stream?.getTracks().forEach((t) => t.stop());
                onDetected(hit.rawValue.trim());
                return;
              }
            } catch {
              // Ignore transient frame decode errors
            }
          }
          timerId = window.setTimeout(scanTick, 250);
        };

        timerId = window.setTimeout(scanTick, 300);
      } catch (err) {
        if (!cancelled) {
          setUnsupportedMsg(
            err instanceof Error
              ? `Camera permission declined (${err.message}). Type the UOB-XXXXXX pass code or 6-digit PIN below.`
              : 'Could not start camera. Type the UOB-XXXXXX pass code or 6-digit PIN below.',
          );
        }
      }
    }

    void startScanner();

    return () => {
      cancelled = true;
      if (timerId !== null) window.clearTimeout(timerId);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [open, onDetected]);

  if (!open) return null;

  return (
    <div className="rounded-xl border border-emerald-300 bg-slate-950 p-4 text-white space-y-3">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-400">
          <Camera className="h-4 w-4" /> Live Hub Camera QR Scanner
        </span>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700"
        >
          <X className="h-3.5 w-3.5" /> Stop Camera
        </button>
      </div>

      <div className="relative mx-auto max-w-sm overflow-hidden rounded-xl border border-slate-800 bg-slate-900 aspect-video flex items-center justify-center">
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-6 rounded-xl border-2 border-dashed border-emerald-400/70" />
      </div>

      {unsupportedMsg ? (
        <div className="flex items-start gap-2 rounded-lg bg-amber-950/80 border border-amber-700 px-3 py-2 text-xs text-amber-200">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
          <span>{unsupportedMsg}</span>
        </div>
      ) : (
        <p className="text-center text-xs text-slate-300">{statusMsg}</p>
      )}
    </div>
  );
}
