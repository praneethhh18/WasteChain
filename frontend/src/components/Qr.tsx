/* Real QR generation + scanning.
 *
 * QrCode renders a scannable SVG QR for any string (batch code, recovery
 * code, etc). Test it by pointing your phone camera at the screen.
 *
 * QrScanner opens the device camera and decodes a QR in view. Used by
 * aggregator and recycler "confirm receipt" flows so they can scan the
 * sticker on the incoming sack instead of typing the code.
 */

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Html5Qrcode } from "html5-qrcode";
import { Btn } from "./ui";
import clsx from "clsx";

// ─── QrCode — display a real scannable QR ──────────────────────────────

export function QrCode({ value, size = 160, className = "" }: { value: string; size?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    QRCode.toCanvas(c, value || " ", {
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#0a0d0b", light: "#f5e6d3" },
    }).catch(() => {});
  }, [value, size]);
  return <canvas ref={ref} width={size} height={size} className={clsx("rounded", className)} title={value} />;
}

// ─── QrScanner — open the camera and decode a QR ───────────────────────

export function QrScanner({ onScan, onClose, prefix = "WC-" }: {
  onScan: (code: string) => void;
  onClose: () => void;
  /** Optional accepted prefix(es). Comma-separated. Defaults to "WC-" (batches). */
  prefix?: string;
}) {
  const elemId = "wc-qr-scanner";
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [status, setStatus] = useState<"starting" | "ready" | "error" | "scanned">("starting");
  const [err, setErr] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  useEffect(() => {
    let mounted = true;
    const start = async () => {
      try {
        if (!Html5Qrcode.getCameras) {
          setStatus("error"); setErr("Camera API not available in this browser"); return;
        }
        const cams = await Html5Qrcode.getCameras();
        if (!cams || cams.length === 0) {
          setStatus("error"); setErr("No camera detected"); return;
        }
        // Prefer rear camera
        const rear = cams.find(c => /back|rear|environment/i.test(c.label)) || cams[cams.length - 1];
        const s = new Html5Qrcode(elemId);
        scannerRef.current = s;
        await s.start(
          { deviceId: { exact: rear.id } },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decoded) => {
            if (!mounted) return;
            const prefixes = prefix.split(",").map(p => p.trim());
            if (prefixes.some(p => decoded.startsWith(p))) {
              setStatus("scanned");
              s.stop().catch(() => {});
              onScan(decoded);
            }
          },
          () => { /* decoding misses are normal; ignore */ }
        );
        if (mounted) setStatus("ready");
      } catch (e: any) {
        setStatus("error");
        setErr(e?.message || "Could not start camera. Check browser permissions.");
      }
    };
    start();
    return () => {
      mounted = false;
      const s = scannerRef.current;
      if (s) { s.stop().catch(() => {}); s.clear(); }
    };
  }, []);

  const submitManual = () => {
    if (!manual.trim()) return;
    onScan(manual.trim().toUpperCase());
  };

  return (
    <div className="fixed inset-0 bg-bg/90 backdrop-blur-md z-[1000] grid place-items-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-panel border border-line rounded-2xl max-w-md w-full shadow-card overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-line/60 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted">QR scanner</div>
            <div className="font-display text-xl tracking-tight2 mt-0.5">Point at the sticker</div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-slate-100 text-xl leading-none">×</button>
        </div>

        <div className="relative bg-black aspect-square">
          <div id={elemId} className="absolute inset-0" />
          {/* Scanner overlay reticule */}
          {status === "ready" && (
            <div className="absolute inset-0 pointer-events-none grid place-items-center">
              <div className="w-3/5 aspect-square border-2 border-accent/80 rounded-2xl relative">
                <div className="absolute -top-px -left-px w-6 h-6 border-t-4 border-l-4 border-accent rounded-tl-xl" />
                <div className="absolute -top-px -right-px w-6 h-6 border-t-4 border-r-4 border-accent rounded-tr-xl" />
                <div className="absolute -bottom-px -left-px w-6 h-6 border-b-4 border-l-4 border-accent rounded-bl-xl" />
                <div className="absolute -bottom-px -right-px w-6 h-6 border-b-4 border-r-4 border-accent rounded-br-xl" />
              </div>
            </div>
          )}
          {status === "starting" && (
            <div className="absolute inset-0 grid place-items-center text-muted text-sm">Starting camera…</div>
          )}
          {status === "error" && (
            <div className="absolute inset-0 grid place-items-center p-6 text-center">
              <div>
                <div className="text-3xl mb-2">📷</div>
                <div className="text-sm text-danger">{err}</div>
                <div className="text-xs text-muted mt-2">You can still type the code in below.</div>
              </div>
            </div>
          )}
          {status === "scanned" && (
            <div className="absolute inset-0 grid place-items-center text-accent text-2xl font-display tracking-tight2">
              ✓ Scanned
            </div>
          )}
        </div>

        {/* Manual fallback */}
        <div className="px-5 py-4 border-t border-line/60 bg-bg/40">
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted mb-2">Or type the code</div>
          <div className="flex gap-2">
            <input value={manual} onChange={(e) => setManual(e.target.value)}
              placeholder="WC-2026-0042"
              onKeyDown={(e) => e.key === "Enter" && submitManual()}
              className="flex-1 bg-bg/60 border border-line/60 focus:border-accent rounded-lg px-3 py-2 text-sm mono outline-none" />
            <Btn onClick={submitManual} disabled={!manual.trim()}>Use code</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Printable receipt card with real QR ──────────────────────────────

export function PrintableSticker({ code, material, weight, area, hash }: {
  code: string; material?: string; weight?: number; area?: string; hash?: string;
}) {
  return (
    <div className="bg-cream text-bg rounded-xl p-5 border-2 border-bg/10 max-w-sm shadow-glow">
      <div className="flex items-start gap-4">
        <div className="bg-cream p-1.5 rounded">
          <QrCode value={code} size={120} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[9px] uppercase tracking-[0.18em] text-bg/60">WasteChain · sack ID</div>
          <div className="font-display text-xl tracking-tight2 mt-0.5 break-all">{code}</div>
          {material && weight !== undefined && (
            <div className="mt-2.5 text-sm">
              <div className="font-medium">{material}</div>
              <div className="font-display text-2xl tracking-tight2">{weight} <span className="text-base text-bg/70">kg</span></div>
            </div>
          )}
          {area && <div className="text-[10px] text-bg/60 mt-1.5">{area}</div>}
        </div>
      </div>
      {hash && (
        <div className="mt-3 pt-2.5 border-t border-dashed border-bg/20 text-[9px] mono text-bg/60 break-all">
          {hash.slice(0, 36)}…
        </div>
      )}
    </div>
  );
}
