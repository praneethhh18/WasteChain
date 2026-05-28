import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, Provenance as ProvenanceType, Batch } from "../api";
import { Btn, Hash, Eyebrow, Reveal, Empty } from "../components/ui";
import { MiniMap, MapPoint, MapLine } from "../components/Map";
import clsx from "clsx";

export default function ProvenancePage() {
  const [params, setParams] = useSearchParams();
  const batchId = parseInt(params.get("batch") || "0") || null;
  const [data, setData] = useState<ProvenanceType | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.batches({}).then(b => setBatches(b.filter(x => x.source_recovery_id))).catch(() => {});
  }, []);

  useEffect(() => {
    if (!batchId) { setData(null); return; }
    setLoading(true);
    api.provenance(batchId).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [batchId]);

  const pickBatch = (id: number) => setParams({ batch: String(id) });

  // ─── Index view: pick a batch ──────────────────────────────
  if (!batchId) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-10 space-y-10">
        <Reveal>
          <header>
            <Eyebrow>Provenance</Eyebrow>
            <h1 className="font-display text-5xl md:text-6xl tracking-tight2 mt-3 leading-[1.05]">
              Pick a batch.
              <br /><span className="text-muted/60 italic font-light">We'll trace it home.</span>
            </h1>
            <p className="text-slate-300 mt-5 max-w-2xl leading-relaxed">
              Every batch with a verified upstream chain — which ragpicker recovered it, which aggregation pile it came from, which truck dumped material there, which houses they picked up from. The full 5-stage journey on one screen.
            </p>
          </header>
        </Reveal>

        <Reveal delay={150}>
          {batches.length === 0 ? <Empty>No batches with upstream chain yet.</Empty> :
            <div>
              <div className="text-xs uppercase tracking-[0.14em] text-muted mb-4">
                {batches.length} traceable batches · pick any one
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {batches.slice(0, 24).map(b => (
                  <button key={b.id} onClick={() => pickBatch(b.id)}
                    className="text-left bg-panel/40 hover:bg-panel/70 border border-line/60 hover:border-accent/50 transition-all rounded-2xl p-5 hover:-translate-y-0.5 hover:shadow-card group">
                    <div className="mono text-[11px] text-muted">{b.batch_code}</div>
                    <div className="font-display text-3xl tracking-tight2 text-cream mt-2">
                      {b.weight_kg}<span className="text-base text-muted ml-1">kg</span>
                    </div>
                    <div className="text-sm text-slate-400 mt-1">{b.material_type}</div>
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-line/40">
                      <div className="text-[10px] text-muted">{b.area || "—"}</div>
                      <div className="text-[10px] text-accent group-hover:translate-x-1 transition-transform">trace →</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          }
        </Reveal>
      </div>
    );
  }

  if (loading || !data) {
    return <div className="max-w-5xl mx-auto px-6 py-20 text-muted">Loading provenance…</div>;
  }

  // ─── Detail view: full chain ───────────────────────────────
  const journey = buildJourney(data);

  const points: MapPoint[] = [];
  for (const p of data.pickups) points.push({ lat: p.lat, lon: p.lon, label: `Pickup #${p.id}`, sub: p.house_tag, kind: "batch" });
  if (data.aggregation_point) points.push({ lat: data.aggregation_point.lat, lon: data.aggregation_point.lon, label: data.aggregation_point.name, sub: "aggregation point", kind: "aggregator" });
  if (data.recovery) points.push({ lat: data.recovery.lat, lon: data.recovery.lon, label: "Recovery", sub: data.recovery.code, kind: "kabadiwala" });

  const lines: MapLine[] = [];
  if (data.aggregation_point && data.pickups.length > 0) {
    for (const p of data.pickups.slice(0, 12)) {
      lines.push({ from: [p.lat, p.lon], to: [data.aggregation_point.lat, data.aggregation_point.lon], color: "#f5cf6f" });
    }
  }
  if (data.aggregation_point && data.recovery) {
    lines.push({ from: [data.aggregation_point.lat, data.aggregation_point.lon], to: [data.recovery.lat, data.recovery.lon], color: "#2eea84" });
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-12">
      {/* Hero */}
      <Reveal>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Provenance · {data.batch.code}</Eyebrow>
            <h1 className="font-display text-5xl md:text-6xl tracking-tight2 mt-3 leading-[1.05]">
              {data.batch.weight_kg}<span className="text-3xl text-muted ml-1.5">kg</span>
              <span className="text-cream ml-3">{data.batch.material}</span>
            </h1>
            <p className="text-sm text-muted mt-2">
              {data.batch.creator?.name} · {new Date(data.batch.created_at).toLocaleString()}
            </p>
          </div>
          <Btn variant="ghost" onClick={() => setParams({})}>← Pick another batch</Btn>
        </header>
      </Reveal>

      {/* Journey timeline */}
      <Reveal delay={100}>
        <div className="space-y-0">
          {journey.map((j, i) => (
            <JourneyStage key={i} stage={j} index={i} total={journey.length} />
          ))}
        </div>
      </Reveal>

      {/* Map */}
      {points.length > 1 && (
        <Reveal delay={200}>
          <div className="bg-panel/40 border border-line/60 rounded-2xl p-3">
            <MiniMap points={points} lines={lines} height={420} />
            <div className="px-3 pb-3 pt-3 text-[11px] text-muted flex flex-wrap gap-5">
              <Legend color="bg-accent" label="recovery / pickups" />
              <Legend color="bg-accent2" label="aggregation point" />
              <span className="ml-auto">Yellow dashed: pickups → aggregation point · Green dashed: aggregation → ragpicker recovery</span>
            </div>
          </div>
        </Reveal>
      )}
    </div>
  );
}

type Journey = {
  num: number;
  stageLabel: string;
  emoji: string;
  present: boolean;
  title: string;
  subtitle?: string;
  detail?: string;
  hash?: string;
  meta?: { label: string; value: string }[];
};

function buildJourney(d: ProvenanceType): Journey[] {
  const out: Journey[] = [];

  out.push({
    num: 1, stageLabel: "Household", emoji: "🏠",
    present: d.pickups.length > 0,
    title: d.pickups.length > 0 ? `${d.pickups.length} houses` : "(upstream pickups not linked)",
    subtitle: d.pickups.length > 0 ? "where the material originated" : undefined,
    detail: d.pickups.length > 0
      ? `Picked up door-to-door by the collector on this day. We don't track individual bottles — we track the route + GPS pings + tonnage.`
      : undefined,
  });

  for (const r of d.routes.slice(0, 1)) {
    out.push({
      num: 2, stageLabel: "Collector route", emoji: "🚛",
      present: true,
      title: `${r.collector?.name || "Driver"}`,
      subtitle: `${r.code} · ${r.pickup_count} stops · ${(r.weight_kg || 0).toFixed(0)} kg`,
      detail: `Route ran on ${new Date(r.started_at).toLocaleDateString()} from ${r.ward || "—"}.`,
      hash: r.hash,
      meta: [
        { label: "started", value: new Date(r.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
        { label: "stops", value: String(r.pickup_count) },
      ],
    });
  }
  if (d.routes.length === 0) {
    out.push({
      num: 2, stageLabel: "Collector route", emoji: "🚛",
      present: false,
      title: "(no linked route)",
      detail: "This batch entered the system directly from the kabadiwala — bypassing the municipal collection path.",
    });
  }

  if (d.aggregation_point) {
    out.push({
      num: 3, stageLabel: "Aggregation point", emoji: "📦",
      present: true,
      title: d.aggregation_point.name,
      subtitle: d.aggregation_point.area || undefined,
      detail: "Truck dumped here. Ragpickers sort the pile. The recovered sack walked out from this point.",
    });
  } else {
    out.push({
      num: 3, stageLabel: "Aggregation point", emoji: "📦",
      present: false, title: "(direct ragpicker recovery)",
      detail: "Ragpicker went door-to-door themselves and sold straight to the kabadiwala.",
    });
  }

  if (d.recovery) {
    out.push({
      num: 4, stageLabel: "Ragpicker", emoji: "♻️",
      present: true,
      title: d.recovery.ragpicker?.name || "Ragpicker",
      subtitle: `${d.recovery.code} · ${d.recovery.weight_kg} kg ${d.recovery.material} ${d.recovery.door_to_door ? "(door-to-door)" : ""}`,
      detail: "Sorted the sack, weighed it, sold to the kabadiwala. Got a paper QR receipt slip.",
      hash: d.recovery.hash,
    });
  } else {
    out.push({
      num: 4, stageLabel: "Ragpicker", emoji: "♻️",
      present: false, title: "(direct kabadiwala purchase)",
      detail: "No ragpicker involved — kabadiwala bought directly from a shop or household.",
    });
  }

  out.push({
    num: 5, stageLabel: "Kabadiwala", emoji: "🏪",
    present: true,
    title: d.batch.creator?.name || "Kabadiwala",
    subtitle: `${d.batch.code} · ${d.batch.weight_kg} kg ${d.batch.material}`,
    detail: "Weighed at the scrap shop. QR sticker on the sack. This is where the batch ID is born.",
    hash: d.batch.hash,
  });

  for (const h of d.handoffs) {
    out.push({
      num: 6, stageLabel: h.status === "DELIVERED" || h.receiver?.role === "recycler" ? "Recycler" : "Aggregator",
      emoji: h.receiver?.role === "recycler" ? "🏭" : "📦",
      present: true,
      title: `${h.sender?.name} → ${h.receiver?.name}`,
      subtitle: `${h.sent_weight} kg sent · ${h.received_weight ?? "?"} kg received`,
      detail: h.discrepancy_flag ? `⚠ Variance ${h.discrepancy_pct?.toFixed(1)}% — flagged.` : `Variance ${h.discrepancy_pct?.toFixed(1)}% — within threshold.`,
      hash: h.hash,
    });
  }
  return out;
}

function JourneyStage({ stage, index, total }: { stage: Journey; index: number; total: number }) {
  const isLast = index === total - 1;
  return (
    <div className={clsx(
      "relative flex gap-6 group transition-opacity",
      !stage.present && "opacity-50"
    )}>
      {/* Left rail */}
      <div className="flex flex-col items-center w-12 flex-shrink-0">
        <div className={clsx(
          "w-12 h-12 rounded-full grid place-items-center text-2xl border-2 transition-all",
          stage.present ? "bg-bg border-accent shadow-glow group-hover:scale-110" : "bg-bg border-line/60",
        )}>
          {stage.emoji}
        </div>
        {!isLast && <div className="flex-1 w-px bg-line/40 mt-1 mb-1 min-h-[40px]" />}
      </div>

      {/* Content */}
      <div className="flex-1 pb-10">
        <div className="text-[10px] uppercase tracking-[0.16em] text-muted">Stage {stage.num} · {stage.stageLabel}</div>
        <div className="font-display text-3xl tracking-tight2 mt-1 text-cream leading-tight">
          {stage.title}
        </div>
        {stage.subtitle && (
          <div className="text-sm text-accent mt-1">{stage.subtitle}</div>
        )}
        {stage.detail && (
          <div className="text-sm text-slate-400 mt-3 leading-relaxed max-w-2xl">{stage.detail}</div>
        )}
        {stage.hash && (
          <div className="mt-3 flex items-center gap-2 text-[11px]">
            <span className="text-muted">on chain</span>
            <Hash value={stage.hash} prefix={20} />
          </div>
        )}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span><span className={`inline-block w-2 h-2 rounded-full align-middle mr-1.5 ${color}`}/> {label}</span>;
}
