import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, MunicipalityStats, Batch, User } from "../api";
import { Card, Stat, Empty, Eyebrow, Reveal, CountUp, Btn } from "../components/ui";
import { CarbonCity } from "../components/CarbonImpact";
import { MiniMap, MapPoint } from "../components/Map";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

const COLORS = ["#2eea84", "#f5cf6f", "#60a5fa", "#f472b6", "#a78bfa", "#fb923c"];

export default function Municipality() {
  const [stats, setStats] = useState<MunicipalityStats | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const refresh = async () => {
    const [s, b, u] = await Promise.all([api.municipalityStats(), api.batches(), api.users()]);
    setStats(s); setBatches(b); setUsers(u);
  };
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 8000);
    return () => clearInterval(id);
  }, []);

  if (!stats) return <div className="max-w-7xl mx-auto px-6 py-20 text-muted">Loading…</div>;

  const pie = Object.entries(stats.material_breakdown).map(([name, value]) => ({ name, value }));
  const collectors = users.filter(u => u.role === "kabadiwala");
  const recyclers = users.filter(u => u.role === "recycler");
  const recentBatches = batches.slice(0, 60);

  const points: MapPoint[] = [
    ...collectors.map(u => ({ lat: u.lat!, lon: u.lon!, label: u.name, sub: u.area, kind: "kabadiwala" as const })),
    ...recyclers.map(u => ({ lat: u.lat!, lon: u.lon!, label: u.name, sub: u.area, kind: "recycler" as const })),
    ...recentBatches.map(b => ({
      lat: b.lat, lon: b.lon, label: b.batch_code,
      sub: `${b.weight_kg}kg ${b.material_type}`,
      kind: b.tampered ? "tampered" as const : "batch" as const,
    })),
  ];

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-10">
      <Reveal>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Stage 1 + 2 + 5 oversight · Municipality</Eyebrow>
            <h1 className="font-display text-4xl md:text-5xl tracking-tight2 mt-3">Demo City Dashboard</h1>
            <p className="text-sm text-muted mt-2">Fictional deployment · waste recovery analytics</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-xs text-muted flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" /> Live · auto-refresh 8s
            </div>
            <Link to="/admin"><Btn variant="ghost" size="lg">🏛️ Admin console</Btn></Link>
            <Link to="/live"><Btn size="lg">🛰️ Live network map →</Btn></Link>
          </div>
        </header>
      </Reveal>

      <Reveal delay={100}>
        <div className="grid md:grid-cols-4 gap-3">
          <Stat label="Collected today (truck)" value={`${stats.collected_kg_today.toFixed(0)} kg`} sub={`${stats.active_routes} active routes`} accent="yellow" big />
          <Stat label="Recovered today (recyclable)" value={`${stats.total_recovered_kg_today.toFixed(0)} kg`} sub={`week: ${stats.total_recovered_kg_week.toFixed(0)} kg`} accent="cream" big />
          <Stat label="Landfill diversion" value={`${stats.landfill_diversion_pct}%`} sub="of baseline" big />
          <Stat label="Active collectors" value={stats.active_collectors} sub={`${stats.flagged_handoffs} flagged`} accent={stats.flagged_handoffs > 0 ? "red" : "green"} big />
        </div>
      </Reveal>

      {stats.carbon && (
        <Reveal delay={150}>
          <CarbonCity carbon={stats.carbon} />
        </Reveal>
      )}

      <Reveal delay={200}>
        <div className="grid md:grid-cols-3 gap-5">
          <Card title="Daily recovery · last 14 days" className="md:col-span-2">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={stats.daily_series}>
                <XAxis dataKey="date" stroke="#8a9a93" fontSize={11} />
                <YAxis stroke="#8a9a93" fontSize={11} />
                <Tooltip contentStyle={{ background: "#10171a", border: "1px solid #1c2823", borderRadius: 8 }} />
                <Line type="monotone" dataKey="kg" stroke="#2eea84" strokeWidth={2.5} dot={{ r: 3, fill: "#2eea84" }} />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Material mix">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={2}>
                  {pie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#10171a", border: "1px solid #1c2823", borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </div>
      </Reveal>

      <Reveal delay={300}>
        <Card title={`Live network · ${recentBatches.length} recent batches across the region`} padded={false}>
          <div className="p-3"><MiniMap points={points} height={460} center={[12.9, 74.85]} /></div>
          <div className="px-5 pb-5 text-[11px] text-muted flex flex-wrap gap-5">
            <Legend2 color="bg-accent" label="kabadiwalas & batches" />
            <Legend2 color="bg-blue-400" label="recyclers" />
            <Legend2 color="bg-danger" label="tampered records" />
          </div>
        </Card>
      </Reveal>
    </div>
  );
}

function Legend2({ color, label }: { color: string; label: string }) {
  return <span><span className={`inline-block w-2 h-2 rounded-full align-middle mr-1.5 ${color}`}/> {label}</span>;
}
