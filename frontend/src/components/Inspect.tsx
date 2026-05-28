/* AI sack inspector — opens the camera, captures one frame, sends it to
 * /inspect and renders the breakdown. The backend currently returns a
 * deterministic mock (see /backend/app/routers/inspect.py); the production
 * swap is one URL change. */

import { useEffect, useRef, useState } from "react";
import { api, InspectResult } from "../api";
import { Btn } from "./ui";
import clsx from "clsx";

const MATERIALS = ["PET", "PAPER", "CARDBOARD", "METAL", "GLASS"];

export function InspectModal({ defaultMaterial = "PET", onClose, onResult }: {
  defaultMaterial?: string;
  onClose: () => void;
  onResult?: (r: InspectResult) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [material, setMaterial] = useState(defaultMaterial);
  const [streaming, setStreaming] = useState<"starting" | "ready" | "error">("starting");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<InspectResult | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let mounted = true;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: 720, height: 720 },
          audio: false,
        });
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStreaming("ready");
      } catch (e: any) {
        setStreaming("error");
        setErr(e?.message || "Camera not available");
      }
    })();
    return () => {
      mounted = false;
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, []);

  const capture = async () => {
    const v = videoRef.current, c = canvasRef.current;
    if (!v || !c) return;
    c.width = v.videoWidth || 480;
    c.height = v.videoHeight || 480;
    c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
    setBusy(true);
    try {
      const blob: Blob = await new Promise(resolve => c.toBlob(b => resolve(b!), "image/jpeg", 0.85)!);
      const r = await api.inspect(material, blob);
      setResult(r);
      onResult?.(r);
    } catch (e: any) {
      setErr(e?.message || "Inspect failed");
    } finally {
      setBusy(false);
    }
  };

  // Fallback: upload a still image if camera is denied
  const uploadFallback = async (file: File) => {
    setBusy(true);
    try {
      const r = await api.inspect(material, file);
      setResult(r);
      onResult?.(r);
    } catch (e: any) {
      setErr(e?.message || "Inspect failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-bg/90 backdrop-blur-md z-[1000] grid place-items-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-panel border border-line rounded-2xl max-w-lg w-full shadow-card overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-line/60 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-accent2 flex items-center gap-1.5">
              <span>🧠</span> AI sack inspector
            </div>
            <div className="font-display text-xl tracking-tight2 mt-0.5">Point at the open sack</div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-slate-100 text-xl leading-none">×</button>
        </div>

        {!result ? (
          <>
            <div className="px-5 py-3 border-b border-line/40 flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.14em] text-muted">Declared material:</span>
              <div className="flex gap-1">
                {MATERIALS.map(m => (
                  <button key={m} onClick={() => setMaterial(m)}
                    className={clsx("px-2 py-1 text-[11px] rounded border transition",
                      material === m ? "bg-accent text-bg border-accent font-semibold" : "bg-bg/40 border-line/60 hover:border-accent/50")}>
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative bg-black aspect-video">
              <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
              <canvas ref={canvasRef} className="hidden" />
              {streaming === "ready" && (
                <div className="absolute inset-0 pointer-events-none grid place-items-center">
                  <div className="w-3/5 aspect-square border-2 border-accent2/80 rounded-2xl" />
                </div>
              )}
              {streaming === "starting" && <div className="absolute inset-0 grid place-items-center text-muted text-sm">Starting camera…</div>}
              {streaming === "error" && (
                <div className="absolute inset-0 grid place-items-center p-4 text-center">
                  <div>
                    <div className="text-3xl mb-2">📷</div>
                    <div className="text-sm text-danger mb-3">{err}</div>
                    <label className="text-xs text-accent cursor-pointer hover:underline">
                      upload an image instead
                      <input type="file" accept="image/*" className="hidden"
                        onChange={(e) => e.target.files?.[0] && uploadFallback(e.target.files[0])} />
                    </label>
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-4 flex items-center justify-between">
              <div className="text-[10px] text-muted">Production swap: YOLO / GPT-4V</div>
              <Btn variant="cream" disabled={busy || streaming !== "ready"} onClick={capture}>
                {busy ? "Analysing…" : "📸 Capture & analyse"}
              </Btn>
            </div>
          </>
        ) : (
          <InspectResultPanel r={result} onClose={onClose} onRetake={() => setResult(null)} />
        )}
      </div>
    </div>
  );
}

function InspectResultPanel({ r, onClose, onRetake }: { r: InspectResult; onClose: () => void; onRetake: () => void }) {
  const grade = r.quality_grade;
  const gradeColor = grade === "A" ? "text-accent" : grade === "B" ? "text-accent2" : "text-danger";
  return (
    <div className="p-5 space-y-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted">Quality grade</div>
          <div className={clsx("font-display text-5xl tracking-tight2", gradeColor)}>{grade}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted">Confidence</div>
          <div className="font-display text-2xl tracking-tight2 text-cream">{(r.confidence * 100).toFixed(0)}%</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted">Price adjustment</div>
          <div className={clsx("font-display text-2xl tracking-tight2",
            r.price_adjustment_pct === 0 ? "text-accent" : "text-danger")}>
            {r.price_adjustment_pct >= 0 ? "+" : ""}{r.price_adjustment_pct}%
          </div>
        </div>
      </div>

      <div className="bg-bg/40 border border-line/60 rounded-xl p-4 space-y-2.5">
        <div className="text-[10px] uppercase tracking-[0.14em] text-muted">Material breakdown</div>
        <Bar label={r.breakdown.primary.label} pct={r.breakdown.primary.pct} color="bg-accent" />
        <Bar label={r.breakdown.secondary.label} pct={r.breakdown.secondary.pct} color="bg-accent2" />
        <Bar label={r.breakdown.contamination.label} pct={r.breakdown.contamination.pct} color="bg-danger" />
      </div>

      <div className="text-sm text-slate-200 bg-accent2/10 border border-accent2/30 rounded-xl p-3">
        💡 {r.advisory}
      </div>

      <div className="text-[10px] text-muted">{r.production_note}</div>

      <div className="flex justify-end gap-2 pt-1">
        <Btn variant="ghost" onClick={onRetake}>Re-take</Btn>
        <Btn variant="cream" onClick={onClose}>Use this</Btn>
      </div>
    </div>
  );
}

function Bar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs mb-1">
        <span className="text-cream">{label}</span>
        <span className="text-muted mono">{pct.toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-bg/60 rounded-full overflow-hidden">
        <div className={clsx("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
