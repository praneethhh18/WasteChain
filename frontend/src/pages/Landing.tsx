import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { api, MunicipalityStats, User, Organization } from "../api";
import { Eyebrow, CountUp, Reveal, Btn } from "../components/ui";
import { setCurrentUser, setJudgeMode } from "../session";
import clsx from "clsx";

const STAGES = [
  { num: 1, label: "Household",  emoji: "🏠",
    body: "A bottle gets thrown in a bin in any urban ward. No tracking here — too cheap to RFID every item.", system: "no data captured" },
  { num: 2, label: "Collector",  emoji: "🚛",
    body: "A municipal truck driver runs the route. GPS auto-logs the path. One tap at the dump point.", system: "1 route + GPS trail" },
  { num: 3, label: "Ragpicker", emoji: "♻️",
    body: "A ragpicker sorts the pile, pulls out the bottle and others like it. They get a paper QR receipt for every sack sold.", system: "1 recovery + paper receipt" },
  { num: 4, label: "Kabadiwala", emoji: "🏪",
    body: "The kabadiwala weighs the sack at their shop. A QR sticker goes on it. They get a WhatsApp with the buyer's price.", system: "1 batch · QR sticker is the ID" },
  { num: 5, label: "Recycler",   emoji: "🏭",
    body: "The recycler factory scans the QR at the gate, confirms the weight. Chain complete. Money settles.", system: "1 handoff · chain closed" },
];

export default function Landing() {
  const [stats, setStats] = useState<MunicipalityStats | null>(null);
  const [showSignin, setShowSignin] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const nav = useNavigate();

  useEffect(() => { api.municipalityStats().then(setStats).catch(() => {}); }, []);
  useEffect(() => { api.users().then(setUsers).catch(() => {}); }, []);

  const ROLE_HOME: Record<string, string> = {
    collector: "/collector", ragpicker: "/ragpicker", kabadiwala: "/kabadiwala",
    aggregator: "/aggregator", recycler: "/recycler", municipality: "/municipality",
  };
  const signInAs = (u: User) => {
    setCurrentUser(u);
    setShowSignin(false);
    nav(ROLE_HOME[u.role] || "/");
  };
  const openJudgeMode = () => {
    setJudgeMode(true);
    // No persona — drop straight into the guided walkthrough
    nav("/workflow");
  };

  return (
    <div>
      {/* ─── HERO ────────────────────────────────────────────────── */}
      <section className="relative">
        <div className="max-w-7xl mx-auto px-6 pt-24 md:pt-32 pb-20">
          <Eyebrow>Live · demo deployment</Eyebrow>
          <h1 className="font-display text-5xl md:text-7xl tracking-tight2 leading-[1.02] mt-5 max-w-4xl">
            India already moves
            <br />
            <span className="text-accent">₹4,200 crore</span> of recyclables.
            <br />
            <span className="text-muted/70 italic font-light">Nobody knows where.</span>
          </h1>

          <p className="text-lg text-slate-300 mt-7 max-w-2xl leading-relaxed">
            WasteChain is the intelligent data layer on top of the chain that already moves
            India's waste — household to collector to ragpicker to kabadiwala to recycler.
            We track every kilo. Every handoff. Hashed end-to-end.
          </p>

          <div className="flex flex-wrap gap-3 mt-9">
            <Btn size="xl" onClick={() => nav("/setup")}>🏛️ Set up my deployment</Btn>
            <Btn variant="ghost" size="xl" onClick={() => setShowSignin(true)}>Sign in to existing</Btn>
            <Btn variant="ghost" size="xl" onClick={openJudgeMode}>🎭 Explore the demo</Btn>
          </div>
          <p className="text-xs text-muted mt-3 max-w-xl">
            Any city corporation, town/village panchayat, recycler, or NGO can set up their own deployment in 60 seconds. A fictional pre-seeded deployment lets you explore a working network — all names are placeholders. The platform is multi-tenant by design.
          </p>

          {/* Live stats strip */}
          {stats && (
            <Reveal>
              <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-0 border-t border-line/60 pt-8">
                <BigNumber to={Math.round(stats.total_recovered_kg_month)} suffix=" kg" label="Recovered this month" />
                <BigNumber to={stats.active_collectors} label="Collectors on the network" />
                <BigNumber to={Math.round(stats.landfill_diversion_pct)} suffix="%" label="Diverted from landfill today" />
                <BigNumber to={stats.flagged_handoffs} label="Discrepancies caught" accent="yellow" />
              </div>
            </Reveal>
          )}
        </div>
      </section>

      {/* ─── ROLE PICKER ────────────────────────────────────── */}
      {/* One-click sign-in as each of the 6 actors in the chain — designed
          so a visitor with zero context can understand the product by
          clicking, no video / walkthrough required. */}
      <section className="max-w-7xl mx-auto px-6 py-14 border-t border-line/40">
        <Reveal>
          <div className="flex items-end justify-between flex-wrap gap-3 mb-6">
            <div>
              <Eyebrow>Start here · Walk in their shoes</Eyebrow>
              <h2 className="font-display text-3xl md:text-4xl tracking-tight2 mt-2 leading-tight">
                See the system through every actor's eyes.
              </h2>
              <p className="text-slate-300 mt-3 max-w-2xl text-sm leading-relaxed">
                <span className="text-cream font-medium">First time here?</span> Click any role card below to instantly become that actor and see their dashboard. No password. No setup. Each page tells you what you're looking at. Switch back via the persona pill top-right or the WasteChain logo.
              </p>
            </div>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ROLE_PICKER_CARDS.map(card => (
              <RoleCard key={card.role} card={card} users={users} onPick={signInAs} />
            ))}
          </div>
        </Reveal>
      </section>

      {/* ─── LIVE MAP CTA ───────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 py-12 border-t border-line/40">
        <Reveal>
          <div className="bg-gradient-to-br from-accent/10 via-bg/0 to-accent2/5 border border-accent/30 rounded-3xl p-8 md:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex-1">
              <div className="text-[10px] uppercase tracking-[0.18em] text-accent flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" /> Live · for city corporations
              </div>
              <h2 className="font-display text-3xl md:text-4xl tracking-tight2 mt-3 leading-tight">
                Where is every truck, sack, and handoff <span className="text-accent">right now</span>?
              </h2>
              <p className="text-slate-300 mt-3 max-w-2xl leading-relaxed">
                Every truck on a live route with its GPS trail, every batch logged in the last 24 hours, every handoff flowing through the network. Search by plate number, person, ward, or batch code.
                Municipality officers use this every day as their primary tool.
              </p>
              <div className="flex flex-wrap gap-2 mt-4 text-[11px] text-muted">
                <Tag>🚛 animated trucks</Tag>
                <Tag>📍 live GPS polylines</Tag>
                <Tag>🔎 search by plate / person</Tag>
                <Tag>📷 chain-bound photo evidence</Tag>
                <Tag>🔄 auto-refresh 4s</Tag>
              </div>
            </div>
            <div className="flex flex-col gap-2 md:min-w-[180px]">
              <Btn size="xl" onClick={() => nav("/live")}>🛰️ Open live map</Btn>
              <button onClick={() => {
                const muni = users.find(u => u.role === "municipality");
                if (muni) signInAs(muni);
                else nav("/live");
              }} className="text-[11px] text-accent hover:underline">
                or sign in as Municipality →
              </button>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ─── THE CHAIN — five vignettes ────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 py-20 border-t border-line/40">
        <Eyebrow>The 5-stage chain</Eyebrow>
        <h2 className="font-display text-4xl md:text-5xl tracking-tight2 mt-3 max-w-3xl leading-tight">
          A bottle's journey through any Indian city.
        </h2>
        <p className="text-slate-300 mt-4 max-w-2xl">
          The chain already exists physically. We just made every link visible — without forcing any of the actors to do new work.
        </p>

        <div className="mt-12 space-y-3">
          {STAGES.map((s, i) => (
            <Reveal key={s.num} delay={i * 80}>
              <StageRow stage={s} isLast={i === STAGES.length - 1} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* ─── THREE THINGS THAT MAKE IT WORK ─────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 py-20 border-t border-line/40">
        <Eyebrow>Why it actually works in India</Eyebrow>
        <h2 className="font-display text-4xl md:text-5xl tracking-tight2 mt-3 max-w-3xl leading-tight">
          Built for people who don't open apps.
        </h2>

        <div className="mt-12 grid md:grid-cols-3 gap-4">
          <Reveal delay={0}>
            <Pillar
              kicker="QR over apps"
              title="A sticker on the sack."
              body="Kabadiwalas slap a pre-printed QR onto every sack they buy. Ragpickers get a QR paper slip. No phone needed at the originator. Sticker rolls cost ₹0.20 each, distributed by NGOs."
            />
          </Reveal>
          <Reveal delay={120}>
            <Pillar
              kicker="Aggregator-first"
              title="The data enters where there's already a scale."
              body="The aggregator is the realistic active user — they already weigh, they already have a phone. Their entry credits the kabadiwala and ragpicker automatically upstream. No new behaviour from anyone else."
            />
          </Reveal>
          <Reveal delay={240}>
            <Pillar
              kicker="SHA-256 ledger"
              title="Tamper one row. The whole chain flags."
              body="Every event hashed with its predecessor inside Postgres. Mutate a weight after the fact, every downstream record diverges and lights up red on the audit screen. No blockchain. No gas. Free-tier deployable."
            />
          </Reveal>
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link to="/aggregator"><Btn>Open aggregator console →</Btn></Link>
          <Link to="/provenance"><Btn variant="ghost">Trace a batch</Btn></Link>
        </div>
      </section>

      {showSignin && <SignInModal users={users} onPick={signInAs} onClose={() => setShowSignin(false)} />}
    </div>
  );
}

function BigNumber({ to, suffix = "", label, accent }: { to: number; suffix?: string; label: string; accent?: "yellow" }) {
  const color = accent === "yellow" ? "text-accent2" : "text-cream";
  return (
    <div className="border-l border-line/60 first:border-l-0 pl-6 first:pl-0 md:pl-8 md:first:pl-0">
      <div className={`font-display text-5xl md:text-6xl tracking-tight2 ${color}`}>
        <CountUp to={to} />{suffix}
      </div>
      <div className="text-xs uppercase tracking-[0.14em] text-muted mt-2">{label}</div>
    </div>
  );
}

function StageRow({ stage, isLast }: { stage: typeof STAGES[number]; isLast: boolean }) {
  return (
    <div className="group relative flex items-stretch gap-5 md:gap-8 py-5 border-b border-line/40">
      {/* Stage number */}
      <div className="flex flex-col items-center min-w-[60px]">
        <div className="font-display text-3xl tracking-tight2 text-muted/60 group-hover:text-accent transition-colors">
          0{stage.num}
        </div>
        {!isLast && <div className="flex-1 w-px bg-line/60 mt-2" />}
      </div>

      {/* Emoji block */}
      <div className="text-3xl md:text-4xl pt-1 select-none">{stage.emoji}</div>

      {/* Body */}
      <div className="flex-1 min-w-0 grid md:grid-cols-3 gap-4 md:gap-8 items-start">
        <div>
          <div className="font-display text-2xl tracking-tight2 text-cream">{stage.label}</div>
          <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted mt-1">Stage {stage.num}</div>
        </div>
        <div className="md:col-span-2 text-slate-300 leading-relaxed">
          {stage.body}
          <div className="text-[11px] text-accent2 mono mt-2 tracking-tight">→ {stage.system}</div>
        </div>
      </div>
    </div>
  );
}

function Pillar({ kicker, title, body }: { kicker: string; title: string; body: string }) {
  return (
    <div className="bg-panel/40 border border-line/60 rounded-2xl p-6 h-full hover:border-accent/30 transition-colors">
      <div className="text-[10px] uppercase tracking-[0.18em] text-accent mb-3">{kicker}</div>
      <h3 className="font-display text-2xl tracking-tight2 text-cream leading-snug">{title}</h3>
      <p className="text-sm text-slate-400 leading-relaxed mt-3">{body}</p>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="bg-bg/40 border border-line/60 rounded-full px-2.5 py-1">{children}</span>;
}

// One representative user per role, hand-picked from the Harithpur demo
// deployment so the dashboard each role lands on actually has data.
// The matcher prefers the phone number we know works; falls back to the
// first user of that role if for some reason the phone isn't seeded.
const ROLE_PICKER_CARDS: {
  role: string; emoji: string; label: string;
  preferred_phone: string; tagline: string; sees: string;
}[] = [
  {
    role: "collector", emoji: "🚛", label: "Truck driver",
    preferred_phone: "+919900500001",
    tagline: "Big GPS button. Start route. Tap pickup. Drive.",
    sees: "Collector PWA · GPS streaming · animated route trail",
  },
  {
    role: "ragpicker", emoji: "♻️", label: "Ragpicker",
    preferred_phone: "RP-002",
    tagline: "No phone. Just paper QR receipts in a booklet.",
    sees: "Anonymous kiosk · earnings history · QR slip cards",
  },
  {
    role: "kabadiwala", emoji: "🏪", label: "Kabadiwala",
    preferred_phone: "+919900100002",
    tagline: "Weighs the sack, slaps a QR sticker, gets a WhatsApp.",
    sees: "WhatsApp-style notifications · QR sticker printer · earnings",
  },
  {
    role: "aggregator", emoji: "📦", label: "Aggregator",
    preferred_phone: "+919900200002",
    tagline: "Weighbridge. Scans every incoming sack. The data oracle.",
    sees: "Weighbridge · QR scanner · AI sack inspector · photo capture",
  },
  {
    role: "recycler", emoji: "🏭", label: "Recycler",
    preferred_phone: "+919900300001",
    tagline: "Posts bids. Confirms at the factory gate. Closes the chain.",
    sees: "Live bids · gate QR scanner · supply forecast",
  },
  {
    role: "municipality", emoji: "🏛️", label: "Municipality",
    preferred_phone: "+919900400001",
    tagline: "City-wide analytics. Live truck map. Anomaly engine. Carbon credits.",
    sees: "Analytics · Live Network Map · Risk Patterns · Material Flows",
  },
];

function RoleCard({ card, users, onPick }: {
  card: typeof ROLE_PICKER_CARDS[number];
  users: User[];
  onPick: (u: User) => void;
}) {
  // Find the matching demo user. Try preferred phone first; fall back to
  // the first user of that role in the demo deployment.
  const target = users.find(u => u.phone === card.preferred_phone)
              || users.find(u => u.role === card.role && (u as any).organization_id === 1)
              || users.find(u => u.role === card.role);

  return (
    <button
      onClick={() => target && onPick(target)}
      disabled={!target}
      className="text-left bg-panel/40 border border-line/60 hover:border-accent/60 hover:bg-accent/5 disabled:opacity-40 disabled:cursor-not-allowed transition-all rounded-2xl p-5 group hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-3xl">{card.emoji}</div>
          <div className="font-display text-xl tracking-tight2 text-cream mt-2">{card.label}</div>
        </div>
        <span className="text-[10px] text-accent group-hover:translate-x-1 transition-transform">try →</span>
      </div>
      <div className="text-sm text-slate-300 mt-2 leading-relaxed">{card.tagline}</div>
      <div className="text-[10.5px] text-muted mt-3 pt-3 border-t border-line/30">
        You'll see: {card.sees}
      </div>
    </button>
  );
}

function SignInModal({ users, onPick, onClose }: { users: User[]; onPick: (u: User) => void; onClose: () => void }) {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<number | null>(null);
  useEffect(() => { api.organizations().then(setOrgs).catch(() => {}); }, []);
  // Simulates a phone-OTP login — but for the demo, we let the user pick which
  // role to sign in as. In production this screen would just be a phone-number
  // input + OTP, and the role would be looked up from the user record.
  const ROLE_LABEL: Record<string, string> = {
    collector: "Truck driver", ragpicker: "Ragpicker", kabadiwala: "Kabadiwala",
    aggregator: "Aggregator", recycler: "Recycler", municipality: "Municipality",
  };
  const ROLE_BLURB: Record<string, string> = {
    aggregator: "weighbridge, supply forecasting, EPR audit",
    recycler:   "post bids, confirm at gate, supply visibility",
    municipality: "city-wide recovery + diversion analytics",
    kabadiwala: "passive — receives WhatsApp after each sale",
    collector:  "GPS-tracked routes, one-button mode",
    ragpicker:  "paper QR receipts, kiosk lookup",
  };
  const ORDER = ["aggregator", "recycler", "municipality", "kabadiwala", "collector", "ragpicker"];
  const grouped: Record<string, User[]> = {};
  for (const u of users) (grouped[u.role] ||= []).push(u);

  // Users for the currently selected org (or all if none selected)
  const filteredUsers = selectedOrg
    ? users.filter((u: any) => u.organization_id === selectedOrg)
    : users;

  const filteredGrouped: Record<string, User[]> = {};
  for (const u of filteredUsers) (filteredGrouped[u.role] ||= []).push(u);

  return (
    <div className="fixed inset-0 bg-bg/85 backdrop-blur-md z-[1000] grid place-items-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-panel border border-line rounded-2xl max-w-lg w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-line/60">
          <div className="text-[10px] uppercase tracking-[0.18em] text-accent">Sign in to WasteChain</div>
          <div className="font-display text-2xl tracking-tight2 mt-1.5">
            {selectedOrg ? "Pick an account in this organization" : "Pick your organization first"}
          </div>
          <div className="text-[11px] text-muted mt-2 leading-relaxed">
            {selectedOrg
              ? "In production: phone-number + OTP. For demo, pick any pre-seeded account in the selected deployment."
              : "Every deployment is its own tenant. Pick yours — or set up a new one if your city / panchayat isn't listed."}
          </div>
        </div>

        {!selectedOrg ? (
          <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2">
            {orgs.length === 0 ? (
              <div className="text-sm text-muted text-center py-6">Loading organizations…</div>
            ) : (
              <>
                {orgs.map(o => (
                  <button key={o.id} onClick={() => setSelectedOrg(o.id)}
                    className="w-full text-left bg-bg/40 hover:bg-accent/5 border border-line/60 hover:border-accent/60 rounded-lg p-3.5 transition">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="font-semibold text-cream">{o.name}</div>
                      {o.is_demo && <span className="text-[9px] uppercase tracking-wider bg-accent2/20 text-accent2 px-2 py-0.5 rounded-full">demo</span>}
                    </div>
                    <div className="text-[11px] text-muted mt-1">
                      {ORG_TYPE_LABEL[o.type] || o.type} · {[o.city_or_village, o.district, o.state].filter(Boolean).join(", ") || "—"}
                    </div>
                    <div className="text-[10px] text-muted mt-1.5">
                      {o.member_count} member{o.member_count !== 1 ? "s" : ""}
                    </div>
                  </button>
                ))}
                <div className="pt-2 border-t border-line/40 mt-3 text-center">
                  <Link to="/setup" className="text-xs text-accent hover:underline">Don't see yours? Set up a new deployment →</Link>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="p-4 max-h-[60vh] overflow-y-auto space-y-3">
            <button onClick={() => setSelectedOrg(null)}
              className="text-[11px] text-muted hover:text-slate-100 mb-2">← Pick a different organization</button>
            {Object.keys(filteredGrouped).length === 0 ? (
              <div className="text-sm text-muted text-center py-6">No team members in this organization yet. <Link to="/setup" className="text-accent">Add some →</Link></div>
            ) : ORDER.map(role => filteredGrouped[role] && (
              <div key={role}>
                <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted mb-1.5">
                  <span className="text-cream font-medium">{ROLE_LABEL[role]}</span> · {ROLE_BLURB[role]}
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {filteredGrouped[role].slice(0, 4).map(u => (
                    <button key={u.id} onClick={() => onPick(u)}
                      className="text-left bg-bg/40 hover:bg-accent/5 border border-line/60 hover:border-accent/60 rounded-lg px-3 py-2 transition">
                      <div className="text-sm">{u.name}</div>
                      <div className="text-[10px] text-muted">{u.area || "—"} · {u.phone}</div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const ORG_TYPE_LABEL: Record<string, string> = {
  city_corp: "City Corporation",
  town_panchayat: "Town Panchayat",
  gram_panchayat: "Gram Panchayat",
  zilla_parishad: "Zilla Parishad",
  recycler: "Private Recycler",
  aggregator: "Aggregator",
  ngo: "NGO / Cooperative",
};
