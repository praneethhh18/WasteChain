/* Risk Patterns — chain anomaly detection.
 *
 * The 5 patterns we detect are documented in backend/app/services/anomaly.py.
 * No public competitor in Indian waste-tech ships these together — this is
 * the genuinely novel technical wrinkle of the platform.
 */

import { useEffect, useMemo, useState } from "react";
import { api, AnomalyScan, AnomalyFinding } from "../api";
import { Btn, Eyebrow, Reveal, Empty, Hash } from "../components/ui";
import clsx from "clsx";

const KIND_META: Record<string, { emoji: string; label: string; blurb: string }> = {
  REBAG_SUSPICION:        { emoji: "♻️🏷️", label: "Re-bag suspicion",        blurb: "Same material + matching weight appears twice nearby — likely the same physical sack tracked under two QR stickers." },
  WEIGHT_SHAVING:         { emoji: "⚖️",   label: "Weight shaving pattern", blurb: "An actor's average shrinkage is > 2σ above the regional baseline across many handoffs." },
  TEMPORAL_INCONSISTENCY: { emoji: "⏱",    label: "Temporal anomaly",       blurb: "A recovery or handoff that's physically impossible given the upstream timing." },
  DENSITY_VIOLATION:      { emoji: "📦",   label: "Density violation",      blurb: "A single sack's weight exceeds the plausible ceiling for that material — likely combined sacks under one sticker." },
  REPUTATION_FARMING:     { emoji: "🤝",   label: "Reputation farming",     blurb: "Two accounts shuttle material back and forth with no recycler-anchored leg — inflating reputation artificially." },
};

const SEV_TONE: Record<string, string> = {
  high:   "bg-danger/10 border-danger/50",
  medium: "bg-accent2/10 border-accent2/40",
  low:    "bg-bg/40 border-line/60",
};
const SEV_BADGE: Record<string, string> = {
  high:   "bg-danger text-bg",
  medium: "bg-accent2 text-bg",
  low:    "bg-bg/60 text-muted border border-line/60",
};

export default function Risk() {
  const [scan, setScan] = useState<AnomalyScan | null>(null);
  const [filterKind, setFilterKind] = useState<string>("all");
  const [filterSev, setFilterSev] = useState<string>("all");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try { setScan(await api.anomalies()); }
    catch {} finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
  }, [autoRefresh]);

  const filtered = useMemo(() => {
    if (!scan) return [];
    return scan.findings.filter(f =>
      (filterKind === "all" || f.kind === filterKind) &&
      (filterSev === "all" || f.severity === filterSev)
    );
  }, [scan, filterKind, filterSev]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-7">
      <Reveal>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Chain anomaly engine</Eyebrow>
            <h1 className="font-display text-5xl md:text-6xl tracking-tight2 mt-3 leading-[1.05]">
              The chain <span className="text-accent">defends its own</span> truth.
            </h1>
            <p className="text-slate-300 mt-4 max-w-2xl leading-relaxed">
              The hash chain proves no one tampered with the data after it was written.
              These five detectors prove no one is faking the data at write-time either —
              re-bagging, weight-shaving, impossible timing, physically impossible weights,
              and reputation farming.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            {autoRefresh ? "auto-rescan · 10s" : "paused"}
            <button onClick={() => setAutoRefresh(!autoRefresh)} className="text-accent hover:underline ml-2">
              {autoRefresh ? "pause" : "resume"}
            </button>
          </div>
        </header>
      </Reveal>

      {scan && (
        <Reveal delay={100}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Total findings" value={scan.total} accent="cream" />
            <Stat label="High severity" value={scan.by_severity.high || 0} accent={scan.by_severity.high ? "red" : "green"} />
            <Stat label="Medium severity" value={scan.by_severity.medium || 0} accent="yellow" />
            <Stat label="Low severity" value={scan.by_severity.low || 0} />
          </div>
        </Reveal>
      )}

      {/* Pattern legend */}
      <Reveal delay={150}>
        <div className="bg-panel/40 border border-line/60 rounded-2xl">
          <div className="px-5 py-3 border-b border-line/60">
            <div className="text-[10px] uppercase tracking-[0.18em] text-accent">Five detection patterns</div>
            <div className="font-display text-xl tracking-tight2 mt-0.5">What we look for, and why</div>
          </div>
          <div className="p-5 grid md:grid-cols-2 gap-3">
            {Object.entries(KIND_META).map(([key, m]) => (
              <button key={key} onClick={() => setFilterKind(filterKind === key ? "all" : key)}
                className={clsx("text-left rounded-xl p-3.5 border transition",
                  filterKind === key
                    ? "bg-accent/10 border-accent"
                    : "bg-bg/40 border-line/60 hover:border-accent/40")}>
                <div className="flex items-baseline justify-between gap-3">
                  <div className="font-medium text-cream">{m.emoji} {m.label}</div>
                  <div className="text-[10px] text-muted">{scan?.by_kind[key] ?? 0} found</div>
                </div>
                <div className="text-[11.5px] text-slate-400 mt-1 leading-relaxed">{m.blurb}</div>
              </button>
            ))}
          </div>
        </div>
      </Reveal>

      {/* Findings */}
      <Reveal delay={200}>
        <div className="bg-panel/40 border border-line/60 rounded-2xl">
          <div className="px-5 py-3 border-b border-line/60 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-accent">Findings</div>
              <div className="font-display text-xl tracking-tight2 mt-0.5">
                {filtered.length} {filterKind !== "all" || filterSev !== "all" ? "filtered" : "total"} pattern{filtered.length !== 1 ? "s" : ""}
              </div>
            </div>
            <div className="flex gap-1.5 flex-wrap items-center">
              <SevPill label="all" active={filterSev === "all"} onClick={() => setFilterSev("all")} />
              <SevPill label="high" active={filterSev === "high"} onClick={() => setFilterSev("high")} tone="red" />
              <SevPill label="medium" active={filterSev === "medium"} onClick={() => setFilterSev("medium")} tone="yellow" />
              <SevPill label="low" active={filterSev === "low"} onClick={() => setFilterSev("low")} />
              {(filterKind !== "all" || filterSev !== "all") && (
                <button onClick={() => { setFilterKind("all"); setFilterSev("all"); }}
                  className="text-[11px] text-muted hover:text-accent ml-2">clear</button>
              )}
            </div>
          </div>
          <div className="p-5">
            {loading ? <Empty>Loading…</Empty> :
             filtered.length === 0 ? (
               <div className="text-center py-10">
                 <div className="text-4xl mb-3">✓</div>
                 <div className="font-display text-xl tracking-tight2 text-accent">No anomalies matching filter</div>
                 <div className="text-xs text-muted mt-1">The chain looks clean.</div>
               </div>
             ) : (
              <div className="space-y-3">
                {filtered.map((f, i) => <FindingCard key={`${f.kind}-${i}`} f={f} />)}
              </div>
             )}
          </div>
        </div>
      </Reveal>
    </div>
  );
}

function FindingCard({ f }: { f: AnomalyFinding }) {
  const m = KIND_META[f.kind];
  return (
    <div className={clsx("rounded-xl p-4 border transition", SEV_TONE[f.severity])}>
      <div className="flex items-start gap-3 flex-wrap">
        <div className="text-2xl">{m?.emoji || "⚠"}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className={clsx("text-[9px] uppercase tracking-[0.16em] px-2 py-0.5 rounded font-semibold", SEV_BADGE[f.severity])}>
              {f.severity}
            </span>
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted">{m?.label || f.kind}</span>
          </div>
          <div className="font-display text-lg tracking-tight2 text-cream mt-1.5 leading-snug">{f.title}</div>
          <div className="text-sm text-slate-300 mt-2 leading-relaxed">{f.detail}</div>
          <div className="mt-3 pt-3 border-t border-line/30 grid sm:grid-cols-2 gap-3 text-[11px]">
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted mb-1">Actors</div>
              <div className="text-slate-200">{f.actors.join(" · ")}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted mb-1">Evidence</div>
              <div className="mono text-slate-300">{f.evidence_ids.slice(0, 4).join(", ")}{f.evidence_ids.length > 4 ? `, +${f.evidence_ids.length - 4} more` : ""}</div>
            </div>
          </div>
          <div className="mt-3 text-[11.5px] text-accent bg-accent/8 rounded-md px-3 py-2 leading-relaxed">
            💡 {f.suggested_action}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent = "cream" }: { label: string; value: number; accent?: "green" | "yellow" | "red" | "cream" }) {
  const color = accent === "red" ? "text-danger" : accent === "yellow" ? "text-accent2" : accent === "green" ? "text-accent" : "text-cream";
  return (
    <div className="bg-bg/40 border border-line/60 rounded-xl p-4">
      <div className="text-[10.5px] uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className={clsx("font-display text-4xl tracking-tight2 mt-1.5", color)}>{value}</div>
    </div>
  );
}

function SevPill({ label, active, onClick, tone }: { label: string; active: boolean; onClick: () => void; tone?: "red" | "yellow" }) {
  const cls = active
    ? (tone === "red" ? "bg-danger text-bg" : tone === "yellow" ? "bg-accent2 text-bg" : "bg-accent text-bg")
    : "bg-bg/40 border border-line/60 text-muted hover:border-accent/40";
  return (
    <button onClick={onClick}
      className={clsx("text-[11px] px-2.5 py-1 rounded-md font-medium uppercase tracking-wider", cls)}>
      {label}
    </button>
  );
}
