import { useEffect, useMemo, useState } from "react";
import { useCurrentUser, useFreshMode } from "../session";
import { api, Recovery } from "../api";
import { Btn, Hash, Eyebrow, Reveal } from "../components/ui";
import { EmptyOnboarding } from "../components/EmptyState";
import { QrCode } from "../components/Qr";
import clsx from "clsx";

/** The Ragpicker view is NOT a daily-driver dashboard.
 * In real life a ragpicker doesn't open apps.
 * This page is the **kiosk view** an NGO field worker (or the ragpicker
 * themselves with help) uses to look up their on-chain history by typing
 * a slip code (or their booklet ID). */

export default function Ragpicker() {
  const [user] = useCurrentUser();
  const [fresh] = useFreshMode();
  const [recoveries, setRecoveriesRaw] = useState<Recovery[]>([]);
  const [zoomed, setZoomed] = useState<Recovery | null>(null);
  const [search, setSearch] = useState("");

  if (!user || user.role !== "ragpicker") {
    return <Gate expected="ragpicker" />;
  }

  const setRecoveries = (r: Recovery[]) => setRecoveriesRaw(fresh ? [] : r);

  const refresh = async () => {
    const r = await api.recoveries({ ragpicker_phone: user.phone });
    setRecoveries(r);
  };
  useEffect(() => { refresh(); }, [user?.id, fresh]);

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    if (!q) return recoveries;
    return recoveries.filter(r => r.recovery_code.toUpperCase().includes(q));
  }, [recoveries, search]);

  const sold = recoveries.filter(r => r.batch_id);
  const totalKg = sold.reduce((s, r) => s + r.weight_kg, 0);
  const totalInr = sold.reduce((s, r) => s + (r.sold_price_inr || 0), 0);

  if (fresh) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        <Reveal>
          <header>
            <Eyebrow>Stage 3 · Ragpicker · Day 1</Eyebrow>
            <h1 className="font-display text-4xl md:text-5xl tracking-tight2 mt-3">{user.name}</h1>
            <p className="text-sm text-muted mt-2">Booklet ID <span className="mono text-cream">{user.phone}</span> · just issued</p>
          </header>
        </Reveal>

        <Reveal delay={100}>
          <EmptyOnboarding
            emoji="🎫"
            title="No slips yet."
            body={
              <>
                You got your QR booklet from the NGO yesterday. Every time you sell a sack to a kabadiwala, they'll <span className="text-cream">tear off a slip</span> with the weight + price + a QR code, and give it to you. Bring any slip to any kiosk to look up the chain record.
              </>
            }
            secondary="No phone needed. No app. Identity = the booklet number. Privacy by design."
          />
        </Reveal>

        <div className="text-center">
          <p className="text-sm text-muted">Switch to <span className="text-accent">Established</span> to see slips populated for an active ragpicker.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-10">
      <Reveal>
        <header>
          <Eyebrow>Stage 3 · Ragpicker kiosk</Eyebrow>
          <h1 className="font-display text-4xl md:text-5xl tracking-tight2 mt-3 leading-tight">
            <span className="text-cream">{user.name}</span>
          </h1>
          <p className="text-sm text-muted mt-2">Booklet ID <span className="mono text-cream">{user.phone}</span> · {user.area}</p>
          <p className="text-slate-400 max-w-2xl mt-4 text-[15px] leading-relaxed">
            Ragpickers don't carry phones — they carry <span className="text-cream">paper QR receipt slips</span>. This is the kiosk view where they (or an NGO field worker) can scan any slip and see what's been recorded for them on the chain. Anonymous by design — identity is the booklet number, not a name or phone.
          </p>
        </header>
      </Reveal>

      <Reveal delay={100}>
        <div className="grid sm:grid-cols-3 gap-6 border-t border-line/60 pt-8">
          <BigNum value={totalKg.toFixed(0)} suffix=" kg" label="Recovered all-time" />
          <BigNum value={`₹${totalInr.toFixed(0)}`} label="Earnings on chain" accent="cream" />
          <BigNum value={sold.length} label="Sacks sold" />
        </div>
      </Reveal>

      <Reveal delay={200}>
        <div className="bg-panel/40 border border-line/60 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">🎫</span>
            <div>
              <div className="font-display text-xl tracking-tight2">Look up a receipt slip</div>
              <div className="text-xs text-muted">Type or scan the code printed on any paper slip you have.</div>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="e.g. RR-2026-0042"
              className="flex-1 bg-bg/60 border border-line/80 focus:border-accent rounded-xl px-4 py-3 text-base outline-none mono"
            />
            <Btn variant="cream" size="lg" onClick={() => setSearch("")}>Clear</Btn>
          </div>
        </div>
      </Reveal>

      <Reveal delay={300}>
        <div>
          <div className="flex items-baseline justify-between mb-4">
            <div className="font-display text-2xl tracking-tight2">
              {search ? `Showing ${filtered.length} match${filtered.length === 1 ? "" : "es"}` : `All ${recoveries.length} slips`}
            </div>
            <div className="text-[11px] text-muted">click any card for the full receipt</div>
          </div>
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted text-sm">No slips match "{search}".</div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.slice(0, 18).map(r => (
                <SlipCard key={r.id} r={r} onClick={() => setZoomed(r)} />
              ))}
            </div>
          )}
        </div>
      </Reveal>

      {zoomed && <SlipZoom r={zoomed} onClose={() => setZoomed(null)} />}
    </div>
  );
}

function BigNum({ value, suffix = "", label, accent = "accent" }: { value: any; suffix?: string; label: string; accent?: "accent" | "cream" }) {
  const color = accent === "cream" ? "text-cream" : "text-accent";
  return (
    <div>
      <div className={`font-display text-5xl tracking-tight2 ${color}`}>{value}{suffix}</div>
      <div className="text-xs uppercase tracking-[0.14em] text-muted mt-2">{label}</div>
    </div>
  );
}

function SlipCard({ r, onClick }: { r: Recovery; onClick: () => void }) {
  const sold = !!r.batch_id;
  return (
    <button onClick={onClick}
      className={clsx(
        "text-left rounded-2xl p-5 transition-all border group hover:-translate-y-0.5 hover:shadow-card",
        sold ? "bg-panel/60 border-line/60 hover:border-accent/50" : "bg-panel/40 border-line/40 hover:border-accent2/50"
      )}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="mono text-[11px] text-muted">{r.recovery_code}</div>
          <div className="font-display text-2xl tracking-tight2 text-cream mt-1">{r.weight_kg} kg</div>
          <div className="text-xs text-muted mt-0.5">{r.material_type}</div>
        </div>
        <QrSquare code={r.recovery_code} />
      </div>
      <div className="flex items-center justify-between text-[11px] mt-3 pt-3 border-t border-line/40">
        <span className="text-muted">{new Date(r.captured_at).toLocaleDateString()}</span>
        {sold ? (
          <span className="text-accent font-medium">₹{r.sold_price_inr?.toFixed(0)}</span>
        ) : (
          <span className="text-accent2">unsold</span>
        )}
      </div>
    </button>
  );
}

function SlipZoom({ r, onClose }: { r: Recovery; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-bg/90 backdrop-blur-md z-[1000] grid place-items-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-cream text-bg rounded-2xl max-w-md w-full shadow-glow border-8 border-cream" onClick={(e) => e.stopPropagation()}>
        {/* Designed as a real paper slip — light cream stock, like a paan-shop receipt */}
        <div className="px-6 py-4 border-b border-dashed border-bg/20 flex items-center justify-between">
          <div>
            <div className="text-[9px] uppercase tracking-[0.18em] text-bg/60">WasteChain · receipt</div>
            <div className="font-display text-xl tracking-tight2 mt-0.5">{r.recovery_code}</div>
          </div>
          <div className="text-[10px] text-bg/60 mono text-right">
            {new Date(r.captured_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
          </div>
        </div>
        <div className="px-6 py-6">
          <div className="grid grid-cols-3 gap-4 items-center">
            <div className="col-span-2">
              <div className="text-[10px] uppercase tracking-[0.14em] text-bg/60">Material</div>
              <div className="font-display text-3xl tracking-tight2">{r.material_type}</div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-bg/60 mt-4">Weight</div>
              <div className="font-display text-3xl tracking-tight2">{r.weight_kg} <span className="text-lg text-bg/60">kg</span></div>
              {r.sold_price_inr && (
                <>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-bg/60 mt-4">Paid</div>
                  <div className="font-display text-3xl tracking-tight2">₹{r.sold_price_inr.toFixed(0)}</div>
                </>
              )}
            </div>
            <div className="grid place-items-center">
              <QrSquare code={r.recovery_code} large />
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-dashed border-bg/20 text-[10px] text-bg/60 mono break-all">
          on chain · {r.record_hash.slice(0, 24)}…
        </div>
        <div className="px-6 pb-6 text-center">
          <button onClick={onClose} className="text-xs text-bg/70 hover:text-bg transition">Tap to close</button>
        </div>
      </div>
    </div>
  );
}

function QrSquare({ code, large = false }: { code: string; large?: boolean }) {
  // Real scannable QR — point any phone camera at this to read the recovery code.
  return (
    <div className={clsx("bg-cream rounded", large ? "p-1.5" : "p-0.5")}>
      <QrCode value={code} size={large ? 132 : 44} />
    </div>
  );
}

function Gate({ expected }: { expected: string }) {
  return (
    <div className="max-w-2xl mx-auto px-6 py-24 text-center">
      <div className="text-5xl mb-4">🔒</div>
      <div className="font-display text-2xl tracking-tight2">Switch to a {expected} persona</div>
      <p className="text-sm text-muted mt-2">Open the persona picker top-right and pick someone whose role is <span className="text-accent">{expected}</span>.</p>
    </div>
  );
}
