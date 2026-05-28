"""EPR / Carbon impact service.

Converts a kg-of-material event into:
  - CO2-equivalent saved vs landfill (kg CO2e)
  - EPR credit value (INR) using current MoEFCC PWM Rules 2022 framework prices

Why this matters
----------------
India's Plastic Waste Management Rules 2022 amendment introduced **Extended
Producer Responsibility (EPR) certificates** — tradeable proof that a tonne of
recyclable plastic was actually recovered and processed. Brand owners (Coke,
Unilever, etc.) MUST buy these certificates to meet their recovery targets.
Per-kg market rates have been ₹8–15/kg for PET, with similar mechanisms for
paper, metal, and glass under separate rules.

WasteChain's chain of custody is exactly what an EPR auditor needs to certify
recovery. So every batch we track ISN'T just data — it's potentially a
saleable credit. This is the link between "track waste" and "earn money from
the climate transition" that makes the whole system economically viable.

The constants below are conservative published figures (CPCB 2023, MoEFCC EPR
price observations 2024). Production deployment would pull live prices from
the CPCB EPR registry API.
"""

from dataclasses import dataclass
from typing import Iterable


# Per-kg recovered: CO2 saved vs landfilling/incineration, and EPR credit price
# Sources: CPCB lifecycle assessments + 2024 EPR market observations.
MATERIAL_IMPACT: dict[str, dict[str, float]] = {
    "PET":        {"co2e_kg_per_kg": 1.50, "epr_inr_per_kg": 12.0},
    "PAPER":      {"co2e_kg_per_kg": 3.30, "epr_inr_per_kg":  4.0},
    "CARDBOARD":  {"co2e_kg_per_kg": 3.50, "epr_inr_per_kg":  4.5},
    "METAL":      {"co2e_kg_per_kg": 9.10, "epr_inr_per_kg": 40.0},
    "GLASS":      {"co2e_kg_per_kg": 0.55, "epr_inr_per_kg":  2.0},
}

# Equivalences that make the numbers feel real to a non-technical audience.
KG_CO2_PER_TREE_YEAR = 21.0  # mature tree absorbs ~21kg CO2/year
KG_CO2_PER_KM_PETROL_CAR = 0.171  # average Indian compact petrol car


@dataclass
class CarbonImpact:
    material: str
    weight_kg: float
    co2e_saved_kg: float
    epr_credit_inr: float
    equivalents: dict

    def to_dict(self) -> dict:
        return {
            "material": self.material,
            "weight_kg": round(self.weight_kg, 2),
            "co2e_saved_kg": round(self.co2e_saved_kg, 2),
            "epr_credit_inr": round(self.epr_credit_inr, 2),
            "equivalents": self.equivalents,
        }


def impact_for(material: str, weight_kg: float) -> CarbonImpact:
    """Compute the climate + money value of recovering this much material."""
    factors = MATERIAL_IMPACT.get(material.upper())
    if factors is None:
        return CarbonImpact(
            material=material, weight_kg=weight_kg,
            co2e_saved_kg=0.0, epr_credit_inr=0.0,
            equivalents={},
        )
    co2 = factors["co2e_kg_per_kg"] * weight_kg
    inr = factors["epr_inr_per_kg"] * weight_kg
    return CarbonImpact(
        material=material, weight_kg=weight_kg,
        co2e_saved_kg=co2, epr_credit_inr=inr,
        equivalents={
            "tree_years": round(co2 / KG_CO2_PER_TREE_YEAR, 2),
            "petrol_km_avoided": round(co2 / KG_CO2_PER_KM_PETROL_CAR, 0),
        },
    )


def aggregate_impact(events: Iterable[tuple[str, float]]) -> dict:
    """Aggregate a stream of (material, kg) into total CO2e + EPR + by-material breakdown."""
    by_material: dict[str, dict] = {}
    total_kg = 0.0
    total_co2 = 0.0
    total_inr = 0.0
    for material, weight in events:
        if weight is None or weight <= 0:
            continue
        imp = impact_for(material, weight)
        total_kg += weight
        total_co2 += imp.co2e_saved_kg
        total_inr += imp.epr_credit_inr
        slot = by_material.setdefault(material.upper(), {"weight_kg": 0.0, "co2e_saved_kg": 0.0, "epr_credit_inr": 0.0})
        slot["weight_kg"] += weight
        slot["co2e_saved_kg"] += imp.co2e_saved_kg
        slot["epr_credit_inr"] += imp.epr_credit_inr

    for slot in by_material.values():
        for k in slot:
            slot[k] = round(slot[k], 2)

    return {
        "total_weight_kg": round(total_kg, 2),
        "total_co2e_saved_kg": round(total_co2, 2),
        "total_epr_credit_inr": round(total_inr, 2),
        "equivalents": {
            "tree_years": round(total_co2 / KG_CO2_PER_TREE_YEAR, 1),
            "petrol_km_avoided": round(total_co2 / KG_CO2_PER_KM_PETROL_CAR, 0),
        },
        "by_material": by_material,
    }
