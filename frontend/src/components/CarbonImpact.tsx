/* Climate impact + EPR credit display.
 *
 * Visualises the carbon saved + EPR credit value of a recovery event. This is
 * the answer to "why does the data layer matter for the climate" — every kg
 * tracked is a kg of CO2 not emitted, and a fraction of a tradeable EPR
 * certificate.
 */

import { Reveal } from "./ui";
import clsx from "clsx";

// keep in sync with backend/app/services/carbon.py
const MATERIAL_CO2: Record<string, number> = {
  PET: 1.50, PAPER: 3.30, CARDBOARD: 3.50, METAL: 9.10, GLASS: 0.55,
};
const MATERIAL_EPR: Record<string, number> = {
  PET: 12.0, PAPER: 4.0, CARDBOARD: 4.5, METAL: 40.0, GLASS: 2.0,
};

export function localImpactFor(material: string, weightKg: number) {
  const co2 = (MATERIAL_CO2[material.toUpperCase()] || 0) * weightKg;
  const epr = (MATERIAL_EPR[material.toUpperCase()] || 0) * weightKg;
  return { co2e_saved_kg: co2, epr_credit_inr: epr };
}

/** Compact inline pill — used on batch cards / notification bubbles. */
export function CarbonPill({ material, weightKg, size = "sm" }: {
  material: string; weightKg: number; size?: "sm" | "md";
}) {
  const { co2e_saved_kg, epr_credit_inr } = localImpactFor(material, weightKg);
  if (co2e_saved_kg === 0) return null;
  return (
    <div className={clsx(
      "inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 text-accent font-medium",
      size === "md" ? "px-3 py-1 text-[11px]" : "px-2.5 py-0.5 text-[10px]"
    )}>
      <span>🌿</span>
      <span>−{co2e_saved_kg.toFixed(1)} kg CO₂</span>
      <span className="text-accent2/80">·</span>
      <span className="text-accent2">₹{epr_credit_inr.toFixed(0)} EPR</span>
    </div>
  );
}

/** Large hero card — for the kabadiwala notification feed & workflow demo. */
export function CarbonCard({ material, weightKg }: { material: string; weightKg: number }) {
  const { co2e_saved_kg, epr_credit_inr } = localImpactFor(material, weightKg);
  const treeYears = co2e_saved_kg / 21;
  const carKm = co2e_saved_kg / 0.171;
  return (
    <div className="bg-gradient-to-br from-accent/10 via-accent/5 to-transparent border border-accent/30 rounded-2xl p-5">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="text-[10px] uppercase tracking-[0.18em] text-accent flex items-center gap-2">
          <span>🌿</span> Climate impact of this sack
        </div>
        <div className="text-[10px] text-muted">based on PWM Rules 2022 EPR</div>
      </div>
      <div className="grid grid-cols-2 gap-4 mt-3">
        <div>
          <div className="font-display text-3xl tracking-tight2 text-accent">
            −{co2e_saved_kg.toFixed(1)} <span className="text-base text-muted">kg CO₂</span>
          </div>
          <div className="text-[11px] text-muted mt-1">
            ≈ {treeYears.toFixed(1)} tree-years or {carKm.toFixed(0)} km of car emissions
          </div>
        </div>
        <div>
          <div className="font-display text-3xl tracking-tight2 text-accent2">
            ₹{epr_credit_inr.toFixed(0)}
          </div>
          <div className="text-[11px] text-muted mt-1">
            EPR credit value · tradeable to brand owners
          </div>
        </div>
      </div>
    </div>
  );
}

/** City-scale summary — for the Municipality dashboard. */
export function CarbonCity({ carbon }: {
  carbon: {
    total_weight_kg: number;
    total_co2e_saved_kg: number;
    total_epr_credit_inr: number;
    equivalents?: { tree_years: number; petrol_km_avoided: number };
    by_material?: Record<string, { weight_kg: number; co2e_saved_kg: number; epr_credit_inr: number }>;
  };
}) {
  const eq = carbon.equivalents || { tree_years: 0, petrol_km_avoided: 0 };
  const total = carbon.total_co2e_saved_kg || 0;
  const materials = Object.entries(carbon.by_material || {});
  return (
    <div className="bg-gradient-to-br from-accent/10 via-bg/0 to-accent2/5 border border-accent/30 rounded-2xl p-6">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-accent">Climate impact · last 30 days</div>
          <div className="font-display text-2xl tracking-tight2 mt-1">
            What this city's data layer saved.
          </div>
        </div>
        <div className="text-[10px] text-muted">EPR pricing per CPCB · PWM Rules 2022</div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
        <Hero label="CO₂ avoided" value={`${total.toFixed(0)} kg`} accent="green" />
        <Hero label="EPR credit value" value={`₹${(carbon.total_epr_credit_inr || 0).toLocaleString()}`} accent="yellow" />
        <Hero label="Tree-years equivalent" value={eq.tree_years.toFixed(0)} sub="🌳" />
        <Hero label="Car km of CO₂ avoided" value={eq.petrol_km_avoided.toLocaleString()} sub="🚗" />
      </div>

      {materials.length > 0 && (
        <div className="mt-6 pt-4 border-t border-line/40">
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted mb-3">CO₂ saved by material</div>
          <div className="space-y-2">
            {materials
              .sort((a, b) => b[1].co2e_saved_kg - a[1].co2e_saved_kg)
              .map(([mat, v]) => {
                const pct = total > 0 ? (v.co2e_saved_kg / total) * 100 : 0;
                return (
                  <div key={mat}>
                    <div className="flex items-baseline justify-between text-xs mb-1">
                      <span className="text-cream font-medium">{mat}</span>
                      <span className="text-muted">
                        {v.co2e_saved_kg.toFixed(0)} kg CO₂ · ₹{v.epr_credit_inr.toFixed(0)} EPR
                      </span>
                    </div>
                    <div className="h-1.5 bg-bg/60 rounded-full overflow-hidden">
                      <div className="h-full bg-accent rounded-full transition-all"
                        style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

function Hero({ label, value, sub, accent = "cream" }: { label: string; value: string; sub?: string; accent?: "green" | "yellow" | "cream" }) {
  const color = accent === "yellow" ? "text-accent2" : accent === "green" ? "text-accent" : "text-cream";
  return (
    <div>
      <div className={clsx("font-display text-3xl tracking-tight2", color)}>{value}</div>
      <div className="text-[10.5px] uppercase tracking-[0.12em] text-muted mt-1.5">
        {label} {sub && <span className="ml-0.5">{sub}</span>}
      </div>
    </div>
  );
}
