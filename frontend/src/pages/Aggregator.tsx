import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useCurrentUser, useFreshMode } from "../session";
import { api, Batch, Handoff, User } from "../api";
import { Card, Stat, StatusPill, Btn, Hash, Empty, Eyebrow, Reveal } from "../components/ui";
import { EmptyOnboarding, EmptyPanel } from "../components/EmptyState";
import { MiniMap, MapPoint } from "../components/Map";
import { QrScanner, QrCode } from "../components/Qr";
import { InspectModal } from "../components/Inspect";
import { CarbonPill } from "../components/CarbonImpact";
import { PhotoCapture, PhotoThumb } from "../components/PhotoCapture";
import { InspectResult } from "../api";

export default function Aggregator() {
  const [user] = useCurrentUser();
  const [fresh] = useFreshMode();
  const [handoffs, setHandoffsRaw] = useState<Handoff[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmFor, setConfirmFor] = useState<Handoff | null>(null);
  const [receivedWeight, setReceivedWeight] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [inspectFor, setInspectFor] = useState<{ material: string; handoff?: Handoff } | null>(null);
  const [lastInspect, setLastInspect] = useState<InspectResult | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);

  if (!user || user.role !== "aggregator") {
    return (
      <Gate to="/aggregator" expected="aggregator" />
    );
  }

  // In Day-1 (fresh) mode, hide all historical handoffs/batches for this user
  // so we render the brand-new empty experience.
  const setHandoffs = (h: Handoff[]) => setHandoffsRaw(fresh ? [] : h);

  const refresh = async () => {
    const [h, u, b] = await Promise.all([
      api.handoffs({ user_phone: user.phone }),
      api.users(),
      api.batches(),
    ]);
    setHandoffs(h);
    setUsers(u);
    setBatches(b);
  };
  useEffect(() => { refresh(); }, [user?.id, fresh]);

  const incoming = handoffs.filter(h => h.receiver_id === user.id && h.status === "PENDING");
  const completed = handoffs.filter(h => h.receiver_id === user.id && h.status !== "PENDING");
  const totalKg = completed.reduce((s, h) => s + (h.received_weight || 0), 0);
  const flagged = handoffs.filter(h => h.discrepancy_flag).length;
  const senders = new Set(handoffs.map(h => h.sender_id)).size;
  const today = new Date().toISOString().slice(0, 10);
  const todayKg = completed.filter(h => h.confirmed_at?.startsWith(today)).reduce((s, h) => s + (h.received_weight || 0), 0);

  const confirm = async () => {
    if (!confirmFor) return;
    const w = parseFloat(receivedWeight);
    if (!w) return;
    if (!photo) { alert("Photo evidence required at the gate."); return; }
    setBusy(true);
    try {
      await api.confirmHandoff({
        handoff_id: confirmFor.id, receiver_phone: user.phone,
        received_weight: w, photo_data_url: photo,
      });
      setConfirmFor(null); setReceivedWeight(""); setPhoto(null);
      await refresh();
    } catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  };

  const recyclers = users.filter(u => u.role === "recycler");
  const myReadyBatches = batches.filter(b => b.current_holder_id === user.id && b.status === "IN_TRANSIT");

  // Scanner: when a QR is scanned, find the matching pending handoff and
  // open the confirm modal for it.
  const handleScan = (code: string) => {
    setScanning(false);
    const batch = batches.find(b => b.batch_code === code);
    if (!batch) {
      setScanMsg(`No batch found for ${code}`);
      setTimeout(() => setScanMsg(null), 4000);
      return;
    }
    const pending = incoming.find(h => h.batch_id === batch.id);
    if (!pending) {
      setScanMsg(`Batch ${code} found, but no pending handoff to you. Status: ${batch.status}.`);
      setTimeout(() => setScanMsg(null), 4500);
      return;
    }
    setConfirmFor(pending);
    setReceivedWeight(String(pending.sent_weight));
    setScanMsg(`Scanned ${code} — confirm the weight below`);
    setTimeout(() => setScanMsg(null), 4500);
  };

  const sendToRecycler = async (b: Batch, r: User) => {
    setBusy(true);
    try {
      await api.initiateHandoff({
        batch_id: b.id, sender_phone: user.phone, receiver_phone: r.phone, sent_weight: b.weight_kg,
      });
      await refresh();
    } catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  };

  const userLat = user.lat ?? 12.87;
  const userLon = user.lon ?? 74.85;
  const points: MapPoint[] = [
    { lat: userLat, lon: userLon, label: user.name, sub: user.area, kind: "aggregator" },
    ...recyclers.filter(r => r.lat != null && r.lon != null).map(r => ({ lat: r.lat!, lon: r.lon!, label: r.name, sub: r.area, kind: "recycler" as const })),
    ...incoming.map(h => {
      const b = batches.find(x => x.id === h.batch_id);
      return b ? { lat: b.lat, lon: b.lon, label: b.batch_code, sub: `${b.weight_kg}kg ${b.material_type}`, kind: "batch" as const } : null;
    }).filter(Boolean) as MapPoint[],
  ];

  // ─── DAY-1 ONBOARDING VIEW ───────────────────────────────────────
  if (fresh) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        <Reveal>
          <header>
            <Eyebrow>Stage 4 · Aggregator · Day 1</Eyebrow>
            <h1 className="font-display text-4xl md:text-5xl tracking-tight2 mt-3">{user.name}</h1>
            <p className="text-sm text-muted mt-2">{user.area} · just joined the network</p>
          </header>
        </Reveal>

        <Reveal delay={100}>
          <EmptyOnboarding
            emoji="📦"
            title="Welcome. The weighbridge is empty."
            body={
              <>
                You just signed up. <span className="text-cream">Nothing has happened yet.</span> Here's what will appear once material starts flowing — usually within 1–2 weeks of NGO-led kabadiwala onboarding in your catchment.
              </>
            }
            next={{ label: "Open the WasteChain partner kit →", to: "https://github.com/" }}
            secondary="Reach out to your area NGO partner to issue QR sticker rolls to the kabadiwalas you already buy from."
          />
        </Reveal>

        <Reveal delay={200}>
          <div className="grid md:grid-cols-3 gap-4">
            <DayOneTile num="01" title="Kabadiwalas log batches"
              body="Once your upstream kabadiwalas have QR sticker rolls, every sack they weigh becomes a tracked batch. They sell to you — and the handoff lands in your inbox here." />
            <DayOneTile num="02" title="You confirm receipt"
              body="You weigh on arrival, type the number, tap confirm. 30 seconds per truck. The chain hashes automatically. Your kabadiwala is paid faster." />
            <DayOneTile num="03" title="Recyclers post bids · you forward"
              body="Recyclers post live ₹/kg bids in the morning. The matching engine routes your inventory to the best buyer in your catchment. ~15-20% price uplift vs middlemen." />
          </div>
        </Reveal>

        <Reveal delay={300}>
          <div className="bg-bg/40 border border-line/60 rounded-2xl p-6 text-sm text-slate-300 leading-relaxed">
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-accent mb-2">How the network bootstraps</div>
            <p>
              WasteChain rolls out one city at a time, in this order: <span className="text-cream">3 recyclers</span> sign first (buyer demand exists) → <span className="text-cream">2-3 aggregators</span> next (intermediate node ready) → an NGO onboards <span className="text-cream">~10 kabadiwalas</span> with QR sticker rolls and ragpicker booklets. By the time you're seeing batches arrive, the recyclers are already bidding — you never sit at a dead network.
            </p>
          </div>
        </Reveal>

        <div className="text-center">
          <p className="text-sm text-muted">To see what this dashboard looks like once the network is running, switch back to <span className="text-accent">Established</span> in the demo picker.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">
      {/* ─── HERO ──────────────────────────────────────────── */}
      <Reveal>
        <header>
          <Eyebrow>Stage 4 · Aggregator console</Eyebrow>
          <h1 className="font-display text-4xl md:text-5xl tracking-tight2 mt-3">
            {user.name}
          </h1>
          <p className="text-sm text-muted mt-2">{user.area} · the realistic active user of the network</p>
          <p className="text-slate-400 max-w-2xl mt-4 text-[15px] leading-relaxed">
            You're the truth oracle. You weigh material on arrival, you confirm what was sent, and your entries credit the kabadiwala &amp; ragpicker upstream. They never open an app — your work IS their data.
          </p>
        </header>
      </Reveal>

      {/* ─── STATS ─────────────────────────────────────────── */}
      <Reveal delay={100}>
        <div className="grid md:grid-cols-4 gap-3">
          <Stat label="Awaiting confirm" value={incoming.length} sub="incoming handoffs" accent="yellow" big />
          <Stat label="Today" value={`${todayKg.toFixed(0)}`} sub="kg confirmed" accent="cream" big />
          <Stat label="Network depth" value={senders} sub="upstream partners" big />
          <Stat label="Flagged" value={flagged} sub="discrepancies all-time" accent={flagged > 0 ? "red" : "green"} big />
        </div>
      </Reveal>

      {/* ─── SCAN A QR ──────────────────────────────────────── */}
      <Reveal delay={150}>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="bg-panel/40 border border-line/60 rounded-2xl p-5 flex flex-col justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-accent">QR scanner</div>
              <div className="font-display text-xl tracking-tight2 mt-1">Scan the sticker on the incoming sack</div>
              <div className="text-xs text-muted mt-1">Opens your camera · finds the batch · pre-fills weight.</div>
              {scanMsg && <div className="text-xs text-accent2 mt-2">{scanMsg}</div>}
            </div>
            <Btn variant="cream" size="lg" onClick={() => setScanning(true)}>📷 Scan QR</Btn>
          </div>

          <div className="bg-panel/40 border border-accent2/30 rounded-2xl p-5 flex flex-col justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-accent2 flex items-center gap-1.5">
                <span>🧠</span> AI sack inspector
              </div>
              <div className="font-display text-xl tracking-tight2 mt-1">Catch contamination before you pay</div>
              <div className="text-xs text-muted mt-1">Point your camera at the open sack. Get material breakdown + grade + price adjustment in 3 seconds.</div>
              {lastInspect && (
                <div className="mt-2 text-[11px] flex items-center gap-2 text-accent2">
                  <span className="font-display text-lg">{lastInspect.quality_grade}</span>
                  <span>Last inspect: {lastInspect.contamination_pct}% contamination · {lastInspect.price_adjustment_pct}%</span>
                </div>
              )}
            </div>
            <Btn variant="cream" size="lg" onClick={() => setInspectFor({ material: "PET" })}>
              🧠 Inspect sack
            </Btn>
          </div>
        </div>
      </Reveal>

      {/* ─── INCOMING WEIGHBRIDGE ───────────────────────────── */}
      <Reveal delay={200}>
        <Card title="Weighbridge · awaiting your confirmation" action={incoming.length > 0 && <span className="text-xs text-accent2">{incoming.length} pending</span>}>
          {incoming.length === 0 ? (
            <div className="py-12 text-center">
              <div className="text-4xl mb-3">📦</div>
              <div className="font-display text-xl tracking-tight2 text-cream">Nothing en route right now.</div>
              <div className="text-sm text-muted mt-1">When kabadiwalas send sacks your way, they land here.</div>
            </div>
          ) : (
            <div className="space-y-3">
              {incoming.map(h => {
                const b = batches.find(x => x.id === h.batch_id);
                const sender = users.find(u => u.id === h.sender_id);
                return (
                  <div key={h.id} className="bg-bg/40 border border-line/60 hover:border-accent/40 rounded-xl p-5 transition-colors">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="mono text-[10px] text-muted tracking-wide uppercase">{b?.batch_code}</div>
                        <div className="font-display text-2xl tracking-tight2 mt-1 text-cream">
                          {h.sent_weight} kg <span className="text-muted text-lg">{b?.material_type}</span>
                        </div>
                        <div className="text-sm text-muted mt-1.5">from {sender?.name} · {sender?.area}</div>
                        {b?.source_recovery_id && (
                          <Link to={`/provenance?batch=${b.id}`} className="text-[11px] text-accent hover:underline mt-2 inline-block">
                            ↑ this batch has full upstream provenance
                          </Link>
                        )}
                      </div>
                      {b?.batch_code && (
                        <div className="flex flex-col items-center gap-1">
                          <div className="bg-cream p-1.5 rounded-lg">
                            <QrCode value={b.batch_code} size={84} />
                          </div>
                          <div className="text-[9px] text-muted mono">scan me</div>
                        </div>
                      )}
                      <Btn variant="primary" size="lg" onClick={() => { setConfirmFor(h); setReceivedWeight(String(h.sent_weight)); }}>
                        Confirm receipt
                      </Btn>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </Reveal>

      {/* ─── READY TO SHIP ──────────────────────────────────── */}
      {myReadyBatches.length > 0 && (
        <Reveal delay={250}>
          <Card title="Ready to ship onward to a recycler">
            <div className="space-y-3">
              {myReadyBatches.map(b => (
                <div key={b.id} className="bg-bg/40 border border-line/60 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="mono text-[10px] text-muted uppercase tracking-wide">{b.batch_code}</div>
                    <div className="text-base mt-1"><span className="text-cream">{b.weight_kg} kg</span> <span className="text-muted">{b.material_type}</span></div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recyclers.map(r => (
                      <Btn key={r.id} variant="ghost" disabled={busy} onClick={() => sendToRecycler(b, r)}>
                        → {r.name.split("·")[0].trim()}
                      </Btn>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </Reveal>
      )}

      {/* ─── NETWORK + ACTIVITY ─────────────────────────────── */}
      <Reveal delay={300}>
        <div className="grid md:grid-cols-3 gap-5">
          <Card title="Network around you" className="md:col-span-2" padded={false}>
            <div className="p-3"><MiniMap points={points} height={320} center={[userLat, userLon]} /></div>
            <div className="px-5 pb-4 text-[11px] text-muted flex flex-wrap gap-4">
              <Legend color="bg-accent2" label="you" />
              <Legend color="bg-blue-400" label="recyclers" />
              <Legend color="bg-accent" label="incoming batches" />
            </div>
          </Card>
          <Card title="Throughput · last 7 days">
            <ThroughputChart completed={completed} />
            <div className="mt-4 pt-4 border-t border-line/40 text-xs text-muted">
              Total: <span className="text-cream font-medium">{totalKg.toFixed(0)} kg</span> across {completed.length} confirmed handoffs.
            </div>
          </Card>
        </div>
      </Reveal>

      {/* ─── RECENT ACTIVITY ────────────────────────────────── */}
      <Reveal delay={400}>
        <Card title="Recent activity">
          {completed.length === 0 ? <Empty>No activity yet.</Empty> :
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[10.5px] uppercase tracking-[0.12em] text-muted">
                  <tr className="border-b border-line/40">
                    <th className="text-left py-3 pl-2 font-medium">Batch</th>
                    <th className="text-left py-3 font-medium">Sender</th>
                    <th className="text-left py-3 font-medium">Sent</th>
                    <th className="text-left py-3 font-medium">Received</th>
                    <th className="text-left py-3 font-medium">Variance</th>
                    <th className="text-left py-3 font-medium">Proof</th>
                    <th className="text-left py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {completed.slice(0, 12).map(h => {
                    const sender = users.find(u => u.id === h.sender_id);
                    return (
                      <tr key={h.id} className="border-t border-line/40 hover:bg-bg/20 transition-colors">
                        <td className="py-3 pl-2 mono text-[11px] text-muted">#{h.batch_id}</td>
                        <td className="py-3 text-xs">{sender?.name || "—"}</td>
                        <td className="py-3">{h.sent_weight} kg</td>
                        <td className="py-3">{h.received_weight} kg</td>
                        <td className={`py-3 font-medium ${h.discrepancy_flag ? "text-danger" : "text-muted"}`}>
                          {h.discrepancy_pct?.toFixed(1)}%
                        </td>
                        <td className="py-3"><PhotoThumb dataUrl={h.photo_data_url} hash={h.photo_hash} /></td>
                        <td className="py-3"><StatusPill status={h.status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          }
        </Card>
      </Reveal>

      {/* ─── QR SCANNER OVERLAY ─────────────────────────────── */}
      {scanning && <QrScanner onScan={handleScan} onClose={() => setScanning(false)} />}

      {/* ─── AI INSPECTOR OVERLAY ───────────────────────────── */}
      {inspectFor && (
        <InspectModal
          defaultMaterial={inspectFor.material}
          onClose={() => setInspectFor(null)}
          onResult={(r) => setLastInspect(r)}
        />
      )}

      {/* ─── CONFIRM MODAL ──────────────────────────────────── */}
      {confirmFor && (
        <div className="fixed inset-0 bg-bg/85 backdrop-blur-md z-[1000] grid place-items-center p-4 animate-fade-in" onClick={() => setConfirmFor(null)}>
          <div className="bg-panel border border-line rounded-2xl max-w-md w-full shadow-card" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-line/60">
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted">Confirm receipt</div>
              <div className="font-display text-2xl tracking-tight2 mt-1.5">Weigh, then enter.</div>
            </div>
            <div className="p-6 space-y-4">
              <div className="text-sm text-muted">
                Sender claimed <span className="text-cream font-medium">{confirmFor.sent_weight} kg</span>.
                What does your scale say?
              </div>
              <input type="number" inputMode="decimal" value={receivedWeight} onChange={(e) => setReceivedWeight(e.target.value)}
                autoFocus
                className="w-full bg-bg/60 border border-line/80 focus:border-accent rounded-xl px-4 py-4 text-4xl font-display tracking-tight2 outline-none text-center" />
              <div className="text-[11px] text-muted text-center">
                Variances &gt; 5% flag both parties and ding reputation.
              </div>
              <PhotoCapture value={photo} onCapture={setPhoto} label="Sack at the gate" />
              <div className="flex justify-end gap-2 pt-2">
                <Btn variant="ghost" onClick={() => { setConfirmFor(null); setPhoto(null); }}>Cancel</Btn>
                <Btn onClick={confirm} disabled={busy || !receivedWeight || !photo}>Confirm</Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span><span className={`inline-block w-2 h-2 rounded-full align-middle mr-1.5 ${color}`}/> {label}</span>;
}

function ThroughputChart({ completed }: { completed: Handoff[] }) {
  // 7-day bar chart, no recharts to keep it light + on-brand
  const days = useMemo(() => {
    const arr: { label: string; kg: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ymd = d.toISOString().slice(0, 10);
      const kg = completed
        .filter(h => h.confirmed_at?.startsWith(ymd))
        .reduce((s, h) => s + (h.received_weight || 0), 0);
      arr.push({ label: d.toLocaleDateString(undefined, { weekday: "short" }), kg });
    }
    return arr;
  }, [completed]);
  const max = Math.max(1, ...days.map(d => d.kg));
  return (
    <div className="flex items-end gap-1.5 h-32">
      {days.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1.5 group">
          <div className="w-full bg-accent/20 hover:bg-accent/40 rounded-t transition-colors" style={{ height: `${(d.kg / max) * 100}%`, minHeight: 2 }} />
          <div className="text-[10px] text-muted">{d.label}</div>
        </div>
      ))}
    </div>
  );
}

function Gate({ to, expected }: { to: string; expected: string }) {
  return (
    <div className="max-w-2xl mx-auto px-6 py-24 text-center">
      <div className="text-5xl mb-4">🔒</div>
      <div className="font-display text-2xl tracking-tight2">Switch to a {expected} persona</div>
      <p className="text-sm text-muted mt-2">Open the persona picker top-right and pick someone whose role is <span className="text-accent">{expected}</span>.</p>
    </div>
  );
}

function DayOneTile({ num, title, body }: { num: string; title: string; body: string }) {
  return (
    <div className="bg-panel/40 border border-line/60 rounded-2xl p-5">
      <div className="font-display text-2xl tracking-tight2 text-accent/60 mono">{num}</div>
      <div className="font-semibold text-cream mt-1">{title}</div>
      <div className="text-sm text-slate-400 mt-2 leading-relaxed">{body}</div>
    </div>
  );
}
