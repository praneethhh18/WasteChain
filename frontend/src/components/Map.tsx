import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker } from "react-leaflet";
import L from "leaflet";
import { useMemo } from "react";

// Custom dot markers — leaflet's default uses external images that bork in Vite.
function dotIcon(color: string) {
  return L.divIcon({
    className: "wc-dot",
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};box-shadow:0 0 0 3px ${color}33,0 0 12px ${color}66;"></div>`,
    iconSize: [14, 14], iconAnchor: [7, 7],
  });
}

const COLORS = {
  kabadiwala: "#3ddc97",
  aggregator: "#fcd34d",
  recycler: "#60a5fa",
  batch: "#3ddc97",
  tampered: "#f87171",
};

export type MapPoint = {
  lat: number; lon: number; label: string; sub?: string;
  kind: "kabadiwala" | "aggregator" | "recycler" | "batch" | "tampered";
};

export type MapLine = { from: [number, number]; to: [number, number]; color?: string };

export function MiniMap({
  points, lines, center, height = 280,
}: { points: MapPoint[]; lines?: MapLine[]; center?: [number, number]; height?: number }) {
  const center_ = useMemo<[number, number]>(() => {
    if (center) return center;
    if (!points.length) return [12.87, 74.85];
    const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
    const lon = points.reduce((s, p) => s + p.lon, 0) / points.length;
    return [lat, lon];
  }, [points, center]);

  return (
    <div className="rounded-xl overflow-hidden border border-line" style={{ height }}>
      <MapContainer center={center_} zoom={12} style={{ width: "100%", height: "100%" }} scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {lines?.map((l, i) => (
          <Polyline key={i} positions={[l.from, l.to]} pathOptions={{ color: l.color || "#3ddc97", weight: 2, opacity: 0.6, dashArray: "4 6" }} />
        ))}
        {points.map((p, i) => (
          <Marker key={i} position={[p.lat, p.lon]} icon={dotIcon(COLORS[p.kind])}>
            <Popup>
              <div className="text-sm">
                <div className="font-semibold">{p.label}</div>
                {p.sub && <div className="text-xs text-slate-500">{p.sub}</div>}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
