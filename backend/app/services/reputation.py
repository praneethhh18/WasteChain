"""Reputation events.

Score starts at 100. Penalty scales with discrepancy size — a 6% off-by is a
nudge, a 50% off-by is a flag. Clean handoffs nudge the score back up so
genuine actors recover after an isolated bad day.
"""

from sqlalchemy.orm import Session
from .. import models


def apply_handoff_outcome(
    db: Session,
    sender: models.User,
    receiver: models.User,
    discrepancy_pct: float,
) -> None:
    if discrepancy_pct is None:
        return
    if discrepancy_pct <= 5.0:
        delta = +0.5
        event = "CLEAN_HANDOFF"
        detail = f"variance {discrepancy_pct:.1f}% within threshold"
    elif discrepancy_pct <= 15.0:
        delta = -3.0
        event = "MINOR_DISCREPANCY"
        detail = f"variance {discrepancy_pct:.1f}%"
    elif discrepancy_pct <= 30.0:
        delta = -8.0
        event = "MODERATE_DISCREPANCY"
        detail = f"variance {discrepancy_pct:.1f}%"
    else:
        delta = -15.0
        event = "SEVERE_DISCREPANCY"
        detail = f"variance {discrepancy_pct:.1f}%"

    for user in (sender, receiver):
        user.reputation_score = max(0.0, min(100.0, user.reputation_score + delta))
        db.add(models.ReputationEvent(
            user_id=user.id, event_type=event, score_change=delta, detail=detail,
        ))
