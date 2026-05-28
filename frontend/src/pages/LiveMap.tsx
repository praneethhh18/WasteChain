/* Live Network Map — for city corp / municipal officers.
 *
 * Real-time map of active trucks (animated icons along their GPS trail),
 * recent batches as pulsing dots, recent handoffs as flow lines, and a
 * search bar that filters by plate number, person, area, or batch code.
 *
 * Polls /live every 4 seconds. Pure tracking visualization — no economic
 * features, no marketplace, just *where is everything right now*.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap } from "react-leaflet";
import L from "leaflet";
import { api, LiveNetwork } from "../api";
import { Btn, Eyebrow, Reveal, Hash } from "../components/ui";
import clsx from "clsx";

function truckIcon(active: boolean) {
  return L.divIcon({
    className: "wc-truck",
    html: `<div style="
      width:34px;height:34px;display:grid;place-items:center;
      background:${active ? "#2eea84" : "#8a9a93"};color:#0a0d0b;
      border-radius:50%;font-size:18px;
      box-shadow:0 0 0 4px ${active ? "rgba(46,234,132,0.25)" : "rgba(138,154,147,0.18)"},0 0 18px ${active ? "rgba(46,234,132,0.7)" : "rgba(0,0,0,0.4)"};
      ${active ? "animation:wc-pulse 1.8s ease-in-out infinite;" : ""}
    ">🚛</div>`,
    iconSize: [34, 34], iconAnchor: [17, 17],
  });
}

function dotIcon(color: string, label?: string) {
  return L.divIcon({
    className: "wc-dot",
    html: `<div style="
      width:14px;height:14px;border-radius:50%;
      background:${color};
      box-shadow:0 0 0 3px ${color}33,0 0 10px ${color}88;
      ${label ? `position:relative;` : ""}
    ">${label ? `<span style="position:absolute;top:-18px;left:50%;transform:translateX(-50%);font-size:9px;color:#e2e8f0;background:#0a0d0b88;padding:1px 4px;border-radius:3px;white-space:nowrap;">${label}</span>` : ""}</div>`,
    iconSize: [14, 14], iconAnchor: [7, 7],
  });
}

const PULSE_CSS = `
@keyframes wc-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.12); }
}
`;

export default function LiveMap() {
  const [data, setData] = useState<LiveNetwork | null>(null);
  const [q, setQ] = useState("");
  const [committedQ, setCommittedQ] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [focus, setFocus] = useState<{ lat: number; lon: number } | null>(null);

  const refresh = async (qry: string = committedQ) => {
    try { setData(await api.live(qry || undefined)); } catch {}
  };

  useEffect(() => { refresh(""); }, []);
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => refresh(), 4000);
    return () => clearInterval(id);
  }, [autoRefresh, committedQ]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById("wc-pulse-style")) return;
    const s = document.createElement("style"); s.id = "wc-pulse-style"; s.innerHTML = PULSE_CSS;
    document.head.appendChild(s);
  }, []);

  const submitSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setCommittedQ(q.trim());
    refresh(q.trim());
  };
  const clearSearch = () => { setQ(""); setCommittedQ(""); refresh(""); };

  const center: [number, number] = [12.90, 74.85];

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      <Reveal>
        <header className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <Eyebrow>Live network · city corporation view</Eyebrow>
            <h1 className="font-display text-4xl md:text-5xl tracking-tight2 mt-3 leading-[1.05]">
              Where is everything <span className="text-accent">right now</span>?
            </h1>
            <p className="text-slate-300 mt-3 max-w-2xl leading-relaxed">
              Every truck on a live route, every batch logged in the last 24 hours, every handoff flowing through the network. Search by plate number, person, area, or batch code.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            {autoRefresh ? "auto-refresh · 4s" : "paused"}
            <button onClick={() => setAutoRefresh(!autoRefresh)}
              className="ml-2 text-accent hover:underline">{autoRefresh ? "pause" : "resume"}</button>
          </div>
        </header>
      </Reveal>

      <Reveal delay={80}>
        <form onSubmit={submitSearch} className="flex flex-wrap gap-2 items-center bg-panel/50 border border-line/60 rounded-2xl p-3">
          <span className="text-2xl ml-1">🔎</span>
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder='Try "Ward A" · "Vehicle DEMO-001" · "[Demo] Kabadiwala" · "WC-2026-0042" · "RP-002"'
            className="flex-1 min-w-[200px] bg-bg/60 border border-line/60 focus:border-accent rounded-lg px-3 py-2 text-sm outline-none" />
          <Btn variant="primary" type="submit">Search</Btn>
          {committedQ && <Btn variant="ghost" onClick={clearSearch}>Clear</Btn>}
          {committedQ && (
            <div className="text-[11px] text-accent2 w-full mt-1 pl-12">
              filtering by <span className="mono">"{committedQ}"</span>
            </div>
          )}
        </form>
      </Reveal>

      {data && (
        <Reveal delay={120}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Active routes now" value={data.counts.active_route_count} accent="green" pulse />
            <Stat label="Routes (24h)" value={data.counts.recent_route_count} />
            <Stat label="Batches (24h)" value={data.counts.recent_batch_count} accent="cream" />
            <Stat label="Handoffs (24h)" value={data.counts.recent_handoff_count} accent="yellow" />
          </div>
        </Reveal>
      )}

      <Reveal delay={150}>
        <div className="grid lg:grid-cols-[1fr_360px] gap-5">
          {/* The map */}
          <div className="bg-panel/40 border border-line/60 rounded-2xl p-3 relative">
            <MapContainer center={center} zoom={12} style={{ width: "100%", height: 560, borderRadius: 12 }}>
              <TileLayer attribution='&copy; OpenStreetMap'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <Recenter focus={focus} />

              {/* Aggregation points (static) */}
              {data?.aggregation_points.map(a => (
                <Marker key={`ap-${a.id}`} position={[a.lat, a.lon]} icon={dotIcon("#fcd34d")}>
                  <Popup><b>{a.name}</b><br/><span style={{ fontSize: 11 }}>{a.area || "—"}</span></Popup>
                </Marker>
              ))}

              {/* Route polylines (the truck trail) */}
              {data?.active_routes.map(r => r.coords.length >= 2 && (
                <Polyline key={`rt-${r.id}`}
                  positions={r.coords.map(c => [c.lat, c.lon])}
                  pathOptions={{
                    color: r.status === "IN_PROGRESS" ? "#2eea84" : "#8a9a93",
                    weight: r.status === "IN_PROGRESS" ? 3 : 2,
                    opacity: r.status === "IN_PROGRESS" ? 0.85 : 0.45,
                    dashArray: r.status === "IN_PROGRESS" ? undefined : "5 5",
                  }} />
              ))}

              {/* Truck icons at the current position */}
              {data?.active_routes.filter(r => r.current_lat !== undefined).map(r => (
                <Marker key={`tk-${r.id}`} position={[r.current_lat!, r.current_lon!]}
                  icon={truckIcon(r.status === "IN_PROGRESS")}>
                  <Popup>
                    <div style={{ fontSize: 12 }}>
                      <b>{r.code}</b><br/>
                      Driver: {r.collector?.name}<br/>
                      Ward: {r.ward || "—"}<br/>
                      {r.pickup_count} pickups · {r.total_weight_kg || "?"} kg<br/>
                      <span style={{ color: r.status === "IN_PROGRESS" ? "#2eea84" : "#8a9a93" }}>
                        {r.status}
                      </span>
                    </div>
                  </Popup>
                </Marker>
              ))}

              {/* Recent batches */}
              {data?.recent_batches.map(b => (
                <CircleMarker key={`bt-${b.id}`} center={[b.lat, b.lon]}
                  radius={5} pathOptions={{
                    fillColor: b.tampered ? "#ff6b6b" : "#2eea84",
                    color: b.tampered ? "#ff6b6b" : "#2eea84",
                    fillOpacity: 0.85, weight: 1,
                  }}>
                  <Popup>
                    <div style={{ fontSize: 12 }}>
                      <b>{b.code}</b> · {b.material} · {b.weight_kg} kg<br/>
                      {b.creator?.name} ({b.area || "—"})<br/>
                      <span style={{ color: "#8a9a93" }}>{new Date(b.created_at).toLocaleString()}</span>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}

              {/* Recent handoff flow lines */}
              {data?.recent_handoffs.slice(0, 30).map(h => (
                <Polyline key={`hf-${h.id}`}
                  positions={[[h.from.lat, h.from.lon], [h.to.lat, h.to.lon]]}
                  pathOptions={{
                    color: h.discrepancy_flag ? "#ff6b6b" : "#60a5fa",
                    weight: 1.5, opacity: 0.55, dashArray: "3 5",
                  }} />
              ))}
            </MapContainer>
          </div>

          {/* Sidebar — live ticker / search results */}
          <div className="space-y-3">
            <Section title="🚛 Active routes" count={data?.active_routes.filter(r => r.status === "IN_PROGRESS").length || 0}>
              {data?.active_routes.filter(r => r.status === "IN_PROGRESS").length === 0 ? (
                <Empty>No trucks on the road right now.</Empty>
              ) : (
                <div className="space-y-2">
                  {data?.active_routes.filter(r => r.status === "IN_PROGRESS").map(r => (
                    <Row key={r.id}
                      title={r.code}
                      subtitle={`${r.collector?.name || "?"} · ${r.ward || "—"}`}
                      meta={`${r.pickup_count} pickups · ${r.ping_count} GPS pings`}
                      onClick={() => r.current_lat && r.current_lon && setFocus({ lat: r.current_lat, lon: r.current_lon })}
                    />
                  ))}
                </div>
              )}
            </Section>

            <Section title="📦 Recent batches" count={data?.counts.recent_batch_count || 0}>
              {data?.recent_batches.length === 0 ? (
                <Empty>No batches in the last 24h.</Empty>
              ) : (
                <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
                  {data?.recent_batches.slice(0, 8).map(b => (
                    <Row key={b.id}
                      title={b.code}
                      subtitle={`${b.material} · ${b.weight_kg} kg`}
                      meta={`${b.creator?.name || "?"} · ${b.area || "—"}`}
                      onClick={() => setFocus({ lat: b.lat, lon: b.lon })}
                      flagged={b.tampered}
                    />
                  ))}
                </div>
              )}
            </Section>

            <Section title="🤝 Recent handoffs" count={data?.counts.recent_handoff_count || 0}>
              {data?.recent_handoffs.length === 0 ? <Empty>No handoffs in the last 24h.</Empty> :
                <div className="space-y-1 max-h-[180px] overflow-y-auto pr-1 text-[11px]">
                  {data?.recent_handoffs.slice(0, 10).map(h => (
                    <div key={h.id} className={clsx(
                      "px-2.5 py-1.5 rounded border",
                      h.discrepancy_flag
                        ? "bg-danger/10 border-danger/40"
                        : "bg-bg/40 border-line/60",
                    )}>
                      <span className="text-cream">{h.from.name}</span>
                      <span className="text-muted mx-1.5">→</span>
                      <span className="text-cream">{h.to.name}</span>
                      <span className="text-muted ml-2">{h.sent_weight} → {h.received_weight ?? "?"} kg</span>
                      {h.has_photo && <span className="ml-2 text-accent2" title="Photo evidence on chain">📷</span>}
                    </div>
                  ))}
                </div>
              }
            </Section>
          </div>
        </div>
      </Reveal>
    </div>
  );
}

// Imperatively pan the leaflet map to a focus coordinate (driven by sidebar clicks).
function Recenter({ focus }: { focus: { lat: number; lon: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (focus) map.flyTo([focus.lat, focus.lon], 15, { duration: 1.2 });
  }, [focus, map]);
  return null;
}

function Stat({ label, value, accent = "cream", pulse }: { label: string; value: number; accent?: "green" | "yellow" | "cream"; pulse?: boolean }) {
  const color = accent === "green" ? "text-accent" : accent === "yellow" ? "text-accent2" : "text-cream";
  return (
    <div className="bg-bg/40 border border-line/60 rounded-xl p-4">
      <div className="text-[10.5px] uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className={clsx("font-display text-4xl tracking-tight2 mt-1.5", color, pulse && value > 0 && "animate-pulse")}>
        {value}
      </div>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="bg-panel/40 border border-line/60 rounded-2xl">
      <div className="px-4 py-2.5 border-b border-line/40 flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-[0.14em] text-cream font-medium">{title}</div>
        {count !== undefined && <div className="text-[10px] text-muted">{count}</div>}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function Row({ title, subtitle, meta, onClick, flagged }: { title: string; subtitle?: string; meta?: string; onClick?: () => void; flagged?: boolean }) {
  return (
    <button onClick={onClick}
      className={clsx("w-full text-left px-3 py-2 rounded-md border transition",
        flagged ? "bg-danger/10 border-danger/40 hover:bg-danger/15" : "bg-bg/40 border-line/60 hover:border-accent/40")}>
      <div className="mono text-[11px] text-cream">{title}</div>
      {subtitle && <div className="text-[11px] text-slate-300 mt-0.5">{subtitle}</div>}
      {meta && <div className="text-[10px] text-muted mt-0.5">{meta}</div>}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-muted py-3 text-center">{children}</div>;
}
