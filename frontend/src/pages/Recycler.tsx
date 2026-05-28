import { useEffect, useState } from "react";
import { useCurrentUser, useFreshMode } from "../session";
import { api, Bid, Batch, Handoff, User } from "../api";
import { Card, Stat, Btn, Eyebrow, Reveal, Empty, Hash } from "../components/ui";
import { EmptyOnboarding } from "../components/EmptyState";
import { MiniMap, MapPoint } from "../components/Map";
import { QrScanner, QrCode } from "../components/Qr";
import { PhotoCapture } from "../components/PhotoCapture";

const MATERIALS = ["PET", "PAPER", "CARDBOARD", "METAL", "GLASS"];

export default function Recycler() {
  const [user] = useCurrentUser();
  const [fresh] = useFreshMode();
  const [bidsRaw, setBidsRaw] = useState<Bid[]>([]);
  const [allBatches, setAllBatches] = useState<Batch[]>([]);
  const [handoffsRaw, setHandoffsRaw] = useState<Handoff[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const bids = fresh ? [] : bidsRaw;
  const handoffs = fresh ? [] : handoffsRaw;
  const setBids = setBidsRaw;
  const setHandoffs = setHandoffsRaw;
  const [busy, setBusy] = useState(false);
  const [confirmFor, setConfirmFor] = useState<Handoff | null>(null);
  const [receivedWeight, setReceivedWeight] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);

  // bid form
  const [bidMat, setBidMat] = useState("PET");
  const [bidQty, setBidQty] = useState("");
  const [bidPrice, setBidPrice] = useState("");
  const [bidHours, setBidHours] = useState("24");

  if (!user || user.role !== "recycler") return <Gate expected="recycler" />;

  const refresh = async () => {
    const [b, bs, h, u] = await Promise.all([
      api.bids(user.phone), api.batches({ status: "AVAILABLE" }),
      api.handoffs({ user_phone: user.phone }), api.users(),
    ]);
    setBids(b); setAllBatches(bs); setHandoffs(h); setUsers(u);
  };
  useEffect(() => { refresh(); }, [user?.id, fresh]);

  const myMaterials = new Set(bids.filter(b => b.active).map(b => b.material_type));
  const relevantSupply = allBatches.filter(b => myMaterials.has(b.material_type));
  const incoming = handoffs.filter(h => h.receiver_id === user.id && h.status === "PENDING");
  const delivered = handoffs.filter(h => h.receiver_id === user.id && h.status !== "PENDING");
  const totalReceivedKg = delivered.reduce((s, h) => s + (h.received_weight || 0), 0);

  const postBid = async () => {
    if (!bidQty || !bidPrice) return;
    setBusy(true);
    try {
      await api.createBid({
        recycler_phone: user.phone, material_type: bidMat,
        quantity_needed_kg: parseFloat(bidQty), price_per_kg: parseFloat(bidPrice),
        valid_hours: parseInt(bidHours) || 24,
      });
      setBidQty(""); setBidPrice("");
      await refresh();
    } finally { setBusy(false); }
  };
  const cancelBid = async (id: number) => { setBusy(true); try { await api.cancelBid(id); await refresh(); } finally { setBusy(false); } };
  const confirm = async () => {
    if (!confirmFor) return;
    const w = parseFloat(receivedWeight); if (!w) return;
    if (!photo) { alert("Photo evidence required at the factory gate."); return; }
    setBusy(true);
    try {
      await api.confirmHandoff({
        handoff_id: confirmFor.id, receiver_phone: user.phone,
        received_weight: w, photo_data_url: photo,
      });
      setConfirmFor(null); setReceivedWeight(""); setPhoto(null); await refresh();
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  const userLat = user.lat ?? 12.87;
  const userLon = user.lon ?? 74.85;
  const points: MapPoint[] = [
    { lat: userLat, lon: userLon, label: user.name, sub: user.area, kind: "recycler" },
    ...relevantSupply.slice(0, 30).map(b => ({
      lat: b.lat, lon: b.lon, label: b.batch_code,
      sub: `${b.weight_kg}kg ${b.material_type}`, kind: "batch" as const,
    })),
  ];

  const handleScan = async (code: string) => {
    setScanning(false);
    const all = await api.handoffs({ user_phone: user.phone });
    const pending = all.find(h => h.status === "PENDING" && h.receiver_id === user.id);
    // Find the handoff whose batch matches the scanned code
    const matchPending: Handoff | undefined = (() => {
      const all2 = handoffs;
      const candidate = all2.find(h => {
        const b = allBatches.find(x => x.id === h.batch_id);
        return h.status === "PENDING" && h.receiver_id === user.id && b?.batch_code === code;
      });
      return candidate;
    })();
    const target = matchPending || pending;
    if (!target) {
      setScanMsg(`No pending arrival for ${code}`);
      setTimeout(() => setScanMsg(null), 4000);
      return;
    }
    setConfirmFor(target);
    setReceivedWeight(String(target.sent_weight));
    setScanMsg(`Scanned ${code} — confirm at the gate`);
    setTimeout(() => setScanMsg(null), 4500);
  };

  if (fresh) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        <Reveal>
          <header>
            <Eyebrow>Stage 5 · Recycler · Day 1</Eyebrow>
            <h1 className="font-display text-4xl md:text-5xl tracking-tight2 mt-3">{user.name}</h1>
            <p className="text-sm text-muted mt-2">{user.area} · just joined the network</p>
          </header>
        </Reveal>

        <Reveal delay={100}>
          <EmptyOnboarding
            emoji="🏭"
            title="Post your first bid."
            body={
              <>
                You're the first signup in your material × region. <span className="text-cream">Post a bid</span> — that's the trigger. The matching engine sends your offer to every kabadiwala in range who has matching material. Within a week, sacks start arriving.
              </>
            }
            next={{ label: "Post your first bid →", onClick: () => window.scrollBy({ top: 400, behavior: "smooth" }) }}
            secondary="Most recyclers sign up before kabadiwalas in their catchment — your bid IS the demand signal that brings them on."
          />
        </Reveal>

        <Reveal delay={200}>
          <div className="grid sm:grid-cols-3 gap-4">
            <DayOneTile num="01" title="Post bid"
              body="Material, quantity needed, ₹/kg. Valid 24h. Kabadiwalas in range see this as their best buyer of the day." />
            <DayOneTile num="02" title="Material arrives"
              body="Aggregators consolidate sacks from kabadiwalas and ship to you. Each arrival has a QR sticker = batch ID." />
            <DayOneTile num="03" title="Confirm at gate"
              body="Scan the QR, weigh on your scale, type the number. Chain closes. Payment to upstream parties releases automatically." />
          </div>
        </Reveal>

        <div className="text-center">
          <p className="text-sm text-muted">Switch to <span className="text-accent">Established</span> to see what this looks like with active bids + a full supply forecast map.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">
      <Reveal>
        <header>
          <Eyebrow>Stage 5 · Recycler</Eyebrow>
          <h1 className="font-display text-4xl md:text-5xl tracking-tight2 mt-3">{user.name}</h1>
          <p className="text-sm text-muted mt-2">{user.area}</p>
          <p className="text-slate-400 max-w-2xl mt-4 text-[15px] leading-relaxed">
            The terminal step. You post live bids in the morning, confirm receipt at the weighbridge, and the chain closes. Your weight is the ground truth — discrepancies that survive to here flag everyone upstream.
          </p>
        </header>
      </Reveal>

      <Reveal delay={100}>
        <div className="grid md:grid-cols-4 gap-3">
          <Stat label="Open bids" value={bids.filter(b => b.active).length} big />
          <Stat label="Awaiting confirm" value={incoming.length} accent="yellow" big />
          <Stat label="Supply nearby" value={relevantSupply.length} sub="matching batches" big />
          <Stat label="Received" value={`${totalReceivedKg.toFixed(0)} kg`} accent="cream" big />
        </div>
      </Reveal>

      <Reveal delay={200}>
        <div className="grid md:grid-cols-2 gap-5">
          <Card title="Post a fresh bid">
            <div className="space-y-4">
              <div>
                <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted mb-2">Material</div>
                <div className="grid grid-cols-5 gap-1.5">
                  {MATERIALS.map(m => (
                    <button key={m} onClick={() => setBidMat(m)}
                      className={`py-2 text-xs rounded-lg border transition ${bidMat === m ? "bg-accent text-bg border-accent font-semibold" : "bg-bg/40 border-line/60 hover:border-accent/50"}`}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Qty (kg)" value={bidQty} onChange={setBidQty} />
                <Field label="₹/kg" value={bidPrice} onChange={setBidPrice} />
                <Field label="Valid (h)" value={bidHours} onChange={setBidHours} />
              </div>
              <div className="flex justify-end pt-1">
                <Btn onClick={postBid} disabled={busy || !bidQty || !bidPrice}>Post bid</Btn>
              </div>
            </div>
          </Card>

          <Card title={`My open bids · ${bids.filter(b => b.active).length}`}>
            {bids.length === 0 ? <Empty>No bids yet.</Empty> :
              <div className="space-y-2 max-h-[280px] overflow-y-auto">
                {bids.map(b => (
                  <div key={b.id} className={`flex items-center justify-between p-3 rounded-xl border ${b.active ? "bg-bg/40 border-line/60" : "bg-bg/20 border-line/30 opacity-50"}`}>
                    <div>
                      <div className="text-sm">{b.material_type} · {b.quantity_needed_kg} kg @ <span className="text-accent">₹{b.price_per_kg}/kg</span></div>
                      <div className="text-[11px] text-muted mt-0.5">valid until {new Date(b.valid_until).toLocaleString()}</div>
                    </div>
                    {b.active && <Btn variant="ghost" size="sm" onClick={() => cancelBid(b.id)} disabled={busy}>Cancel</Btn>}
                  </div>
                ))}
              </div>
            }
          </Card>
        </div>
      </Reveal>

      <Reveal delay={250}>
        <div className="bg-panel/40 border border-line/60 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-accent">QR gate scanner</div>
            <div className="font-display text-xl tracking-tight2 mt-1">Truck pulls up · scan the sack</div>
            <div className="text-xs text-muted mt-1">Camera opens. Decode the QR. The matching incoming handoff opens for confirmation.</div>
            {scanMsg && <div className="text-xs text-accent2 mt-2">{scanMsg}</div>}
          </div>
          <Btn variant="cream" size="lg" onClick={() => setScanning(true)}>📷 Scan QR at the gate</Btn>
        </div>
      </Reveal>

      <Reveal delay={300}>
        <div className="grid md:grid-cols-3 gap-5">
          <Card title={`Incoming · ${incoming.length}`} className="md:col-span-1">
            {incoming.length === 0 ? <Empty>Nothing en route.</Empty> :
              <div className="space-y-3">
                {incoming.map(h => {
                  const b = allBatches.find(x => x.id === h.batch_id);
                  return (
                    <div key={h.id} className="bg-bg/40 border border-line/60 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="mono text-[10px] text-muted">{b?.batch_code || `batch #${h.batch_id}`}</div>
                          <div className="font-display text-2xl tracking-tight2 text-cream mt-1">{h.sent_weight} kg</div>
                        </div>
                        {b?.batch_code && (
                          <div className="bg-cream p-1 rounded">
                            <QrCode value={b.batch_code} size={56} />
                          </div>
                        )}
                      </div>
                      <Btn className="mt-3 w-full" onClick={() => { setConfirmFor(h); setReceivedWeight(String(h.sent_weight)); }}>
                        Confirm receipt
                      </Btn>
                    </div>
                  );
                })}
              </div>
            }
          </Card>

          <Card title="Supply forecast · matching your open bids" className="md:col-span-2" padded={false}>
            <div className="p-3"><MiniMap points={points} height={320} center={[userLat, userLon]} /></div>
            <div className="px-5 pb-4 text-[11px] text-muted">
              {relevantSupply.length} available batches matching your bids · most weight in your catchment.
            </div>
          </Card>
        </div>
      </Reveal>

      {scanning && <QrScanner onScan={handleScan} onClose={() => setScanning(false)} />}

      {confirmFor && (
        <div className="fixed inset-0 bg-bg/85 backdrop-blur-md z-[1000] grid place-items-center p-4 animate-fade-in" onClick={() => setConfirmFor(null)}>
          <div className="bg-panel border border-line rounded-2xl max-w-md w-full shadow-card" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-line/60">
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted">Confirm receipt</div>
              <div className="font-display text-2xl tracking-tight2 mt-1.5">Weigh at the gate.</div>
            </div>
            <div className="p-6 space-y-4">
              <div className="text-sm text-muted">Sent: <span className="text-cream font-medium">{confirmFor.sent_weight} kg</span></div>
              <input type="number" inputMode="decimal" value={receivedWeight} onChange={(e) => setReceivedWeight(e.target.value)}
                autoFocus
                className="w-full bg-bg/60 border border-line/80 focus:border-accent rounded-xl px-4 py-4 text-4xl font-display tracking-tight2 outline-none text-center" />
              <PhotoCapture value={photo} onCapture={setPhoto} label="Sack at the factory gate" />
              <div className="flex justify-end gap-2 pt-1">
                <Btn variant="ghost" onClick={() => { setConfirmFor(null); setPhoto(null); }}>Cancel</Btn>
                <Btn onClick={confirm} disabled={busy || !photo}>Confirm</Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted">{label}</div>
      <input type="number" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-bg/40 border border-line/60 focus:border-accent rounded-lg px-3 py-2 mt-1 outline-none" />
    </div>
  );
}

function Gate({ expected }: { expected: string }) {
  return (
    <div className="max-w-2xl mx-auto px-6 py-24 text-center">
      <div className="text-5xl mb-4">🔒</div>
      <div className="font-display text-2xl tracking-tight2">Switch to a {expected} persona</div>
      <p className="text-sm text-muted mt-2">Pick someone whose role is <span className="text-accent">{expected}</span>.</p>
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
