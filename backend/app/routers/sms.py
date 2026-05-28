"""SMS gateway endpoints.

POST /sms/inbound — receives a 'text message' from the simulator (or a real
Twilio webhook in production), runs it through the bot, returns the bot's
reply. Both inbound and outbound are persisted to the SmsMessage table so the
simulator UI can render the full conversation history.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models, schemas
from ..services.sms_bot import handle_inbound

router = APIRouter(prefix="/sms", tags=["sms"])


@router.post("/inbound", response_model=schemas.SmsOutbound)
def inbound(payload: schemas.SmsInbound, db: Session = Depends(get_db)):
    reply = handle_inbound(db, payload.phone, payload.body)
    db.commit()
    out = (
        db.query(models.SmsMessage)
        .filter(models.SmsMessage.phone == payload.phone)
        .order_by(models.SmsMessage.id.desc())
        .first()
    )
    return out


@router.get("/history", response_model=list[schemas.SmsOutbound])
def history(phone: str, db: Session = Depends(get_db)):
    return (
        db.query(models.SmsMessage)
        .filter(models.SmsMessage.phone == phone)
        .order_by(models.SmsMessage.id.asc())
        .limit(200)
        .all()
    )


@router.post("/reset")
def reset(phone: str, db: Session = Depends(get_db)):
    db.query(models.SmsMessage).filter(models.SmsMessage.phone == phone).delete()
    db.query(models.SmsSession).filter(models.SmsSession.phone == phone).delete()
    db.commit()
    return {"ok": True}
