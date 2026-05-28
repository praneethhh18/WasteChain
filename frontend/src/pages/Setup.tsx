/* Setup wizard — multi-tenant onboarding for new deployments.
 *
 * A District Commissioner / City Corp commissioner / panchayat secretary /
 * private recycler can sign up here. After completion, their organization
 * exists in the platform with them as admin, ready to add team members.
 *
 * Flow: Type → Location (country/state/district/city or village) → Name →
 * Admin contact → Confirm.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, Organization } from "../api";
import { setCurrentUser } from "../session";
import { Btn, Eyebrow, Reveal } from "../components/ui";
import clsx from "clsx";

const ORG_TYPES = [
  { key: "city_corp",        emoji: "🏛️",  label: "City Corporation",        sub: "Municipal Corp · BBMP, MCM, etc." },
  { key: "town_panchayat",   emoji: "🏘️",  label: "Town Panchayat",           sub: "Nagar / Town Panchayat" },
  { key: "gram_panchayat",   emoji: "🌾",  label: "Gram Panchayat",           sub: "Village-level rural body" },
  { key: "zilla_parishad",   emoji: "🏞️",  label: "Zilla Parishad",           sub: "District rural authority" },
  { key: "recycler",         emoji: "🏭",  label: "Private Recycler",         sub: "Industrial recovery facility" },
  { key: "aggregator",       emoji: "📦",  label: "Aggregator / Scrap Dealer",sub: "Material consolidator" },
  { key: "ngo",              emoji: "🤝",  label: "NGO / Cooperative",        sub: "Hasiru Dala-style worker programs" },
];

// 28 states + 8 UTs of India
const STATES = [
  "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh",
  "Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka",
  "Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram",
  "Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu",
  "Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal",
  "Andaman and Nicobar Islands","Chandigarh","Dadra and Nagar Haveli and Daman and Diu",
  "Delhi","Jammu and Kashmir","Ladakh","Lakshadweep","Puducherry",
];

// Sample district hints — user can also free-type for any district
const DISTRICT_HINTS: Record<string, string[]> = {
  Karnataka: ["Bengaluru Urban", "Bengaluru Rural", "Mysuru", "Belagavi", "Hassan", "Tumakuru", "Udupi", "Kodagu"],
  Maharashtra: ["Mumbai City", "Mumbai Suburban", "Pune", "Thane", "Nagpur", "Aurangabad", "Nashik"],
  "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai", "Salem", "Tiruchirappalli", "Tirunelveli"],
  Delhi: ["New Delhi", "Central Delhi", "South Delhi", "North Delhi", "East Delhi", "West Delhi"],
  Kerala: ["Thiruvananthapuram", "Ernakulam", "Kozhikode", "Thrissur", "Kollam"],
};

type State = {
  step: 1 | 2 | 3 | 4 | 5;
  type?: string;
  state?: string;
  district?: string;
  city_or_village?: string;
  name?: string;
  admin_name?: string;
  admin_phone?: string;
  created?: Organization;
};

const ROLE_HOME: Record<string, string> = {
  city_corp: "/municipality", town_panchayat: "/municipality",
  gram_panchayat: "/municipality", zilla_parishad: "/municipality",
  ngo: "/municipality",
  recycler: "/recycler", aggregator: "/aggregator",
};

export default function Setup() {
  const [s, setS] = useState<State>({ step: 1 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nav = useNavigate();

  const update = (patch: Partial<State>) => setS({ ...s, ...patch });
  const next = () => update({ step: (Math.min(5, s.step + 1) as State["step"]) });
  const back = () => update({ step: (Math.max(1, s.step - 1) as State["step"]) });

  const submit = async () => {
    if (!s.type || !s.name || !s.admin_name || !s.admin_phone) return;
    setBusy(true); setErr(null);
    try {
      const org = await api.createOrganization({
        type: s.type, name: s.name, country: "India",
        state: s.state, district: s.district, city_or_village: s.city_or_village,
        admin_name: s.admin_name, admin_phone: s.admin_phone,
      });
      update({ step: 5, created: org });

      // Auto-sign-in the admin to their own org
      const member = (await api.orgMembers(org.id))[0];
      if (member) {
        setCurrentUser({
          id: member.id, phone: member.phone, name: member.name, role: member.role,
          area: member.area, language: "en",
          reputation_score: 100, usual_price_inr: {},
        } as any);
      }
    } catch (e: any) {
      setErr(e?.message || "Failed to create organization");
    } finally { setBusy(false); }
  };

  const canNext1 = !!s.type;
  const canNext2 = !!s.state && !!s.district;
  const canNext3 = !!s.city_or_village && !!s.name;
  const canSubmit = !!s.admin_name && !!s.admin_phone;

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 md:py-16 min-h-screen">
      <Reveal>
        <Eyebrow>Set up your deployment</Eyebrow>
        <h1 className="font-display text-4xl md:text-5xl tracking-tight2 mt-3 leading-[1.05]">
          {s.step === 5 ? "You're live." : "Bring WasteChain to your city."}
        </h1>
        <p className="text-slate-300 mt-4 leading-relaxed">
          {s.step === 5
            ? `Your deployment is registered. Add your team members and start tracking.`
            : `Any city corporation, panchayat, recycler, or NGO can deploy WasteChain in 60 seconds. Five short steps.`}
        </p>
      </Reveal>

      <Reveal delay={100}>
        <div className="mt-8 flex items-center gap-2">
          {[1, 2, 3, 4, 5].map(n => (
            <div key={n} className={clsx(
              "h-1.5 flex-1 rounded-full transition-all",
              n < s.step ? "bg-accent" : n === s.step ? "bg-accent2" : "bg-line/40",
            )} />
          ))}
        </div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted mt-2">Step {s.step} of 5</div>
      </Reveal>

      <Reveal delay={150}>
        <div className="mt-8 bg-panel/40 border border-line/60 rounded-2xl p-6 md:p-8">

        {/* STEP 1 — Type */}
        {s.step === 1 && (
          <>
            <div className="font-display text-2xl tracking-tight2 mb-1">What kind of organization are you?</div>
            <div className="text-sm text-muted mb-5">Pick the closest match. This sets up your dashboard.</div>
            <div className="grid sm:grid-cols-2 gap-2">
              {ORG_TYPES.map(t => (
                <button key={t.key} onClick={() => update({ type: t.key })}
                  className={clsx("text-left p-4 rounded-xl border transition",
                    s.type === t.key
                      ? "bg-accent/10 border-accent"
                      : "bg-bg/40 border-line/60 hover:border-accent/50")}>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{t.emoji}</span>
                    <span className="font-semibold text-cream">{t.label}</span>
                  </div>
                  <div className="text-[11px] text-muted mt-1">{t.sub}</div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* STEP 2 — Location */}
        {s.step === 2 && (
          <>
            <div className="font-display text-2xl tracking-tight2 mb-1">Where are you located?</div>
            <div className="text-sm text-muted mb-5">Country, state, district. Pre-loaded with India's hierarchy.</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Country" value="India" disabled />
              <Field label="State" value={s.state || ""} onChange={(v) => update({ state: v, district: "" })} select={STATES} placeholder="Karnataka" />
              <Field label="District" value={s.district || ""} onChange={(v) => update({ district: v })} placeholder="your district"
                suggestions={s.state ? DISTRICT_HINTS[s.state] : undefined} className="col-span-2" />
            </div>
          </>
        )}

        {/* STEP 3 — Name + city */}
        {s.step === 3 && (
          <>
            <div className="font-display text-2xl tracking-tight2 mb-1">Name your deployment.</div>
            <div className="text-sm text-muted mb-5">What appears on every dashboard. Use the official name.</div>
            <Field label="City / Block / Village name" value={s.city_or_village || ""}
              onChange={(v) => update({ city_or_village: v, name: s.name || autoName(s.type, v) })}
              placeholder="e.g. your city / block / village name" />
            <Field className="mt-3" label="Official organization name" value={s.name || ""}
              onChange={(v) => update({ name: v })}
              placeholder="e.g. (your city) Municipal Corporation" />
            <div className="text-[11px] text-muted mt-2">
              Tip: this is what every kabadiwala receipt slip and audit certificate will say.
            </div>
          </>
        )}

        {/* STEP 4 — Admin */}
        {s.step === 4 && (
          <>
            <div className="font-display text-2xl tracking-tight2 mb-1">Who's the admin?</div>
            <div className="text-sm text-muted mb-5">You'll be the first user. Add your team afterwards.</div>
            <Field label="Your name" value={s.admin_name || ""} onChange={(v) => update({ admin_name: v })}
              placeholder="e.g. Smt. Priya Kulkarni" />
            <Field className="mt-3" label="Your phone (+91…)" value={s.admin_phone || ""}
              onChange={(v) => update({ admin_phone: v })}
              placeholder="+91" />
            <div className="text-[11px] text-muted mt-2">
              In production we'd send an OTP. For the demo we trust the number.
            </div>
          </>
        )}

        {/* STEP 5 — Done */}
        {s.step === 5 && s.created && (
          <>
            <div className="text-5xl mb-3">🎉</div>
            <div className="font-display text-2xl tracking-tight2">{s.created.name}</div>
            <div className="text-sm text-muted mt-1">
              {s.created.city_or_village && `${s.created.city_or_village}, `}{s.created.district && `${s.created.district}, `}{s.created.state}
            </div>
            <div className="mt-4 text-sm text-slate-300 leading-relaxed">
              You're signed in as <span className="text-cream">{s.created.admin_name}</span>.
              Your dashboard is empty — that's the real day-1 view. Add team members from the admin tools, or sign in to the fictional demo deployment to see what an established deployment looks like.
            </div>
            <div className="mt-6 grid sm:grid-cols-2 gap-3">
              <Btn size="lg" onClick={() => nav(`/admin?org=${s.created!.id}`)}>
                Build your pyramid →
              </Btn>
              <Btn variant="ghost" size="lg" onClick={() => nav(ROLE_HOME[s.created!.type] || "/")}>
                Skip to dashboard
              </Btn>
            </div>
            <div className="mt-4 text-[11px] text-muted leading-relaxed">
              Next: add zones / wards / sub-panchayats inside your deployment, then add team members (drivers, kabadiwalas, etc.) at each level.
            </div>
          </>
        )}

        {err && <div className="mt-4 bg-danger/15 border border-danger/40 rounded-lg p-3 text-sm text-danger">{err}</div>}

        {s.step < 5 && (
          <div className="flex justify-between mt-7 pt-6 border-t border-line/40">
            <Btn variant="ghost" onClick={back} disabled={s.step === 1 || busy}>← Back</Btn>
            {s.step < 4 ? (
              <Btn size="lg" onClick={next} disabled={
                (s.step === 1 && !canNext1) ||
                (s.step === 2 && !canNext2) ||
                (s.step === 3 && !canNext3)
              }>Continue →</Btn>
            ) : (
              <Btn size="lg" onClick={submit} disabled={busy || !canSubmit}>
                {busy ? "Creating…" : "Create deployment"}
              </Btn>
            )}
          </div>
        )}
        </div>
      </Reveal>
    </div>
  );
}

function autoName(type: string | undefined, place: string): string {
  if (!type || !place) return "";
  const suffix: Record<string, string> = {
    city_corp: "Municipal Corporation",
    town_panchayat: "Town Panchayat",
    gram_panchayat: "Gram Panchayat",
    zilla_parishad: "Zilla Parishad",
    recycler: "Recycling Facility",
    aggregator: "Aggregators",
    ngo: "Cooperative",
  };
  return `${place} ${suffix[type] || ""}`.trim();
}

function Field({ label, value, onChange, placeholder, disabled, select, suggestions, className }: {
  label: string; value: string; onChange?: (v: string) => void; placeholder?: string;
  disabled?: boolean; select?: string[]; suggestions?: string[]; className?: string;
}) {
  return (
    <label className={clsx("block", className)}>
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted mb-1.5">{label}</div>
      {select ? (
        <select value={value} onChange={(e) => onChange?.(e.target.value)}
          className="w-full bg-bg/60 border border-line/80 focus:border-accent rounded-lg px-3 py-2.5 text-sm outline-none">
          <option value="">Select…</option>
          {select.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      ) : (
        <input value={value} onChange={(e) => onChange?.(e.target.value)} disabled={disabled}
          placeholder={placeholder} list={suggestions ? `dl-${label}` : undefined}
          className={clsx("w-full bg-bg/60 border border-line/80 focus:border-accent rounded-lg px-3 py-2.5 text-sm outline-none",
            disabled && "opacity-60")} />
      )}
      {suggestions && (
        <datalist id={`dl-${label}`}>
          {suggestions.map(d => <option key={d} value={d} />)}
        </datalist>
      )}
    </label>
  );
}
