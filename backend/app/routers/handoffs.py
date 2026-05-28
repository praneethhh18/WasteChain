from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from .. import models, schemas
from ..hash_chain import compute_handoff_hash, latest_chain_hash, advance_chain_tip, hash_photo
from ..services.reputation import apply_handoff_outcome

router = APIRouter(prefix="/handoffs", tags=["handoffs"])


@router.post("/initiate", response_model=schemas.HandoffOut)
def initiate(payload: schemas.HandoffInitiate, db: Session = Depends(get_db)):
    batch = db.query(models.Batch).get(payload.batch_id)
    sender = db.query(models.User).filter(models.User.phone == payload.sender_phone).first()
    receiver = db.query(models.User).filter(models.User.phone == payload.receiver_phone).first()
    if not (batch and sender and receiver):
        raise HTTPException(404, "Batch / sender / receiver missing")
    if batch.current_holder_id != sender.id:
        raise HTTPException(400, "Sender is not current holder of this batch")

    now = datetime.utcnow()
    prev = latest_chain_hash(db)
    record_hash = compute_handoff_hash(
        batch.id, sender.id, receiver.id, payload.sent_weight, None, now, prev,
    )
    h = models.Handoff(
        batch_id=batch.id, sender_id=sender.id, receiver_id=receiver.id,
        sent_weight=payload.sent_weight, price_per_kg=payload.price_per_kg,
        initiated_at=now, status="PENDING",
        previous_hash=prev, record_hash=record_hash,
    )
    batch.status = "IN_TRANSIT"
    db.add(h)
    db.flush()
    advance_chain_tip(db, record_hash)
    db.commit()
    db.refresh(h)
    return h


@router.post("/confirm", response_model=schemas.HandoffOut)
def confirm(payload: schemas.HandoffConfirm, db: Session = Depends(get_db)):
    h = db.query(models.Handoff).get(payload.handoff_id)
    receiver = db.query(models.User).filter(models.User.phone == payload.receiver_phone).first()
    if not (h and receiver):
        raise HTTPException(404, "Handoff or receiver missing")
    if h.receiver_id != receiver.id:
        raise HTTPException(403, "Only the named receiver can confirm")
    if h.status != "PENDING":
        raise HTTPException(400, f"Already {h.status}")

    h.received_weight = payload.received_weight
    h.confirmed_at = datetime.utcnow()
    diff = abs(h.sent_weight - h.received_weight)
    h.discrepancy_pct = (diff / h.sent_weight * 100.0) if h.sent_weight else 0
    h.discrepancy_flag = h.discrepancy_pct > settings.discrepancy_threshold_pct
    h.status = "DISPUTED" if h.discrepancy_flag else "CONFIRMED"

    # Bind the photo to the chain — bytes get hashed into the handoff record.
    # Future tampering with the photo breaks the link.
    if payload.photo_data_url:
        h.photo_data_url = payload.photo_data_url
        h.photo_hash = hash_photo(payload.photo_data_url)

    # Rehash with the now-known received_weight + photo_hash. previous_hash
    # stays pinned to insertion time so verification still walks the chain
    # in order.
    h.record_hash = compute_handoff_hash(
        h.batch_id, h.sender_id, h.receiver_id, h.sent_weight,
        h.received_weight, h.initiated_at, h.previous_hash,
        photo_hash=h.photo_hash,
    )

    batch = db.query(models.Batch).get(h.batch_id)
    batch.current_holder_id = receiver.id
    if h.status == "CONFIRMED":
        # final leg if receiver is a recycler => DELIVERED
        batch.status = "DELIVERED" if receiver.role == "recycler" else "IN_TRANSIT"
    else:
        batch.status = "DISPUTED"

    sender = db.query(models.User).get(h.sender_id)
    apply_handoff_outcome(db, sender, receiver, h.discrepancy_pct)
    db.commit()
    db.refresh(h)
    return h


@router.get("", response_model=list[schemas.HandoffOut])
def list_handoffs(
    user_phone: str | None = None,
    discrepancy_only: bool = False,
    db: Session = Depends(get_db),
):
    q = db.query(models.Handoff).order_by(models.Handoff.initiated_at.desc())
    if user_phone:
        u = db.query(models.User).filter(models.User.phone == user_phone).first()
        if u:
            q = q.filter(
                (models.Handoff.sender_id == u.id) | (models.Handoff.receiver_id == u.id)
            )
    if discrepancy_only:
        q = q.filter(models.Handoff.discrepancy_flag == True)  # noqa: E712
    return q.limit(500).all()
