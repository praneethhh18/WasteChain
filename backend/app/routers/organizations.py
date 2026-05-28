"""Multi-tenant: organizations register, add team members under themselves.

A real deployment is one org. A city corp signs up, becomes the admin, and
adds collectors / kabadiwalas / aggregators that fall under their
jurisdiction. The demo seed creates one default org (Mangalore Municipal
Corp) so judges land in a working network — but the registration flow
proves the platform is multi-tenant by design.
"""

from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models

router = APIRouter(prefix="/organizations", tags=["organizations"])


VALID_TYPES = {
    # Top-level deployment types
    "city_corp", "town_panchayat", "gram_panchayat", "zilla_parishad",
    "recycler", "aggregator", "ngo",
    # Sub-division types (always have a parent_id)
    "zone", "ward", "taluk_panchayat", "sub_division",
}

# Role each org TYPE auto-creates for its admin user
ADMIN_ROLE_BY_ORG_TYPE = {
    "city_corp": "municipality",
    "town_panchayat": "municipality",
    "gram_panchayat": "municipality",
    "zilla_parishad": "municipality",
    "recycler": "recycler",
    "aggregator": "aggregator",
    "ngo": "municipality",  # NGOs use the read-only municipality dashboard for now
}


class OrgCreate(BaseModel):
    name: str
    type: str
    country: str = "India"
    state: Optional[str] = None
    district: Optional[str] = None
    city_or_village: Optional[str] = None
    admin_name: str
    admin_phone: str


class OrgOut(BaseModel):
    id: int
    name: str
    type: str
    parent_id: Optional[int] = None
    country: str
    state: Optional[str]
    district: Optional[str]
    city_or_village: Optional[str]
    admin_name: Optional[str]
    admin_phone: Optional[str]
    is_demo: bool
    member_count: int = 0
    division_count: int = 0
    created_at: datetime
    class Config:
        from_attributes = True


class DivisionCreate(BaseModel):
    name: str
    type: str = "zone"  # zone | ward | taluk_panchayat | gram_panchayat | sub_division
    admin_name: Optional[str] = None
    admin_phone: Optional[str] = None


@router.post("", response_model=OrgOut)
def create_org(payload: OrgCreate, db: Session = Depends(get_db)):
    if payload.type not in VALID_TYPES:
        raise HTTPException(400, f"Invalid org type. Must be one of: {sorted(VALID_TYPES)}")
    if not payload.admin_phone.strip():
        raise HTTPException(400, "admin_phone required")

    # Reject duplicate admin phone (would conflict with users.phone UNIQUE)
    if db.query(models.User).filter(models.User.phone == payload.admin_phone).first():
        raise HTTPException(400, "This phone is already registered to another user. Use a different one.")

    org = models.Organization(
        name=payload.name.strip(),
        type=payload.type,
        country=payload.country or "India",
        state=payload.state, district=payload.district,
        city_or_village=payload.city_or_village,
        admin_name=payload.admin_name.strip(),
        admin_phone=payload.admin_phone.strip(),
        is_demo=False,
    )
    db.add(org); db.flush()

    # Auto-create the admin user under this org
    admin_role = ADMIN_ROLE_BY_ORG_TYPE.get(payload.type, "municipality")
    admin = models.User(
        phone=payload.admin_phone.strip(),
        name=payload.admin_name.strip(),
        role=admin_role,
        organization_id=org.id,
        area=f"{payload.city_or_village or ''}, {payload.district or ''}".strip(", "),
        language="en", reputation_score=100.0, usual_price_inr={},
    )
    db.add(admin)
    db.commit(); db.refresh(org)
    return _serialize(db, org)


@router.get("", response_model=list[OrgOut])
def list_orgs(top_level_only: bool = True, db: Session = Depends(get_db)):
    """By default returns only top-level deployments (no parent). Pass
    top_level_only=false to get every org including sub-divisions."""
    q = db.query(models.Organization).order_by(
        models.Organization.is_demo.desc(),
        models.Organization.created_at.desc(),
    )
    if top_level_only:
        q = q.filter(models.Organization.parent_id.is_(None))
    return [_serialize(db, o) for o in q.all()]


@router.get("/{org_id}/tree")
def org_tree(org_id: int, db: Session = Depends(get_db)):
    """Returns the full hierarchy tree rooted at this org. Used by the
    Admin Console to render the pyramid view."""
    root = db.query(models.Organization).get(org_id)
    if not root:
        raise HTTPException(404, "Organization not found")

    def build(o: models.Organization) -> dict:
        children = db.query(models.Organization).filter(
            models.Organization.parent_id == o.id
        ).order_by(models.Organization.created_at.asc()).all()
        members = db.query(models.User).filter(
            models.User.organization_id == o.id
        ).count()
        return {
            "id": o.id, "name": o.name, "type": o.type,
            "member_count": members,
            "children": [build(c) for c in children],
        }
    return build(root)


@router.get("/{org_id}/children", response_model=list[OrgOut])
def list_children(org_id: int, db: Session = Depends(get_db)):
    rows = db.query(models.Organization).filter(
        models.Organization.parent_id == org_id
    ).order_by(models.Organization.created_at.desc()).all()
    return [_serialize(db, o) for o in rows]


@router.post("/{org_id}/divisions", response_model=OrgOut)
def create_division(org_id: int, payload: DivisionCreate, db: Session = Depends(get_db)):
    """Add a sub-division under an existing org. The parent's location is
    inherited; the new division can have its own admin or share the parent's.
    """
    parent = db.query(models.Organization).get(org_id)
    if not parent:
        raise HTTPException(404, "Parent organization not found")
    if payload.type not in VALID_TYPES:
        raise HTTPException(400, f"Invalid division type")

    child = models.Organization(
        name=payload.name.strip(), type=payload.type,
        parent_id=parent.id,
        country=parent.country, state=parent.state, district=parent.district,
        city_or_village=parent.city_or_village,
        admin_name=payload.admin_name or parent.admin_name,
        admin_phone=payload.admin_phone or parent.admin_phone,
        is_demo=parent.is_demo,
    )
    db.add(child); db.commit(); db.refresh(child)
    return _serialize(db, child)


@router.get("/{org_id}", response_model=OrgOut)
def get_org(org_id: int, db: Session = Depends(get_db)):
    o = db.query(models.Organization).get(org_id)
    if not o:
        raise HTTPException(404, "Organization not found")
    return _serialize(db, o)


@router.get("/{org_id}/users")
def list_org_users(org_id: int, db: Session = Depends(get_db)):
    return [
        {"id": u.id, "name": u.name, "role": u.role, "phone": u.phone, "area": u.area}
        for u in db.query(models.User).filter(
            models.User.organization_id == org_id
        ).order_by(models.User.role, models.User.name).all()
    ]


class MemberCreate(BaseModel):
    name: str
    role: str  # kabadiwala | aggregator | recycler | collector | ragpicker | municipality
    phone: str
    area: Optional[str] = None
    language: str = "en"


@router.post("/{org_id}/members")
def add_member(org_id: int, payload: MemberCreate, db: Session = Depends(get_db)):
    org = db.query(models.Organization).get(org_id)
    if not org:
        raise HTTPException(404, "Organization not found")
    if db.query(models.User).filter(models.User.phone == payload.phone).first():
        raise HTTPException(400, "This phone is already registered")
    u = models.User(
        phone=payload.phone.strip(), name=payload.name.strip(),
        role=payload.role, organization_id=org.id,
        area=payload.area, language=payload.language,
        reputation_score=100.0, usual_price_inr={},
    )
    db.add(u); db.commit(); db.refresh(u)
    return {"id": u.id, "name": u.name, "role": u.role, "phone": u.phone}


def _serialize(db: Session, o: models.Organization) -> OrgOut:
    count = db.query(models.User).filter(models.User.organization_id == o.id).count()
    div_count = db.query(models.Organization).filter(
        models.Organization.parent_id == o.id
    ).count()
    return OrgOut(
        id=o.id, name=o.name, type=o.type, parent_id=o.parent_id,
        country=o.country,
        state=o.state, district=o.district, city_or_village=o.city_or_village,
        admin_name=o.admin_name, admin_phone=o.admin_phone,
        is_demo=o.is_demo, member_count=count,
        division_count=div_count, created_at=o.created_at,
    )
