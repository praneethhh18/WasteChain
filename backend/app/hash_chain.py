"""Tamper-evident hash chain across the full 5-stage waste journey.

Every event that materially moves or transforms waste gets hashed with the
previous event's hash. The chain spans **five record kinds**:

  route    → a municipal truck or door-to-door collector starts/ends a route
  pickup   → a single house pickup within a route (with GPS, optional photo)
  recovery → a ragpicker recovers a sorted sack from an aggregation pile
  batch    → a kabadiwala buys/weighs the sack (QR sticker enters here)
  handoff  → material changes hands downstream (kabadiwala → aggregator → recycler)

Tampering with any field breaks the link to every subsequent record. Audit is
a single linear walk from genesis to tip.
"""

import hashlib
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from . import models

GENESIS_HASH = "0" * 64


def _sha256(*parts: str) -> str:
    payload = "|".join(parts).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


# ─── per-kind hash functions ──────────────────────────────────────────────

def compute_batch_hash(
    batch_code: str, creator_id: int, material_type: str, weight_kg: float,
    lat: float, lon: float, created_at: datetime, previous_hash: str,
) -> str:
    return _sha256(
        batch_code, str(creator_id), material_type,
        f"{weight_kg:.3f}", f"{lat:.6f}", f"{lon:.6f}",
        created_at.isoformat(timespec="seconds"), previous_hash,
    )


def compute_handoff_hash(
    batch_id: int, sender_id: int, receiver_id: int,
    sent_weight: float, received_weight: Optional[float],
    initiated_at: datetime, previous_hash: str,
    photo_hash: Optional[str] = None,
) -> str:
    return _sha256(
        str(batch_id), str(sender_id), str(receiver_id),
        f"{sent_weight:.3f}",
        f"{received_weight:.3f}" if received_weight is not None else "PENDING",
        initiated_at.isoformat(timespec="seconds"),
        photo_hash or "NO_PHOTO",
        previous_hash,
    )


def hash_photo(data_url: str) -> str:
    """Hash a base64 data URL (or any string payload). Folded into the
    handoff's record_hash so the image is bound to the chain entry —
    swapping the photo later breaks the link."""
    return hashlib.sha256(data_url.encode("utf-8")).hexdigest()


def compute_route_hash(
    route_code: str, collector_id: int, started_at: datetime,
    previous_hash: str,
) -> str:
    """Routes are hashed over their START-TIME identity only. End values
    (dump location, total weight, end time) are metadata that update after
    pickups have already chained on top of this hash — we don't re-hash to
    avoid orphaning the downstream chain. The integrity guarantee is
    'this collector opened this route at this time', which is enough."""
    return _sha256(
        route_code, str(collector_id),
        started_at.isoformat(timespec="seconds"),
        previous_hash,
    )


def compute_pickup_hash(
    route_id: int, lat: float, lon: float,
    captured_at: datetime, est_weight: Optional[float], previous_hash: str,
) -> str:
    return _sha256(
        str(route_id), f"{lat:.6f}", f"{lon:.6f}",
        captured_at.isoformat(timespec="seconds"),
        f"{est_weight:.2f}" if est_weight is not None else "0",
        previous_hash,
    )


def compute_recovery_hash(
    recovery_code: str, ragpicker_id: int, material_type: str,
    weight_kg: float, lat: float, lon: float, captured_at: datetime,
    previous_hash: str,
) -> str:
    return _sha256(
        recovery_code, str(ragpicker_id), material_type,
        f"{weight_kg:.3f}", f"{lat:.6f}", f"{lon:.6f}",
        captured_at.isoformat(timespec="seconds"), previous_hash,
    )


# ─── chain tip + walker ───────────────────────────────────────────────────

def latest_chain_hash(db: Session) -> str:
    """Returns the current tip of the global hash chain. Reads from the
    singleton ChainState row — authoritative regardless of backdated
    timestamps in seed or offline-sync records."""
    state = db.query(models.ChainState).filter(models.ChainState.id == 1).first()
    if state is None:
        # First record ever — bootstrap the singleton at genesis
        state = models.ChainState(id=1, tip_hash=GENESIS_HASH, seq=0)
        db.add(state); db.flush()
    return state.tip_hash


def advance_chain_tip(db: Session, new_tip: str) -> None:
    """Call AFTER inserting a new chain record with the hash we just stored."""
    state = db.query(models.ChainState).filter(models.ChainState.id == 1).first()
    if state is None:
        state = models.ChainState(id=1, tip_hash=new_tip, seq=1)
        db.add(state)
    else:
        state.tip_hash = new_tip
        state.seq = (state.seq or 0) + 1
    db.flush()


def verify_chain(db: Session) -> list[dict]:
    """Walks the entire chain by following `previous_hash` pointers from
    GENESIS_HASH forward. Recomputes each hash, flags divergence. Once one
    link is broken, all downstream links cascade-flag."""
    batches = db.query(models.Batch).order_by(models.Batch.id.asc()).all()
    handoffs = db.query(models.Handoff).order_by(models.Handoff.id.asc()).all()
    routes = db.query(models.CollectionRoute).order_by(models.CollectionRoute.id.asc()).all()
    pickups = db.query(models.PickupEvent).order_by(models.PickupEvent.id.asc()).all()
    recoveries = db.query(models.RagpickerRecovery).order_by(models.RagpickerRecovery.id.asc()).all()

    by_prev: dict[str, list[tuple[str, object]]] = {}
    for b in batches:     by_prev.setdefault(b.previous_hash, []).append(("batch", b))
    for h in handoffs:    by_prev.setdefault(h.previous_hash, []).append(("handoff", h))
    for r in routes:      by_prev.setdefault(r.previous_hash, []).append(("route", r))
    for p in pickups:     by_prev.setdefault(p.previous_hash, []).append(("pickup", p))
    for rc in recoveries: by_prev.setdefault(rc.previous_hash, []).append(("recovery", rc))

    KIND_ORDER = {"route": 0, "pickup": 1, "recovery": 2, "batch": 3, "handoff": 4}
    visited: set[tuple[str, int]] = set()
    ordered: list[tuple[str, object]] = []
    cursor = GENESIS_HASH
    while True:
        candidates = [c for c in by_prev.get(cursor, []) if (c[0], c[1].id) not in visited]
        if not candidates:
            break
        candidates.sort(key=lambda c: (KIND_ORDER.get(c[0], 99), c[1].id))
        kind, rec = candidates[0]
        ordered.append((kind, rec))
        visited.add((kind, rec.id))
        cursor = rec.record_hash

    # Surface any orphans (records whose previous_hash chains nowhere — they
    # will fail verification, which is correct).
    for source, kind_name in (
        (batches, "batch"), (handoffs, "handoff"), (routes, "route"),
        (pickups, "pickup"), (recoveries, "recovery"),
    ):
        for rec in source:
            if (kind_name, rec.id) not in visited:
                ordered.append((kind_name, rec))

    prev = GENESIS_HASH
    results: list[dict] = []
    chain_broken = False

    for kind, rec in ordered:
        if kind == "batch":
            expected = compute_batch_hash(
                rec.batch_code, rec.creator_id, rec.material_type,
                rec.weight_kg, rec.lat, rec.lon, rec.created_at, prev,
            )
            ok = expected == rec.record_hash and rec.previous_hash == prev and not chain_broken
            results.append({
                "kind": "batch", "id": rec.id, "code": rec.batch_code,
                "material": rec.material_type, "weight_kg": rec.weight_kg,
                "stored_hash": rec.record_hash, "expected_hash": expected,
                "previous_hash": rec.previous_hash, "expected_previous_hash": prev,
                "tampered": rec.tampered, "ok": ok,
                "created_at": rec.created_at.isoformat(),
            })
        elif kind == "handoff":
            expected = compute_handoff_hash(
                rec.batch_id, rec.sender_id, rec.receiver_id,
                rec.sent_weight, rec.received_weight, rec.initiated_at, prev,
                photo_hash=rec.photo_hash,
            )
            ok = expected == rec.record_hash and rec.previous_hash == prev and not chain_broken
            results.append({
                "kind": "handoff", "id": rec.id, "batch_id": rec.batch_id,
                "sent_weight": rec.sent_weight, "received_weight": rec.received_weight,
                "stored_hash": rec.record_hash, "expected_hash": expected,
                "previous_hash": rec.previous_hash, "expected_previous_hash": prev,
                "tampered": False, "ok": ok,
                "created_at": rec.initiated_at.isoformat(),
            })
        elif kind == "route":
            expected = compute_route_hash(
                rec.route_code, rec.collector_id, rec.started_at, prev,
            )
            ok = expected == rec.record_hash and rec.previous_hash == prev and not chain_broken
            results.append({
                "kind": "route", "id": rec.id, "code": rec.route_code,
                "weight_kg": rec.total_estimated_weight_kg,
                "stored_hash": rec.record_hash, "expected_hash": expected,
                "previous_hash": rec.previous_hash, "expected_previous_hash": prev,
                "tampered": False, "ok": ok,
                "created_at": rec.started_at.isoformat(),
            })
        elif kind == "pickup":
            expected = compute_pickup_hash(
                rec.route_id, rec.lat, rec.lon, rec.captured_at,
                rec.estimated_weight_kg, prev,
            )
            ok = expected == rec.record_hash and rec.previous_hash == prev and not chain_broken
            results.append({
                "kind": "pickup", "id": rec.id, "code": f"pickup·route#{rec.route_id}",
                "weight_kg": rec.estimated_weight_kg,
                "stored_hash": rec.record_hash, "expected_hash": expected,
                "previous_hash": rec.previous_hash, "expected_previous_hash": prev,
                "tampered": False, "ok": ok,
                "created_at": rec.captured_at.isoformat(),
            })
        else:  # recovery
            expected = compute_recovery_hash(
                rec.recovery_code, rec.ragpicker_id, rec.material_type,
                rec.weight_kg, rec.lat, rec.lon, rec.captured_at, prev,
            )
            ok = expected == rec.record_hash and rec.previous_hash == prev and not chain_broken
            results.append({
                "kind": "recovery", "id": rec.id, "code": rec.recovery_code,
                "material": rec.material_type, "weight_kg": rec.weight_kg,
                "stored_hash": rec.record_hash, "expected_hash": expected,
                "previous_hash": rec.previous_hash, "expected_previous_hash": prev,
                "tampered": False, "ok": ok,
                "created_at": rec.captured_at.isoformat(),
            })

        if not results[-1]["ok"]:
            chain_broken = True
        prev = rec.record_hash

    return results
