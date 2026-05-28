"""Seed the database with a realistic Mangalore/Surathkal/Udupi waste network.

Run: python -m app.seed (from backend/)

Drops and recreates all tables.
"""

import random
from datetime import datetime, timedelta

from .db import Base, engine, SessionLocal
from . import models
from .services.batches import create_batch_record
from .services.matching import rank_matches
from .hash_chain import (
    compute_handoff_hash, latest_chain_hash, advance_chain_tip,
    compute_route_hash, compute_pickup_hash, compute_recovery_hash,
)
from .services.reputation import apply_handoff_outcome

random.seed(42)


# ─── DEMO DATA ────────────────────────────────────────────────────────
# All names below are FICTIONAL PLACEHOLDERS for demo purposes only.
# They do not correspond to any real person, organization, or location.
# The city is a fictional "Harithpur" — coordinates are placed in coastal
# Karnataka so the map renders plausibly, but the data represents nobody
# real. Real deployments register their own organization via /setup.

KABADIWALAS = [
    # (name, phone, lat, lon, area, lang)
    ("[Demo] Kabadiwala A1",  "+919900100001", 12.8703, 74.8420, "Ward A · Town Centre",  "kn"),
    ("[Demo] Kabadiwala A2",  "+919900100002", 12.9141, 74.8560, "Ward B · Coast Side",   "kn"),
    ("[Demo] Kabadiwala B1",  "+919900100003", 12.8650, 74.8750, "Ward C · Harbour",      "en"),
    ("[Demo] Kabadiwala B2",  "+919900100004", 12.8920, 74.8410, "Ward D · East",         "kn"),
    ("[Demo] Kabadiwala C1",  "+919900100005", 12.9716, 74.7997, "Ward E · North",        "hi"),
    ("[Demo] Kabadiwala C2",  "+919900100006", 12.8420, 74.8580, "Ward F · Hill Side",    "kn"),
    ("[Demo] Kabadiwala D1",  "+919900100007", 12.8540, 74.8400, "Ward G · West",         "hi"),
    ("[Demo] Kabadiwala D2",  "+919900100008", 12.9160, 74.8600, "Ward H · Tech Park",    "en"),
]

AGGREGATORS = [
    ("[Demo] Aggregator North",   "+919900200001", 12.8800, 74.8500, "North Hub"),
    ("[Demo] Aggregator Coast",   "+919900200002", 12.9050, 74.8480, "Coast Hub"),
    ("[Demo] Aggregator South",   "+919900200003", 12.8500, 74.8650, "South Hub"),
]

RECYCLERS = [
    # (name, phone, lat, lon, area)
    ("[Demo] PET Recycler",       "+919900300001", 12.9180, 74.8580, "Industrial Zone N"),
    ("[Demo] Paper Mill",         "+919900300002", 12.8430, 74.8750, "Industrial Zone S"),
    ("[Demo] Metal Smelter",      "+919900300003", 12.8900, 74.8400, "Industrial Zone E"),
    ("[Demo] Glass Plant",        "+919900300004", 13.3409, 74.7421, "Industrial Zone N+"),
]

MUNICIPALITY = [
    ("[Demo] City Municipal Corp", "+919900400001", 12.8703, 74.8420, "Harithpur (demo city)"),
]

# Stage 2 — municipal / cooperative collectors (truck drivers + door-to-door workers).
COLLECTORS = [
    ("[Demo] Truck Driver 1 (Vehicle DEMO-001)", "+919900500001", 12.8703, 74.8420, "Ward A · route 1", "kn"),
    ("[Demo] Door-to-Door Worker 1",             "+919900500002", 12.9141, 74.8560, "Ward B · door route", "kn"),
    ("[Demo] Truck Driver 2 (Vehicle DEMO-002)", "+919900500003", 12.8650, 74.8750, "Ward C · route 2", "en"),
    ("[Demo] Door-to-Door Worker 2",             "+919900500004", 12.8920, 74.8410, "Ward D · door route", "hi"),
]

# Stage 3 — ragpickers. They have no app; their "phone" is the QR booklet ID
# we issued them ("RP-001" etc). Reputation tracks them anonymously.
# All names below are placeholders — real deployments register their own.
RAGPICKERS = [
    ("[Demo] Ragpicker RP-001",   "RP-001", 12.8800, 74.8500, "Demo area 1"),
    ("[Demo] Ragpicker RP-002",   "RP-002", 12.9100, 74.8540, "Demo area 2"),
    ("[Demo] Ragpicker RP-003",   "RP-003", 12.8650, 74.8770, "Demo area 3"),
    ("[Demo] Ragpicker RP-004",   "RP-004", 12.8900, 74.8400, "Demo area 4"),
    ("[Demo] Ragpicker RP-005",   "RP-005", 12.8420, 74.8580, "Demo area 5"),
    ("[Demo] Ragpicker RP-006",   "RP-006", 12.8540, 74.8400, "Demo area 6"),
    ("[Demo] Ragpicker RP-007",   "RP-007", 12.9716, 74.7997, "Demo area 7"),
    ("[Demo] Ragpicker RP-008",   "RP-008", 12.8740, 74.8460, "Demo area 8"),
]

# Aggregation points — where municipal trucks dump and ragpickers sort.
AGGREGATION_POINTS = [
    ("[Demo] Transfer Station 1",  12.8755, 74.8505, "Demo area 1"),
    ("[Demo] Transfer Station 2",  12.8650, 74.8750, "Demo area 3"),
    ("[Demo] Transfer Station 3",  12.9180, 74.8580, "Demo area 2"),
    ("[Demo] Transfer Station 4",  12.8920, 74.8410, "Demo area 4"),
]

MATERIALS = ["PET", "PAPER", "CARDBOARD", "METAL", "GLASS"]

# typical "usual price" that kabadiwalas get from local middlemen (low end)
USUAL_PRICE = {"PET": 13, "PAPER": 9, "CARDBOARD": 7, "METAL": 28, "GLASS": 3}

# recycler bids — what they're willing to pay (the price uplift WasteChain unlocks)
RECYCLER_BIDS = [
    # (recycler_idx, material, qty_kg, price_inr)
    (0, "PET",       400, 19),
    (1, "PAPER",     600, 13),
    (1, "CARDBOARD", 800, 10),
    (2, "METAL",     250, 42),
    (3, "GLASS",     500, 5.5),
    (0, "PET",       200, 21),  # premium small-quantity bid
]


def seed():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    # ─── Default demo organization ────────────────────────────────────────
    # Real deployments create their own org via the onboarding flow. Mangalore
    # is the demo tenant — one organization among many that the platform supports.
    demo_org = models.Organization(
        name="[Demo] Harithpur Municipal Corporation",
        type="city_corp",
        country="India", state="(Demo State)",
        district="Demo District", city_or_village="Harithpur (demo city)",
        admin_name="[Demo] Admin",
        admin_phone="+919900400001",
        is_demo=True,
    )
    db.add(demo_org); db.flush()
    demo_org_id = demo_org.id

    # Example sub-divisions — the pyramid INSIDE the deployment.
    # A real city corp has BOTH geographic divisions (zones, wards) AND
    # functional ones (Sanitation Dept, Procurement Office, Waste Mgmt Cell).
    # The Admin Console treats them as sibling nodes — the admin labels each
    # level however makes sense for their jurisdiction.
    GEOGRAPHIC_DIVISIONS = [
        ("[Demo] Zone North", "zone", [
            ("Ward A · Town Centre", "ward"),
            ("Ward B · Coast Side",  "ward"),
        ]),
        ("[Demo] Zone South", "zone", [
            ("Ward C · Harbour", "ward"),
            ("Ward D · East",    "ward"),
        ]),
        ("[Demo] Zone East", "zone", [
            ("Ward E · North",     "ward"),
            ("Ward F · Hill Side", "ward"),
        ]),
    ]
    for zone_name, zone_type, wards in GEOGRAPHIC_DIVISIONS:
        zone = models.Organization(
            name=zone_name, type=zone_type, parent_id=demo_org_id,
            country="India", state="(Demo State)", district="Demo District",
            city_or_village="Harithpur (demo city)",
            admin_name=demo_org.admin_name,
            admin_phone=demo_org.admin_phone, is_demo=True,
        )
        db.add(zone); db.flush()
        for ward_name, ward_type in wards:
            db.add(models.Organization(
                name=ward_name, type=ward_type, parent_id=zone.id,
                country="India", state="(Demo State)", district="Demo District",
                city_or_village="Harithpur (demo city)",
                admin_name=demo_org.admin_name,
                admin_phone=demo_org.admin_phone, is_demo=True,
            ))

    # Functional departments — show that the same Admin Console handles
    # both geographic and functional org structures.
    FUNCTIONAL_DEPTS = [
        "[Demo] Sanitation Department",
        "[Demo] Waste Management Cell",
        "[Demo] Procurement Office",
    ]
    for d in FUNCTIONAL_DEPTS:
        db.add(models.Organization(
            name=d, type="sub_division", parent_id=demo_org_id,
            country="India", state="(Demo State)", district="Demo District",
            city_or_village="Harithpur (demo city)",
            admin_name=demo_org.admin_name,
            admin_phone=demo_org.admin_phone, is_demo=True,
        ))
    db.flush()

    # ─── 6 additional fictional deployments ─────────────────────────────
    # Different org types so judges can compare deployment styles. Each gets
    # its own admin user + small pyramid but no batches/handoffs/routes —
    # they look like fresh deployments waiting for activity. The richer
    # Harithpur deployment above is the one with real chain data.

    EXTRA_DEPLOYMENTS = [
        {
            "name": "[Demo] Pavitra Nagar Town Panchayat",
            "type": "town_panchayat",
            "district": "Demo District B",
            "place": "Pavitra Nagar (demo town)",
            "admin_name": "[Demo] Town Panchayat Secretary",
            "admin_phone": "+919900401001",
            "divisions": [
                ("Ward 1 · Bazaar Road", "ward"),
                ("Ward 2 · Temple Side", "ward"),
                ("Ward 3 · School Road", "ward"),
                ("Ward 4 · Bus Stand", "ward"),
                ("Sanitation Cell", "sub_division"),
            ],
        },
        {
            "name": "[Demo] Doddagrama Gram Panchayat",
            "type": "gram_panchayat",
            "district": "Demo District C",
            "place": "Doddagrama (demo village)",
            "admin_name": "[Demo] GP Secretary",
            "admin_phone": "+919900402001",
            "divisions": [
                ("Hamlet 1 field team", "sub_division"),
                ("Hamlet 2 field team", "sub_division"),
            ],
        },
        {
            "name": "[Demo] Nirmal Zilla Parishad",
            "type": "zilla_parishad",
            "district": "Demo District D",
            "place": "Nirmal (demo district HQ)",
            "admin_name": "[Demo] District Commissioner",
            "admin_phone": "+919900403001",
            "divisions": [
                ("Demo Taluk A", "taluk_panchayat", [
                    ("Taluk A · GP 1", "gram_panchayat"),
                    ("Taluk A · GP 2", "gram_panchayat"),
                ]),
                ("Demo Taluk B", "taluk_panchayat", [
                    ("Taluk B · GP 1", "gram_panchayat"),
                    ("Taluk B · GP 2", "gram_panchayat"),
                ]),
                ("ZP Sanitation Office", "sub_division"),
            ],
        },
        {
            "name": "[Demo] PolyChakra Recyclers Pvt Ltd",
            "type": "recycler",
            "district": "Demo Industrial District",
            "place": "Industrial Estate (demo)",
            "admin_name": "[Demo] Procurement Head",
            "admin_phone": "+919900404001",
            "divisions": [
                ("Procurement Office", "sub_division"),
                ("Quality Control Lab", "sub_division"),
                ("Logistics Team", "sub_division"),
            ],
        },
        {
            "name": "[Demo] Coastal Aggregator Cooperative",
            "type": "aggregator",
            "district": "Demo Coastal District",
            "place": "Coastal Hub (demo)",
            "admin_name": "[Demo] Cooperative Manager",
            "admin_phone": "+919900405001",
            "divisions": [
                ("Hub North", "sub_division"),
                ("Hub South", "sub_division"),
            ],
        },
        {
            "name": "[Demo] Hasiru Mitra Foundation",
            "type": "ngo",
            "district": "Demo District E",
            "place": "Field Office (demo)",
            "admin_name": "[Demo] NGO Field Lead",
            "admin_phone": "+919900406001",
            "divisions": [
                ("Field Area 1", "sub_division"),
                ("Field Area 2", "sub_division"),
                ("Field Area 3", "sub_division"),
                ("Worker Welfare Cell", "sub_division"),
            ],
        },
    ]

    # Role each org TYPE auto-creates for its admin user (keep in sync with
    # backend/app/routers/organizations.py)
    ADMIN_ROLE = {
        "city_corp": "municipality", "town_panchayat": "municipality",
        "gram_panchayat": "municipality", "zilla_parishad": "municipality",
        "ngo": "municipality",
        "recycler": "recycler", "aggregator": "aggregator",
    }

    # NOTE: the actual creation loop is moved to the end of seed() so that
    # the original Harithpur users keep their predictable IDs (1-28) and the
    # bid/match/handoff seed code still references the right recyclers.
    pass

    # Users (all under the Mangalore demo org)
    for name, phone, lat, lon, area, lang in KABADIWALAS:
        db.add(models.User(
            name=name, phone=phone, role="kabadiwala", lat=lat, lon=lon,
            area=area, language=lang, reputation_score=random.uniform(82, 99),
            usual_price_inr={**USUAL_PRICE},
            organization_id=demo_org_id,
        ))
    for name, phone, lat, lon, area in AGGREGATORS:
        db.add(models.User(
            name=name, phone=phone, role="aggregator", lat=lat, lon=lon,
            area=area, language="en", reputation_score=random.uniform(88, 98),
            usual_price_inr={}, organization_id=demo_org_id,
        ))
    for name, phone, lat, lon, area in RECYCLERS:
        db.add(models.User(
            name=name, phone=phone, role="recycler", lat=lat, lon=lon,
            area=area, language="en", reputation_score=random.uniform(90, 99),
            usual_price_inr={}, organization_id=demo_org_id,
        ))
    for name, phone, lat, lon, area in MUNICIPALITY:
        db.add(models.User(
            name=name, phone=phone, role="municipality", lat=lat, lon=lon,
            area=area, language="en", reputation_score=100.0, usual_price_inr={},
            organization_id=demo_org_id,
        ))
    # Collectors (stage 2 — municipal trucks + door-to-door)
    for name, phone, lat, lon, area, lang in COLLECTORS:
        db.add(models.User(
            name=name, phone=phone, role="collector", lat=lat, lon=lon,
            area=area, language=lang, reputation_score=random.uniform(90, 99),
            usual_price_inr={}, organization_id=demo_org_id,
        ))
    # Ragpickers (stage 3 — informal sorters, no real phone needed)
    for name, phone, lat, lon, area in RAGPICKERS:
        db.add(models.User(
            name=name, phone=phone, role="ragpicker", lat=lat, lon=lon,
            area=area, language="kn", reputation_score=random.uniform(75, 95),
            usual_price_inr={}, organization_id=demo_org_id,
        ))
    # Aggregation points (not users — physical locations)
    for name, lat, lon, area in AGGREGATION_POINTS:
        db.add(models.AggregationPoint(
            name=name, lat=lat, lon=lon, area=area, capacity_tonnes=15.0,
        ))
    db.commit()

    kabadiwalas = db.query(models.User).filter(models.User.role == "kabadiwala").all()
    aggregators = db.query(models.User).filter(models.User.role == "aggregator").all()
    recyclers = db.query(models.User).filter(models.User.role == "recycler").all()
    collectors = db.query(models.User).filter(models.User.role == "collector").all()
    ragpickers = db.query(models.User).filter(models.User.role == "ragpicker").all()
    agg_points = db.query(models.AggregationPoint).all()

    # ─── Generate upstream activity over last 14 days ────────────────────
    # Each day: ~2 collection routes, each with 4-8 pickups, dumping at an
    # aggregation point. Then ~3-5 ragpicker recoveries from the dumped piles.
    now = datetime.utcnow()
    recoveries_created: list[models.RagpickerRecovery] = []
    for d in range(14, 0, -1):
        day_start = now - timedelta(days=d)
        # collection routes
        for _ in range(random.randint(1, 2)):
            collector = random.choice(collectors)
            start_ts = day_start + timedelta(hours=random.randint(6, 9), minutes=random.randint(0, 59))
            n_pickups = random.randint(4, 8)
            route_code = f"CR-{now.year}-{(db.query(models.CollectionRoute).count() + 1):04d}"
            prev_h = latest_chain_hash(db)
            rh = compute_route_hash(route_code, collector.id, start_ts, prev_h)
            route = models.CollectionRoute(
                route_code=route_code, collector_id=collector.id,
                started_at=start_ts,
                start_lat=collector.lat + random.uniform(-0.003, 0.003),
                start_lon=collector.lon + random.uniform(-0.003, 0.003),
                ward=collector.area, status="IN_PROGRESS",
                previous_hash=prev_h, record_hash=rh,
            )
            db.add(route); db.flush(); advance_chain_tip(db, rh)

            total_weight = 0.0
            for i in range(n_pickups):
                p_ts = start_ts + timedelta(minutes=10 + i * random.randint(5, 12))
                p_lat = collector.lat + random.uniform(-0.012, 0.012)
                p_lon = collector.lon + random.uniform(-0.012, 0.012)
                p_w = round(random.uniform(8, 35), 1)
                total_weight += p_w
                prev_h = latest_chain_hash(db)
                ph = compute_pickup_hash(route.id, p_lat, p_lon, p_ts, p_w, prev_h)
                db.add(models.PickupEvent(
                    route_id=route.id, lat=p_lat, lon=p_lon, captured_at=p_ts,
                    estimated_weight_kg=p_w,
                    house_tag=f"H-{random.randint(100, 999)}",
                    previous_hash=prev_h, record_hash=ph,
                ))
                db.flush(); advance_chain_tip(db, ph)

            # close the route
            end_ts = start_ts + timedelta(hours=random.randint(2, 4))
            dump_ap = random.choice(agg_points)
            route.pickup_count = n_pickups
            route.ended_at = end_ts
            route.end_lat = dump_ap.lat
            route.end_lon = dump_ap.lon
            route.dump_aggregation_point_id = dump_ap.id
            route.total_estimated_weight_kg = round(total_weight, 1)
            route.status = "COMPLETED"
            # Route hash already pinned to start-time identity; end values are
            # metadata and don't affect the chain.
            db.flush()

            # ragpicker recoveries from THIS aggregation point shortly after dump
            for _ in range(random.randint(2, 4)):
                rp = random.choice(ragpickers)
                mat = random.choice(MATERIALS)
                w = round(random.uniform(4, 18), 1)
                r_ts = end_ts + timedelta(minutes=random.randint(15, 180))
                rec_lat = dump_ap.lat + random.uniform(-0.002, 0.002)
                rec_lon = dump_ap.lon + random.uniform(-0.002, 0.002)
                prev_h = latest_chain_hash(db)
                rec_code = f"RR-{now.year}-{(db.query(models.RagpickerRecovery).count() + 1):04d}"
                rh = compute_recovery_hash(rec_code, rp.id, mat, w, rec_lat, rec_lon, r_ts, prev_h)
                rec = models.RagpickerRecovery(
                    recovery_code=rec_code, ragpicker_id=rp.id,
                    aggregation_point_id=dump_ap.id,
                    door_to_door=False,
                    material_type=mat, weight_kg=w,
                    lat=rec_lat, lon=rec_lon, captured_at=r_ts,
                    previous_hash=prev_h, record_hash=rh,
                )
                db.add(rec); db.flush(); advance_chain_tip(db, rh)
                recoveries_created.append(rec)
    db.commit()

    # Recycler bids — active for next 24h
    valid_until = datetime.utcnow() + timedelta(hours=24)
    for ridx, material, qty, price in RECYCLER_BIDS:
        r = recyclers[ridx]
        db.add(models.RecyclerBid(
            recycler_id=r.id, material_type=material,
            quantity_needed_kg=qty, price_per_kg=price,
            valid_until=valid_until, lat=r.lat, lon=r.lon, active=True,
        ))
    db.commit()

    # Historical batches over last 14 days — random kabadiwala/material/weight.
    # ~60% of batches now have an upstream recovery linked (the ragpicker QR
    # path); the rest are kabadiwala-direct purchases (offices, shops calling
    # the kabadiwala — third entry path in the brief).
    batches_created = []
    unsold = [r for r in recoveries_created if r.batch_id is None]
    random.shuffle(unsold)

    for d in range(14, 0, -1):
        day_start = now - timedelta(days=d)
        # 3-5 batches per day
        for _ in range(random.randint(3, 5)):
            k = random.choice(kabadiwalas)
            link_recovery = None
            if unsold and random.random() < 0.6:
                # find a recovery from a nearby aggregation point in same day
                same_day_recovs = [r for r in unsold
                                   if abs((r.captured_at - day_start).total_seconds()) < 36 * 3600]
                if same_day_recovs:
                    link_recovery = same_day_recovs[0]
                    unsold.remove(link_recovery)
            if link_recovery:
                mat = link_recovery.material_type
                wt = link_recovery.weight_kg
                ts = link_recovery.captured_at + timedelta(minutes=random.randint(20, 180))
            else:
                mat = random.choice(MATERIALS)
                wt = round(random.uniform(15, 95), 1)
                ts = day_start + timedelta(hours=random.randint(7, 18), minutes=random.randint(0, 59))
            jitter_lat = k.lat + random.uniform(-0.005, 0.005)
            jitter_lon = k.lon + random.uniform(-0.005, 0.005)
            b = create_batch_record(
                db, creator=k, material=mat, weight=wt,
                lat=jitter_lat, lon=jitter_lon, area=k.area,
                source_channel="qr-recovery" if link_recovery else random.choice(["sms", "pwa", "direct"]),
                captured_at=ts,
            )
            if link_recovery:
                b.source_recovery_id = link_recovery.id
                link_recovery.batch_id = b.id
                link_recovery.sold_to_kabadiwala_id = k.id
                link_recovery.sold_at = ts
                # ragpicker gets paid usual_price * 0.85 (kabadiwala margin)
                usual = (k.usual_price_inr or {}).get(mat, 10)
                link_recovery.sold_price_inr = round(usual * 0.85 * wt, 2)
            batches_created.append(b)
    db.commit()

    # Simulate handoffs for ~70% of historical batches: kabadiwala -> aggregator -> recycler
    for b in batches_created:
        if random.random() > 0.7:
            continue
        # First leg: kabadiwala -> aggregator (nearest)
        sender = db.query(models.User).get(b.creator_id)
        agg = min(aggregators, key=lambda a: (a.lat - b.lat) ** 2 + (a.lon - b.lon) ** 2)
        _do_handoff(db, b, sender, agg, dispute_chance=0.05)

        if b.status != "DISPUTED" and random.random() < 0.8:
            # Second leg: aggregator -> recycler that wants this material
            matching_recs = [r for r in recyclers
                             if any(bid.material_type == b.material_type
                                    for bid in db.query(models.RecyclerBid).filter_by(recycler_id=r.id).all())]
            if matching_recs:
                rec = min(matching_recs, key=lambda r: (r.lat - b.lat) ** 2 + (r.lon - b.lon) ** 2)
                _do_handoff(db, b, agg, rec, dispute_chance=0.03)
                if b.status != "DISPUTED":
                    b.status = "DELIVERED"
                    b.current_holder_id = rec.id
    db.commit()

    # For ~5 of the latest AVAILABLE batches, compute & store matches so
    # the kabadiwala dashboard isn't empty.
    available = (
        db.query(models.Batch).filter(models.Batch.status == "AVAILABLE")
        .order_by(models.Batch.created_at.desc()).limit(8).all()
    )
    for b in available:
        matches = rank_matches(db, b, limit=3)
        for m in matches[:1]:  # only persist the top recommendation
            db.add(models.Match(
                batch_id=b.id, bid_id=m["bid_id"], score=m["score"],
                distance_km=m["distance_km"],
                expected_earnings_inr=m["expected_earnings_inr"],
                usual_earnings_inr=m["usual_earnings_inr"],
                accepted=False,
            ))
    db.commit()

    # ─── EXTRA DEMO DEPLOYMENTS ────────────────────────────────────────
    # Now (with all original Harithpur users + chain in place) create the
    # 6 additional demo deployments so judges can browse a real range of
    # org types. Each has its own admin user but no batches/handoffs —
    # they look like fresh-signup deployments waiting for activity.

    for d in EXTRA_DEPLOYMENTS:
        org = models.Organization(
            name=d["name"], type=d["type"],
            country="India", state="(Demo State)", district=d["district"],
            city_or_village=d["place"],
            admin_name=d["admin_name"], admin_phone=d["admin_phone"],
            is_demo=True,
        )
        db.add(org); db.flush()

        # Admin user for this org so it has 1 member from the start.
        # Give a sensible default lat/lon (varies by deployment so the maps
        # don't all stack at the same point) so role dashboards that render
        # a map don't crash on Leaflet's NaN center.
        admin_lat = 12.87 + random.uniform(-0.5, 0.5)
        admin_lon = 74.85 + random.uniform(-0.5, 0.5)
        db.add(models.User(
            name=d["admin_name"], phone=d["admin_phone"],
            role=ADMIN_ROLE.get(d["type"], "municipality"),
            organization_id=org.id,
            area=d["place"], language="en",
            lat=admin_lat, lon=admin_lon,
            reputation_score=100.0, usual_price_inr={},
        ))

        for spec in d["divisions"]:
            if len(spec) == 2:
                name, dtype = spec; child_specs = []
            else:
                name, dtype, child_specs = spec
            sub = models.Organization(
                name=name, type=dtype, parent_id=org.id,
                country="India", state="(Demo State)", district=d["district"],
                city_or_village=d["place"],
                admin_name=d["admin_name"], admin_phone=d["admin_phone"],
                is_demo=True,
            )
            db.add(sub); db.flush()
            for cs in child_specs:
                cname, ctype = cs
                db.add(models.Organization(
                    name=cname, type=ctype, parent_id=sub.id,
                    country="India", state="(Demo State)", district=d["district"],
                    city_or_village=d["place"],
                    admin_name=d["admin_name"], admin_phone=d["admin_phone"],
                    is_demo=True,
                ))
    db.commit()

    print(f"Seeded demo deployment '[Demo] Harithpur Municipal Corporation' with "
          f"{len(kabadiwalas)} kabadiwalas, {len(aggregators)} aggregators, "
          f"{len(recyclers)} recyclers, {len(batches_created)} batches. "
          f"Plus {len(EXTRA_DEPLOYMENTS)} additional empty demo deployments. "
          f"All names are placeholders — real deployments register their own.")
    db.close()


def _do_handoff(db, batch, sender, receiver, dispute_chance: float):
    now = datetime.utcnow()
    sent = batch.weight_kg
    if random.random() < dispute_chance:
        # introduce a real discrepancy
        received = round(sent * random.uniform(0.5, 0.85), 1)
    else:
        received = round(sent * random.uniform(0.97, 1.0), 1)

    # In seed we know both weights upfront, so we hash with the final values
    # in one shot (no placeholder + rehash cycle that would orphan the chain).
    prev = latest_chain_hash(db)
    h_hash = compute_handoff_hash(batch.id, sender.id, receiver.id, sent, received, now, prev)
    diff = abs(sent - received)
    pct = (diff / sent * 100.0) if sent else 0.0
    flagged = pct > 5.0
    status = "DISPUTED" if flagged else "CONFIRMED"
    h = models.Handoff(
        batch_id=batch.id, sender_id=sender.id, receiver_id=receiver.id,
        sent_weight=sent, received_weight=received,
        initiated_at=now,
        confirmed_at=now + timedelta(minutes=random.randint(20, 180)),
        discrepancy_pct=pct, discrepancy_flag=flagged, status=status,
        previous_hash=prev, record_hash=h_hash,
    )
    db.add(h); db.flush(); advance_chain_tip(db, h_hash)

    batch.current_holder_id = receiver.id
    if status == "DISPUTED":
        batch.status = "DISPUTED"
    apply_handoff_outcome(db, sender, receiver, pct)


if __name__ == "__main__":
    seed()
