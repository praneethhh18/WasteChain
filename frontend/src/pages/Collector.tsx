import { useEffect, useState } from "react";
import { useCurrentUser, useFreshMode } from "../session";
import { api, Route, Pickup, AggregationPoint } from "../api";
import { Btn, Hash, Empty, Eyebrow, Reveal } from "../components/ui";
import { EmptyOnboarding } from "../components/EmptyState";
import { MiniMap, MapPoint, MapLine } from "../components/Map";
import clsx from "clsx";

const KEY_ACTIVE = "wc.collector.activeRoute";

export default function Collector() {
  const [user] = useCurrentUser();
  const [fresh] = useFreshMode();
  const [routes, setRoutesRaw] = useState<Route[]>([]);
  const setRoutes = (r: Route[]) => setRoutesRaw(fresh ? [] : r);
  const [active, setActive] = useState<Route | null>(null);
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [aggs, setAggs] = useState<AggregationPoint[]>([]);
  const [busy, setBusy] = useState(false);
  const [gpsErr, setGpsErr] = useState<string | null>(null);
  const [endModal, setEndModal] = useState(false);
  const [endWeight, setEndWeight] = useState("");
  const [endDumpId, setEndDumpId] = useState<number | null>(null);

  if (!user || user.role !== "collector") {
    return <Gate expected="collector" />;
  }

  // Day-1 ragpicker / collector: same simple message + still allow them to
  // press "Start route" because day-1 != broken. Day-1 just means no history.

  const refresh = async () => {
    const [rs, aps] = await Promise.all([
      api.routes({ collector_phone: user.phone }),
      api.aggregationPoints(),
    ]);
    setRoutes(rs);
    setAggs(aps);
    const cachedId = parseInt(localStorage.getItem(KEY_ACTIVE) || "0") || null;
    const live = rs.find(r => r.status === "IN_PROGRESS") || rs.find(r => r.id === cachedId);
    if (live && live.status === "IN_PROGRESS") {
      setActive(live);
      const det = await api.routeDetail(live.id);
      setPickups(det.pickups);
    } else {
      setActive(null);
      setPickups([]);
      localStorage.removeItem(KEY_ACTIVE);
    }
  };
  useEffect(() => { refresh(); }, [user?.id, fresh]);

  // ── Continuous GPS streaming while a route is IN_PROGRESS ──────────
  // Every 20s, push the current GPS position as a ping. The live map
  // reads these to draw the truck's trail and current position.
  useEffect(() => {
    if (!active || active.status !== "IN_PROGRESS") return;
    let cancelled = false;
    const tick = () => {
      if (cancelled || !navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return;
          api.pingRoute(
            active.id, pos.coords.latitude, pos.coords.longitude,
            pos.coords.accuracy,
            pos.coords.speed != null ? pos.coords.speed * 3.6 : undefined,
          ).catch(() => {});
        },
        () => {
          // Fallback ping at the user's registered location so the trail
          // doesn't go silent when GPS is denied.
          api.pingRoute(active.id, user.lat || 12.87, user.lon || 74.85).catch(() => {});
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 }
      );
    };
    tick();  // immediate first ping
    const id = setInterval(tick, 20000);
    return () => { cancelled = true; clearInterval(id); };
  }, [active?.id, active?.status]);

  const getGps = (): Promise<{ lat: number; lon: number }> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ lat: user.lat || 12.87, lon: user.lon || 74.85 });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => {
          setGpsErr("GPS unavailable — using registered location");
          resolve({ lat: user.lat || 12.87, lon: user.lon || 74.85 });
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    });
  };

  const startRoute = async () => {
    setBusy(true);
    try {
      const gps = await getGps();
      const r = await api.startRoute({ collector_phone: user.phone, lat: gps.lat, lon: gps.lon, ward: user.area });
      localStorage.setItem(KEY_ACTIVE, String(r.id));
      await refresh();
    } catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  };

  const logPickup = async () => {
    if (!active) return;
    setBusy(true);
    setGpsErr(null);
    try {
      const gps = await getGps();
      const p = await api.logPickup({ route_id: active.id, lat: gps.lat, lon: gps.lon });
      setPickups([...pickups, p]);
    } catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  };

  const endRoute = async () => {
    if (!active) return;
    const w = parseFloat(endWeight);
    if (!w) return;
    setBusy(true);
    try {
      const gps = await getGps();
      await api.endRoute({
        route_id: active.id, lat: gps.lat, lon: gps.lon,
        total_estimated_weight_kg: w, dump_aggregation_point_id: endDumpId || undefined,
      });
      localStorage.removeItem(KEY_ACTIVE);
      setEndModal(false); setEndWeight(""); setEndDumpId(null);
      await refresh();
    } catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  };

  const recent = routes.filter(r => r.status === "COMPLETED").slice(0, 5);

  // When a route is active, render the focus-mode big-button UI
  if (active) {
    return <ActiveRouteView
      user={user} route={active} pickups={pickups} busy={busy} gpsErr={gpsErr}
      onLogPickup={logPickup} onEnd={() => setEndModal(true)}
      endModal={endModal} onCloseEnd={() => setEndModal(false)}
      endWeight={endWeight} setEndWeight={setEndWeight}
      endDumpId={endDumpId} setEndDumpId={setEndDumpId}
      aggs={aggs} onConfirmEnd={endRoute}
    />;
  }

  // No active route — landing/start view
  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
      <Reveal>
        <header>
          <Eyebrow>Stage 2 · Collector {fresh && "· Day 1"}</Eyebrow>
          <h1 className="font-display text-4xl md:text-5xl tracking-tight2 mt-3">{user.name}</h1>
          <p className="text-sm text-muted mt-2">{user.area}{fresh && " · just enrolled"}</p>
          <p className="text-slate-400 max-w-2xl mt-4 text-[15px] leading-relaxed">
            {fresh
              ? <>First time using WasteChain? Just tap <span className="text-cream">▶ Start new route</span> below when you're heading out. GPS records your path automatically; one tap per house. Your route history will start building from here.</>
              : <>Truck drivers don't tap their phone 40 times a day. Once they tap <span className="text-cream">▶ Start route</span>, GPS streams automatically. Houses are logged with one tap each — most of the data captures itself.</>
            }
          </p>
        </header>
      </Reveal>

      <Reveal delay={100}>
        <div className="bg-panel/40 border border-line/60 rounded-3xl p-10 text-center">
          <div className="text-6xl mb-5">🚛</div>
          <div className="font-display text-3xl tracking-tight2 text-cream">No active route</div>
          <div className="text-sm text-muted mt-2 max-w-md mx-auto">
            Tap below when you're heading out. GPS turns on, route opens, hash chain starts.
          </div>
          <button onClick={startRoute} disabled={busy}
            className="bg-accent text-bg w-full max-w-md mt-8 py-6 rounded-2xl text-2xl font-bold hover:brightness-110 active:scale-[0.98] transition shadow-glow disabled:opacity-50">
            ▶ Start new route
          </button>
          {gpsErr && <div className="text-xs text-accent2 mt-4">⚠ {gpsErr}</div>}
        </div>
      </Reveal>

      {recent.length > 0 && (
        <Reveal delay={200}>
          <div>
            <Eyebrow>Recent routes</Eyebrow>
            <div className="mt-4 space-y-2">
              {recent.map(r => (
                <div key={r.id} className="bg-panel/40 border border-line/60 rounded-xl p-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="mono text-[11px] text-muted">{r.route_code}</div>
                    <div className="mt-0.5">
                      <span className="font-display text-xl tracking-tight2 text-cream">{r.pickup_count}</span>
                      <span className="text-muted text-sm"> pickups · </span>
                      <span className="text-accent">{(r.total_estimated_weight_kg || 0).toFixed(0)} kg</span>
                    </div>
                    <div className="text-[11px] text-muted mt-1">{r.ward}</div>
                  </div>
                  <div className="text-right">
                    <Hash value={r.record_hash} />
                    <div className="text-[10px] text-muted mt-1">{new Date(r.started_at).toLocaleDateString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      )}
    </div>
  );
}

function ActiveRouteView({
  user, route, pickups, busy, gpsErr,
  onLogPickup, onEnd, endModal, onCloseEnd, endWeight, setEndWeight,
  endDumpId, setEndDumpId, aggs, onConfirmEnd,
}: any) {
  const points: MapPoint[] = pickups.map((p: Pickup) => ({
    lat: p.lat, lon: p.lon, label: `#${p.id}`,
    sub: new Date(p.captured_at).toLocaleTimeString(),
    kind: "batch" as const,
  }));
  const lines: MapLine[] = [];
  let prev: [number, number] | null = route.start_lat && route.start_lon ? [route.start_lat, route.start_lon] : null;
  for (const p of pickups) {
    if (prev) lines.push({ from: prev, to: [p.lat, p.lon], color: "#f5cf6f" });
    prev = [p.lat, p.lon];
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-accent flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"/> Route active
          </div>
          <div className="mono text-xs text-muted mt-1">{route.route_code}</div>
        </div>
        <div className="text-right">
          <div className="font-display text-5xl tracking-tight2 text-cream">{pickups.length}</div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted">pickups so far</div>
        </div>
      </div>

      {/* The big button */}
      <button onClick={onLogPickup} disabled={busy}
        className="w-full bg-accent text-bg py-10 rounded-3xl text-3xl font-bold hover:brightness-110 active:scale-[0.98] transition shadow-glow disabled:opacity-50">
        📍 Log pickup here
      </button>
      <div className="text-center text-[11px] text-muted">
        GPS captured automatically · works offline · syncs when back online
      </div>
      {gpsErr && <div className="text-xs text-accent2 text-center">⚠ {gpsErr}</div>}

      {/* End route button (smaller, lower priority) */}
      <button onClick={onEnd} disabled={busy}
        className="w-full bg-bg/40 border border-line/80 text-slate-200 py-3 rounded-xl text-sm hover:border-danger/40 transition">
        End route &amp; dump at aggregation point
      </button>

      {/* Map below */}
      {pickups.length > 0 && (
        <div className="bg-panel/40 border border-line/60 rounded-2xl p-3 mt-4">
          <MiniMap points={points} lines={lines} height={260} />
        </div>
      )}

      {/* Recent pickups list */}
      {pickups.length > 0 && (
        <div className="bg-panel/40 border border-line/60 rounded-2xl p-4">
          <div className="text-xs uppercase tracking-[0.14em] text-muted mb-3">Pickups this route</div>
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
            {[...pickups].reverse().map((p: Pickup) => (
              <div key={p.id} className="flex items-center justify-between text-xs bg-bg/40 border border-line/40 rounded-md px-3 py-2">
                <span><span className="mono text-muted">#{p.id}</span> · {new Date(p.captured_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                <span className="mono text-muted text-[10px]">{p.lat.toFixed(4)}, {p.lon.toFixed(4)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* End modal */}
      {endModal && (
        <div className="fixed inset-0 bg-bg/85 backdrop-blur-md z-[1000] grid place-items-center p-4 animate-fade-in" onClick={onCloseEnd}>
          <div className="bg-panel border border-line rounded-2xl max-w-md w-full shadow-card" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-line/60">
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted">End route</div>
              <div className="font-display text-2xl tracking-tight2 mt-1.5">Dump at?</div>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto">
                {aggs.map((a: AggregationPoint) => (
                  <button key={a.id} onClick={() => setEndDumpId(a.id)}
                    className={clsx("text-left p-3 rounded-xl border transition",
                      endDumpId === a.id ? "bg-accent/15 border-accent" : "bg-bg/40 border-line/60 hover:border-accent/50")}>
                    <div className="font-medium text-sm">{a.name}</div>
                    <div className="text-[11px] text-muted">{a.area}</div>
                  </button>
                ))}
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.14em] text-muted mb-2">Total weight at dump</div>
                <div className="flex items-center gap-2">
                  <input type="number" inputMode="decimal" value={endWeight} onChange={(e) => setEndWeight(e.target.value)}
                    placeholder="0" autoFocus
                    className="flex-1 bg-bg/60 border border-line/80 focus:border-accent rounded-xl px-4 py-3 text-3xl font-display tracking-tight2 outline-none" />
                  <div className="text-muted">kg</div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Btn variant="ghost" onClick={onCloseEnd}>Cancel</Btn>
                <Btn onClick={onConfirmEnd} disabled={busy || !endWeight || !endDumpId}>Finalize</Btn>
              </div>
            </div>
          </div>
        </div>
      )}
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
