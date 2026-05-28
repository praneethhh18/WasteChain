"""Risk Patterns endpoint — fraud detection on the chain.

GET /anomalies — runs the 5-pattern scanner and returns all findings.
GET /flows     — Sankey-friendly material flow weights (kabadiwala → aggregator → recycler).
"""

from collections import defaultdict
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models
from ..services.anomaly import scan_all

router = APIRouter(tags=["anomalies"])


@router.get("/anomalies")
def list_anomalies(db: Session = Depends(get_db)):
    return scan_all(db)


@router.get("/flows")
def material_flows(window_days: int = 30, db: Session = Depends(get_db)):
    """Aggregated material flow weights for the Sankey diagram.

    Returns nodes (every actor that touched material) and links
    (source → target with total kg + material breakdown).
    """
    cutoff = datetime.utcnow() - timedelta(days=window_days)
    handoffs = (db.query(models.Handoff)
                  .filter(models.Handoff.initiated_at >= cutoff)
                  .filter(models.Handoff.received_weight.isnot(None))
                  .all())

    # Build user index
    user_ids: set[int] = set()
    for h in handoffs:
        user_ids.add(h.sender_id); user_ids.add(h.receiver_id)
    users = {u.id: u for u in db.query(models.User).filter(
        models.User.id.in_(list(user_ids) or [0])
    ).all()}

    # Aggregate by (sender, receiver) pair
    flows: dict[tuple[int, int], dict] = {}
    batches = {b.id: b for b in db.query(models.Batch).filter(
        models.Batch.id.in_(list({h.batch_id for h in handoffs}) or [0])
    ).all()}

    for h in handoffs:
        b = batches.get(h.batch_id)
        if b is None: continue
        key = (h.sender_id, h.receiver_id)
        slot = flows.setdefault(key, {
            "from_id": h.sender_id, "to_id": h.receiver_id,
            "total_kg": 0.0, "handoff_count": 0,
            "by_material": defaultdict(float),
        })
        slot["total_kg"] += h.received_weight or 0.0
        slot["handoff_count"] += 1
        slot["by_material"][b.material_type] += h.received_weight or 0.0

    # Serialise nodes
    nodes = []
    for uid, u in users.items():
        nodes.append({
            "id": u.id, "name": u.name, "role": u.role,
            "area": u.area, "lat": u.lat, "lon": u.lon,
        })

    # Serialise links — sort largest first so Sankey renders nicely
    links = []
    for slot in flows.values():
        links.append({
            "from_id": slot["from_id"], "to_id": slot["to_id"],
            "total_kg": round(slot["total_kg"], 2),
            "handoff_count": slot["handoff_count"],
            "by_material": {k: round(v, 2) for k, v in slot["by_material"].items()},
        })
    links.sort(key=lambda l: l["total_kg"], reverse=True)

    return {
        "window_days": window_days,
        "scanned_at": datetime.utcnow().isoformat(),
        "node_count": len(nodes),
        "link_count": len(links),
        "total_kg": round(sum(l["total_kg"] for l in links), 2),
        "nodes": nodes,
        "links": links,
    }
