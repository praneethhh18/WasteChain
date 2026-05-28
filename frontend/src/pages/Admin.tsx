/* Admin Console — where an org's admin builds out their deployment.
 *
 * Two things happen here:
 *   1. Build the hierarchy: zones / wards / sub-panchayats (the pyramid)
 *   2. Add team members: drivers / kabadiwalas / aggregators / etc.
 *
 * The demo deployment's seeded pyramid (3 zones, 6 wards) shows exactly
 * what a real deployment would look like — but all names are placeholders.
 */

import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, Organization, OrgTreeNode } from "../api";
import { useCurrentUser, setCurrentUser } from "../session";
import { Btn, Eyebrow, Reveal, Empty } from "../components/ui";
import clsx from "clsx";

const DIVISION_TYPE_LABEL: Record<string, string> = {
  zone: "Zone",
  ward: "Ward",
  taluk_panchayat: "Taluk Panchayat",
  gram_panchayat: "Gram Panchayat",
  sub_division: "Sub-division",
  city_corp: "City Corporation",
  town_panchayat: "Town Panchayat",
  zilla_parishad: "Zilla Parishad",
  recycler: "Recycler",
  aggregator: "Aggregator",
  ngo: "NGO / Cooperative",
};

const TYPE_EMOJI: Record<string, string> = {
  city_corp: "🏛️", town_panchayat: "🏘️", gram_panchayat: "🌾",
  zilla_parishad: "🏞️", recycler: "🏭", aggregator: "📦", ngo: "🤝",
  zone: "🗺️", ward: "📍", taluk_panchayat: "🏞️", sub_division: "🔹",
};

// What division types make sense as children of each parent type. Every
// parent supports a generic "Department / Office / Team" (sub_division) so
// admins can model functional units (Sanitation Dept, Procurement Office,
// Waste Management Cell) alongside geographic ones.
const ALLOWED_DIVISIONS: Record<string, { type: string; label: string }[]> = {
  city_corp: [
    { type: "zone",         label: "Zone (geographic)" },
    { type: "ward",         label: "Ward (geographic)" },
    { type: "sub_division", label: "Department / Office / Team" },
  ],
  town_panchayat: [
    { type: "ward",         label: "Ward" },
    { type: "sub_division", label: "Department / Office / Team" },
  ],
  gram_panchayat: [
    { type: "sub_division", label: "Field team / Sub-area" },
  ],
  zilla_parishad: [
    { type: "taluk_panchayat", label: "Taluk Panchayat" },
    { type: "gram_panchayat",  label: "Gram Panchayat" },
    { type: "sub_division",    label: "Department / Office" },
  ],
  zone: [
    { type: "ward",         label: "Ward" },
    { type: "sub_division", label: "Sub-area / Team" },
  ],
  ward: [
    { type: "sub_division", label: "Sub-area / Team" },
  ],
  taluk_panchayat: [
    { type: "gram_panchayat", label: "Gram Panchayat" },
    { type: "sub_division",   label: "Field team / Office" },
  ],
  recycler: [
    { type: "sub_division", label: "Department / Office / Team" },
  ],
  aggregator: [
    { type: "sub_division", label: "Internal team / Office" },
  ],
  ngo: [
    { type: "sub_division", label: "Field area / Project team" },
  ],
  sub_division: [
    { type: "sub_division", label: "Sub-team / Cell" },
  ],
};

const MEMBER_ROLES = [
  { role: "municipality", label: "Office staff",  emoji: "🏛️" },
  { role: "collector",    label: "Truck driver",   emoji: "🚛" },
  { role: "kabadiwala",   label: "Kabadiwala",     emoji: "🏪" },
  { role: "ragpicker",    label: "Ragpicker",      emoji: "♻️" },
  { role: "aggregator",   label: "Aggregator",     emoji: "📦" },
  { role: "recycler",     label: "Recycler",       emoji: "🏭" },
];

export default function Admin() {
  const [user] = useCurrentUser();
  const [params] = useSearchParams();
  const orgIdParam = parseInt(params.get("org") || "0") || null;
  const [org, setOrg] = useState<Organization | null>(null);
  const [tree, setTree] = useState<OrgTreeNode | null>(null);
  const [members, setMembers] = useState<{ id: number; name: string; role: string; phone: string; area?: string }[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [showAddDivision, setShowAddDivision] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [addingTo, setAddingTo] = useState<number | null>(null);
  const [memberTargetNode, setMemberTargetNode] = useState<{ id: number; name: string } | null>(null);
  const nav = useNavigate();

  useEffect(() => { api.organizations().then(setOrgs).catch(() => {}); }, []);

  // Resolve which org to show
  const resolvedOrgId = orgIdParam ?? (user as any)?.organization_id ?? orgs.find(o => o.is_demo)?.id ?? null;

  const refresh = async () => {
    if (!resolvedOrgId) return;
    try {
      const t = await api.orgTree(resolvedOrgId);
      setTree(t);
      const o = orgs.find(o => o.id === resolvedOrgId) ||
                (await api.organizations()).find(o => o.id === resolvedOrgId) || null;
      setOrg(o);
      const m = await api.orgMembers(resolvedOrgId);
      setMembers(m);
    } catch {}
  };
  useEffect(() => { refresh(); }, [resolvedOrgId]);

  if (!resolvedOrgId) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        <div className="text-5xl mb-3">🏛️</div>
        <div className="font-display text-2xl tracking-tight2">No deployment selected</div>
        <p className="text-sm text-muted mt-2">Pick an organization to administer, or set up a new one.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link to="/setup"><Btn>Set up new deployment</Btn></Link>
          <Link to="/"><Btn variant="ghost">Back to landing</Btn></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
      {/* ─── Header ──────────────────────────────────────── */}
      <Reveal>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Admin console</Eyebrow>
            <h1 className="font-display text-4xl md:text-5xl tracking-tight2 mt-3 leading-tight">
              {org?.name || "Loading…"}
            </h1>
            <div className="text-sm text-muted mt-2">
              {org && (
                <>
                  {DIVISION_TYPE_LABEL[org.type] || org.type}
                  {org.is_demo && <span className="ml-2 text-[10px] uppercase tracking-wider bg-accent2/20 text-accent2 px-2 py-0.5 rounded-full">demo</span>}
                  {org.city_or_village && <> · {org.city_or_village}, {org.district || org.state}</>}
                </>
              )}
            </div>
            {org?.admin_name && (
              <div className="text-xs text-muted mt-1">
                Admin: {org.admin_name} <span className="mono">{org.admin_phone}</span>
              </div>
            )}
          </div>
          {orgs.length > 1 && (
            <select
              value={resolvedOrgId || ""}
              onChange={(e) => nav(`/admin?org=${e.target.value}`)}
              className="bg-bg/60 border border-line/60 rounded-lg px-3 py-2 text-sm">
              {orgs.map(o => (
                <option key={o.id} value={o.id}>{o.name} {o.is_demo ? "· demo" : ""}</option>
              ))}
            </select>
          )}
        </header>
      </Reveal>

      <Reveal delay={100}>
        <div className="grid sm:grid-cols-3 gap-3">
          <Stat label="Members" value={members.length} accent="green" />
          <Stat label="Sub-divisions" value={countDivisions(tree)} accent="yellow" />
          <Stat label="Pyramid depth" value={treeDepth(tree)} sub="levels" />
        </div>
      </Reveal>

      {/* ─── Hierarchy / pyramid ────────────────────────── */}
      <Reveal delay={150}>
        <div className="bg-panel/40 border border-line/60 rounded-2xl">
          <div className="px-6 py-4 border-b border-line/60 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-accent">The pyramid</div>
              <div className="font-display text-xl tracking-tight2 mt-0.5">Divisions inside this deployment</div>
              <div className="text-xs text-muted mt-1">
                Zones, wards, sub-panchayats — every level the official jurisdiction has.
              </div>
            </div>
            <Btn variant="primary" onClick={() => { setAddingTo(resolvedOrgId); setShowAddDivision(true); }}>
              + Add division
            </Btn>
          </div>
          <div className="p-6">
            {tree ? (
              <>
                <TreeView
                  node={tree}
                  onAddChild={(id) => { setAddingTo(id); setShowAddDivision(true); }}
                  onAddMember={(node) => { setMemberTargetNode(node); setShowAddMember(true); }}
                />
                <div className="text-[10px] text-muted mt-3 pl-3">
                  Hover any node → <span className="text-accent">+ add inside</span> creates a sub-division · <span className="text-accent2">+ add member</span> registers a truck driver / kabadiwala / ragpicker / officer at that node.
                </div>
              </>
            ) : <Empty>Loading…</Empty>}
          </div>
        </div>
      </Reveal>

      {/* ─── Team members ───────────────────────────────── */}
      <Reveal delay={200}>
        <div className="bg-panel/40 border border-line/60 rounded-2xl">
          <div className="px-6 py-4 border-b border-line/60 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-accent">The team</div>
              <div className="font-display text-xl tracking-tight2 mt-0.5">Members at this org level</div>
              <div className="text-xs text-muted mt-1">
                Drivers, kabadiwalas, aggregators, office staff. Each one gets their own dashboard once added.
              </div>
            </div>
            <Btn variant="primary" onClick={() => setShowAddMember(true)}>+ Add member</Btn>
          </div>

          {/* What happens to a member after creation — the production flow */}
          {members.length > 0 && (
            <div className="px-6 py-3 border-b border-line/40 bg-accent/5 text-[11.5px] text-slate-300 flex items-start gap-2">
              <span className="text-base leading-none mt-0.5">📨</span>
              <div className="flex-1 leading-relaxed">
                <span className="text-cream font-medium">How they sign in (in production):</span> when you add a member, the system sends an SMS to their phone with a one-time login link via MSG91 / Gupshup. They tap the link, verify with an OTP, and land on their role's dashboard. <span className="text-cream">For the demo,</span> click <span className="text-accent2">🎭 Preview as them</span> on any card to instantly see what their dashboard would look like.
              </div>
            </div>
          )}

          <div className="p-6">
            {members.length === 0 ? (
              <div className="text-center py-10 bg-bg/20 border border-dashed border-accent/30 rounded-xl">
                <div className="text-4xl mb-3">📨</div>
                <div className="font-display text-xl tracking-tight2">No team yet</div>
                <div className="text-sm text-muted mt-1 max-w-md mx-auto leading-relaxed">
                  Add truck drivers, kabadiwalas, ragpickers, aggregators, recyclers — anyone working under your jurisdiction.
                  Each one gets their own role-specific dashboard. In production they get an SMS with a login link.
                </div>
                <div className="mt-5">
                  <Btn size="lg" onClick={() => setShowAddMember(true)}>+ Add your first member</Btn>
                </div>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {members.map(m => (
                  <MemberCard key={m.id} m={m} />
                ))}
              </div>
            )}
          </div>
        </div>
      </Reveal>

      {/* ─── Modals ─────────────────────────────────────── */}
      {showAddDivision && addingTo && (
        <AddDivisionModal
          parentId={addingTo}
          parentType={org?.type || "city_corp"}
          tree={tree}
          onClose={() => setShowAddDivision(false)}
          onCreated={() => { setShowAddDivision(false); refresh(); }}
        />
      )}
      {showAddMember && (memberTargetNode || resolvedOrgId) && (
        <AddMemberModal
          orgId={memberTargetNode?.id || resolvedOrgId!}
          orgLabel={memberTargetNode?.name}
          onClose={() => { setShowAddMember(false); setMemberTargetNode(null); }}
          onCreated={() => { setShowAddMember(false); setMemberTargetNode(null); refresh(); }}
        />
      )}
    </div>
  );
}

function MemberCard({ m }: { m: { id: number; name: string; role: string; phone: string; area?: string } }) {
  const nav = useNavigate();
  const ROLE_LABEL: Record<string, string> = {
    municipality: "Office staff", collector: "Truck driver", kabadiwala: "Kabadiwala",
    ragpicker: "Ragpicker", aggregator: "Aggregator", recycler: "Recycler",
  };
  const ROLE_HOME: Record<string, string> = {
    collector: "/collector", ragpicker: "/ragpicker", kabadiwala: "/kabadiwala",
    aggregator: "/aggregator", recycler: "/recycler", municipality: "/municipality",
  };
  const emoji = MEMBER_ROLES.find(r => r.role === m.role)?.emoji || "👤";

  const previewAs = () => {
    // Demo affordance: sign in as this member so the admin can see what
    // their dashboard looks like. In production this never exists — each
    // member logs in independently via phone OTP.
    setCurrentUser({
      id: m.id, phone: m.phone, name: m.name, role: m.role,
      area: m.area, language: "en",
      reputation_score: 100, usual_price_inr: {},
    } as any);
    nav(ROLE_HOME[m.role] || "/");
  };

  return (
    <div className="bg-bg/40 border border-line/60 hover:border-accent/30 rounded-xl p-3.5 transition-colors group">
      <div className="flex items-start gap-2.5">
        <span className="text-lg leading-none mt-0.5">{emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-cream truncate">{m.name}</div>
          <div className="text-[10px] text-muted mt-0.5">{ROLE_LABEL[m.role] || m.role} · <span className="mono">{m.phone}</span></div>
          {m.area && <div className="text-[10px] text-muted mt-1.5">{m.area}</div>}
        </div>
      </div>
      <div className="mt-3 pt-2.5 border-t border-line/30 flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted leading-tight">
          In prod: SMS link sent to <span className="mono">{m.phone}</span>
        </span>
        <button onClick={previewAs}
          className="text-[10.5px] text-accent2 hover:text-accent2/80 hover:underline whitespace-nowrap font-medium">
          🎭 Preview as them →
        </button>
      </div>
    </div>
  );
}

function TreeView({ node, depth = 0, onAddChild, onAddMember }: {
  node: OrgTreeNode; depth?: number;
  onAddChild: (id: number) => void;
  onAddMember: (node: { id: number; name: string }) => void;
}) {
  return (
    <div className={clsx(depth > 0 && "ml-6 pl-4 border-l border-line/40")}>
      <div className={clsx("flex items-center gap-3 py-2 group", depth === 0 && "font-medium")}>
        <span className="text-base">{TYPE_EMOJI[node.type] || "🔹"}</span>
        <div className="flex-1 min-w-0">
          <div className={clsx("truncate", depth === 0 ? "text-cream" : "text-slate-200")}>{node.name}</div>
          <div className="text-[10px] text-muted">
            {DIVISION_TYPE_LABEL[node.type] || node.type} ·{" "}
            <span className={node.member_count > 0 ? "text-accent" : ""}>
              {node.member_count} member{node.member_count !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-2 transition-opacity">
          <button
            onClick={() => onAddMember({ id: node.id, name: node.name })}
            className="text-[11px] text-accent2 hover:underline whitespace-nowrap">
            + add member
          </button>
          <span className="text-muted text-[10px]">·</span>
          <button
            onClick={() => onAddChild(node.id)}
            className="text-[11px] text-accent hover:underline whitespace-nowrap">
            + add inside
          </button>
        </div>
      </div>
      {node.children.length > 0 && (
        <div className="ml-2 mt-1">
          {node.children.map(c => <TreeView key={c.id} node={c} depth={depth + 1} onAddChild={onAddChild} onAddMember={onAddMember} />)}
        </div>
      )}
    </div>
  );
}

function AddDivisionModal({ parentId, parentType, tree, onClose, onCreated }: {
  parentId: number; parentType: string; tree: OrgTreeNode | null;
  onClose: () => void; onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("");
  const [adminName, setAdminName] = useState("");
  const [adminPhone, setAdminPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Allowed division types depend on the PARENT node's type (not the deployment root's)
  const parentNode = findInTree(tree, parentId);
  const allowed = ALLOWED_DIVISIONS[parentNode?.type || parentType] || [{ type: "sub_division", label: "Sub-division" }];

  useEffect(() => { if (!type && allowed[0]) setType(allowed[0].type); }, [parentId]);

  const submit = async () => {
    if (!name.trim() || !type) return;
    setBusy(true); setErr(null);
    try {
      await api.createDivision(parentId, {
        name: name.trim(), type,
        admin_name: adminName.trim() || undefined,
        admin_phone: adminPhone.trim() || undefined,
      });
      onCreated();
    } catch (e: any) { setErr(e?.message || "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <Modal onClose={onClose} title="Add a division">
      <div className="text-xs text-muted mb-4">
        Adding inside <span className="text-cream">{parentNode?.name}</span>.
      </div>
      <Field label="Division type">
        <div className="flex flex-wrap gap-1.5">
          {allowed.map(a => (
            <button key={a.type} onClick={() => setType(a.type)}
              className={clsx("px-3 py-1.5 text-xs rounded-md border",
                type === a.type ? "bg-accent text-bg border-accent font-semibold" : "bg-bg/40 border-line/60")}>
              {TYPE_EMOJI[a.type]} {a.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Name" className="mt-3">
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus
          placeholder={type === "zone" ? "e.g. North Zone" : type === "ward" ? "e.g. Ward 17 · Town Centre" : "e.g. Taluk Panchayat name"}
          className="w-full bg-bg/60 border border-line/60 focus:border-accent rounded-lg px-3 py-2 text-sm outline-none" />
      </Field>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <Field label="Sub-admin name (optional)">
          <input value={adminName} onChange={(e) => setAdminName(e.target.value)}
            placeholder="leave blank to inherit"
            className="w-full bg-bg/60 border border-line/60 focus:border-accent rounded-lg px-3 py-2 text-sm outline-none" />
        </Field>
        <Field label="Sub-admin phone (optional)">
          <input value={adminPhone} onChange={(e) => setAdminPhone(e.target.value)}
            placeholder="+91…"
            className="w-full bg-bg/60 border border-line/60 focus:border-accent rounded-lg px-3 py-2 text-sm outline-none" />
        </Field>
      </div>
      {err && <div className="bg-danger/15 border border-danger/40 rounded-lg p-2 text-xs text-danger mt-3">{err}</div>}
      <div className="flex justify-end gap-2 mt-5">
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={submit} disabled={busy || !name.trim() || !type}>Add division</Btn>
      </div>
    </Modal>
  );
}

function AddMemberModal({ orgId, orgLabel, onClose, onCreated }: {
  orgId: number; orgLabel?: string;
  onClose: () => void; onCreated: () => void;
}) {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [role, setRole] = useState("collector");
  const [phone, setPhone] = useState("");
  const [area, setArea] = useState("");
  const [language, setLanguage] = useState("en");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: number; name: string; role: string; phone: string } | null>(null);

  const submit = async () => {
    if (!name.trim() || !phone.trim()) return;
    setBusy(true); setErr(null);
    try {
      const m: any = await api.addOrgMember(orgId, {
        name: name.trim(), role, phone: phone.trim(),
        area: area.trim() || undefined, language,
      });
      setCreated(m);
      onCreated();
    } catch (e: any) { setErr(e?.message || "Failed"); }
    finally { setBusy(false); }
  };

  const signInAsCreated = () => {
    if (!created) return;
    setCurrentUser({
      id: created.id, phone: created.phone, name: created.name, role: created.role,
      area: area || undefined, language,
      reputation_score: 100, usual_price_inr: {},
      organization_id: orgId,
    } as any);
    const home: Record<string, string> = {
      collector: "/collector", ragpicker: "/ragpicker", kabadiwala: "/kabadiwala",
      aggregator: "/aggregator", recycler: "/recycler", municipality: "/municipality",
    };
    onClose();
    nav(home[created.role] || "/");
  };

  // ─── Post-create success state ─────────────────────────────────
  if (created) {
    return (
      <Modal onClose={onClose} title="✓ Member onboarded">
        <div className="text-center py-2">
          <div className="text-4xl mb-3">📨</div>
          <div className="font-display text-2xl tracking-tight2 text-cream">{created.name}</div>
          <div className="text-sm text-muted mt-1">{MEMBER_ROLES.find(r => r.role === created.role)?.label} · {created.phone}</div>

          <div className="bg-accent/10 border border-accent/30 rounded-xl p-4 mt-5 text-left">
            <div className="text-[10px] uppercase tracking-[0.14em] text-accent">What just happened</div>
            <ol className="text-xs text-slate-300 mt-2 space-y-1.5 list-decimal pl-5 leading-relaxed">
              <li>Member account created under your deployment.</li>
              <li>In production: an SMS goes to {created.phone} with a login link (MSG91 / Gupshup).</li>
              <li>They open the link, OTP-verify, and land on their role's dashboard.</li>
              <li>You'll see their activity (batches, routes, handoffs) show up in your Live Network Map and analytics.</li>
            </ol>
          </div>

          <div className="text-[11px] text-muted mt-4">
            For demo — preview what they'll see:
          </div>
          <div className="flex flex-wrap justify-center gap-2 mt-3">
            <Btn variant="cream" onClick={signInAsCreated}>🎭 Sign in as {created.name} →</Btn>
            <Btn variant="ghost" onClick={onClose}>Done</Btn>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} title="Add a team member">
      {orgLabel && (
        <div className="bg-accent/10 border border-accent/30 rounded-lg p-2.5 mb-4 text-xs">
          Adding inside <span className="text-cream font-medium">{orgLabel}</span> · they'll appear under this division in the pyramid.
        </div>
      )}
      <Field label="Role">
        <div className="grid grid-cols-3 gap-1.5">
          {MEMBER_ROLES.map(r => (
            <button key={r.role} onClick={() => setRole(r.role)}
              className={clsx("p-2 text-xs rounded-md border text-left",
                role === r.role ? "bg-accent/10 border-accent" : "bg-bg/40 border-line/60")}>
              <div className="text-base">{r.emoji}</div>
              <div className="mt-0.5">{r.label}</div>
            </button>
          ))}
        </div>
      </Field>
      <Field label="Name" className="mt-3">
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus
          placeholder={role === "kabadiwala" ? "e.g. local scrap shop name" : "Full name"}
          className="w-full bg-bg/60 border border-line/60 focus:border-accent rounded-lg px-3 py-2 text-sm outline-none" />
      </Field>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <Field label="Phone / booklet ID">
          <input value={phone} onChange={(e) => setPhone(e.target.value)}
            placeholder="+91… or RP-007"
            className="w-full bg-bg/60 border border-line/60 focus:border-accent rounded-lg px-3 py-2 text-sm outline-none" />
        </Field>
        <Field label="Area / ward">
          <input value={area} onChange={(e) => setArea(e.target.value)}
            placeholder="e.g. Ward A"
            className="w-full bg-bg/60 border border-line/60 focus:border-accent rounded-lg px-3 py-2 text-sm outline-none" />
        </Field>
      </div>
      <Field label="Language" className="mt-3">
        <select value={language} onChange={(e) => setLanguage(e.target.value)}
          className="bg-bg/60 border border-line/60 rounded-lg px-3 py-2 text-sm">
          <option value="en">English</option>
          <option value="hi">हिंदी (Hindi)</option>
          <option value="kn">ಕನ್ನಡ (Kannada)</option>
        </select>
      </Field>
      {err && <div className="bg-danger/15 border border-danger/40 rounded-lg p-2 text-xs text-danger mt-3">{err}</div>}
      <div className="flex justify-end gap-2 mt-5">
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={submit} disabled={busy || !name.trim() || !phone.trim()}>Add member</Btn>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-bg/85 backdrop-blur-md z-[1000] grid place-items-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-panel border border-line rounded-2xl max-w-lg w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-line/60 flex items-center justify-between">
          <div className="font-display text-xl tracking-tight2">{title}</div>
          <button onClick={onClose} className="text-muted hover:text-slate-100 text-xl leading-none">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function Stat({ label, value, sub, accent = "cream" }: { label: string; value: any; sub?: string; accent?: "green" | "yellow" | "cream" }) {
  const color = accent === "green" ? "text-accent" : accent === "yellow" ? "text-accent2" : "text-cream";
  return (
    <div className="bg-bg/40 border border-line/60 rounded-xl p-4">
      <div className="text-[10.5px] uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className={clsx("font-display text-3xl tracking-tight2 mt-1.5", color)}>{value}</div>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </div>
  );
}

function countDivisions(node: OrgTreeNode | null): number {
  if (!node) return 0;
  return node.children.reduce((sum, c) => sum + 1 + countDivisions(c), 0);
}

function treeDepth(node: OrgTreeNode | null): number {
  if (!node) return 0;
  if (node.children.length === 0) return 1;
  return 1 + Math.max(...node.children.map(treeDepth));
}

function findInTree(node: OrgTreeNode | null, id: number): OrgTreeNode | null {
  if (!node) return null;
  if (node.id === id) return node;
  for (const c of node.children) {
    const f = findInTree(c, id);
    if (f) return f;
  }
  return null;
}
