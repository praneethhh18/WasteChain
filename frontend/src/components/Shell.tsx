import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useCurrentUser, useAllUsers, setCurrentUser, useFreshMode, useJudgeMode } from "../session";
import { User } from "../api";
import clsx from "clsx";

const LANGS = [
  { code: "en", label: "EN" },
  { code: "hi", label: "हि" },
  { code: "kn", label: "ಕ" },
];

const ROLE_HOME: Record<string, string> = {
  collector: "/collector",
  ragpicker: "/ragpicker",
  kabadiwala: "/kabadiwala",
  aggregator: "/aggregator",
  recycler: "/recycler",
  municipality: "/municipality",
};

const ROLE_EMOJI: Record<string, string> = {
  collector: "🚛",
  ragpicker: "♻️",
  kabadiwala: "🏪",
  aggregator: "📦",
  recycler: "🏭",
  municipality: "🏛️",
};

const ROLE_LABEL: Record<string, string> = {
  collector: "Truck driver",
  ragpicker: "Ragpicker",
  kabadiwala: "Kabadiwala",
  aggregator: "Aggregator",
  recycler: "Recycler",
  municipality: "Municipality",
};

const PRIMARY_ROLE_ORDER = ["aggregator", "recycler", "municipality", "kabadiwala", "collector", "ragpicker"];

export default function Shell({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation();
  const [user] = useCurrentUser();
  const [fresh] = useFreshMode();
  const [judge, setJudge] = useJudgeMode();
  const users = useAllUsers();
  const nav = useNavigate();
  const loc = useLocation();
  const onLanding = loc.pathname === "/";

  const setLang = (code: string) => {
    i18n.changeLanguage(code);
    localStorage.setItem("lang", code);
    document.documentElement.lang = code;
  };

  const signOut = () => {
    setCurrentUser(null);
    setJudge(false);
    nav("/");
  };

  const switchTo = (u: User) => {
    setCurrentUser(u);
    nav(ROLE_HOME[u.role] || "/");
  };

  return (
    <div className="min-h-full flex flex-col">
      {/* ─── HEADER ──────────────────────────────────────────────── */}
      <header className={clsx(
        "sticky top-0 z-30 transition-colors",
        onLanding ? "bg-bg/40 backdrop-blur-md" : "bg-bg/80 backdrop-blur-xl border-b border-line/60",
      )}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-6">
          {/* Logo always goes to landing — works as the universal "home" for
              both signed-in and signed-out users. Signed-in users use their
              role tab to get to their dashboard. */}
          <NavLink to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-accent to-emerald-500 grid place-items-center text-bg font-black text-sm shadow-glow">W</div>
            <div className="leading-tight">
              <div className="font-semibold tracking-tightish text-[15px]">WasteChain</div>
              <div className="text-[10px] text-muted -mt-0.5 tracking-[0.14em] uppercase">Traceable waste</div>
            </div>
          </NavLink>

          {user && (
            <nav className="hidden md:flex gap-1 ml-2 text-sm">
              <NavTab to={ROLE_HOME[user.role] || "/"}>
                {ROLE_EMOJI[user.role]} <span className="ml-1">{ROLE_LABEL[user.role] || user.role}</span>
              </NavTab>
              {/* Admin Console — every signed-in user who belongs to an org
                  can see and manage their own deployment's pyramid + team. */}
              {user.organization_id && (
                <NavTab to="/admin">🏛️ <span className="ml-1">Admin</span></NavTab>
              )}
              {/* Network-wide analytics tools — only municipality officers
                  see these in their daily-use nav. */}
              {user.role === "municipality" && (
                <>
                  <NavTab to="/live">🛰️ <span className="ml-1">Live network</span></NavTab>
                  <NavTab to="/risk">⚠ <span className="ml-1">Risk patterns</span></NavTab>
                  <NavTab to="/flows">🌊 <span className="ml-1">Material flows</span></NavTab>
                </>
              )}
            </nav>
          )}

          <div className="ml-auto flex items-center gap-3">
            {!onLanding && (
              <div className="hidden sm:flex items-center gap-1 bg-bg/60 border border-line/60 rounded-lg px-1 py-0.5">
                {LANGS.map(l => (
                  <button
                    key={l.code}
                    onClick={() => setLang(l.code)}
                    className={clsx("px-2 py-1 text-xs rounded-md transition",
                      i18n.language === l.code ? "bg-accent text-bg font-semibold" : "text-muted hover:text-slate-100")}
                  >{l.label}</button>
                ))}
              </div>
            )}

            {user ? (
              // Signed-in user — looks like a real account chip. No persona-switcher
              // option here; switching happens via Judge tools (intentional).
              <div className="flex items-center gap-2 bg-bg/60 border border-line/80 rounded-lg px-3 py-1.5 text-sm">
                <span className="w-7 h-7 rounded-full bg-accent/15 text-accent grid place-items-center text-sm">
                  {ROLE_EMOJI[user.role]}
                </span>
                <div className="leading-tight text-left">
                  <div className="text-xs font-medium">{user.name}</div>
                  <div className="text-[10px] text-muted tracking-wider">{ROLE_LABEL[user.role]}{fresh && " · new"}</div>
                </div>
                <button onClick={signOut} title="Sign out"
                  className="ml-2 text-[10px] text-muted hover:text-danger transition">
                  sign out
                </button>
              </div>
            ) : !onLanding ? (
              // Helpful link back to landing — but ONLY when we're not already there.
              <NavLink to="/" className="text-sm text-muted hover:text-slate-100">
                ← back to landing
              </NavLink>
            ) : null}
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-20 pb-10 pt-10 border-t border-line/40">
        <div className="max-w-7xl mx-auto px-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs text-muted tracking-[0.14em] uppercase">WasteChain · 2026</div>
            <div className="text-sm text-slate-400 mt-1 max-w-md">
              An intelligent data layer for the informal recycling economy of India.
            </div>
          </div>
          <div className="text-xs text-muted mono">SHA-256 ledger · provider-agnostic gateway</div>
        </div>
      </footer>

      {/* ─── JUDGE TOOLS — floating, intentionally hidden by default ─ */}
      <JudgeToolsButton
        open={judge}
        onToggle={() => setJudge(!judge)}
        signedIn={!!user}
        currentUser={user}
        users={users}
        onSwitch={switchTo}
      />
    </div>
  );
}

function NavTab({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink to={to} end className={({ isActive }) =>
      clsx("px-3 py-1.5 rounded-md transition text-[13px]",
        isActive ? "bg-accent/15 text-accent" : "text-slate-300 hover:bg-bg/60")
    }>{children}</NavLink>
  );
}

function JudgeToolsButton({
  open, onToggle, signedIn, currentUser, users, onSwitch,
}: {
  open: boolean; onToggle: () => void; signedIn: boolean;
  currentUser: User | null; users: User[];
  onSwitch: (u: User) => void;
}) {
  const [fresh, setFresh] = useFreshMode();
  const loc = useLocation();

  return (
    <>
      {/* Floating launcher button */}
      <button onClick={onToggle}
        className={clsx(
          "fixed z-40 bottom-5 right-5 rounded-full pl-3 pr-4 py-2.5 text-xs font-medium shadow-card transition-all",
          "border flex items-center gap-2",
          open
            ? "bg-accent2 text-bg border-accent2 shadow-glowYellow"
            : "bg-panel border-line text-cream hover:border-accent2/60 hover:bg-panel/90"
        )}
        title={open ? "Close judge tools" : "Open judge tools"}>
        <span className="text-base">🎭</span>
        {open ? "Close demo controls" : "Demo controls"}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <button onClick={onToggle}
            className="fixed inset-0 z-30 bg-bg/40 backdrop-blur-sm animate-fade-in"
            aria-hidden />

          {/* Panel — slides up from bottom-right */}
          <div className="fixed bottom-20 right-5 z-40 w-[min(380px,calc(100vw-2rem))] bg-panel border border-line rounded-2xl shadow-card overflow-hidden animate-fade-up">
            <div className="px-5 py-4 border-b border-line/60 flex items-baseline justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-accent2">🎭 Demo controls</div>
                <div className="font-display text-lg tracking-tight2 mt-0.5">Cross-cutting tools</div>
              </div>
              <button onClick={onToggle} className="text-muted hover:text-slate-100 text-xl leading-none">×</button>
            </div>

            <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
              <div className="text-[11px] text-muted leading-relaxed">
                In production each user logs in once with their phone and sees only their own dashboard. This panel lets you cross-cut roles + access the audit / provenance views — features no real user would ever see in a live deployment.
              </div>

              {/* Judge nav links */}
              <div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-muted mb-2">Cross-cutting views</div>
                <div className="grid grid-cols-1 gap-1.5">
                  <ToolLink to="/" label="🏠  Landing page" />
                  <ToolLink to="/setup" label="🏛️  Set up a new deployment" />
                  <ToolLink to="/admin" label="📐  Admin console (pyramid)" />
                  <ToolLink to="/live" label="🛰️  Live network map" />
                  <ToolLink to="/risk" label="⚠   Risk patterns (anomalies)" />
                  <ToolLink to="/flows" label="🌊  Material flow Sankey" />
                  <ToolLink to="/workflow" label="▶  90-second walkthrough" />
                  <ToolLink to="/provenance" label="🧭  Trace a batch (provenance)" />
                  <ToolLink to="/trust" label="🔗  Trust layer (hash chain)" />
                  <ToolLink to="/sms" label="📨  SMS bot simulator" />
                </div>
              </div>

              {/* Fresh-mode toggle */}
              <div className="bg-bg/40 border border-line/60 rounded-xl p-3.5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium">
                      {fresh ? "🌱 Brand-new user" : "📊 Established user"}
                    </div>
                    <div className="text-[11px] text-muted mt-0.5">
                      {fresh ? "Dashboard reads empty — onboarding view." : "Sample data shown."}
                    </div>
                  </div>
                  <div className="flex bg-bg/60 border border-line/60 rounded-lg p-0.5">
                    <button onClick={() => setFresh(false)}
                      className={clsx("px-2.5 py-1 text-[11px] rounded-md transition",
                        !fresh ? "bg-accent text-bg font-semibold" : "text-muted")}>
                      Established
                    </button>
                    <button onClick={() => setFresh(true)}
                      className={clsx("px-2.5 py-1 text-[11px] rounded-md transition",
                        fresh ? "bg-accent2 text-bg font-semibold" : "text-muted")}>
                      Day 1
                    </button>
                  </div>
                </div>
              </div>

              {/* Persona switcher */}
              <div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-muted mb-2">Sign in as a different role</div>
                <PersonaList currentUser={currentUser} users={users} onSwitch={onSwitch} />
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function ToolLink({ to, label }: { to: string; label: string }) {
  const loc = useLocation();
  const active = loc.pathname === to;
  return (
    <NavLink to={to} className={clsx(
      "block px-3 py-2 rounded-lg text-sm transition border",
      active ? "bg-accent/10 border-accent/40 text-accent" : "bg-bg/40 border-line/40 hover:border-accent/30 text-slate-200"
    )}>
      {label}
    </NavLink>
  );
}

function PersonaList({ currentUser, users, onSwitch }: {
  currentUser: User | null; users: User[];
  onSwitch: (u: User) => void;
}) {
  const grouped: Record<string, User[]> = {};
  for (const u of users) (grouped[u.role] ||= []).push(u);

  return (
    <div className="space-y-3">
      {PRIMARY_ROLE_ORDER.map(role => grouped[role] && (
        <div key={role}>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-sm">{ROLE_EMOJI[role]}</span>
            <span className="text-xs font-medium">{ROLE_LABEL[role]}</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {grouped[role].map(u => {
              const isCurrent = currentUser?.id === u.id;
              return (
                <button key={u.id} onClick={() => onSwitch(u)}
                  className={clsx("text-left rounded-md p-2 transition border text-[11px]",
                    isCurrent
                      ? "bg-accent/10 border-accent text-accent"
                      : "bg-bg/40 border-line/40 hover:border-accent/40 text-slate-300")}>
                  <div className="font-medium truncate">{u.name}</div>
                  <div className="text-[9px] text-muted truncate">{u.area || "—"}</div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
