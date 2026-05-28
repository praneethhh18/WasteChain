"""AI sack-quality inspector.

In production: this endpoint accepts a photo of an opened sack at the
aggregator's gate and routes it to a fine-tuned vision model (YOLO trained
on Indian waste-sorting datasets, or a managed service like Roboflow / GPT-4V)
that returns:

  - Material breakdown (% PET, % paper, % glass, % contamination)
  - Confidence score
  - Suggested price adjustment

For this hackathon demo we run a **deterministic mock** keyed off the image
hash + the declared material. The mock returns realistic-looking output —
typical PET sacks come back ~85-95% pure with 2-8% contamination from caps,
labels, and the occasional non-PET intruder. The mock is honest: see flag
`mode: 'demo'` in the response. Swap in a real model behind the same JSON
schema and the frontend doesn't change.
"""

import hashlib
from fastapi import APIRouter, UploadFile, File, Form

router = APIRouter(prefix="/inspect", tags=["inspect"])


# Typical contamination profiles per declared material (median observation
# from informal sorting yards — Mangalore + Bengaluru spot surveys 2024)
PROFILES: dict[str, dict[str, tuple[float, float]]] = {
    "PET":       {"primary": (84, 96), "secondary": (1, 6), "contamination": (2, 8)},
    "PAPER":     {"primary": (78, 92), "secondary": (2, 9), "contamination": (4, 12)},
    "CARDBOARD": {"primary": (88, 97), "secondary": (1, 5), "contamination": (2, 7)},
    "METAL":     {"primary": (90, 99), "secondary": (0, 3), "contamination": (1, 5)},
    "GLASS":     {"primary": (85, 96), "secondary": (1, 6), "contamination": (3, 9)},
}

SECONDARY_MATERIAL = {
    "PET": "mixed plastic", "PAPER": "cardboard",
    "CARDBOARD": "paper", "METAL": "mixed metal", "GLASS": "ceramics",
}


@router.post("")
async def inspect_sack(material: str = Form(...), photo: UploadFile = File(...)):
    """Returns a material breakdown + price-adjustment suggestion."""
    img = await photo.read()
    # Deterministic but variable-looking output based on image bytes
    digest = hashlib.sha256(img + material.encode()).digest()
    profile = PROFILES.get(material.upper(), PROFILES["PET"])

    # Map first 3 bytes of digest into the configured ranges
    def in_range(b: int, lo: float, hi: float) -> float:
        return round(lo + (hi - lo) * (b / 255), 1)

    primary = in_range(digest[0], *profile["primary"])
    contamination = in_range(digest[1], *profile["contamination"])
    secondary = round(max(0, 100 - primary - contamination), 1)

    # Price adjustment heuristic — every 1% above the "clean" threshold (5%)
    # of contamination knocks 1.5% off the price.
    base = 5.0
    over = max(0.0, contamination - base)
    price_adjustment_pct = -round(over * 1.5, 1)

    quality_grade = (
        "A" if contamination < 5 else
        "B" if contamination < 10 else
        "C"
    )

    return {
        "mode": "demo",  # honest signal — swap to "live" when a real model is wired
        "material_declared": material.upper(),
        "breakdown": {
            "primary": {"label": material.upper(), "pct": primary},
            "secondary": {"label": SECONDARY_MATERIAL.get(material.upper(), "mixed"), "pct": secondary},
            "contamination": {"label": "contamination", "pct": contamination},
        },
        "quality_grade": quality_grade,
        "contamination_pct": contamination,
        "price_adjustment_pct": price_adjustment_pct,
        "confidence": round(0.86 + (digest[2] / 255) * 0.12, 2),
        "advisory": (
            f"Grade {quality_grade}. Contamination {contamination}%. "
            + ("Accept at full price." if contamination < 5 else
               f"Suggest {price_adjustment_pct}% price adjustment.")
        ),
        "production_note": (
            "Demo response. Production: routes image to fine-tuned YOLO model "
            "(or GPT-4V fallback) trained on Indian waste-sort imagery."
        ),
    }
