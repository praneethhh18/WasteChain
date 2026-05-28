from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models, schemas
from ..services.batches import create_batch_record
from ..services.matching import rank_matches

router = APIRouter(prefix="/batches", tags=["batches"])


@router.post("", response_model=schemas.BatchOut)
def create_batch(payload: schemas.BatchCreate, db: Session = Depends(get_db)):
    creator = db.query(models.User).filter(models.User.phone == payload.creator_phone).first()
    if not creator:
        raise HTTPException(404, "Creator not found")
    batch = create_batch_record(
        db, creator=creator, material=payload.material_type, weight=payload.weight_kg,
        lat=payload.lat, lon=payload.lon, area=payload.area,
        source_channel=payload.source_channel,
        captured_at=payload.captured_at, notes=payload.notes,
    )
    if payload.source_channel == "offline-sync" or payload.captured_at:
        db.add(models.OfflineQueueItem(
            phone=creator.phone,
            payload={"material": payload.material_type, "weight_kg": payload.weight_kg},
            captured_at=payload.captured_at or datetime.utcnow(),
            batch_id=batch.id,
        ))
    db.commit()
    db.refresh(batch)
    return batch


@router.get("", response_model=list[schemas.BatchOut])
def list_batches(
    creator_phone: str | None = None,
    status: str | None = None,
    material: str | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(models.Batch).order_by(models.Batch.created_at.desc())
    if creator_phone:
        u = db.query(models.User).filter(models.User.phone == creator_phone).first()
        if u:
            q = q.filter(models.Batch.creator_id == u.id)
    if status:
        q = q.filter(models.Batch.status == status)
    if material:
        q = q.filter(models.Batch.material_type == material)
    return q.limit(500).all()


@router.get("/{batch_id}", response_model=schemas.BatchOut)
def get_batch(batch_id: int, db: Session = Depends(get_db)):
    b = db.query(models.Batch).get(batch_id)
    if not b:
        raise HTTPException(404, "Batch not found")
    return b


@router.get("/{batch_id}/matches", response_model=list[schemas.MatchOut])
def batch_matches(batch_id: int, db: Session = Depends(get_db)):
    b = db.query(models.Batch).get(batch_id)
    if not b:
        raise HTTPException(404, "Batch not found")
    return rank_matches(db, b, limit=5)


@router.post("/{batch_id}/accept-match")
def accept_match(batch_id: int, bid_id: int = Query(...), db: Session = Depends(get_db)):
    batch = db.query(models.Batch).get(batch_id)
    bid = db.query(models.RecyclerBid).get(bid_id)
    if not batch or not bid:
        raise HTTPException(404, "Batch or bid not found")
    matches = rank_matches(db, batch, limit=10)
    chosen = next((m for m in matches if m["bid_id"] == bid_id), None)
    if not chosen:
        raise HTTPException(400, "Bid is not a valid match for this batch")
    m = models.Match(
        batch_id=batch.id, bid_id=bid.id,
        score=chosen["score"], distance_km=chosen["distance_km"],
        expected_earnings_inr=chosen["expected_earnings_inr"],
        usual_earnings_inr=chosen["usual_earnings_inr"],
        accepted=True,
    )
    batch.status = "MATCHED"
    db.add(m)
    db.commit()
    return {"ok": True, "match_id": m.id, "batch_status": batch.status}
