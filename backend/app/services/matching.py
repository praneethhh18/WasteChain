"""Matching engine.

Scoring blends four signals, each in [0, 1]:
  - material_match  (hard filter: must equal 1, else excluded)
  - distance        (closer = higher; falls off linearly to 50km)
  - price           (higher offer = higher; normalised against the best open
                     bid for this material)
  - reputation      (recycler's own reputation; protects kabadiwalas from
                     known-bad buyers)

Weights chosen so price dominates (kabadiwalas care about money) but a nearby
trustworthy buyer can beat a distant cheapskate."""

from math import asin, cos, radians, sin, sqrt
from datetime import datetime
from sqlalchemy.orm import Session

from .. import models

W_DISTANCE = 0.25
W_PRICE = 0.55
W_REPUTATION = 0.20
MAX_DIST_KM = 50.0


def haversine_km(lat1, lon1, lat2, lon2) -> float:
    R = 6371.0
    p1, p2 = radians(lat1), radians(lat2)
    dp = radians(lat2 - lat1)
    dl = radians(lon2 - lon1)
    a = sin(dp / 2) ** 2 + cos(p1) * cos(p2) * sin(dl / 2) ** 2
    return 2 * R * asin(sqrt(a))


def rank_matches(db: Session, batch: models.Batch, limit: int = 5):
    bids = (
        db.query(models.RecyclerBid)
        .filter(models.RecyclerBid.active == True)  # noqa: E712
        .filter(models.RecyclerBid.material_type == batch.material_type)
        .filter(models.RecyclerBid.valid_until >= datetime.utcnow())
        .all()
    )
    if not bids:
        return []

    max_price = max(b.price_per_kg for b in bids)
    kabadiwala = db.query(models.User).get(batch.creator_id)
    usual_price = (kabadiwala.usual_price_inr or {}).get(batch.material_type, 0) if kabadiwala else 0

    scored = []
    for bid in bids:
        recycler = db.query(models.User).get(bid.recycler_id)
        if not recycler:
            continue
        dist = haversine_km(batch.lat, batch.lon, bid.lat, bid.lon)
        if dist > MAX_DIST_KM:
            continue
        s_distance = max(0.0, 1.0 - dist / MAX_DIST_KM)
        s_price = bid.price_per_kg / max_price if max_price > 0 else 0
        s_reputation = max(0.0, min(1.0, recycler.reputation_score / 100.0))
        score = (
            W_DISTANCE * s_distance
            + W_PRICE * s_price
            + W_REPUTATION * s_reputation
        )
        expected = bid.price_per_kg * batch.weight_kg
        usual = usual_price * batch.weight_kg
        scored.append({
            "bid_id": bid.id,
            "recycler_id": recycler.id,
            "recycler_name": recycler.name,
            "recycler_area": recycler.area,
            "material_type": bid.material_type,
            "price_per_kg": bid.price_per_kg,
            "distance_km": round(dist, 2),
            "score": round(score, 4),
            "expected_earnings_inr": round(expected, 2),
            "usual_earnings_inr": round(usual, 2),
            "earnings_delta_inr": round(expected - usual, 2),
            "reputation_score": recycler.reputation_score,
        })
    scored.sort(key=lambda m: m["score"], reverse=True)
    return scored[:limit]
