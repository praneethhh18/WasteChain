"""Trust Layer endpoints — the demo's hash chain visualisation + tamper
toggle. The tamper endpoint deliberately mutates a batch weight WITHOUT
recomputing the stored hash, so the verifier flags it.

The 'untamper' endpoint resets all tampered records to their authentic weight
(stored in `notes` as JSON), so the demo can be re-run cleanly."""

import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models, schemas
from ..hash_chain import verify_chain

router = APIRouter(prefix="/trust", tags=["trust"])


@router.get("/chain", response_model=list[schemas.TrustRecord])
def get_chain(db: Session = Depends(get_db)):
    return verify_chain(db)


@router.post("/tamper")
def tamper(payload: schemas.TamperRequest, db: Session = Depends(get_db)):
    b = db.query(models.Batch).get(payload.batch_id)
    if not b:
        raise HTTPException(404, "Batch not found")
    # stash original so we can restore for re-runs
    note = {}
    if b.notes:
        try:
            note = json.loads(b.notes)
        except Exception:
            note = {"raw_notes": b.notes}
    note["pre_tamper_weight_kg"] = note.get("pre_tamper_weight_kg", b.weight_kg)
    b.notes = json.dumps(note)
    b.weight_kg = payload.new_weight_kg
    b.tampered = True
    db.commit()
    return {"ok": True, "batch_id": b.id, "tampered_weight": b.weight_kg}


@router.post("/restore")
def restore(db: Session = Depends(get_db)):
    """Roll back every tampered batch to its pre-tamper weight."""
    tampered = db.query(models.Batch).filter(models.Batch.tampered == True).all()  # noqa: E712
    restored = 0
    for b in tampered:
        try:
            note = json.loads(b.notes or "{}")
        except Exception:
            note = {}
        if "pre_tamper_weight_kg" in note:
            b.weight_kg = note.pop("pre_tamper_weight_kg")
            b.notes = json.dumps(note) if note else None
            b.tampered = False
            restored += 1
    db.commit()
    return {"ok": True, "restored": restored}
