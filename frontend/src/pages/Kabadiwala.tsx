import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useCurrentUser, useFreshMode } from "../session";
import { api, Batch, Match, Handoff } from "../api";
import { Card, Stat, Btn, Hash, Empty, Eyebrow, Reveal } from "../components/ui";
import { EmptyOnboarding } from "../components/EmptyState";
import { PrintableSticker } from "../components/Qr";
import { CarbonPill } from "../components/CarbonImpact";
import clsx from "clsx";

export default function Kabadiwala() {
  const [user] = useCurrentUser();
  const [fresh] = useFreshMode();
  const [batches, setBatchesRaw] = useState<Batch[]>([]);
  const [latestMatches, setLatestMatches] = useState<Record<number, Match[]>>({});
  const [handoffs, setHandoffsRaw] = useState<Handoff[]>([]);

  const [stickerFor, setStickerFor] = useState<Batch | null>(null);

  if (!user || user.role !== "kabadiwala") {
    return <Gate expected="kabadiwala" />;
  }

  const setBatches = (b: Batch[]) => setBatchesRaw(fresh ? [] : b);
  const setHandoffs = (h: Handoff[]) => setHandoffsRaw(fresh ? [] : h);

  const refresh = async () => {
    const [b, h] = await Promise.all([
      api.batches({ creator_phone: user.phone }),
      api.handoffs({ user_phone: user.phone }),
    ]);
    setBatches(b);
    setHandoffs(h);
    // Get matches for available batches
    const available = b.filter(x => x.status === "AVAILABLE").slice(0, 5);
    const ms: Record<number, Match[]> = {};
    for (const ab of available) {
      try { ms[ab.id] = await api.batchMatches(ab.id); } catch { ms[ab.id] = []; }
    }
    setLatestMatches(fresh ? {} : ms);
  };
  useEffect(() => { refresh(); }, [user?.id, fresh]);

  // Build a unified "notifications" feed — chronological mix of batch creations,
  // match recommendations, handoff updates. Each one is the SMS/WhatsApp the
  // kabadiwala would actually receive.
  const notifs = buildNotifFeed(batches, handoffs, latestMatches);
  const totalKg = batches.reduce((s, b) => s + b.weight_kg, 0);
  const totalInr = handoffs.reduce((s, h) => {
    if (h.sender_id === user.id && h.received_weight && h.price_per_kg) {
      return s + (h.received_weight * h.price_per_kg);
    }
    return s;
  }, 0);

  if (fresh) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        <Reveal>
          <header>
            <Eyebrow>Stage 4 · Kabadiwala · Day 1</Eyebrow>
            <h1 className="font-display text-4xl md:text-5xl tracking-tight2 mt-3">{user.name}</h1>
            <p className="text-sm text-muted mt-2">{user.area} · phone {user.phone} · just enrolled</p>
          </header>
        </Reveal>

        <Reveal delay={100}>
          <EmptyOnboarding
            emoji="🏪"
            title="No messages yet."
            body={
              <>
                You just enrolled. The NGO field worker dropped off a <span className="text-cream">QR sticker roll</span> and a <span className="text-cream">ragpicker receipt booklet</span> — that's the entire kit.
                The next time you weigh a sack, the aggregator at the other end logs it and you get a WhatsApp message with the price your buyer offered.
              </>
            }
            next={{ label: "Text 'HI' to +91 99-WC-SMS  →", to: "/sms" }}
            secondary="No app to install, ever. Numbered SMS menus only — works on every phone."
          />
        </Reveal>

        <Reveal delay={200}>
          <div className="grid sm:grid-cols-2 gap-4">
            <DayOneTile num="01" title="Sticker on every sack"
              body="When you weigh a sack of PET / paper / cardboard, slap a QR sticker on it. That's the batch ID. Hand it to whoever you sell to." />
            <DayOneTile num="02" title="Paper QR slip to every ragpicker"
              body="When a ragpicker sells to you, tear off a slip from your booklet, write the weight, give them the paper. They get a tamper-proof record without owning a phone." />
            <DayOneTile num="03" title="Aggregator does the data entry"
              body="When they buy from you, they enter the QR + weight on their phone. The chain credits you and the ragpicker automatically. No work for you." />
            <DayOneTile num="04" title="You get a WhatsApp / SMS"
              body="After every confirmed sale, you get a message: ‘Sold 42kg PET · ₹882 credited · +₹336 above your usual.' One per transaction. That's it." />
          </div>
        </Reveal>

        <div className="text-center">
          <p className="text-sm text-muted">Switch to <span className="text-accent">Established</span> in the demo picker to see what this view looks like after a few weeks of activity.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
      <Reveal>
        <header>
          <Eyebrow>Stage 4 · Kabadiwala</Eyebrow>
          <h1 className="font-display text-4xl md:text-5xl tracking-tight2 mt-3">{user.name}</h1>
          <p className="text-sm text-muted mt-2">{user.area} · {user.phone}</p>
          <p className="text-slate-400 max-w-2xl mt-4 text-[15px] leading-relaxed">
            The kabadiwala doesn't actively use an app. They <span className="text-cream">receive WhatsApp / SMS messages</span> — one for each transaction. This is what their phone shows them.
          </p>
        </header>
      </Reveal>

      <Reveal delay={100}>
        <div className="grid md:grid-cols-3 gap-3">
          <Stat label="My batches" value={batches.length} sub={`${totalKg.toFixed(0)} kg total`} big />
          <Stat label="Reputation" value={user.reputation_score.toFixed(0)} sub="/ 100" accent="yellow" big />
          <Stat label="This week (est)" value={`₹${(totalInr).toFixed(0)}`} sub="across confirmed handoffs" accent="cream" big />
        </div>
      </Reveal>

      <div className="grid lg:grid-cols-3 gap-6 lg:gap-8">
        {/* Phone-style notification feed */}
        <Reveal delay={200} className="lg:col-span-2">
          <div className="bg-panel/40 border border-line/60 rounded-2xl">
            <div className="px-6 py-4 border-b border-line/60 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-muted">WhatsApp · WasteChain</div>
                <div className="font-display text-lg tracking-tight2 mt-0.5">Your messages today</div>
              </div>
              <Link to="/sms" className="text-xs text-accent hover:underline">Open SMS bot →</Link>
            </div>
            <div className="p-4 max-h-[560px] overflow-y-auto bg-bg/30">
              {notifs.length === 0 ? <Empty>No notifications yet.</Empty> :
                <div className="space-y-2">
                  {notifs.map((n, i) => <NotifBubble key={i} {...n} />)}
                </div>
              }
            </div>
          </div>
        </Reveal>

        {/* Side: available batches + actions */}
        <Reveal delay={300}>
          <Card title="Sacks needing a buyer">
            {batches.filter(b => b.status === "AVAILABLE").length === 0 ? (
              <Empty>Nothing to sell right now.</Empty>
            ) : (
              <div className="space-y-3">
                {batches.filter(b => b.status === "AVAILABLE").slice(0, 4).map(b => {
                  const m = latestMatches[b.id]?.[0];
                  return (
                    <div key={b.id} className="bg-bg/40 border border-line/60 rounded-xl p-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="mono text-[10px] text-muted">{b.batch_code}</div>
                          <div className="text-sm mt-1"><span className="text-cream">{b.weight_kg} kg</span> {b.material_type}</div>
                        </div>
                        <button onClick={() => setStickerFor(b)}
                          className="text-[10px] mono bg-cream/10 hover:bg-cream/20 text-cream px-2 py-1 rounded border border-cream/30">
                          🏷️ QR
                        </button>
                      </div>
                      <div className="mt-2">
                        <CarbonPill material={b.material_type} weightKg={b.weight_kg} />
                      </div>
                      {m && (
                        <>
                          <div className="text-[11px] text-muted mt-2">Top buyer right now</div>
                          <div className="flex items-end justify-between gap-2 mt-1">
                            <div>
                              <div className="text-xs">{m.recycler_name.split("·")[0]}</div>
                              <div className="text-[10px] text-muted">{m.distance_km}km · ₹{m.price_per_kg}/kg</div>
                            </div>
                            <div className="text-right">
                              <div className="text-accent2 font-display text-lg tracking-tight2">₹{m.expected_earnings_inr.toFixed(0)}</div>
                              <div className="text-[9px] text-accent">+₹{m.earnings_delta_inr.toFixed(0)} vs usual</div>
                            </div>
                          </div>
                        </>
                      )}
                      {b.source_recovery_id && (
                        <Link to={`/provenance?batch=${b.id}`} className="text-[10px] text-accent hover:underline mt-2 inline-block">
                          ↑ has upstream provenance
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </Reveal>
      </div>

      {stickerFor && (
        <div className="fixed inset-0 bg-bg/90 backdrop-blur-md z-[1000] grid place-items-center p-4 animate-fade-in" onClick={() => setStickerFor(null)}>
          <div onClick={(e) => e.stopPropagation()} className="space-y-4">
            <PrintableSticker
              code={stickerFor.batch_code}
              material={stickerFor.material_type}
              weight={stickerFor.weight_kg}
              area={stickerFor.area || undefined}
              hash={stickerFor.record_hash}
            />
            <div className="text-center text-xs text-muted">
              The sticker that goes on the sack. Print on a ₹50 thermal label printer or paste a pre-printed roll.
            </div>
            <div className="text-center">
              <button onClick={() => setStickerFor(null)} className="text-xs text-cream hover:underline">Tap anywhere to close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type Notif = { kind: "batch_created" | "match" | "handoff_confirmed" | "handoff_disputed"; ts: string; body: string; meta?: string; accent?: string };

function buildNotifFeed(batches: Batch[], handoffs: Handoff[], matches: Record<number, Match[]>): Notif[] {
  const out: Notif[] = [];
  for (const b of batches.slice(0, 20)) {
    out.push({
      kind: "batch_created", ts: b.created_at,
      body: `Batch ${b.batch_code} logged.\n${b.weight_kg}kg ${b.material_type}.`,
      meta: `chain hash ${b.record_hash.slice(0, 10)}`,
    });
    const m = matches[b.id]?.[0];
    if (m) {
      out.push({
        kind: "match", ts: b.created_at,
        body: `Best buyer today: ${m.recycler_name}\n₹${m.price_per_kg}/kg = ₹${m.expected_earnings_inr.toFixed(0)} on this sack`,
        meta: m.earnings_delta_inr > 0 ? `+₹${m.earnings_delta_inr.toFixed(0)} more than your usual price` : undefined,
        accent: "match",
      });
    }
  }
  for (const h of handoffs.slice(0, 15)) {
    if (h.status === "CONFIRMED") {
      out.push({
        kind: "handoff_confirmed", ts: h.confirmed_at || h.initiated_at,
        body: `Handoff #${h.id} confirmed.\nReceived ${h.received_weight}kg (you sent ${h.sent_weight}kg).`,
        meta: h.price_per_kg ? `Payment of ₹${(h.received_weight! * h.price_per_kg).toFixed(0)} on its way` : undefined,
      });
    } else if (h.status === "DISPUTED") {
      out.push({
        kind: "handoff_disputed", ts: h.confirmed_at || h.initiated_at,
        body: `⚠ Handoff #${h.id} flagged.\nReceived ${h.received_weight}kg vs ${h.sent_weight}kg sent — ${h.discrepancy_pct?.toFixed(0)}% variance.`,
        meta: "Both parties' reputation has been adjusted.",
        accent: "danger",
      });
    }
  }
  return out.sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 30);
}

function NotifBubble({ kind, ts, body, meta, accent }: Notif) {
  const isMatch = accent === "match";
  const isDanger = accent === "danger";
  return (
    <div className="flex justify-start animate-fade-in">
      <div className={clsx(
        "max-w-[85%] px-4 py-3 rounded-2xl rounded-bl-md text-sm whitespace-pre-line break-words border",
        isMatch ? "bg-accent/8 border-accent/30" :
        isDanger ? "bg-danger/10 border-danger/40" :
        "bg-bg/70 border-line/60"
      )}>
        <div className="leading-relaxed">{body}</div>
        {meta && (
          <div className={clsx("text-[11px] mt-2 pt-2 border-t",
            isMatch ? "text-accent border-accent/20" :
            isDanger ? "text-danger border-danger/30" :
            "text-muted border-line/40"
          )}>{meta}</div>
        )}
        <div className="text-[10px] text-muted/70 mt-2 mono">{new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
      </div>
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

function DayOneTile({ num, title, body }: { num: string; title: string; body: string }) {
  return (
    <div className="bg-panel/40 border border-line/60 rounded-2xl p-5">
      <div className="font-display text-2xl tracking-tight2 text-accent/60 mono">{num}</div>
      <div className="font-semibold text-cream mt-1">{title}</div>
      <div className="text-sm text-slate-400 mt-2 leading-relaxed">{body}</div>
    </div>
  );
}
