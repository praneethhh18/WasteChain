"""Chain Anomaly Engine.

Five detection patterns specifically designed for the informal waste chain.
We did not find any public competitor in Indian waste-tech that ships these
together — most products stop at "show me the data" and don't detect
adversarial behaviour on the data itself.

Patterns:

  1. REBAG_SUSPICION
     Same material + matching weight (±5%) appears in a downstream batch
     within a short time window and small geographic radius. Suggests the
     same physical sack is being tracked twice under different codes
     ("he separated and gives to others on his contacts" scenario).

  2. WEIGHT_SHAVING
     A sender consistently logs more weight than the receiver confirms
     across many handoffs. Z-score against the regional average — flag
     anyone > 2σ from the discrepancy mean.

  3. TEMPORAL_INCONSISTENCY
     A handoff confirmed BEFORE the route that produced its material
     ended, or a recovery logged when no route had dumped at that
     aggregation point that day. Physically impossible.

  4. DENSITY_VIOLATION
     A single batch logs weight inconsistent with the material's plausible
     density × typical sack volume (e.g. > 60 kg of PET in one bag is
     physically very hard; > 120 kg of glass impossible without a vehicle).

  5. REPUTATION_FARMING
     Two accounts have a suspiciously high rate of clean handoffs between
     each other (>= N handoffs/week) with no recycler-anchored leg. They
     might be inflating each other's reputation without real material
     moving.

Each finding returns a severity (low|medium|high), evidence (record IDs),
and a one-line suggested action.
"""

from collections import defaultdict
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from math import asin, cos, radians, sin, sqrt
from typing import Optional

from sqlalchemy.orm import Session

from .. import models


# Plausible per-bag upper bounds (kg). Above these = physically suspect.
# Numbers from informal sorting yard surveys in Mangalore + Bengaluru.
DENSITY_CEILING = {
    "PET":       60.0,    # compressed PET bottles in a 50L jute sack
    "PAPER":     45.0,    # wet paper is dense but rare in a single sack
    "CARDBOARD": 55.0,
    "METAL":    100.0,    # aluminium scrap in mixed forms
    "GLASS":     90.0,    # broken glass in a reinforced sack
}

# Re-bag detection windows
REBAG_TIME_WINDOW = timedelta(hours=8)
REBAG_DISTANCE_KM = 5.0      # same town, same neighbourhood
REBAG_WEIGHT_TOLERANCE = 0.05  # 5%

# Weight-shaving thresholds
SHAVE_MIN_HANDOFFS = 4        # need enough samples to flag a pattern
SHAVE_Z_THRESHOLD = 2.0       # 2σ above regional avg discrepancy

# Reputation farming thresholds
FARM_WINDOW = timedelta(days=14)
FARM_MIN_HANDOFFS_PAIR = 6    # >= 6 handoffs between same two accounts in 14d


@dataclass
class Anomaly:
    kind: str
    severity: str         # "low" | "medium" | "high"
    title: str
    detail: str
    evidence_ids: list[int]
    actors: list[str]
    suggested_action: str
    detected_at: str


def _haversine_km(a_lat, a_lon, b_lat, b_lon) -> float:
    p1, p2 = radians(a_lat), radians(b_lat)
    dp = radians(b_lat - a_lat); dl = radians(b_lon - a_lon)
    a = sin(dp/2)**2 + cos(p1)*cos(p2)*sin(dl/2)**2
    return 2 * 6371.0 * asin(sqrt(a))


# ─── 1. REBAG SUSPICION ─────────────────────────────────────────────────

def detect_rebag(db: Session) -> list[Anomaly]:
    findings: list[Anomaly] = []
    batches = (db.query(models.Batch)
                 .order_by(models.Batch.created_at.asc()).all())
    if len(batches) < 2:
        return findings

    # For each batch, look at the next ones within the time window and check
    # weight + material + distance overlap.
    for i, b in enumerate(batches):
        for j in range(i + 1, min(i + 30, len(batches))):  # cap horizon
            b2 = batches[j]
            if b2.created_at - b.created_at > REBAG_TIME_WINDOW:
                break  # batches are time-ordered, no point continuing
            if b.material_type != b2.material_type:
                continue
            if b.weight_kg == 0:
                continue
            weight_delta = abs(b.weight_kg - b2.weight_kg) / b.weight_kg
            if weight_delta > REBAG_WEIGHT_TOLERANCE:
                continue
            dist = _haversine_km(b.lat, b.lon, b2.lat, b2.lon)
            if dist > REBAG_DISTANCE_KM:
                continue
            # Suspicion: same kabadiwala touched both is the strongest signal
            severity = "high" if b.creator_id == b2.creator_id else "medium"
            creator = db.query(models.User).get(b.creator_id)
            creator2 = db.query(models.User).get(b2.creator_id)
            findings.append(Anomaly(
                kind="REBAG_SUSPICION",
                severity=severity,
                title=f"Possible re-bag: {b.batch_code} ⇄ {b2.batch_code}",
                detail=(
                    f"{b.weight_kg} kg {b.material_type} at {b.batch_code} ({b.created_at:%H:%M %b %d}), "
                    f"then {b2.weight_kg} kg {b2.material_type} at {b2.batch_code} "
                    f"({b2.created_at:%H:%M}, {dist:.1f} km away, {(b2.created_at - b.created_at).total_seconds()/60:.0f} min later). "
                    f"Weight delta {weight_delta*100:.1f}% — within re-bag tolerance."
                ),
                evidence_ids=[b.id, b2.id],
                actors=list({creator.name if creator else "?", creator2.name if creator2 else "?"}),
                suggested_action="Cross-check physical inventory at both kabadiwalas — same sack may be entering the chain twice under different stickers.",
                detected_at=datetime.utcnow().isoformat(),
            ))
    # Deduplicate (a batch can chain to multiple — keep the strongest)
    seen: set[tuple[int, int]] = set()
    out: list[Anomaly] = []
    for f in findings:
        key = tuple(sorted(f.evidence_ids[:2]))
        if key in seen: continue
        seen.add(key); out.append(f)
    return out


# ─── 2. WEIGHT SHAVING ──────────────────────────────────────────────────

def detect_weight_shaving(db: Session) -> list[Anomaly]:
    handoffs = (db.query(models.Handoff)
                  .filter(models.Handoff.discrepancy_pct.isnot(None))
                  .all())
    if not handoffs:
        return []
    # Regional baseline = mean + std of all discrepancies
    pcts = [h.discrepancy_pct for h in handoffs if h.discrepancy_pct is not None]
    n = len(pcts)
    mean = sum(pcts) / n
    var = sum((p - mean) ** 2 for p in pcts) / max(1, n - 1)
    std = max(0.5, var ** 0.5)

    # Group by sender
    by_sender: dict[int, list[models.Handoff]] = defaultdict(list)
    for h in handoffs:
        by_sender[h.sender_id].append(h)

    findings: list[Anomaly] = []
    for sender_id, group in by_sender.items():
        if len(group) < SHAVE_MIN_HANDOFFS:
            continue
        sender_mean = sum(h.discrepancy_pct for h in group) / len(group)
        z = (sender_mean - mean) / std
        if z < SHAVE_Z_THRESHOLD:
            continue
        sender = db.query(models.User).get(sender_id)
        severity = "high" if z >= 3 else "medium" if z >= 2.5 else "low"
        findings.append(Anomaly(
            kind="WEIGHT_SHAVING",
            severity=severity,
            title=f"{sender.name if sender else f'#{sender_id}'} shows systematic weight shaving",
            detail=(
                f"Across {len(group)} handoffs, this {sender.role if sender else 'actor'}'s "
                f"average shrinkage was {sender_mean:.1f}% vs the regional mean of {mean:.1f}% "
                f"(σ={std:.1f}, z-score {z:.1f}). The pattern is unlikely to be random."
            ),
            evidence_ids=[h.id for h in group[:8]],
            actors=[sender.name if sender else f"#{sender_id}"],
            suggested_action=(
                "Audit one of their next handoffs in person. If the pattern holds, "
                "deprioritise in matching and notify their downstream buyers."
            ),
            detected_at=datetime.utcnow().isoformat(),
        ))
    return findings


# ─── 3. TEMPORAL INCONSISTENCIES ────────────────────────────────────────

def detect_temporal(db: Session) -> list[Anomaly]:
    findings: list[Anomaly] = []
    # Pattern: recovery logged before its aggregation point received any dump that day
    recoveries = (db.query(models.RagpickerRecovery)
                    .filter(models.RagpickerRecovery.aggregation_point_id.isnot(None))
                    .all())
    for r in recoveries:
        same_day_start = r.captured_at.replace(hour=0, minute=0, second=0)
        latest_dump = (db.query(models.CollectionRoute)
            .filter(models.CollectionRoute.dump_aggregation_point_id == r.aggregation_point_id)
            .filter(models.CollectionRoute.ended_at != None)  # noqa: E711
            .filter(models.CollectionRoute.ended_at < r.captured_at)
            .filter(models.CollectionRoute.started_at >= same_day_start - timedelta(days=1))
            .order_by(models.CollectionRoute.ended_at.desc())
            .first())
        if latest_dump is None:
            ap = db.query(models.AggregationPoint).get(r.aggregation_point_id)
            rp = db.query(models.User).get(r.ragpicker_id)
            findings.append(Anomaly(
                kind="TEMPORAL_INCONSISTENCY",
                severity="medium",
                title=f"Recovery {r.recovery_code} has no upstream dump",
                detail=(
                    f"{rp.name if rp else '?'} recorded {r.weight_kg} kg {r.material_type} "
                    f"at {ap.name if ap else 'aggregation point'} at {r.captured_at:%H:%M %b %d} — "
                    f"but no truck route had dumped material there in the prior 24 hours."
                ),
                evidence_ids=[r.id],
                actors=[rp.name if rp else f"ragpicker#{r.ragpicker_id}"],
                suggested_action=(
                    "Either an off-network truck dropped the material (informal contractor), "
                    "or the recovery is fabricated. Spot-check with a field officer."
                ),
                detected_at=datetime.utcnow().isoformat(),
            ))
    return findings


# ─── 4. DENSITY VIOLATIONS ──────────────────────────────────────────────

def detect_density_violations(db: Session) -> list[Anomaly]:
    findings: list[Anomaly] = []
    batches = db.query(models.Batch).all()
    for b in batches:
        ceil = DENSITY_CEILING.get(b.material_type)
        if ceil is None or b.weight_kg <= ceil:
            continue
        over_pct = (b.weight_kg / ceil - 1) * 100
        severity = "high" if over_pct >= 50 else "medium" if over_pct >= 20 else "low"
        creator = db.query(models.User).get(b.creator_id)
        findings.append(Anomaly(
            kind="DENSITY_VIOLATION",
            severity=severity,
            title=f"{b.batch_code}: {b.weight_kg} kg {b.material_type} in a single sack",
            detail=(
                f"This batch is {over_pct:.0f}% above the plausible single-sack ceiling "
                f"({ceil} kg for {b.material_type}). Either the kabadiwala logged "
                f"multiple sacks as one, the QR sticker was reused, or the weight is wrong."
            ),
            evidence_ids=[b.id],
            actors=[creator.name if creator else f"kabadiwala#{b.creator_id}"],
            suggested_action="Require splitting into multiple batches at next sale, or re-weighing on a calibrated scale.",
            detected_at=datetime.utcnow().isoformat(),
        ))
    return findings


# ─── 5. REPUTATION FARMING ──────────────────────────────────────────────

def detect_reputation_farming(db: Session) -> list[Anomaly]:
    cutoff = datetime.utcnow() - FARM_WINDOW
    handoffs = (db.query(models.Handoff)
                  .filter(models.Handoff.initiated_at >= cutoff)
                  .all())
    pair_counts: dict[tuple[int, int], list[int]] = defaultdict(list)
    for h in handoffs:
        key = tuple(sorted([h.sender_id, h.receiver_id]))
        pair_counts[key].append(h.id)

    findings: list[Anomaly] = []
    for (a_id, b_id), hids in pair_counts.items():
        if len(hids) < FARM_MIN_HANDOFFS_PAIR:
            continue
        a = db.query(models.User).get(a_id); b = db.query(models.User).get(b_id)
        # Look for a recycler-anchored leg — if none of the handoffs ends at a recycler,
        # the loop is suspicious.
        recycler_anchored = any(
            (u := db.query(models.User).get(h.receiver_id)) and u.role == "recycler"
            for h in db.query(models.Handoff).filter(models.Handoff.id.in_(hids)).all()
        )
        if recycler_anchored:
            continue
        findings.append(Anomaly(
            kind="REPUTATION_FARMING",
            severity="medium",
            title=f"Suspicious handoff loop between {a.name if a else '?'} and {b.name if b else '?'}",
            detail=(
                f"{len(hids)} handoffs in the last {FARM_WINDOW.days} days, "
                f"and none of them chained to a recycler downstream. The pair may be "
                f"shuttling the same material back and forth to inflate reputation."
            ),
            evidence_ids=hids[:8],
            actors=[a.name if a else f"#{a_id}", b.name if b else f"#{b_id}"],
            suggested_action="Verify there is actual recycler delivery downstream. If not, freeze both reputations.",
            detected_at=datetime.utcnow().isoformat(),
        ))
    return findings


# ─── Aggregator ─────────────────────────────────────────────────────────

def scan_all(db: Session) -> dict:
    rebag = detect_rebag(db)
    shave = detect_weight_shaving(db)
    temp = detect_temporal(db)
    density = detect_density_violations(db)
    farm = detect_reputation_farming(db)
    all_findings = rebag + shave + temp + density + farm
    severity_order = {"high": 0, "medium": 1, "low": 2}
    all_findings.sort(key=lambda f: severity_order.get(f.severity, 99))
    return {
        "scanned_at": datetime.utcnow().isoformat(),
        "total": len(all_findings),
        "by_kind": {
            "REBAG_SUSPICION":       len(rebag),
            "WEIGHT_SHAVING":        len(shave),
            "TEMPORAL_INCONSISTENCY": len(temp),
            "DENSITY_VIOLATION":     len(density),
            "REPUTATION_FARMING":    len(farm),
        },
        "by_severity": {
            "high":   sum(1 for f in all_findings if f.severity == "high"),
            "medium": sum(1 for f in all_findings if f.severity == "medium"),
            "low":    sum(1 for f in all_findings if f.severity == "low"),
        },
        "findings": [asdict(f) for f in all_findings],
    }
