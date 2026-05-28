/* The guided workflow demo.
 *
 * Click through 10 steps. Each step fires a REAL API call against the running
 * backend, creates real chain records, and shows the chain hash sidebar
 * extending live. This is the answer to "where is the real time use" — every
 * tap on this page changes server state and you watch the chain grow.
 *
 * Designed so a judge can walk it in 90 seconds without prior knowledge.
 */

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, TrustRecord, User, AggregationPoint, Batch } from "../api";
import { Btn, Eyebrow, Reveal, Hash } from "../components/ui";
import { PrintableSticker } from "../components/Qr";
import { CarbonCard } from "../components/CarbonImpact";
import clsx from "clsx";

// ─── STEP DEFINITIONS ────────────────────────────────────────────────────

type StepKind = "route_start" | "pickup" | "route_end" | "recovery" | "sell"
  | "match" | "accept_match" | "handoff_kab_agg" | "confirm_kab_agg"
  | "handoff_agg_rec" | "confirm_agg_rec" | "tamper" | "restore";

type Step = {
  num: number;
  kind: StepKind;
  emoji: string;
  stage: string;
  title: string;
  body: string;
  buttonLabel: string;
  isDanger?: boolean;
};

const STEPS: Step[] = [
  { num: 1,  kind: "route_start",      emoji: "🚛", stage: "Stage 2", title: "Truck driver starts a route",         body: "One tap on a phone at the depot. GPS starts streaming automatically.", buttonLabel: "▶ Start the route" },
  { num: 2,  kind: "pickup",           emoji: "📍", stage: "Stage 2", title: "3 houses picked up along the way",     body: "Each tap captures the truck's GPS. Three pickups logged in 6 seconds.", buttonLabel: "▶ Log 3 pickups" },
  { num: 3,  kind: "route_end",        emoji: "🏁", stage: "Stage 2", title: "Truck dumps 50kg at the transfer station", body: "Route closes at the aggregation point. Pile is sitting there for ragpickers to sort.", buttonLabel: "▶ End route at dump" },
  { num: 4,  kind: "recovery",         emoji: "♻️", stage: "Stage 3", title: "Ragpicker recovers 8kg PET from the pile", body: "They sort the dumped material and find 8kg of recyclable PET. Anonymous — only their booklet ID is recorded.", buttonLabel: "▶ Log ragpicker recovery" },
  { num: 5,  kind: "sell",             emoji: "🏷️", stage: "Stage 3→4", title: "Ragpicker sells to kabadiwala · QR sticker born", body: "The kabadiwala pays, hands a paper QR slip to the ragpicker, slaps a QR sticker on the sack. The batch ID is born.", buttonLabel: "▶ Create the batch + QR" },
  { num: 6,  kind: "match",            emoji: "💰", stage: "Stage 4", title: "Matching engine finds the best buyer", body: "The top recycler bid this morning vs the kabadiwala's usual price — surfaces ₹/kg uplift on this sack.", buttonLabel: "▶ Find best buyer" },
  { num: 7,  kind: "accept_match",     emoji: "✓",  stage: "Stage 4", title: "Kabadiwala accepts the match",         body: "They don't open an app — they just get a WhatsApp saying ‘sold, payment incoming'.", buttonLabel: "▶ Accept the match" },
  { num: 8,  kind: "handoff_kab_agg",  emoji: "📦", stage: "Stage 4→4", title: "Aggregator picks up the sack",       body: "The aggregator arrives at the kabadiwala's shop, weighs the sack at the gate.", buttonLabel: "▶ Initiate handoff" },
  { num: 9,  kind: "confirm_kab_agg",  emoji: "🤝", stage: "Stage 4→4", title: "Aggregator confirms receipt",        body: "They weigh again at their yard. Matches within 5% — handoff confirmed, both parties' reputation ticks up.", buttonLabel: "▶ Confirm at aggregator" },
  { num: 10, kind: "handoff_agg_rec",  emoji: "🚚", stage: "Stage 4→5", title: "Aggregator ships to the recycler",   body: "Truck leaves for the industrial-zone recycling facility.", buttonLabel: "▶ Ship to recycler" },
  { num: 11, kind: "confirm_agg_rec",  emoji: "🏭", stage: "Stage 5",   title: "Recycler confirms at the gate",      body: "Industrial scale at the factory. Chain closes. Money settles. Provenance is permanent.", buttonLabel: "▶ Close the chain" },
  { num: 12, kind: "tamper",           emoji: "⚠",  stage: "Trust",     title: "Try to tamper with the chain",       body: "Mutate the weight on the original batch row. Watch every downstream link flag red.", buttonLabel: "⚠ Tamper now", isDanger: true },
  { num: 13, kind: "restore",          emoji: "↻",  stage: "Trust",     title: "Restore the chain",                  body: "Roll back the tampered record. Chain returns to fully verified.", buttonLabel: "↻ Restore" },
];

// ─── COMPONENT ───────────────────────────────────────────────────────────

type State = {
  routeId?: number;
  pickupCount: number;
  recoveryId?: number;
  batchId?: number;
  batch?: Batch;
  bidId?: number;
  handoff1Id?: number;
  handoff2Id?: number;
  log: { ts: string; msg: string; kind: "info" | "success" | "danger" }[];
};

const TRUCK_PHONE  = "+919900500001";  // [Demo] Truck Driver 1
const RAG_PHONE    = "RP-002";          // [Demo] Ragpicker RP-002
const KAB_PHONE    = "+919900100002";   // [Demo] Kabadiwala A2
const AGG_PHONE    = "+919900200002";   // [Demo] Aggregator Coast

export default function Workflow() {
  const [stepIdx, setStepIdx] = useState(0);
  const [state, setState] = useState<State>({ pickupCount: 0, log: [] });
  const [chainPreview, setChainPreview] = useState<TrustRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [aggs, setAggs] = useState<AggregationPoint[]>([]);
  const [chainStats, setChainStats] = useState({ total: 0, ok: 0, broken: 0 });
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.users().then(setUsers).catch(() => {});
    api.aggregationPoints().then(setAggs).catch(() => {});
    refreshChain();
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [state.log]);

  const refreshChain = async () => {
    try {
      const c = await api.trustChain();
      setChainPreview(c.slice(-15).reverse());
      setChainStats({
        total: c.length,
        ok: c.filter(r => r.ok).length,
        broken: c.filter(r => !r.ok).length,
      });
    } catch {}
  };

  const log = (msg: string, kind: "info" | "success" | "danger" = "info") => {
    setState(s => ({
      ...s,
      log: [{ ts: new Date().toLocaleTimeString(), msg, kind }, ...s.log].slice(0, 30),
    }));
  };

  const findAgg = () => aggs[0] || aggs.find(a => /pumpwell/i.test(a.name));

  const runStep = async (s: Step) => {
    setBusy(true);
    try {
      switch (s.kind) {
        case "route_start": {
          const r = await api.startRoute({ collector_phone: TRUCK_PHONE, lat: 12.8703, lon: 74.8420, ward: "Ward A · Town Centre" });
          setState(p => ({ ...p, routeId: r.id }));
          log(`Route ${r.route_code} opened · hash ${r.record_hash.slice(0, 12)}`, "success");
          break;
        }
        case "pickup": {
          if (!state.routeId) { log("No active route — re-run step 1", "danger"); break; }
          for (let i = 1; i <= 3; i++) {
            const p = await api.logPickup({
              route_id: state.routeId,
              lat: 12.8703 + i * 0.004, lon: 74.8420 + i * 0.003,
              estimated_weight_kg: 12 + i * 4,
              house_tag: `H-${100 + i}`,
            });
            log(`Pickup #${p.id} logged at ${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`, "success");
            await sleep(180);
          }
          setState(p => ({ ...p, pickupCount: 3 }));
          break;
        }
        case "route_end": {
          if (!state.routeId) { log("No active route", "danger"); break; }
          const dump = findAgg();
          if (!dump) { log("No aggregation point known", "danger"); break; }
          await api.endRoute({
            route_id: state.routeId, lat: dump.lat, lon: dump.lon,
            total_estimated_weight_kg: 50, dump_aggregation_point_id: dump.id,
          });
          log(`Route closed · 50 kg dumped at ${dump.name}`, "success");
          break;
        }
        case "recovery": {
          const dump = findAgg();
          const r = await api.createRecovery({
            ragpicker_phone: RAG_PHONE, material_type: "PET", weight_kg: 8,
            lat: dump?.lat || 12.8755, lon: dump?.lon || 74.8505,
            aggregation_point_id: dump?.id, door_to_door: false,
          });
          setState(p => ({ ...p, recoveryId: r.id }));
          log(`Recovery ${r.recovery_code} · 8 kg PET · QR slip generated`, "success");
          break;
        }
        case "sell": {
          if (!state.recoveryId) { log("No recovery to sell — run step 4", "danger"); break; }
          const b = await api.sellRecovery({ recovery_id: state.recoveryId, kabadiwala_phone: KAB_PHONE, price_inr: 60 });
          setState(p => ({ ...p, batchId: b.id, batch: b }));
          log(`Batch ${b.batch_code} born · QR sticker on the sack · hash ${b.record_hash.slice(0, 12)}`, "success");
          break;
        }
        case "match": {
          if (!state.batchId) { log("No batch — run step 5", "danger"); break; }
          const m = await api.batchMatches(state.batchId);
          if (m.length === 0) { log("No matches yet", "danger"); break; }
          const top = m[0];
          setState(p => ({ ...p, bidId: top.bid_id }));
          log(`Best buyer: ${top.recycler_name} @ ₹${top.price_per_kg}/kg = ₹${top.expected_earnings_inr.toFixed(0)} · +₹${top.earnings_delta_inr.toFixed(0)} above usual`, "success");
          break;
        }
        case "accept_match": {
          if (!state.batchId || !state.bidId) { log("No match selected", "danger"); break; }
          await api.acceptMatch(state.batchId, state.bidId);
          log(`Match accepted · status → MATCHED · WhatsApp sent to kabadiwala`, "success");
          break;
        }
        case "handoff_kab_agg": {
          if (!state.batchId) { log("No batch", "danger"); break; }
          const h = await api.initiateHandoff({
            batch_id: state.batchId, sender_phone: KAB_PHONE, receiver_phone: AGG_PHONE, sent_weight: 8,
          });
          setState(p => ({ ...p, handoff1Id: h.id }));
          log(`Handoff #${h.id} initiated · kabadiwala → aggregator`, "success");
          break;
        }
        case "confirm_kab_agg": {
          if (!state.handoff1Id) { log("No handoff #1", "danger"); break; }
          const h = await api.confirmHandoff({ handoff_id: state.handoff1Id, receiver_phone: AGG_PHONE, received_weight: 7.9 });
          log(`Handoff #${h.id} confirmed · variance ${h.discrepancy_pct?.toFixed(1)}% · ${h.status}`, h.discrepancy_flag ? "danger" : "success");
          break;
        }
        case "handoff_agg_rec": {
          if (!state.batchId) { log("No batch", "danger"); break; }
          const recPhone = users.find(u => u.role === "recycler" && /PET/i.test(u.name))?.phone
            || users.find(u => u.role === "recycler")?.phone;
          if (!recPhone) { log("No recycler in network", "danger"); break; }
          const h = await api.initiateHandoff({
            batch_id: state.batchId, sender_phone: AGG_PHONE, receiver_phone: recPhone, sent_weight: 7.9,
          });
          setState(p => ({ ...p, handoff2Id: h.id }));
          log(`Handoff #${h.id} initiated · Aggregator → PET Reborn`, "success");
          break;
        }
        case "confirm_agg_rec": {
          if (!state.handoff2Id) { log("No handoff #2", "danger"); break; }
          const recPhone = users.find(u => u.role === "recycler" && /PET/i.test(u.name))?.phone
            || users.find(u => u.role === "recycler")?.phone;
          if (!recPhone) { log("No recycler", "danger"); break; }
          const h = await api.confirmHandoff({ handoff_id: state.handoff2Id, receiver_phone: recPhone, received_weight: 7.85 });
          log(`Chain complete · final variance ${h.discrepancy_pct?.toFixed(1)}% · payment settled`, "success");
          break;
        }
        case "tamper": {
          if (!state.batchId) { log("No batch to tamper", "danger"); break; }
          await api.tamper(state.batchId, 999);
          log(`⚠ Weight on batch ${state.batchId} mutated to 999 — chain integrity broken`, "danger");
          break;
        }
        case "restore": {
          await api.restoreChain();
          log(`Chain restored — all hashes verify again`, "success");
          break;
        }
      }
      await refreshChain();
      setStepIdx(i => Math.min(i + 1, STEPS.length));
    } catch (e: any) {
      log(`Error: ${e.message}`, "danger");
    } finally {
      setBusy(false);
    }
  };

  const resetDemo = () => {
    setState({ pickupCount: 0, log: [] });
    setStepIdx(0);
    refreshChain();
  };

  const current = STEPS[stepIdx];
  const done = stepIdx >= STEPS.length;

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <Reveal>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>The 90-second workflow</Eyebrow>
            <h1 className="font-display text-5xl md:text-6xl tracking-tight2 mt-3 leading-[1.05]">
              Click through it.
              <br /><span className="text-muted/60 italic font-light">Live data, real chain.</span>
            </h1>
            <p className="text-slate-300 max-w-2xl mt-5 leading-relaxed">
              Every button on this page fires a real API call against the running backend. The hash chain on the right extends with each step. Total runtime: ~90 seconds end-to-end.
            </p>
          </div>
          <div className="flex gap-2">
            <Btn variant="ghost" size="sm" onClick={resetDemo}>↻ Reset demo state</Btn>
          </div>
        </header>
      </Reveal>

      <div className="mt-10 grid lg:grid-cols-[1fr_360px] gap-8">
        {/* ─── LEFT: STEP CARDS ──────────────────────────────────── */}
        <div className="space-y-4">
          {STEPS.map((s, i) => {
            const status: "done" | "current" | "pending" =
              i < stepIdx ? "done" : i === stepIdx ? "current" : "pending";
            return (
              <Reveal key={s.num} delay={Math.min(i * 30, 250)}>
                <div className={clsx(
                  "rounded-2xl border p-5 transition-all",
                  status === "current" ? "bg-panel/70 border-accent/60 shadow-glow" :
                  status === "done"    ? "bg-panel/30 border-line/60" :
                                          "bg-panel/20 border-line/30 opacity-50",
                  s.isDanger && status === "current" && "border-danger/60",
                )}>
                  <div className="flex items-start gap-4">
                    <div className={clsx(
                      "font-display text-3xl tracking-tight2 w-12 text-center",
                      status === "done" ? "text-accent" : status === "current" ? "text-cream" : "text-muted/40",
                    )}>
                      {status === "done" ? "✓" : String(s.num).padStart(2, "0")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-[10px] uppercase tracking-[0.14em] text-muted">{s.stage}</span>
                        <span className="text-xl">{s.emoji}</span>
                      </div>
                      <div className="font-display text-2xl tracking-tight2 text-cream mt-1 leading-snug">{s.title}</div>
                      <div className="text-sm text-slate-400 mt-2 leading-relaxed">{s.body}</div>
                    </div>
                    <div>
                      {status === "current" && (
                        <Btn
                          variant={s.isDanger ? "danger" : "primary"}
                          size="lg"
                          onClick={() => runStep(s)}
                          disabled={busy}
                        >
                          {s.buttonLabel}
                        </Btn>
                      )}
                      {status === "done" && <span className="text-xs text-accent">done</span>}
                    </div>
                  </div>
                </div>
              </Reveal>
            );
          })}

          {done && (
            <Reveal>
              <div className="bg-accent/10 border border-accent/40 rounded-2xl p-6 text-center">
                <div className="text-4xl mb-2">🎉</div>
                <div className="font-display text-2xl tracking-tight2">Chain complete.</div>
                <div className="text-sm text-slate-300 mt-2 max-w-xl mx-auto">
                  You just walked a recyclable bottle from household pickup all the way to factory weigh-in — and confirmed the hash chain holds.
                </div>
                <div className="flex flex-wrap justify-center gap-3 mt-5">
                  <Link to="/provenance"><Btn>See full provenance →</Btn></Link>
                  <Link to="/municipality"><Btn variant="ghost">Municipality view</Btn></Link>
                  <Btn variant="ghost" onClick={resetDemo}>↻ Run again</Btn>
                </div>
              </div>
            </Reveal>
          )}
        </div>

        {/* ─── RIGHT: LIVE CHAIN + LOG ──────────────────────────── */}
        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {/* Live QR sticker — appears once a batch is born */}
          {state.batch && (
            <>
              <div className="animate-fade-in">
                <div className="text-[10px] uppercase tracking-[0.18em] text-accent flex items-center gap-2 mb-2">
                  <span>🏷️</span> Live QR sticker
                </div>
                <PrintableSticker
                  code={state.batch.batch_code}
                  material={state.batch.material_type}
                  weight={state.batch.weight_kg}
                  hash={state.batch.record_hash}
                />
                <div className="text-[10px] text-muted text-center mt-2">
                  point your phone camera here · this is a real scannable QR
                </div>
              </div>
              <div className="animate-fade-in">
                <CarbonCard material={state.batch.material_type} weightKg={state.batch.weight_kg} />
              </div>
            </>
          )}

          <div className="bg-panel/60 border border-line/60 rounded-2xl p-5">
            <div className="text-[10px] uppercase tracking-[0.18em] text-accent flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" /> Live chain
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <ChainStat label="Records" value={chainStats.total} />
              <ChainStat label="Verified" value={chainStats.ok} accent="green" />
              <ChainStat label="Broken"   value={chainStats.broken} accent={chainStats.broken > 0 ? "red" : "green"} />
            </div>
            <div className="mt-4 pt-4 border-t border-line/40">
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted mb-2">Last 15 records</div>
              <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
                {chainPreview.map(r => (
                  <div key={`${r.kind}-${r.id}`}
                    className={clsx("text-[11px] flex items-center justify-between gap-2 py-1.5 px-2 rounded",
                      r.ok ? "bg-bg/40" : "bg-danger/20 border border-danger/40",
                    )}>
                    <span className="text-muted">{r.kind}#{r.id}</span>
                    <span className={clsx("mono", r.ok ? "text-slate-400" : "text-danger")}>
                      {r.stored_hash.slice(0, 10)}…
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-panel/60 border border-line/60 rounded-2xl p-5">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted mb-2">Activity log</div>
            <div ref={logRef} className="space-y-1 max-h-[200px] overflow-y-auto">
              {state.log.length === 0 && <div className="text-[11px] text-muted">Click a step to see activity here.</div>}
              {state.log.map((entry, i) => (
                <div key={i} className={clsx(
                  "text-[11px] py-1.5 px-2 rounded",
                  entry.kind === "success" && "bg-accent/8 text-accent",
                  entry.kind === "danger" && "bg-danger/12 text-danger",
                  entry.kind === "info" && "bg-bg/40 text-slate-300",
                )}>
                  <span className="text-muted mono mr-2">{entry.ts}</span>
                  {entry.msg}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChainStat({ label, value, accent = "" }: { label: string; value: number; accent?: string }) {
  const color = accent === "red" ? "text-danger" : accent === "green" ? "text-accent" : "text-cream";
  return (
    <div>
      <div className={`font-display text-2xl tracking-tight2 ${color}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted mt-0.5">{label}</div>
    </div>
  );
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
