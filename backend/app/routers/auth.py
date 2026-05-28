"""Phone-based mock auth.

A production build would send an OTP via Twilio. For the demo we trust the
phone number — judges can switch personas in one click. Tokens are JWTs so
swapping in real OTP later only touches this file.
"""

from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from jose import jwt
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from .. import models, schemas

router = APIRouter(prefix="/auth", tags=["auth"])


def make_token(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "exp": datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes),
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


@router.post("/login", response_model=schemas.LoginResponse)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    phone = payload.phone.strip()
    user = db.query(models.User).filter(models.User.phone == phone).first()
    if not user:
        raise HTTPException(404, "Phone not registered")
    return {"token": make_token(user.id), "user": user}


@router.get("/users", response_model=list[schemas.UserOut])
def list_users(role: str | None = None, db: Session = Depends(get_db)):
    q = db.query(models.User)
    if role:
        q = q.filter(models.User.role == role)
    return q.order_by(models.User.role, models.User.name).all()
