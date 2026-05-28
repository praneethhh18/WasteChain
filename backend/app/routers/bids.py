from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models, schemas

router = APIRouter(prefix="/bids", tags=["bids"])


@router.post("", response_model=schemas.BidOut)
def create_bid(payload: schemas.BidCreate, db: Session = Depends(get_db)):
    recycler = db.query(models.User).filter(models.User.phone == payload.recycler_phone).first()
    if not recycler or recycler.role != "recycler":
        raise HTTPException(404, "Recycler not found")
    bid = models.RecyclerBid(
        recycler_id=recycler.id,
        material_type=payload.material_type,
        quantity_needed_kg=payload.quantity_needed_kg,
        price_per_kg=payload.price_per_kg,
        valid_until=datetime.utcnow() + timedelta(hours=payload.valid_hours),
        lat=payload.lat if payload.lat is not None else recycler.lat or 12.87,
        lon=payload.lon if payload.lon is not None else recycler.lon or 74.84,
        active=True,
    )
    db.add(bid)
    db.commit()
    db.refresh(bid)
    return bid


@router.get("", response_model=list[schemas.BidOut])
def list_bids(
    recycler_phone: str | None = None,
    active_only: bool = True,
    db: Session = Depends(get_db),
):
    q = db.query(models.RecyclerBid).order_by(models.RecyclerBid.created_at.desc())
    if recycler_phone:
        u = db.query(models.User).filter(models.User.phone == recycler_phone).first()
        if u:
            q = q.filter(models.RecyclerBid.recycler_id == u.id)
    if active_only:
        q = q.filter(
            models.RecyclerBid.active == True,  # noqa: E712
            models.RecyclerBid.valid_until >= datetime.utcnow(),
        )
    return q.limit(200).all()


@router.delete("/{bid_id}")
def cancel_bid(bid_id: int, db: Session = Depends(get_db)):
    bid = db.query(models.RecyclerBid).get(bid_id)
    if not bid:
        raise HTTPException(404, "Bid not found")
    bid.active = False
    db.commit()
    return {"ok": True}
