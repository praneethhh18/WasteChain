"""Batch creation — used by both the SMS bot and the API. Centralised so the
hash chain is computed in one place no matter where the batch entered."""

from datetime import datetime
from sqlalchemy.orm import Session

from .. import models
from ..hash_chain import compute_batch_hash, latest_chain_hash, advance_chain_tip


def next_batch_code(db: Session) -> str:
    year = datetime.utcnow().year
    count = db.query(models.Batch).count()
    return f"WC-{year}-{count + 1:04d}"


def create_batch_record(
    db: Session,
    creator: models.User,
    material: str,
    weight: float,
    lat: float,
    lon: float,
    area: str | None = None,
    source_channel: str = "pwa",
    captured_at: datetime | None = None,
    notes: str | None = None,
) -> models.Batch:
    created_at = captured_at or datetime.utcnow()
    code = next_batch_code(db)
    prev_hash = latest_chain_hash(db)
    record_hash = compute_batch_hash(
        code, creator.id, material, weight, lat, lon, created_at, prev_hash,
    )
    batch = models.Batch(
        batch_code=code,
        creator_id=creator.id,
        current_holder_id=creator.id,
        material_type=material,
        weight_kg=weight,
        lat=lat, lon=lon,
        area=area or creator.area,
        status="AVAILABLE",
        source_channel=source_channel,
        notes=notes,
        created_at=created_at,
        previous_hash=prev_hash,
        record_hash=record_hash,
    )
    db.add(batch)
    db.flush()
    advance_chain_tip(db, record_hash)
    return batch
