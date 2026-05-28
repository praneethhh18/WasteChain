/* Camera-based photo evidence capture for handoff confirmation.
 *
 * Required field at the receive-confirm boundary. The photo's hash gets
 * folded into the handoff's chain record_hash, so swapping the image later
 * breaks the link.
 *
 * Falls back to file upload if camera access is denied.
 */

import { useEffect, useRef, useState } from "react";
import { Btn } from "./ui";
import clsx from "clsx";

export function PhotoCapture({ value, onCapture, label = "Photo evidence" }: {
  value?: string | null;
  onCapture: (dataUrl: string | null) => void;
  label?: string;
}) {
  const [mode, setMode] = useState<"idle" | "camera" | "captured">("idle");
  const [err, setErr] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => () => {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
  }, []);

  const openCamera = async () => {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: 640, height: 480 },
        audio: false,
      });
      streamRef.current = stream;
      setMode("camera");
      // Defer until video element is mounted
      setTimeout(() => {
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); }
      }, 50);
    } catch (e: any) {
      setErr(e?.message || "Camera unavailable");
    }
  };

  const capture = () => {
    const v = videoRef.current, c = canvasRef.current;
    if (!v || !c) return;
    c.width = v.videoWidth || 640;
    c.height = v.videoHeight || 480;
    c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL("image/jpeg", 0.7);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setMode("captured");
    onCapture(dataUrl);
  };

  const retake = () => {
    onCapture(null);
    openCamera();
  };

  const onFile = (file: File) => {
    const r = new FileReader();
    r.onload = () => { onCapture(r.result as string); setMode("captured"); };
    r.readAsDataURL(file);
  };

  return (
    <div className="bg-bg/40 border border-line/60 rounded-xl p-3">
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted mb-2 flex items-center justify-between">
        <span>📷 {label} <span className="text-danger">*</span></span>
        <span className="text-accent2 text-[9px]">hash folded into chain</span>
      </div>

      {mode === "idle" && !value && (
        <div className="space-y-2">
          <Btn variant="cream" size="md" onClick={openCamera}>📸 Open camera</Btn>
          <label className="text-[11px] text-muted block">
            or <input type="file" accept="image/*" capture="environment" className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            <span className="text-accent cursor-pointer hover:underline"
              onClick={(e) => (e.currentTarget.previousElementSibling as HTMLInputElement)?.click()}>upload from gallery</span>
          </label>
          {err && <div className="text-[11px] text-danger">{err}</div>}
        </div>
      )}

      {mode === "camera" && (
        <div className="space-y-2">
          <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
            <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
            <canvas ref={canvasRef} className="hidden" />
          </div>
          <Btn variant="cream" size="md" onClick={capture}>📸 Capture</Btn>
        </div>
      )}

      {(mode === "captured" || value) && (
        <div className="space-y-2">
          <img src={value || ""} alt="evidence" className="rounded-lg max-h-48 w-full object-cover border border-line/60" />
          <div className="flex gap-2 text-[11px]">
            <span className="text-accent">✓ Captured</span>
            <button onClick={retake} className="text-muted hover:text-slate-100 ml-auto">retake</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function PhotoThumb({ dataUrl, hash }: { dataUrl?: string | null; hash?: string | null }) {
  const [open, setOpen] = useState(false);
  if (!dataUrl) return null;
  return (
    <>
      <button onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-[10px] text-accent2 hover:text-accent" title={hash || ""}>
        <img src={dataUrl} alt="proof" className="w-6 h-6 object-cover rounded border border-line/60" />
        <span>📷</span>
      </button>
      {open && (
        <div className="fixed inset-0 bg-bg/90 backdrop-blur-md z-[1000] grid place-items-center p-4 animate-fade-in" onClick={() => setOpen(false)}>
          <div className="bg-panel border border-line rounded-2xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
            <div className="text-[10px] uppercase tracking-[0.18em] text-accent2 mb-2">Photo evidence on chain</div>
            <img src={dataUrl} alt="evidence" className="w-full rounded-lg border border-line/60" />
            {hash && (
              <div className="mt-3 mono text-[10px] text-muted break-all">
                photo hash: {hash}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
