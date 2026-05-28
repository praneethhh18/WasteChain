from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel, Field


class UserBase(BaseModel):
    phone: str
    name: str
    role: str
    lat: Optional[float] = None
    lon: Optional[float] = None
    area: Optional[str] = None
    language: str = "en"


class UserOut(UserBase):
    id: int
    reputation_score: float
    usual_price_inr: dict
    organization_id: Optional[int] = None
    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    phone: str


class LoginResponse(BaseModel):
    token: str
    user: UserOut


class BatchCreate(BaseModel):
    creator_phone: str
    material_type: str
    weight_kg: float
    lat: float
    lon: float
    area: Optional[str] = None
    source_channel: str = "pwa"
    captured_at: Optional[datetime] = None  # for offline-queued items
    notes: Optional[str] = None


class BatchOut(BaseModel):
    id: int
    batch_code: str
    creator_id: int
    current_holder_id: Optional[int]
    material_type: str
    weight_kg: float
    lat: float
    lon: float
    area: Optional[str]
    status: str
    source_channel: str
    notes: Optional[str]
    record_hash: str
    previous_hash: str
    tampered: bool
    created_at: datetime
    source_recovery_id: Optional[int] = None
    class Config:
        from_attributes = True


class BidCreate(BaseModel):
    recycler_phone: str
    material_type: str
    quantity_needed_kg: float
    price_per_kg: float
    valid_hours: int = 24
    lat: Optional[float] = None
    lon: Optional[float] = None


class BidOut(BaseModel):
    id: int
    recycler_id: int
    material_type: str
    quantity_needed_kg: float
    price_per_kg: float
    valid_until: datetime
    lat: float
    lon: float
    active: bool
    class Config:
        from_attributes = True


class MatchOut(BaseModel):
    bid_id: int
    recycler_id: int
    recycler_name: str
    recycler_area: Optional[str]
    material_type: str
    price_per_kg: float
    distance_km: float
    score: float
    expected_earnings_inr: float
    usual_earnings_inr: float
    earnings_delta_inr: float
    reputation_score: float


class HandoffInitiate(BaseModel):
    batch_id: int
    sender_phone: str
    receiver_phone: str
    sent_weight: float
    price_per_kg: Optional[float] = None


class HandoffConfirm(BaseModel):
    handoff_id: int
    receiver_phone: str
    received_weight: float
    photo_data_url: Optional[str] = None  # base64 data URL captured at gate


class HandoffOut(BaseModel):
    id: int
    batch_id: int
    sender_id: int
    receiver_id: int
    sent_weight: float
    received_weight: Optional[float]
    price_per_kg: Optional[float]
    status: str
    discrepancy_pct: Optional[float]
    discrepancy_flag: bool
    initiated_at: datetime
    confirmed_at: Optional[datetime]
    record_hash: str
    previous_hash: str
    photo_data_url: Optional[str] = None
    photo_hash: Optional[str] = None
    class Config:
        from_attributes = True


class GpsPingIn(BaseModel):
    route_id: int
    lat: float
    lon: float
    accuracy_m: Optional[float] = None
    speed_kmh: Optional[float] = None


class SmsInbound(BaseModel):
    phone: str
    body: str


class SmsOutbound(BaseModel):
    id: int
    phone: str
    direction: str
    body: str
    created_at: datetime
    class Config:
        from_attributes = True


class TrustRecord(BaseModel):
    kind: str
    id: int
    code: Optional[str] = None
    batch_id: Optional[int] = None
    material: Optional[str] = None
    weight_kg: Optional[float] = None
    sent_weight: Optional[float] = None
    received_weight: Optional[float] = None
    stored_hash: str
    expected_hash: str
    previous_hash: str
    expected_previous_hash: str
    tampered: bool
    ok: bool
    created_at: str


class TamperRequest(BaseModel):
    batch_id: int
    new_weight_kg: float


class MunicipalityStats(BaseModel):
    total_recovered_kg_today: float
    total_recovered_kg_week: float
    total_recovered_kg_month: float
    active_collectors: int
    landfill_diversion_pct: float
    material_breakdown: dict
    daily_series: list
    flagged_handoffs: int
    collected_kg_today: float = 0.0
    collected_kg_week: float = 0.0
    active_routes: int = 0
    carbon: dict = {}


# ─── Upstream (stages 1-3): collector routes, pickups, ragpicker recoveries ─

class RouteStart(BaseModel):
    collector_phone: str
    lat: float
    lon: float
    ward: Optional[str] = None


class RouteEnd(BaseModel):
    route_id: int
    lat: float
    lon: float
    total_estimated_weight_kg: float
    dump_aggregation_point_id: Optional[int] = None


class RouteOut(BaseModel):
    id: int
    route_code: str
    collector_id: int
    started_at: datetime
    ended_at: Optional[datetime]
    start_lat: Optional[float]
    start_lon: Optional[float]
    end_lat: Optional[float]
    end_lon: Optional[float]
    dump_aggregation_point_id: Optional[int]
    total_estimated_weight_kg: Optional[float]
    pickup_count: int
    status: str
    ward: Optional[str]
    record_hash: str
    previous_hash: str
    class Config:
        from_attributes = True


class PickupCreate(BaseModel):
    route_id: int
    lat: float
    lon: float
    estimated_weight_kg: Optional[float] = None
    house_tag: Optional[str] = None
    photo_url: Optional[str] = None


class PickupOut(BaseModel):
    id: int
    route_id: int
    lat: float
    lon: float
    captured_at: datetime
    estimated_weight_kg: Optional[float]
    house_tag: Optional[str]
    photo_url: Optional[str]
    record_hash: str
    previous_hash: str
    class Config:
        from_attributes = True


class AggregationPointOut(BaseModel):
    id: int
    name: str
    lat: float
    lon: float
    area: Optional[str]
    capacity_tonnes: float
    class Config:
        from_attributes = True


class RecoveryCreate(BaseModel):
    ragpicker_phone: str
    material_type: str
    weight_kg: float
    lat: float
    lon: float
    aggregation_point_id: Optional[int] = None
    door_to_door: bool = False
    captured_at: Optional[datetime] = None


class RecoverySell(BaseModel):
    recovery_id: int
    kabadiwala_phone: str
    price_inr: float


class RecoveryOut(BaseModel):
    id: int
    recovery_code: str
    ragpicker_id: int
    aggregation_point_id: Optional[int]
    door_to_door: bool
    material_type: str
    weight_kg: float
    lat: float
    lon: float
    captured_at: datetime
    sold_to_kabadiwala_id: Optional[int]
    sold_at: Optional[datetime]
    sold_price_inr: Optional[float]
    batch_id: Optional[int]
    record_hash: str
    previous_hash: str
    class Config:
        from_attributes = True
