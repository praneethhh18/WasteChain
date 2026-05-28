"""Upstream tracking — stages 1-3 of the brief's chain.

Covers:
  /collections/route/start         — collector starts a GPS-tracked route
  /collections/route/pickup        — log a single house pickup with GPS
  /collections/route/end           — close the route at a dump aggregation point
  /collections/route/{id}/ping     — push a GPS ping during an active route
  /collections/route/{id}/path     — full GPS trail for the route
  /collections/routes              — list routes
  /collections/route/{id}          — full route detail incl. pickups
  /aggregation-points              — list known aggregation points
  /recoveries                      — ragpicker sorted-sack recoveries
  /recoveries/sell                 — ragpicker sells to kabadiwala, creates a batch
  /provenance/batch/{id}           — full upstream chain for a batch
  /live                            — aggregate live network state for the map
  /search?q=...                    — find by route code / batch code / plate / area / name
"""

from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models, schemas
from ..hash_chain import (
    compute_route_hash, compute_pickup_hash, compute_recovery_hash,
    latest_chain_hash, advance_chain_tip,
)
from ..services.batches import create_batch_record
from ..services.matching import rank_matches

router = APIRouter(tags=["upstream"])


# ─────────────── COLLECTION ROUTES ────────────────────────────────────────

def _next_route_code(db: Session) -> str:
    year = datetime.utcnow().year
    n = db.query(models.CollectionRoute).count() + 1
    return f"CR-{year}-{n:04d}"


def _next_recovery_code(db: Session) -> str:
    year = datetime.utcnow().year
    n = db.query(models.RagpickerRecovery).count() + 1
    return f"RR-{year}-{n:04d}"


@router.post("/collections/route/start", response_model=schemas.RouteOut)
def start_route(payload: schemas.RouteStart, db: Session = Depends(get_db)):
    collector = db.query(models.User).filter(models.User.phone == payload.collector_phone).first()
    if not collector or collector.role != "collector":
        raise HTTPException(404, "Collector not found")
    now = datetime.utcnow()
    code = _next_route_code(db)
    prev = latest_chain_hash(db)
    rh = compute_route_hash(code, collector.id, now, prev)
    r = models.CollectionRoute(
        route_code=code, collector_id=collector.id,
        started_at=now, start_lat=payload.lat, start_lon=payload.lon,
        ward=payload.ward, status="IN_PROGRESS",
        previous_hash=prev, record_hash=rh,
    )
    db.add(r); db.flush(); advance_chain_tip(db, rh)
    db.commit(); db.refresh(r)
    return r


@router.post("/collections/route/pickup", response_model=schemas.PickupOut)
def log_pickup(payload: schemas.PickupCreate, db: Session = Depends(get_db)):
    route = db.query(models.CollectionRoute).get(payload.route_id)
    if not route or route.status != "IN_PROGRESS":
        raise HTTPException(400, "Route not active")
    now = datetime.utcnow()
    prev = latest_chain_hash(db)
    ph = compute_pickup_hash(
        route.id, payload.lat, payload.lon, now,
        payload.estimated_weight_kg, prev,
    )
    p = models.PickupEvent(
        route_id=route.id, lat=payload.lat, lon=payload.lon,
        captured_at=now,
        estimated_weight_kg=payload.estimated_weight_kg,
        house_tag=payload.house_tag,
        photo_url=payload.photo_url,
        previous_hash=prev, record_hash=ph,
    )
    db.add(p)
    route.pickup_count = (route.pickup_count or 0) + 1
    db.flush(); advance_chain_tip(db, ph)
    db.commit(); db.refresh(p)
    return p


@router.post("/collections/route/end", response_model=schemas.RouteOut)
def end_route(payload: schemas.RouteEnd, db: Session = Depends(get_db)):
    route = db.query(models.CollectionRoute).get(payload.route_id)
    if not route:
        raise HTTPException(404, "Route not found")
    if route.status == "COMPLETED":
        raise HTTPException(400, "Route already completed")
    route.ended_at = datetime.utcnow()
    route.end_lat = payload.lat
    route.end_lon = payload.lon
    route.total_estimated_weight_kg = payload.total_estimated_weight_kg
    route.dump_aggregation_point_id = payload.dump_aggregation_point_id
    route.status = "COMPLETED"
    # We do NOT re-hash the route — its hash covers only its start-time
    # identity. End-of-route values are stored as mutable metadata. Pickups
    # that already chained on top of this route's hash remain valid.
    db.commit(); db.refresh(route)
    return route


@router.get("/collections/routes", response_model=list[schemas.RouteOut])
def list_routes(
    collector_phone: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(models.CollectionRoute).order_by(models.CollectionRoute.started_at.desc())
    if collector_phone:
        u = db.query(models.User).filter(models.User.phone == collector_phone).first()
        if u:
            q = q.filter(models.CollectionRoute.collector_id == u.id)
    if status:
        q = q.filter(models.CollectionRoute.status == status)
    return q.limit(200).all()


@router.post("/collections/route/{route_id}/ping")
def gps_ping(route_id: int, payload: schemas.GpsPingIn, db: Session = Depends(get_db)):
    """Continuous GPS stream. Phone POSTs one of these every ~30s while a
    route is IN_PROGRESS. We're permissive about pings on closed routes
    (the truck may keep moving briefly after End-Route) but only render the
    trail between started_at and ended_at on the live map."""
    route = db.query(models.CollectionRoute).get(route_id)
    if not route:
        raise HTTPException(404, "Route not found")
    p = models.GpsPing(
        route_id=route.id, lat=payload.lat, lon=payload.lon,
        accuracy_m=payload.accuracy_m, speed_kmh=payload.speed_kmh,
        recorded_at=datetime.utcnow(),
    )
    db.add(p); db.commit()
    return {"ok": True, "id": p.id}


@router.get("/collections/route/{route_id}/path")
def route_path(route_id: int, db: Session = Depends(get_db)):
    """Return the full GPS path of a route — start, all pings in order,
    end. Used by the live map to draw a polyline for the truck."""
    route = db.query(models.CollectionRoute).get(route_id)
    if not route:
        raise HTTPException(404, "Route not found")
    pings = db.query(models.GpsPing).filter(
        models.GpsPing.route_id == route.id
    ).order_by(models.GpsPing.recorded_at.asc()).all()
    coords = []
    if route.start_lat is not None:
        coords.append({"lat": route.start_lat, "lon": route.start_lon, "kind": "start", "at": route.started_at.isoformat()})
    for p in pings:
        coords.append({"lat": p.lat, "lon": p.lon, "kind": "ping", "at": p.recorded_at.isoformat(), "speed": p.speed_kmh})
    if route.end_lat is not None:
        coords.append({"lat": route.end_lat, "lon": route.end_lon, "kind": "end", "at": route.ended_at.isoformat() if route.ended_at else None})
    return {
        "route_id": route.id, "route_code": route.route_code,
        "status": route.status, "coords": coords,
        "current": coords[-1] if coords else None,
    }


@router.get("/collections/route/{route_id}")
def route_detail(route_id: int, db: Session = Depends(get_db)):
    r = db.query(models.CollectionRoute).get(route_id)
    if not r:
        raise HTTPException(404, "Route not found")
    pickups = db.query(models.PickupEvent).filter(models.PickupEvent.route_id == r.id) \
        .order_by(models.PickupEvent.captured_at.asc()).all()
    collector = db.query(models.User).get(r.collector_id)
    dump = db.query(models.AggregationPoint).get(r.dump_aggregation_point_id) if r.dump_aggregation_point_id else None
    return {
        "route": schemas.RouteOut.model_validate(r, from_attributes=True),
        "pickups": [schemas.PickupOut.model_validate(p, from_attributes=True) for p in pickups],
        "collector": {"id": collector.id, "name": collector.name, "phone": collector.phone} if collector else None,
        "dump_point": {"id": dump.id, "name": dump.name, "lat": dump.lat, "lon": dump.lon} if dump else None,
    }


# ─────────────── AGGREGATION POINTS ───────────────────────────────────────

@router.get("/aggregation-points", response_model=list[schemas.AggregationPointOut])
def list_aggregation_points(db: Session = Depends(get_db)):
    return db.query(models.AggregationPoint).order_by(models.AggregationPoint.name).all()


# ─────────────── RAGPICKER RECOVERIES ─────────────────────────────────────

@router.post("/recoveries", response_model=schemas.RecoveryOut)
def create_recovery(payload: schemas.RecoveryCreate, db: Session = Depends(get_db)):
    """A kabadiwala (or NGO field worker) creates this when buying from a
    ragpicker — they scan the ragpicker's QR booklet slip and enter weight.
    No phone is required for the ragpicker; their identity is the QR series."""
    rp = db.query(models.User).filter(models.User.phone == payload.ragpicker_phone).first()
    if not rp or rp.role != "ragpicker":
        raise HTTPException(404, "Ragpicker not found")
    now = payload.captured_at or datetime.utcnow()
    code = _next_recovery_code(db)
    prev = latest_chain_hash(db)
    rh = compute_recovery_hash(
        code, rp.id, payload.material_type, payload.weight_kg,
        payload.lat, payload.lon, now, prev,
    )
    r = models.RagpickerRecovery(
        recovery_code=code, ragpicker_id=rp.id,
        aggregation_point_id=payload.aggregation_point_id,
        door_to_door=payload.door_to_door,
        material_type=payload.material_type, weight_kg=payload.weight_kg,
        lat=payload.lat, lon=payload.lon, captured_at=now,
        previous_hash=prev, record_hash=rh,
    )
    db.add(r); db.flush(); advance_chain_tip(db, rh)
    db.commit(); db.refresh(r)
    return r


@router.post("/recoveries/sell", response_model=schemas.BatchOut)
def sell_recovery(payload: schemas.RecoverySell, db: Session = Depends(get_db)):
    """Ragpicker sells the recovered sack to a kabadiwala. This is the moment
    the QR sticker is applied — a Batch is created and linked back to the
    Recovery so we can walk the full upstream chain from the batch later."""
    rec = db.query(models.RagpickerRecovery).get(payload.recovery_id)
    kab = db.query(models.User).filter(models.User.phone == payload.kabadiwala_phone).first()
    if not rec or not kab:
        raise HTTPException(404, "Recovery or kabadiwala not found")
    if rec.batch_id is not None:
        raise HTTPException(400, "Recovery already sold")
    batch = create_batch_record(
        db, creator=kab, material=rec.material_type, weight=rec.weight_kg,
        lat=kab.lat or rec.lat, lon=kab.lon or rec.lon,
        area=kab.area, source_channel="qr-recovery",
    )
    batch.source_recovery_id = rec.id
    rec.sold_to_kabadiwala_id = kab.id
    rec.sold_at = datetime.utcnow()
    rec.sold_price_inr = payload.price_inr
    rec.batch_id = batch.id
    db.commit(); db.refresh(batch)
    return batch


@router.get("/recoveries", response_model=list[schemas.RecoveryOut])
def list_recoveries(
    ragpicker_phone: str | None = None,
    unsold_only: bool = False,
    db: Session = Depends(get_db),
):
    q = db.query(models.RagpickerRecovery).order_by(models.RagpickerRecovery.captured_at.desc())
    if ragpicker_phone:
        u = db.query(models.User).filter(models.User.phone == ragpicker_phone).first()
        if u:
            q = q.filter(models.RagpickerRecovery.ragpicker_id == u.id)
    if unsold_only:
        q = q.filter(models.RagpickerRecovery.batch_id.is_(None))
    return q.limit(200).all()


# ─────────────── LIVE NETWORK MAP + SEARCH ────────────────────────────────

@router.get("/live")
def live_network(
    q: str | None = None,
    db: Session = Depends(get_db),
):
    """Aggregate snapshot for the city-corp live map.

    Returns:
      - active_routes: every IN_PROGRESS route with its current GPS position
        and the polyline of pings so far (so the map can animate trucks)
      - recent_batches: batches created in the last 24h
      - recent_handoffs: handoffs in the last 24h with locations
      - aggregation_points: static physical infrastructure
      - active_collectors / kabadiwalas / recyclers: lat/lon + identity

    Optional ?q= filters by: route code, batch code, person name, area,
    user phone, or a plate number embedded in a collector's name
    ("Truck KA-19-MC-4711"). Case-insensitive substring match.
    """
    now = datetime.utcnow()
    day_ago = now - timedelta(hours=24)
    q_low = (q or "").strip().lower()

    def matches(*haystacks: str | None) -> bool:
        if not q_low:
            return True
        for h in haystacks:
            if h and q_low in h.lower():
                return True
        return False

    # Active routes + their current position
    active_routes_q = db.query(models.CollectionRoute).filter(
        models.CollectionRoute.status == "IN_PROGRESS"
    ).all()
    # Also include routes that ended in the last 24h, so the map shows the
    # full trail of recent activity, not just live ones.
    recent_routes_q = db.query(models.CollectionRoute).filter(
        models.CollectionRoute.status == "COMPLETED",
        models.CollectionRoute.ended_at >= day_ago,
    ).limit(50).all()
    all_routes = active_routes_q + recent_routes_q

    collectors_by_id = {u.id: u for u in db.query(models.User).filter(
        models.User.role == "collector"
    ).all()}

    routes_out = []
    for r in all_routes:
        col = collectors_by_id.get(r.collector_id)
        if not matches(r.route_code, r.ward, col.name if col else None, col.phone if col else None):
            continue
        # Path
        pings = db.query(models.GpsPing).filter(
            models.GpsPing.route_id == r.id
        ).order_by(models.GpsPing.recorded_at.asc()).all()
        coords: list[dict] = []
        if r.start_lat is not None:
            coords.append({"lat": r.start_lat, "lon": r.start_lon, "kind": "start"})
        for p in pings:
            coords.append({"lat": p.lat, "lon": p.lon, "kind": "ping"})
        if r.end_lat is not None:
            coords.append({"lat": r.end_lat, "lon": r.end_lon, "kind": "end"})
        # Current position = last coord
        cur = coords[-1] if coords else None
        routes_out.append({
            "id": r.id, "code": r.route_code, "status": r.status,
            "ward": r.ward,
            "started_at": r.started_at.isoformat(),
            "ended_at": r.ended_at.isoformat() if r.ended_at else None,
            "pickup_count": r.pickup_count or 0,
            "total_weight_kg": r.total_estimated_weight_kg,
            "collector": {
                "id": col.id, "name": col.name, "phone": col.phone, "area": col.area,
            } if col else None,
            "current_lat": cur["lat"] if cur else None,
            "current_lon": cur["lon"] if cur else None,
            "coords": coords,
            "ping_count": len(pings),
        })

    # Recent batches
    batch_rows = db.query(models.Batch).filter(
        models.Batch.created_at >= day_ago
    ).order_by(models.Batch.created_at.desc()).limit(120).all()
    creators = {u.id: u for u in db.query(models.User).filter(
        models.User.id.in_([b.creator_id for b in batch_rows] or [0])
    ).all()}
    batches_out = []
    for b in batch_rows:
        c = creators.get(b.creator_id)
        if not matches(b.batch_code, b.area, c.name if c else None, c.phone if c else None):
            continue
        batches_out.append({
            "id": b.id, "code": b.batch_code,
            "material": b.material_type, "weight_kg": b.weight_kg,
            "lat": b.lat, "lon": b.lon, "area": b.area,
            "status": b.status, "created_at": b.created_at.isoformat(),
            "creator": {"id": c.id, "name": c.name, "phone": c.phone} if c else None,
            "tampered": b.tampered,
        })

    # Recent handoffs (for flow lines)
    handoff_rows = db.query(models.Handoff).filter(
        models.Handoff.initiated_at >= day_ago
    ).order_by(models.Handoff.initiated_at.desc()).limit(120).all()
    user_ids = set()
    for h in handoff_rows:
        user_ids.add(h.sender_id); user_ids.add(h.receiver_id)
    users_map = {u.id: u for u in db.query(models.User).filter(
        models.User.id.in_(list(user_ids) or [0])
    ).all()}
    handoffs_out = []
    for h in handoff_rows:
        s = users_map.get(h.sender_id); r2 = users_map.get(h.receiver_id)
        if not matches(s.name if s else None, r2.name if r2 else None,
                       s.phone if s else None, r2.phone if r2 else None,
                       s.area if s else None, r2.area if r2 else None):
            continue
        if s is None or r2 is None or s.lat is None or r2.lat is None:
            continue
        handoffs_out.append({
            "id": h.id, "status": h.status,
            "from": {"name": s.name, "role": s.role, "lat": s.lat, "lon": s.lon},
            "to":   {"name": r2.name, "role": r2.role, "lat": r2.lat, "lon": r2.lon},
            "sent_weight": h.sent_weight, "received_weight": h.received_weight,
            "discrepancy_flag": h.discrepancy_flag,
            "has_photo": bool(h.photo_hash),
            "initiated_at": h.initiated_at.isoformat(),
        })

    # Static infrastructure
    agg_points = [{
        "id": a.id, "name": a.name, "lat": a.lat, "lon": a.lon, "area": a.area,
    } for a in db.query(models.AggregationPoint).all() if matches(a.name, a.area)]

    return {
        "now": now.isoformat(),
        "filter": q,
        "active_routes": routes_out,
        "recent_batches": batches_out,
        "recent_handoffs": handoffs_out,
        "aggregation_points": agg_points,
        "counts": {
            "active_route_count": sum(1 for r in routes_out if r["status"] == "IN_PROGRESS"),
            "recent_route_count": len(routes_out),
            "recent_batch_count": len(batches_out),
            "recent_handoff_count": len(handoffs_out),
        },
    }


@router.get("/search")
def search(q: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    """Lightweight cross-entity search for the live map sidebar.
    Returns matching: collectors, kabadiwalas, batches, routes, areas.
    """
    q_low = q.strip().lower()
    if not q_low:
        return {"q": q, "users": [], "batches": [], "routes": []}

    users = db.query(models.User).filter(or_(
        models.User.name.ilike(f"%{q}%"),
        models.User.phone.ilike(f"%{q}%"),
        models.User.area.ilike(f"%{q}%"),
    )).limit(20).all()

    batches = db.query(models.Batch).filter(or_(
        models.Batch.batch_code.ilike(f"%{q}%"),
        models.Batch.area.ilike(f"%{q}%"),
    )).order_by(models.Batch.created_at.desc()).limit(20).all()

    routes = db.query(models.CollectionRoute).filter(or_(
        models.CollectionRoute.route_code.ilike(f"%{q}%"),
        models.CollectionRoute.ward.ilike(f"%{q}%"),
    )).order_by(models.CollectionRoute.started_at.desc()).limit(20).all()

    return {
        "q": q,
        "users": [{"id": u.id, "name": u.name, "role": u.role, "phone": u.phone, "area": u.area, "lat": u.lat, "lon": u.lon} for u in users],
        "batches": [{"id": b.id, "code": b.batch_code, "material": b.material_type, "weight_kg": b.weight_kg, "area": b.area, "lat": b.lat, "lon": b.lon, "status": b.status, "created_at": b.created_at.isoformat()} for b in batches],
        "routes": [{"id": r.id, "code": r.route_code, "ward": r.ward, "status": r.status, "pickup_count": r.pickup_count, "started_at": r.started_at.isoformat()} for r in routes],
    }


# ─────────────── BATCH PROVENANCE (the wow moment) ────────────────────────

@router.get("/provenance/batch/{batch_id}")
def batch_provenance(batch_id: int, db: Session = Depends(get_db)):
    """Walks the chain UPSTREAM from a batch:
      batch → recovery → aggregation point → routes that dumped there
            → pickups within those routes

    This is what proves "your PET bottle was picked up at Ward 17, sorted by
    Ravi at Pumpwell aggregation point, sold to Lakshmi's shop in Surathkal,
    handed to Coastal Aggregator, delivered to PET Reborn factory."
    """
    batch = db.query(models.Batch).get(batch_id)
    if not batch:
        raise HTTPException(404, "Batch not found")

    creator = db.query(models.User).get(batch.creator_id)
    handoffs = db.query(models.Handoff).filter(models.Handoff.batch_id == batch.id) \
        .order_by(models.Handoff.initiated_at.asc()).all()
    handoff_users = {u.id: u for u in db.query(models.User).filter(
        models.User.id.in_([h.sender_id for h in handoffs] + [h.receiver_id for h in handoffs])
    ).all()} if handoffs else {}

    out = {
        "batch": {
            "id": batch.id, "code": batch.batch_code,
            "material": batch.material_type, "weight_kg": batch.weight_kg,
            "created_at": batch.created_at.isoformat(),
            "hash": batch.record_hash,
            "creator": {"id": creator.id, "name": creator.name, "area": creator.area} if creator else None,
        },
        "recovery": None, "aggregation_point": None, "routes": [], "pickups": [],
        "handoffs": [
            {
                "id": h.id, "status": h.status,
                "sent_weight": h.sent_weight, "received_weight": h.received_weight,
                "discrepancy_pct": h.discrepancy_pct,
                "discrepancy_flag": h.discrepancy_flag,
                "sender": {"id": handoff_users[h.sender_id].id,
                           "name": handoff_users[h.sender_id].name,
                           "role": handoff_users[h.sender_id].role} if h.sender_id in handoff_users else None,
                "receiver": {"id": handoff_users[h.receiver_id].id,
                             "name": handoff_users[h.receiver_id].name,
                             "role": handoff_users[h.receiver_id].role} if h.receiver_id in handoff_users else None,
                "hash": h.record_hash,
                "initiated_at": h.initiated_at.isoformat(),
            } for h in handoffs
        ],
    }

    if batch.source_recovery_id:
        rec = db.query(models.RagpickerRecovery).get(batch.source_recovery_id)
        if rec:
            rp = db.query(models.User).get(rec.ragpicker_id)
            out["recovery"] = {
                "id": rec.id, "code": rec.recovery_code,
                "material": rec.material_type, "weight_kg": rec.weight_kg,
                "door_to_door": rec.door_to_door,
                "captured_at": rec.captured_at.isoformat(),
                "lat": rec.lat, "lon": rec.lon, "hash": rec.record_hash,
                "ragpicker": {"id": rp.id, "name": rp.name, "area": rp.area} if rp else None,
            }
            if rec.aggregation_point_id:
                ap = db.query(models.AggregationPoint).get(rec.aggregation_point_id)
                if ap:
                    out["aggregation_point"] = {
                        "id": ap.id, "name": ap.name, "area": ap.area,
                        "lat": ap.lat, "lon": ap.lon,
                    }
                    # routes that dumped here on the same day as the recovery
                    same_day_start = rec.captured_at.replace(hour=0, minute=0, second=0, microsecond=0)
                    same_day_end = same_day_start.replace(hour=23, minute=59, second=59)
                    rts = db.query(models.CollectionRoute).filter(
                        models.CollectionRoute.dump_aggregation_point_id == ap.id,
                        models.CollectionRoute.started_at >= same_day_start,
                        models.CollectionRoute.started_at <= same_day_end,
                    ).all()
                    collector_map = {c.id: c for c in db.query(models.User).filter(
                        models.User.id.in_([r.collector_id for r in rts])
                    ).all()} if rts else {}
                    for r in rts:
                        out["routes"].append({
                            "id": r.id, "code": r.route_code,
                            "started_at": r.started_at.isoformat(),
                            "ended_at": r.ended_at.isoformat() if r.ended_at else None,
                            "pickup_count": r.pickup_count,
                            "weight_kg": r.total_estimated_weight_kg,
                            "ward": r.ward,
                            "hash": r.record_hash,
                            "collector": {
                                "id": collector_map[r.collector_id].id,
                                "name": collector_map[r.collector_id].name,
                            } if r.collector_id in collector_map else None,
                        })
                    if rts:
                        pks = db.query(models.PickupEvent).filter(
                            models.PickupEvent.route_id.in_([r.id for r in rts])
                        ).order_by(models.PickupEvent.captured_at.asc()).all()
                        out["pickups"] = [{
                            "id": p.id, "route_id": p.route_id,
                            "lat": p.lat, "lon": p.lon,
                            "captured_at": p.captured_at.isoformat(),
                            "house_tag": p.house_tag,
                            "estimated_weight_kg": p.estimated_weight_kg,
                            "hash": p.record_hash,
                        } for p in pks]
    return out
