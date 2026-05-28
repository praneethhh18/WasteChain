/* Material Flow — full-network Sankey visualization.
 *
 * Every actor that touched material in the time window is a node. Every
 * source→target relationship is a curved link sized by total kg moved.
 *
 * Pure tracking visualization — no marketplace, no economics. Just where
 * material flowed across the chain.
 */

import { useEffect, useMemo, useState } from "react";
import { api, FlowGraph } from "../api";
import { Btn, Eyebrow, Reveal } from "../components/ui";
import clsx from "clsx";

const ROLE_COL: Record<string, number> = {
  collector: 0, ragpicker: 1, kabadiwala: 2, aggregator: 3, recycler: 4, municipality: 5,
};
const ROLE_LABEL: Record<string, string> = {
  collector: "Collectors", ragpicker: "Ragpickers", kabadiwala: "Kabadiwalas",
  aggregator: "Aggregators", recycler: "Recyclers", municipality: "Municipality",
};
const MATERIAL_COLOR: Record<string, string> = {
  PET:       "#3ddc97",
  PAPER:     "#fcd34d",
  CARDBOARD: "#fb923c",
  METAL:     "#60a5fa",
  GLASS:     "#a78bfa",
};

const WIDTH = 1080;
const COL_X = [80, 240, 440, 660, 880, 1040];

export default function Flows() {
  const [graph, setGraph] = useState<FlowGraph | null>(null);
  const [window, setWindow] = useState(30);
  const [highlighted, setHighlighted] = useState<number | null>(null);

  const refresh = async () => {
    try { setGraph(await api.flows(window)); } catch {}
  };
  useEffect(() => { refresh(); }, [window]);

  const layout = useMemo(() => computeLayout(graph), [graph]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-7">
      <Reveal>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Material flow · Sankey view</Eyebrow>
            <h1 className="font-display text-5xl md:text-6xl tracking-tight2 mt-3 leading-[1.05]">
              Every kilo, <span className="text-accent">end to end</span>.
            </h1>
            <p className="text-slate-300 mt-4 max-w-2xl leading-relaxed">
              A river-flow visualization of the chain. Width = kg moved. Color = material.
              Click any node to highlight everything flowing through it.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select value={window} onChange={(e) => setWindow(parseInt(e.target.value))}
              className="bg-bg/60 border border-line/60 rounded-lg px-3 py-2 text-sm">
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <Btn variant="ghost" size="sm" onClick={refresh}>↻ Rescan</Btn>
          </div>
        </header>
      </Reveal>

      {graph && (
        <Reveal delay={80}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Total moved" value={`${graph.total_kg.toLocaleString(undefined, { maximumFractionDigits: 0 })} kg`} accent="cream" />
            <Stat label="Active actors" value={graph.node_count} />
            <Stat label="Flow paths" value={graph.link_count} accent="yellow" />
            <Stat label="Window" value={`${graph.window_days} days`} />
          </div>
        </Reveal>
      )}

      <Reveal delay={150}>
        <div className="bg-panel/40 border border-line/60 rounded-2xl p-4 overflow-x-auto">
          {!graph || graph.link_count === 0 ? (
            <div className="text-center py-20 text-muted">
              No flows in this window. Try a longer time range.
            </div>
          ) : (
            <svg viewBox={`0 0 ${WIDTH} ${layout.height}`} className="w-full">
              {/* Column headers */}
              {layout.columnRoles.map(({ role, x }) => (
                <text key={role} x={x} y={20} fill="#8a9a93" fontSize="11"
                  textAnchor="middle" style={{ textTransform: "uppercase", letterSpacing: "0.14em" }}>
                  {ROLE_LABEL[role] || role}
                </text>
              ))}

              {/* Links first (so nodes are on top) */}
              {layout.links.map((l, i) => {
                const dim = highlighted !== null && l.from_id !== highlighted && l.to_id !== highlighted;
                return (
                  <g key={i} opacity={dim ? 0.1 : 0.7}>
                    {l.materialSegments.map((seg, si) => (
                      <path key={si}
                        d={curvePath(seg.x1, seg.y1, seg.x2, seg.y2)}
                        stroke={MATERIAL_COLOR[seg.material] || "#8a9a93"}
                        strokeWidth={seg.height}
                        fill="none"
                        strokeLinecap="butt"
                        opacity={0.8}
                      />
                    ))}
                  </g>
                );
              })}

              {/* Nodes */}
              {layout.nodes.map(n => {
                const dim = highlighted !== null && n.id !== highlighted &&
                  !layout.links.some(l => (l.from_id === highlighted && l.to_id === n.id) ||
                                          (l.to_id === highlighted && l.from_id === n.id));
                return (
                  <g key={n.id} onClick={() => setHighlighted(highlighted === n.id ? null : n.id)}
                    style={{ cursor: "pointer" }} opacity={dim ? 0.3 : 1}>
                    <rect x={n.x - 6} y={n.y} width={12} height={n.height}
                      fill={n.color} rx={2}
                      stroke={highlighted === n.id ? "#f5e6d3" : "transparent"}
                      strokeWidth={highlighted === n.id ? 2 : 0} />
                    <text x={n.x + (n.col >= 3 ? -12 : 12)} y={n.y + n.height / 2}
                      fill="#e2e8f0" fontSize="11"
                      textAnchor={n.col >= 3 ? "end" : "start"}
                      dominantBaseline="middle">
                      {n.name.length > 22 ? n.name.slice(0, 20) + "…" : n.name}
                    </text>
                    <text x={n.x + (n.col >= 3 ? -12 : 12)} y={n.y + n.height / 2 + 12}
                      fill="#8a9a93" fontSize="9.5"
                      textAnchor={n.col >= 3 ? "end" : "start"}
                      dominantBaseline="middle">
                      {n.total_kg.toFixed(0)} kg
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      </Reveal>

      <Reveal delay={250}>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-muted">
          <span className="text-cream font-medium">Materials</span>
          {Object.entries(MATERIAL_COLOR).map(([m, c]) => (
            <span key={m} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm" style={{ background: c }} />
              {m}
            </span>
          ))}
        </div>
      </Reveal>
    </div>
  );
}

// ─── Layout math ────────────────────────────────────────────────────────

function computeLayout(g: FlowGraph | null) {
  if (!g || g.nodes.length === 0) return { nodes: [], links: [], height: 400, columnRoles: [] };

  // Group nodes by role-column
  const byCol: Record<number, typeof g.nodes> = {};
  for (const n of g.nodes) {
    const c = ROLE_COL[n.role] ?? 5;
    (byCol[c] = byCol[c] || []).push(n);
  }
  const colKeys = Object.keys(byCol).map(Number).sort((a, b) => a - b);

  // Total kg per node (sum of outgoing + incoming, max of the two for size)
  const totalKgIn: Record<number, number> = {};
  const totalKgOut: Record<number, number> = {};
  for (const l of g.links) {
    totalKgIn[l.to_id]   = (totalKgIn[l.to_id]   || 0) + l.total_kg;
    totalKgOut[l.from_id] = (totalKgOut[l.from_id] || 0) + l.total_kg;
  }
  const nodeKg = (id: number) => Math.max(totalKgIn[id] || 0, totalKgOut[id] || 0);

  const maxKg = Math.max(...g.nodes.map(n => nodeKg(n.id)), 1);
  const minH = 14;
  const maxH = 60;
  const colGap = 12;
  const topPadding = 50;

  // Place nodes within each column
  let maxColHeight = 0;
  const placedNodes: any[] = [];
  for (const c of colKeys) {
    const list = byCol[c].sort((a, b) => nodeKg(b.id) - nodeKg(a.id));
    let y = topPadding;
    for (const n of list) {
      const h = Math.max(minH, Math.min(maxH, (nodeKg(n.id) / maxKg) * maxH));
      placedNodes.push({
        id: n.id, name: n.name, role: n.role, col: c,
        x: COL_X[c] ?? 1040,
        y, height: h,
        total_kg: nodeKg(n.id),
        color: ROLE_COLOR[n.role] || "#8a9a93",
      });
      y += h + colGap;
    }
    if (y > maxColHeight) maxColHeight = y;
  }

  // Compute per-link y positions and material segmentation
  const linksOut: any[] = [];
  for (const l of g.links) {
    const fromNode = placedNodes.find(n => n.id === l.from_id);
    const toNode = placedNodes.find(n => n.id === l.to_id);
    if (!fromNode || !toNode) continue;

    // Where on the from-node does this link begin? Stack outgoing links.
    const fromOffset = stackOffset(placedNodes, l.from_id, "out", l, g);
    const toOffset = stackOffset(placedNodes, l.to_id, "in", l, g);
    const linkH = Math.max(2, (l.total_kg / maxKg) * maxH);

    // Split into material segments
    const segments: any[] = [];
    let segY1 = fromNode.y + fromOffset.before;
    let segY2 = toNode.y + toOffset.before;
    const totalM = Object.values(l.by_material).reduce((s, v) => s + v, 0) || 1;
    for (const [mat, kg] of Object.entries(l.by_material)) {
      const segH = Math.max(0.5, (kg / totalM) * linkH);
      segments.push({
        material: mat,
        x1: fromNode.x + 6, y1: segY1 + segH / 2,
        x2: toNode.x - 6,   y2: segY2 + segH / 2,
        height: segH,
      });
      segY1 += segH; segY2 += segH;
    }
    linksOut.push({ from_id: l.from_id, to_id: l.to_id, materialSegments: segments });
  }

  return {
    nodes: placedNodes,
    links: linksOut,
    height: Math.max(420, maxColHeight + 40),
    columnRoles: colKeys.map(c => ({ role: invertRoleCol(c), x: COL_X[c] ?? 1040 })),
  };
}

const ROLE_COLOR: Record<string, string> = {
  collector:    "#a78bfa",
  ragpicker:    "#3ddc97",
  kabadiwala:   "#f5cf6f",
  aggregator:   "#fb923c",
  recycler:     "#60a5fa",
  municipality: "#8a9a93",
};

function invertRoleCol(c: number): string {
  return Object.entries(ROLE_COL).find(([_, v]) => v === c)?.[0] || "";
}

function stackOffset(nodes: any[], nodeId: number, dir: "in" | "out", link: any, g: FlowGraph) {
  const node = nodes.find(n => n.id === nodeId);
  if (!node) return { before: 0 };
  const peers = g.links
    .filter(l => dir === "out" ? l.from_id === nodeId : l.to_id === nodeId)
    .sort((a, b) => (dir === "out" ? b.total_kg - a.total_kg : b.total_kg - a.total_kg));
  let cum = 0;
  const maxKgGlobal = Math.max(...g.nodes.map(n => Math.max(
    g.links.filter(l => l.to_id === n.id).reduce((s, l) => s + l.total_kg, 0),
    g.links.filter(l => l.from_id === n.id).reduce((s, l) => s + l.total_kg, 0),
  )), 1);
  for (const p of peers) {
    if (p === link) break;
    cum += Math.max(2, (p.total_kg / maxKgGlobal) * 60);
  }
  return { before: cum };
}

function curvePath(x1: number, y1: number, x2: number, y2: number): string {
  const cx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
}

function Stat({ label, value, accent = "cream" }: { label: string; value: any; accent?: "green" | "yellow" | "red" | "cream" }) {
  const color = accent === "red" ? "text-danger" : accent === "yellow" ? "text-accent2" : accent === "green" ? "text-accent" : "text-cream";
  return (
    <div className="bg-bg/40 border border-line/60 rounded-xl p-4">
      <div className="text-[10.5px] uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className={clsx("font-display text-3xl tracking-tight2 mt-1.5", color)}>{value}</div>
    </div>
  );
}
