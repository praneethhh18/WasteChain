"""Municipality / admin analytics — read-only aggregations."""

from datetime import datetime, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models, schemas
from ..services.carbon import aggregate_impact, impact_for

router = APIRouter(prefix="/municipality", tags=["municipality"])

# India's MSW recyclable share is ~25-30%. We assume that, absent WasteChain,
# the equivalent material would have gone to landfill. So `diverted` ≈ delivered.
ASSUMED_LANDFILL_BASELINE_KG = 5000.0  # tonnage that *would* hit landfill / day in zone


@router.get("/stats", response_model=schemas.MunicipalityStats)
def stats(db: Session = Depends(get_db)):
    now = datetime.utcnow()
    day_ago = now - timedelta(days=1)
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    def kg_since(ts):
        return db.query(func.coalesce(func.sum(models.Batch.weight_kg), 0.0)).filter(
            models.Batch.created_at >= ts
        ).scalar() or 0.0

    today = kg_since(day_ago)
    week = kg_since(week_ago)
    month = kg_since(month_ago)

    active_collectors = (
        db.query(models.Batch.creator_id).filter(models.Batch.created_at >= week_ago).distinct().count()
    )
    flagged = db.query(models.Handoff).filter(models.Handoff.discrepancy_flag == True).count()  # noqa: E712

    material_rows = (
        db.query(models.Batch.material_type, func.sum(models.Batch.weight_kg))
        .filter(models.Batch.created_at >= month_ago)
        .group_by(models.Batch.material_type)
        .all()
    )
    material_breakdown = {m: round(float(kg or 0), 2) for m, kg in material_rows}

    # daily series for last 14 days
    series = []
    for i in range(13, -1, -1):
        start = (now - timedelta(days=i+1))
        end = (now - timedelta(days=i))
        kg = db.query(func.coalesce(func.sum(models.Batch.weight_kg), 0.0)).filter(
            models.Batch.created_at >= start, models.Batch.created_at < end
        ).scalar() or 0.0
        series.append({"date": end.strftime("%b %d"), "kg": round(float(kg), 1)})

    diversion = min(100.0, (today / ASSUMED_LANDFILL_BASELINE_KG) * 100.0) if today else 0.0

    # Upstream collection stats — total tonnage municipal/door-to-door
    # collectors moved through the city, regardless of whether it was
    # later recovered as recyclable.
    collected_today = db.query(func.coalesce(func.sum(models.CollectionRoute.total_estimated_weight_kg), 0.0)).filter(
        models.CollectionRoute.started_at >= day_ago,
        models.CollectionRoute.status == "COMPLETED",
    ).scalar() or 0.0
    collected_week = db.query(func.coalesce(func.sum(models.CollectionRoute.total_estimated_weight_kg), 0.0)).filter(
        models.CollectionRoute.started_at >= week_ago,
        models.CollectionRoute.status == "COMPLETED",
    ).scalar() or 0.0
    active_routes = db.query(models.CollectionRoute).filter(
        models.CollectionRoute.status == "IN_PROGRESS"
    ).count()

    # Carbon + EPR credit roll-ups for the city
    month_batches = db.query(models.Batch.material_type, models.Batch.weight_kg).filter(
        models.Batch.created_at >= month_ago
    ).all()
    carbon = aggregate_impact([(m, w) for m, w in month_batches])

    return {
        "total_recovered_kg_today": round(today, 1),
        "total_recovered_kg_week": round(week, 1),
        "total_recovered_kg_month": round(month, 1),
        "active_collectors": active_collectors,
        "landfill_diversion_pct": round(diversion, 1),
        "material_breakdown": material_breakdown,
        "daily_series": series,
        "flagged_handoffs": flagged,
        "collected_kg_today": round(float(collected_today), 1),
        "collected_kg_week": round(float(collected_week), 1),
        "active_routes": active_routes,
        "carbon": carbon,
    }


@router.get("/carbon")
def carbon_summary(window: str = "month", db: Session = Depends(get_db)):
    """Standalone carbon impact endpoint — useful for the workflow demo to
    show a running tally as steps are clicked through."""
    now = datetime.utcnow()
    cutoff = {
        "day":   now - timedelta(days=1),
        "week":  now - timedelta(days=7),
        "month": now - timedelta(days=30),
        "all":   datetime(1970, 1, 1),
    }.get(window, now - timedelta(days=30))
    rows = db.query(models.Batch.material_type, models.Batch.weight_kg).filter(
        models.Batch.created_at >= cutoff
    ).all()
    return aggregate_impact([(m, w) for m, w in rows])
