import { useEffect, useState, useMemo } from "react";
import { api, TrustRecord } from "../api";
import { Btn, Eyebrow, Reveal, Stat, Empty, Hash } from "../components/ui";
import clsx from "clsx";

export default function TrustLayer() {
  const [chain, setChain] = useState<TrustRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"all" | "batches" | "handoffs" | "routes" | "broken">("all");

  const refresh = async () => {
    const c = await api.trustChain();
    setChain(c);
    setLoading(false);
  };
  useEffect(() => {
    refresh();
    // Live polling — keeps the dashboard fresh while you run the workflow in
    // another tab (or fire API calls from elsewhere).
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, []);

  const totals = useMemo(() => ({
    total: chain.length,
    ok: chain.filter(r => r.ok).length,
    broken: chain.filter(r => !r.ok).length,
    tampered: chain.filter(r => r.tampered).length,
    batches: chain.filter(r => r.kind === "batch").length,
    handoffs: chain.filter(r => r.kind === "handoff").length,
    routes: chain.filter(r => r.kind === "route").length,
    pickups: chain.filter(r => r.kind === "pickup").length,
    recoveries: chain.filter(r => r.kind === "recovery").length,
  }), [chain]);

  const filtered = chain.filter(r => {
    if (filter === "batches") return r.kind === "batch";
    if (filter === "handoffs") return r.kind === "handoff";
    if (filter === "routes") return r.kind === "route" || r.kind === "pickup" || r.kind === "recovery";
    if (filter === "broken") return !r.ok;
    return true;
  });

  const tamperRecord = async (r: TrustRecord) => {
    if (r.kind !== "batch") return;
    const newW = (r.weight_kg || 0) * 5 + 100;
    setBusy(true);
    try { await api.tamper(r.id, newW); await refresh(); } finally { setBusy(false); }
  };

  const restore = async () => {
    setBusy(true);
    try { await api.restoreChain(); await refresh(); } finally { setBusy(false); }
  };

  const breakageRatio = totals.total > 0 ? (totals.broken / totals.total * 100) : 0;

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-10">
      <Reveal>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Trust layer</Eyebrow>
            <h1 className="font-display text-5xl md:text-6xl tracking-tight2 mt-3 leading-[1.05]">
              SHA-256 ledger.
              <br /><span className="text-muted/60 italic font-light">Inside Postgres.</span>
            </h1>
            <p className="text-slate-300 mt-5 max-w-2xl leading-relaxed">
              Every event in WasteChain is hashed with its predecessor. Mutate any field of any record and every downstream link goes red — instantly. No blockchain, no gas, no validator network. Just an honest chain.
            </p>
          </div>
          <div className="flex gap-2">
            <Btn variant="ghost" onClick={refresh} disabled={busy}>↻ Refresh</Btn>
            {totals.tampered > 0 && (
              <Btn variant="danger" onClick={restore} disabled={busy}>Restore chain</Btn>
            )}
          </div>
        </header>
      </Reveal>

      <Reveal delay={100}>
        <div className="grid md:grid-cols-4 gap-3">
          <Stat label="Total records" value={totals.total} sub="across 5 record kinds" big />
          <Stat label="Verified" value={totals.ok} accent="green" big />
          <Stat label="Broken links" value={totals.broken} accent={totals.broken > 0 ? "red" : "green"} big />
          <Stat label="Tampered rows" value={totals.tampered} accent={totals.tampered > 0 ? "red" : "green"} big />
        </div>
      </Reveal>

      {totals.broken > 0 && (
        <Reveal>
          <div className="bg-danger/10 border border-danger/40 rounded-2xl p-5 flex items-center gap-4">
            <div className="text-3xl">⚠</div>
            <div>
              <div className="font-display text-xl tracking-tight2 text-danger">Chain integrity compromised</div>
              <div className="text-sm text-slate-300 mt-1">
                <span className="text-cream font-medium">{totals.tampered}</span> record(s) tampered, cascading into <span className="text-cream font-medium">{totals.broken}</span> broken downstream links ({breakageRatio.toFixed(1)}% of the chain). In production this would page on-call instantly.
              </div>
            </div>
          </div>
        </Reveal>
      )}

      <Reveal delay={200}>
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
            <div className="flex flex-wrap gap-1.5">
              {([
                ["all", `All · ${totals.total}`],
                ["batches", `Batches · ${totals.batches}`],
                ["handoffs", `Handoffs · ${totals.handoffs}`],
                ["routes", `Upstream · ${totals.routes + totals.pickups + totals.recoveries}`],
                ["broken", `Broken · ${totals.broken}`],
              ] as const).map(([key, label]) => (
                <button key={key} onClick={() => setFilter(key as any)}
                  className={clsx("text-xs px-3 py-1.5 rounded-md border transition",
                    filter === key ? "bg-accent text-bg border-accent font-semibold" : "bg-bg/40 border-line/60 hover:border-accent/40 text-muted")}>
                  {label}
                </button>
              ))}
            </div>
            <div className="text-[11px] text-muted">walk follows previous-hash pointers · genesis → tip</div>
          </div>

          {loading ? <Empty>Loading…</Empty> :
           filtered.length === 0 ? <Empty>No records match filter.</Empty> :
            <div className="space-y-1.5 max-h-[640px] overflow-y-auto pr-2">
              {filtered.map((r, i) => <ChainBlock key={`${r.kind}-${r.id}`} r={r} index={i} onTamper={tamperRecord} busy={busy} />)}
            </div>
          }
        </div>
      </Reveal>
    </div>
  );
}

const KIND_META: Record<string, { emoji: string; tint: string; label: string }> = {
  batch:    { emoji: "🏪", tint: "bg-accent/15 text-accent", label: "Batch" },
  handoff:  { emoji: "🤝", tint: "bg-blue-400/15 text-blue-300", label: "Handoff" },
  route:    { emoji: "🚛", tint: "bg-accent2/15 text-accent2", label: "Route" },
  pickup:   { emoji: "📍", tint: "bg-purple-400/15 text-purple-300", label: "Pickup" },
  recovery: { emoji: "♻️", tint: "bg-emerald-300/15 text-emerald-300", label: "Recovery" },
};

function ChainBlock({ r, index, onTamper, busy }: { r: TrustRecord; index: number; onTamper: (r: TrustRecord) => void; busy: boolean }) {
  const broken = !r.ok;
  const meta = KIND_META[r.kind] || KIND_META.batch;
  return (
    <div className={clsx(
      "flex items-stretch gap-3 rounded-xl border p-3.5 transition",
      broken ? "bg-danger/10 border-danger/50" :
      r.tampered ? "bg-accent2/10 border-accent2/40" :
      "bg-bg/40 border-line/60 hover:border-accent/30"
    )}>
      <div className="flex flex-col items-center pt-0.5 min-w-[44px]">
        <div className={clsx(
          "w-10 h-10 rounded-xl grid place-items-center text-base",
          broken ? "bg-danger text-bg" : meta.tint,
        )}>{meta.emoji}</div>
        <div className="text-[10px] text-muted mt-1">#{index + 1}</div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={clsx("text-[10px] uppercase tracking-[0.14em] font-medium px-1.5 py-0.5 rounded", meta.tint)}>{meta.label}</span>
          <div className="mono text-xs font-semibold">{r.code || `#${r.id}`}</div>
          {r.tampered && <span className="text-[9px] uppercase tracking-[0.14em] bg-danger text-bg px-1.5 py-0.5 rounded font-semibold">TAMPERED</span>}
          {!broken && <span className="text-[9px] uppercase tracking-[0.14em] text-accent">✓ verified</span>}
          {broken && <span className="text-[9px] uppercase tracking-[0.14em] bg-danger text-bg px-1.5 py-0.5 rounded font-semibold">⚠ broken</span>}
        </div>
        <div className="text-xs text-muted mt-1">
          {r.material && <span>{r.material}</span>}
          {r.weight_kg != null && <span> · {r.weight_kg} kg</span>}
          {r.sent_weight != null && <span>sent {r.sent_weight} kg · received {r.received_weight ?? "?"} kg</span>}
          <span> · {new Date(r.created_at).toLocaleString()}</span>
        </div>
        <div className="mt-2 grid sm:grid-cols-2 gap-x-4 gap-y-0.5 mono text-[10.5px]">
          <HashRow label="prev" stored={r.previous_hash} expected={r.expected_previous_hash} />
          <HashRow label="hash" stored={r.stored_hash} expected={r.expected_hash} />
        </div>
      </div>

      {r.kind === "batch" && (
        <div className="flex flex-col gap-1 justify-center">
          <Btn variant="danger" size="sm" disabled={busy} onClick={() => onTamper(r)}>
            Tamper
          </Btn>
        </div>
      )}
    </div>
  );
}

function HashRow({ label, stored, expected }: { label: string; stored: string; expected: string }) {
  const match = stored === expected;
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-muted w-8">{label}</span>
      <span className={match ? "text-slate-300" : "text-danger line-through"}>{stored.slice(0, 18)}…</span>
      {!match && <span className="text-accent">→ {expected.slice(0, 18)}…</span>}
    </div>
  );
}
