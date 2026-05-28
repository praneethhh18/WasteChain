from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Float, DateTime, ForeignKey, Boolean, Text, JSON,
)
from sqlalchemy.orm import relationship

from .db import Base


class Organization(Base):
    """A node in the deployment tree.

    Top-level orgs are deployable tenants — a city corporation, a panchayat,
    a private recycler, an NGO. Each top-level org can have CHILD orgs:
    zones inside a city corp, taluk panchayats inside a zilla parishad,
    procurement teams inside a recycler. This makes the org table a forest
    of trees (one tree per deployment).

    Type values:
      city_corp        — Municipal Corporation (e.g. BBMP, MCM)
      town_panchayat   — Town/Nagar Panchayat
      gram_panchayat   — Gram Panchayat (village body)
      zilla_parishad   — District-level rural body
      recycler         — Private recycler (PET Reborn, etc.)
      aggregator       — Private aggregator / scrap dealer collective
      ngo              — NGO operating waste programs (Hasiru Dala, Chintan)
      zone             — Generic sub-division (e.g. a zone inside a city corp)
      ward             — A ward (typically under a zone)
      taluk_panchayat  — Taluk-level body (typically under a Zilla Parishad)
      sub_division     — Catch-all for private-sector internal divisions
    """
    __tablename__ = "organizations"
    id = Column(Integer, primary_key=True)
    name = Column(String(160), nullable=False)
    type = Column(String(40), nullable=False, index=True)
    # parent_id is NULL for top-level deployments. Non-null for sub-divisions.
    parent_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)
    country = Column(String(60), default="India")
    state = Column(String(60), nullable=True, index=True)
    district = Column(String(80), nullable=True)
    city_or_village = Column(String(120), nullable=True)
    admin_phone = Column(String(20), nullable=True)
    admin_name = Column(String(120), nullable=True)
    is_demo = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class ChainState(Base):
    """Singleton row tracking the current tip of the global hash chain.

    We track this explicitly (instead of inferring from MAX(created_at) per
    table) so that backdated inserts — offline-synced batches, seed data —
    correctly chain on top of whatever was inserted most recently, regardless
    of their business timestamps.
    """
    __tablename__ = "chain_state"
    id = Column(Integer, primary_key=True, default=1)
    tip_hash = Column(String(64), nullable=False, default="0" * 64)
    seq = Column(Integer, nullable=False, default=0)


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    phone = Column(String(20), unique=True, nullable=False, index=True)
    name = Column(String(120), nullable=False)
    role = Column(String(20), nullable=False)  # kabadiwala | aggregator | recycler | municipality
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)
    lat = Column(Float, nullable=True)
    lon = Column(Float, nullable=True)
    area = Column(String(120), nullable=True)
    language = Column(String(8), default="en")  # en | hi | kn
    reputation_score = Column(Float, default=100.0)
    usual_price_inr = Column(JSON, default=dict)  # {"PET": 13, "PAPER": 9, ...}
    created_at = Column(DateTime, default=datetime.utcnow)

    batches = relationship("Batch", back_populates="creator", foreign_keys="Batch.creator_id")
    sent_handoffs = relationship("Handoff", back_populates="sender", foreign_keys="Handoff.sender_id")
    received_handoffs = relationship("Handoff", back_populates="receiver", foreign_keys="Handoff.receiver_id")
    bids = relationship("RecyclerBid", back_populates="recycler")


class Batch(Base):
    __tablename__ = "batches"
    id = Column(Integer, primary_key=True)
    batch_code = Column(String(20), unique=True, nullable=False, index=True)
    creator_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    current_holder_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    material_type = Column(String(40), nullable=False)  # PET | PAPER | CARDBOARD | METAL | GLASS | ECOMM_PLASTIC
    weight_kg = Column(Float, nullable=False)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    area = Column(String(120), nullable=True)
    status = Column(String(20), default="AVAILABLE")
    # AVAILABLE | MATCHED | IN_TRANSIT | DELIVERED | DISPUTED
    source_channel = Column(String(20), default="sms")  # sms | pwa | web | whatsapp
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    record_hash = Column(String(64), nullable=False, index=True)
    previous_hash = Column(String(64), nullable=False)
    tampered = Column(Boolean, default=False)  # marker for the demo tamper button

    # Optional upstream link — set when a kabadiwala buys from a ragpicker.
    # Lets us walk the chain back: batch → recovery → aggregation point → route → pickups.
    source_recovery_id = Column(
        Integer,
        ForeignKey("ragpicker_recoveries.id", use_alter=True, name="fk_batches_source_recovery"),
        nullable=True,
    )

    creator = relationship("User", back_populates="batches", foreign_keys=[creator_id])
    handoffs = relationship("Handoff", back_populates="batch", cascade="all, delete-orphan")


class Handoff(Base):
    __tablename__ = "handoffs"
    id = Column(Integer, primary_key=True)
    batch_id = Column(Integer, ForeignKey("batches.id"), nullable=False)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    receiver_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    sent_weight = Column(Float, nullable=False)
    received_weight = Column(Float, nullable=True)
    price_per_kg = Column(Float, nullable=True)
    status = Column(String(20), default="PENDING")
    # PENDING | CONFIRMED | DISPUTED
    discrepancy_pct = Column(Float, nullable=True)
    discrepancy_flag = Column(Boolean, default=False)
    initiated_at = Column(DateTime, default=datetime.utcnow)
    confirmed_at = Column(DateTime, nullable=True)
    record_hash = Column(String(64), nullable=False)
    previous_hash = Column(String(64), nullable=False)

    # Photo evidence captured by the receiver at confirm-receipt time.
    # The hash is over the photo bytes — it gets folded into the handoff
    # record_hash, so swapping the photo later breaks the chain.
    photo_data_url = Column(Text, nullable=True)   # base64 data URL (demo storage)
    photo_hash = Column(String(64), nullable=True)

    batch = relationship("Batch", back_populates="handoffs")
    sender = relationship("User", back_populates="sent_handoffs", foreign_keys=[sender_id])
    receiver = relationship("User", back_populates="received_handoffs", foreign_keys=[receiver_id])


class RecyclerBid(Base):
    __tablename__ = "recycler_bids"
    id = Column(Integer, primary_key=True)
    recycler_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    material_type = Column(String(40), nullable=False)
    quantity_needed_kg = Column(Float, nullable=False)
    price_per_kg = Column(Float, nullable=False)
    valid_until = Column(DateTime, nullable=False)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    active = Column(Boolean, default=True)

    recycler = relationship("User", back_populates="bids")


class Match(Base):
    __tablename__ = "matches"
    id = Column(Integer, primary_key=True)
    batch_id = Column(Integer, ForeignKey("batches.id"), nullable=False)
    bid_id = Column(Integer, ForeignKey("recycler_bids.id"), nullable=False)
    score = Column(Float, nullable=False)
    distance_km = Column(Float, nullable=False)
    expected_earnings_inr = Column(Float, nullable=False)
    usual_earnings_inr = Column(Float, nullable=False)
    recommended_at = Column(DateTime, default=datetime.utcnow)
    accepted = Column(Boolean, default=False)


class ReputationEvent(Base):
    __tablename__ = "reputation_events"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    event_type = Column(String(40), nullable=False)
    score_change = Column(Float, nullable=False)
    detail = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class SmsMessage(Base):
    """Mock SMS gateway log — every inbound/outbound SMS lands here so the
    simulator UI can render a phone-style conversation."""
    __tablename__ = "sms_messages"
    id = Column(Integer, primary_key=True)
    phone = Column(String(20), nullable=False, index=True)
    direction = Column(String(8), nullable=False)  # IN | OUT
    body = Column(Text, nullable=False)
    session_state = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class SmsSession(Base):
    """Per-phone state machine for the SMS bot."""
    __tablename__ = "sms_sessions"
    id = Column(Integer, primary_key=True)
    phone = Column(String(20), unique=True, nullable=False, index=True)
    state = Column(String(40), default="IDLE")
    context = Column(JSON, default=dict)
    language = Column(String(8), default="en")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class OfflineQueueItem(Base):
    """Stub for offline-queued PWA submissions — recorded server-side once they sync."""
    __tablename__ = "offline_queue"
    id = Column(Integer, primary_key=True)
    phone = Column(String(20), nullable=False)
    payload = Column(JSON, nullable=False)
    captured_at = Column(DateTime, nullable=False)
    synced_at = Column(DateTime, default=datetime.utcnow)
    batch_id = Column(Integer, ForeignKey("batches.id"), nullable=True)


# ──────────────────────────────────────────────────────────────────────
# UPSTREAM STAGES — household → municipal collector → ragpicker
# These exist so we can track waste end-to-end (brief: "across all stages").
# ──────────────────────────────────────────────────────────────────────

class AggregationPoint(Base):
    """Where municipal/door-to-door collectors dump and ragpickers sort.
    Examples: 'Pumpwell transfer station', 'Bunder collection point'.
    """
    __tablename__ = "aggregation_points"
    id = Column(Integer, primary_key=True)
    name = Column(String(160), nullable=False)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    area = Column(String(120), nullable=True)
    capacity_tonnes = Column(Float, default=10.0)


class CollectionRoute(Base):
    """A single door-to-door / truck route run by a collector.
    Carries GPS metadata: start, end, total estimated tonnage at dump.
    """
    __tablename__ = "collection_routes"
    id = Column(Integer, primary_key=True)
    route_code = Column(String(20), unique=True, nullable=False, index=True)
    collector_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)
    start_lat = Column(Float, nullable=True)
    start_lon = Column(Float, nullable=True)
    end_lat = Column(Float, nullable=True)
    end_lon = Column(Float, nullable=True)
    dump_aggregation_point_id = Column(Integer, ForeignKey("aggregation_points.id"), nullable=True)
    total_estimated_weight_kg = Column(Float, nullable=True)
    pickup_count = Column(Integer, default=0)
    status = Column(String(20), default="IN_PROGRESS")  # IN_PROGRESS | COMPLETED
    ward = Column(String(60), nullable=True)
    notes = Column(Text, nullable=True)
    record_hash = Column(String(64), nullable=False)
    previous_hash = Column(String(64), nullable=False)


class GpsPing(Base):
    """Continuous GPS stream from a collector's phone while a route is
    IN_PROGRESS. We get a ping ~every 30s. The actual truck path is the
    sequence of pings between the route's start and end."""
    __tablename__ = "gps_pings"
    id = Column(Integer, primary_key=True)
    route_id = Column(Integer, ForeignKey("collection_routes.id"), nullable=False, index=True)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    accuracy_m = Column(Float, nullable=True)
    speed_kmh = Column(Float, nullable=True)
    recorded_at = Column(DateTime, default=datetime.utcnow, index=True)


class PickupEvent(Base):
    """A single house / spot pickup during a route. GPS is captured at the
    moment the collector taps 'log pickup'. Optional weight estimate and
    optional photo URL (we skip the photo per UX constraints, but the field
    exists for production)."""
    __tablename__ = "pickup_events"
    id = Column(Integer, primary_key=True)
    route_id = Column(Integer, ForeignKey("collection_routes.id"), nullable=False)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    captured_at = Column(DateTime, default=datetime.utcnow, index=True)
    estimated_weight_kg = Column(Float, nullable=True)
    photo_url = Column(String(500), nullable=True)
    house_tag = Column(String(160), nullable=True)
    record_hash = Column(String(64), nullable=False)
    previous_hash = Column(String(64), nullable=False)


class RagpickerRecovery(Base):
    """A ragpicker's sack of sorted recoverable material.

    Sourced either from an aggregation pile (after municipal trucks dump) or
    door-to-door directly from households. When the ragpicker sells to a
    kabadiwala, the kabadiwala scans a QR receipt slip and the recovery row
    gets a `sold_to_kabadiwala_id` + final price.

    A ragpicker does not need a phone — they're identified by an issued QR
    booklet (we represent that as their phone field, value 'RP-xxxx')."""
    __tablename__ = "ragpicker_recoveries"
    id = Column(Integer, primary_key=True)
    recovery_code = Column(String(20), unique=True, nullable=False, index=True)
    ragpicker_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    aggregation_point_id = Column(Integer, ForeignKey("aggregation_points.id"), nullable=True)
    door_to_door = Column(Boolean, default=False)
    material_type = Column(String(40), nullable=False)
    weight_kg = Column(Float, nullable=False)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    captured_at = Column(DateTime, default=datetime.utcnow, index=True)
    sold_to_kabadiwala_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    sold_at = Column(DateTime, nullable=True)
    sold_price_inr = Column(Float, nullable=True)
    batch_id = Column(Integer, ForeignKey("batches.id"), nullable=True)
    record_hash = Column(String(64), nullable=False)
    previous_hash = Column(String(64), nullable=False)
