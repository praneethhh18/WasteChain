# WasteChain
### A traceable, tamper-evident data layer for India's informal recycling economy.

**Hackathon Grevoro · Problem Statement 2 · 2026**

> **Demo data disclaimer.** Every name in the pre-seeded data — `[Demo] Kabadiwala A1`, `[Demo] PET Recycler`, `Harithpur` (fictional city), etc. — is a **placeholder**. No real person, business, or municipality is represented. The platform is multi-tenant by design — any real city corporation, panchayat, recycler, or NGO registers their own deployment via the `/setup` flow.

---

## 1 · Project Title & Description

### Title
**WasteChain — A Traceable Waste Flow Network for India**

### The problem (one paragraph)
India already moves **~₹4,200 crore of recyclable waste** every year through a real, working 5-stage chain: **Household → Municipal truck → Ragpicker → Kabadiwala → Recycler**. The chain physically functions but is data-blind. Nobody knows *what* moved, *who* handled it, *what it weighed*, or *where it went*. High-value material is lost, industries can't find supply, informal workers stay disconnected from formal demand systems, and municipalities have zero recovery data to plan around.

### The solution (one paragraph)
**WasteChain** is the intelligent data layer that sits on top of the chain that already exists. Every event — a truck route, a house pickup, a ragpicker's sack, a kabadiwala's batch, a downstream handoff — is recorded and SHA-256 chained inside Postgres into a tamper-evident ledger. The platform is **multi-tenant**: each deployment (a city corporation, a gram panchayat, a private recycler, an NGO) has its own internal pyramid of zones / wards / departments. **Photos at handoffs are cryptographically bound to the chain.** A standalone **anomaly engine** detects re-bagging, weight-shaving, and reputation-farming patterns no one else in this space publishes. The aggregator is the realistic active user — ragpickers never touch a screen and kabadiwalas just receive WhatsApp / SMS notifications.

---

## 2 · How to explore the prototype (no video — just click)

The app is designed so a first-time visitor with **zero context** can understand it by clicking through. Every page has a clear self-explanatory header.

### The 90-second path

1. **Open `http://127.0.0.1:5173/`** — the landing page opens.
2. **Read the hero** — the problem statement is the first thing you see.
3. **Scroll down to "Walk in their shoes"** — a 6-card grid, one card per actor in the chain.
4. **Click any role card** — you're instantly signed in as a pre-seeded user in that role and dropped on their dashboard. No password. No setup.
5. **Click the WasteChain logo top-left** at any time to return to landing.
6. **For cross-cutting tools** (workflow walkthrough, risk patterns, material flows, hash-chain audit), click the floating **🎭 Demo controls** button bottom-right.

### What each page tells you

Every page has an **eyebrow** (small uppercase label) + **display heading** + **descriptive paragraph** at the top that explains what you're looking at. Sample:

- **Collector PWA**: *"Stage 2 · Collector — Truck drivers don't tap their phone 40 times a day. Once they tap ▶ Start route, GPS streams automatically."*
- **Trust Layer**: *"SHA-256 ledger inside Postgres — Every event in WasteChain is hashed with its predecessor."*
- **Risk Patterns**: *"Chain anomaly engine — The chain defends its own truth. Five detectors look for re-bagging, weight-shaving, impossible timing, density violations, and reputation farming."*
- **Material Flow Sankey**: *"Every kilo, end to end. Width = kg moved, color = material."*

No prior context required. No video needed.

---

## 3 · The 7 pre-seeded demo deployments

The platform is multi-tenant. Each deployment is its own tenant with its own pyramid of zones / wards / departments. The seed creates **7 fictional deployments** so a judge can compare deployment styles instantly:

| Type | Deployment | Pyramid |
|---|---|---|
| 🏛️ **City Corporation** | [Demo] Harithpur Municipal Corporation | 3 zones × 2 wards + 3 functional depts (Sanitation, Waste Mgmt Cell, Procurement). **28 team members. Full chain history** (55 batches, 60 handoffs, 142 pickups, 72 recoveries) |
| 🏘️ Town Panchayat | [Demo] Pavitra Nagar Town Panchayat | 4 wards + 1 sanitation cell |
| 🌾 Gram Panchayat | [Demo] Doddagrama Gram Panchayat | 2 hamlet field teams |
| 🏞️ Zilla Parishad | [Demo] Nirmal Zilla Parishad | **3-level nested**: 2 Taluk Panchayats × 2 Gram Panchayats each + 1 ZP Sanitation Office |
| 🏭 Private Recycler | [Demo] PolyChakra Recyclers Pvt Ltd | Procurement Office + QC Lab + Logistics Team |
| 📦 Aggregator Coop | [Demo] Coastal Aggregator Cooperative | Hub North + Hub South |
| 🤝 NGO / Cooperative | [Demo] Hasiru Mitra Foundation | 3 Field Areas + Worker Welfare Cell |

Harithpur is the **rich demo** with full chain data. The other 6 are **fresh empty deployments** — exactly the "Day 1" view a real DC / Panchayat Secretary / Recycler founder would see after signing up.

A real organization registers their own deployment via the **Set up my deployment** wizard (5 steps: type → location → name → admin → confirm), then builds out their pyramid from the Admin Console.

---

## 4 · What makes it different (the defensible bits)

1. **No new behaviour from households or ragpickers.** Brief says *"integrate informal workers without disrupting their existing workflow."* We took it literally — ragpickers carry paper QR receipts, kabadiwalas slap stickers + get WhatsApp notifications, no app on the phones of people not ready for one.
2. **Aggregator is the realistic data entry point.** Truck drivers won't tap their phone 40 times a day. Kabadiwalas won't open apps for free. Aggregators already weigh, already have phones, get direct business value (EPR credits, supply forecasting, faster payments).
3. **Anonymous by default.** A ragpicker's identity = QR booklet ID, not a name or phone. A kabadiwala's identity = the pre-printed sticker roll they were issued. No KYC, no surveillance. **Subpoena-resistant by construction** — a breach exposes "RP-0247 sold 12kg PET" but no person.
4. **Money never touches the chain.** The sticker is purely a tracking identifier. Cash, UPI, bank transfer — they all flow through whatever channels the parties already use. We're not RBI-regulated. We don't need bank accounts from informal workers.
5. **No real blockchain (deliberately).** A SHA-256 chained ledger inside Postgres gives identical tamper-evidence at ₹0/month on a free Railway tier. We articulate the upgrade path (Polygon anchoring → permissioned Hyperledger for multi-city federation) but don't add complexity we don't need yet.

---

## 5 · The four genuinely novel technical wrinkles

After surveying existing Indian waste-tech (Recykal, Saahas, Mr.Green, BinBag, Hasiru Dala Innovations), these don't appear in any public competitor:

### A. Photo bytes hashed INTO the chain `record_hash`
Most products that store photo evidence store the photo *alongside* the chain entry — easy to swap an image later. We compute `SHA-256(photo_bytes)` and **fold that hash into the handoff's `record_hash` computation**. Swap the photo, the hash diverges, the verifier flags it. Subtle but a categorical upgrade in audit guarantee.

### B. Five-pattern chain anomaly engine ⭐ (the headline novelty)
A standalone scanner (`services/anomaly.py`, `/anomalies` endpoint, `/risk` UI) that detects adversarial patterns:

| Pattern | What it catches |
|---|---|
| **REBAG_SUSPICION** | Same material + matching weight (±5%) within 8 hours + 5 km → the same physical sack tracked twice under different QR stickers |
| **WEIGHT_SHAVING** | An actor's average shrinkage > 2σ above the regional baseline across many handoffs |
| **TEMPORAL_INCONSISTENCY** | A recovery logged when no upstream route dumped material there in the prior 24 hours |
| **DENSITY_VIOLATION** | Single-sack weight exceeds the physical ceiling per material (PET > 60kg, paper > 45kg, etc.) |
| **REPUTATION_FARMING** | Two accounts cycle material between each other with no recycler-anchored downstream leg |

Each finding shows severity, evidence record IDs, actors involved, and a one-line suggested action. The current seed surfaces **5 density violations + 2 reputation-farming pairs** immediately — judges see live findings without staging anything.

> *"The hash chain proves no one tampered with the data after it was written. The anomaly engine proves no one is faking the data in the first place. Together: a trust layer that defends its own truth."*

### C. Material Flow Sankey
Full-network river-flow visualization (`/flows`) where every actor is a node, every source→target flow is a curved link sized by total kg moved, colored by material. Click any node to highlight everything flowing through it. Pure tracking visualization — no other waste-tech competitor publishes this view.

### D. Hierarchical multi-tenant pyramid
Each deployment can have unlimited nesting depth. A Zilla Parishad → Taluk Panchayats → Gram Panchayats works. So does a City Corp → Zones → Wards → functional departments. The Admin Console renders the tree, lets you add divisions inside any node, and assign team members at any level. No other waste-tech product handles Indian government hierarchy this faithfully.

---

## 6 · How the system works — the 5-stage chain

```
┌──────────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────────┐    ┌──────────────┐
│ 1. Household │ →  │ 2. Collector │ →  │ 3. Ragpicker│ →  │ 4. Kabadiwala│ →  │ 5. Recycler  │
│              │    │ truck route  │    │ sorts pile  │    │ scrap shop   │    │ factory      │
│ ❌ no data    │    │ GPS streamed │    │ paper QR    │    │ QR sticker   │    │ scan at gate │
└──────────────┘    │ + 1 tap/dump │    │ receipt     │    │ on every sack│    │ + weigh + 📷 │
                    └──────────────┘    └─────────────┘    └──────────────┘    └──────────────┘
                            ↓                   ↓                  ↓                   ↓
                    ╔═══════════════════════════════════════════════════════════════════════╗
                    ║   ONE GLOBAL SHA-256 CHAIN  ·  every event hashed with predecessor   ║
                    ║   tamper one row  →  every downstream link flags red instantly       ║
                    ║   photo bytes hashed INTO each handoff record_hash                    ║
                    ║   anomaly engine continuously scans for re-bagging / weight-shaving  ║
                    ╚═══════════════════════════════════════════════════════════════════════╝
```

- **Stage 1 — Household.** Not tracked at item level. RFID-per-bottle is economically impossible.
- **Stage 2 — Collector.** One big GPS button. Tap *▶ Start route*, GPS streams every 20 seconds, log each house with one tap. End at an aggregation point.
- **Stage 3 — Ragpicker.** Carries a paper booklet of pre-printed QR receipt slips (~₹50 / 100 slips, NGO-funded). The kabadiwala tears off a slip per sale and hands it over. Ragpicker has *anonymous, on-chain proof* of every sale — verifiable at any kiosk by scanning the slip. **No phone needed.**
- **Stage 4 — Kabadiwala.** Slaps a pre-printed QR sticker on every weighed sack. That sticker IS the batch ID. Kabadiwala doesn't open an app — gets a WhatsApp / SMS notification after each downstream sale. The sticker is **just an identifier**; weight + material + price are bound at scan time.
- **Stage 5 — Recycler.** Camera-scans the QR at the factory gate, weighs on industrial scale, **takes a photo (cryptographically bound to the chain)**, presses Confirm. Chain closes.

---

## 7 · Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  React 18 + Vite + Tailwind + Leaflet · port 5173                           │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Public:   Landing (hero + role picker + live-map CTA + 5-stage chain)      │
│  Onboard:  Setup wizard (5 steps) · Admin Console (pyramid + members)       │
│  Role:     Collector PWA · Ragpicker kiosk · Kabadiwala feed · Aggregator   │
│            · Recycler · Municipality                                        │
│  Demo:     Workflow walkthrough (13 steps, real API) · SMS bot simulator    │
│  Audit:    Trust Layer (tamper / restore) · Provenance walker (per batch)   │
│  Analytics:Live Network Map · Risk Patterns · Material Flow Sankey          │
│  Real QR generation + camera scanning · GPS streaming · Photo capture       │
│  EN / Hindi / Kannada i18n · Role-locked nav · Demo Controls panel          │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │ JSON / HTTP
┌────────────────────────────────────▼────────────────────────────────────────┐
│  FastAPI · port 8765                                                        │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Org:        /organizations  /organizations/{id}/{tree,divisions,members}   │
│  Upstream:   /collections/route/{start,pickup,end,ping,path}                │
│              /recoveries (+ /sell) · /aggregation-points                    │
│              /provenance/batch/{id}    ← walks the full upstream chain      │
│  Material:   /batches  /batches/{id}/matches  /batches/{id}/accept-match    │
│  Handoffs:   /handoffs/{initiate,confirm}    (accepts photo evidence)       │
│  Bids:       /bids                                                          │
│  Trust:      /trust/{chain, tamper, restore}                                │
│  Risk:       /anomalies  /flows                                             │
│  SMS bot:    /sms/inbound (Twilio/MSG91-shaped webhook)                     │
│  Inspect:    /inspect    (AI sack quality — production swap to YOLO)        │
│  Analytics:  /municipality/stats  /municipality/carbon  /search  /live      │
│                                                                             │
│  Services: hash_chain · matching · reputation · sms_bot · carbon · anomaly  │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │ SQLAlchemy 2.0
┌────────────────────────────────────▼────────────────────────────────────────┐
│  SQLite (dev, zero-config) / PostgreSQL (prod, DATABASE_URL=postgres://…)   │
│  ChainState singleton: tracks current chain tip                             │
│  Organizations (hierarchical, self-referential parent_id)                   │
│  Users · AggregationPoints · CollectionRoutes · PickupEvents · GpsPings     │
│  RagpickerRecoveries · Batches · Handoffs · RecyclerBids · Matches          │
│  ReputationEvents · SmsMessages · SmsSessions · OfflineQueue                │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8 · Core logic (what's worth reviewing in the codebase)

1. **SHA-256 chain across 5 record kinds**, walked by `previous_hash` pointers (not timestamps — so offline-synced and backdated records still chain correctly). Track tip in `ChainState` singleton.
2. **Matching engine**: `score = 0.55 × price_norm + 0.25 × distance_score + 0.20 × reputation`. Filter on material match. Returns top-N with *expected earnings* + *uplift vs kabadiwala's usual price*.
3. **Dual confirmation + discrepancy detection**: `disc_pct = |sent - received| / sent × 100`. ≤ 5% clean (+0.5 rep). 5–15% minor flag (−3). 15–30% moderate (−8). >30% severe (−15, batch → DISPUTED).
4. **EPR + carbon math** (`services/carbon.py`): real per-material values from CPCB 2023 + PWM Rules 2022 EPR market. PET = 1.5 kg CO₂e + ₹12/kg credit. Metal = 9.1 kg CO₂e + ₹40/kg. Aggregates to city-wide totals + equivalents (tree-years, petrol-km).
5. **Anomaly engine** (`services/anomaly.py`): 5 detectors, each with severity scoring + evidence collection + suggested action.
6. **AI sack quality inspector** (`/inspect`): production-ready endpoint signature with a deterministic mock honestly labeled `"mode": "demo"`. Production swap: fine-tuned YOLO / GPT-4V.
7. **Real QR**: `qrcode` for generation, `html5-qrcode` for camera scanning. Falls back to manual entry if camera permission denied.
8. **Real GPS streaming**: `navigator.geolocation` posts a ping every 20s while a route is `IN_PROGRESS`. Live Network Map renders the polyline in real time.

---

## 9 · Mapped to the brief (5 explicit requirements)

| Brief asks for | We have |
|---|---|
| End-to-end tracking across all stages | SHA-256 chain spans Collector (Stage 2) → Ragpicker (Stage 3) → Kabadiwala (Stage 4) → Recycler (Stage 5). Household (Stage 1) is intentionally not item-tracked. |
| Visibility across stakeholders | 6 role-locked dashboards + Public Provenance walker + Live Network Map for city corp |
| Integrate informal workers without disrupting workflow | Ragpickers carry paper QR receipts (no phone). Kabadiwalas slap stickers + get WhatsApp (no app). Anonymous by default. |
| Improve sorting / routing / reuse efficiency | Matching engine (material × distance × price × reputation) + AI Sack Quality Inspector at the gate |
| Blockchain / distributed ledger for tamper-proof tracking | SHA-256 chained ledger in Postgres with tamper-and-restore demo. Photo bytes hashed into each handoff. Articulated upgrade path to Polygon anchoring → Hyperledger Fabric consortium. |

## 10 · Mapped to the rubric (the scoring criteria)

- **Problem Understanding (20%)**: Anonymous-by-default identity, aggregator-first positioning, multi-tenant org types matching real Indian governance (city corp / town panchayat / gram panchayat / zilla parishad / recycler / NGO), QR-over-apps reasoning, SMS-over-WhatsApp reasoning — every choice flows from an Indian-context constraint.
- **System Design & Core Logic (30%)**: One global SHA-256 chain across 5 record kinds. ChainState singleton for backdated/offline writes. Photo-hash-folded-into-record-hash. Hierarchical multi-tenant tree. Matching engine with explicit weights. 5-pattern anomaly engine. Material Flow Sankey aggregation.
- **Innovation & Creativity (20%)**: 5-pattern anomaly engine + photo hash binding + material flow Sankey are not in any public Indian waste-tech competitor.
- **Practicality & Feasibility (15%)**: Free-tier deployable. NGO-distributed sticker rolls (₹0.20/sticker). Bootstrap order (recyclers first). Provider-agnostic SMS webhook (MSG91 / Gupshup / Exotel). No RBI exposure (money never touches the chain).
- **Implementation & Prototype (15%)**: All features above are *actually working*. Real QR scanning, real GPS streaming, real photo-bound chain, real anomaly detection on seeded data. Not slides.

---

## 11 · Tech stack

**Backend** · Python 3.10+ · FastAPI · SQLAlchemy 2.0 · Pydantic 2.10 · Uvicorn · SQLite (dev) / PostgreSQL (prod)

**Frontend** · React 18 · Vite 5 · TypeScript · Tailwind CSS 3 · react-i18next · Leaflet + OpenStreetMap · Recharts · `qrcode` + `html5-qrcode` · Fraunces (display) + Inter (body) + Noto Sans Devanagari/Kannada

**Auth** · Phone-based (mock OTP for demo; production swap = 1-URL change to MSG91/Gupshup OTP)

**SMS / WhatsApp gateway** · Provider-agnostic JSON webhook. Production swap: MSG91 (SMS, DLT-compliant), Gupshup (WhatsApp Business), Exotel (IVR).

**Hosting target** · Railway / Render free tier (backend) + Vercel / Netlify (static frontend)

---

## 12 · File layout

```
backend/
  app/
    main.py · config.py · db.py
    models.py            # ORM (ChainState, Organization tree, 5 chain record kinds, etc.)
    schemas.py           # Pydantic models
    hash_chain.py        # SHA-256 chain logic + photo-hash binding + chain walker
    seed.py              # Multi-deployment demo seed
    routers/
      organizations.py   # Multi-tenant CRUD + tree + divisions + members
      auth.py            # Mock phone-based login
      batches.py         # Batches + match acceptance
      handoffs.py        # Dual-confirmation + photo-bound chain entry
      bids.py            # Recycler bids
      trust.py           # /chain + /tamper + /restore
      sms.py             # SMS bot (Twilio/MSG91 webhook shape)
      municipality.py    # Analytics + carbon endpoints
      upstream.py        # Routes / pickups / recoveries / provenance / live / search
      anomalies.py       # /anomalies + /flows
      inspect.py         # AI sack quality (mock with honest demo flag)
    services/
      batches.py · matching.py · reputation.py · sms_bot.py
      carbon.py · anomaly.py

frontend/
  src/
    pages/
      Landing.tsx        # Hero + Walk-in-their-shoes role grid + Live-map CTA + 5-stage chain
      Setup.tsx          # 5-step deployment onboarding wizard
      Admin.tsx          # Pyramid tree + team members (with preview-as)
      Collector.tsx      # GPS-button PWA for truck drivers
      Ragpicker.tsx      # Anonymous kiosk for paper QR receipts
      Kabadiwala.tsx     # WhatsApp-style notification feed
      Aggregator.tsx     # Weighbridge + QR scanner + AI inspector + photo capture
      Recycler.tsx       # Live bids + gate QR scanner + photo capture
      Municipality.tsx   # City-wide analytics + carbon impact
      LiveMap.tsx        # Real-time network map with search
      Risk.tsx           # 5-pattern anomaly engine UI
      Flows.tsx          # Material Flow Sankey
      Provenance.tsx     # Per-batch upstream chain walker
      TrustLayer.tsx     # Hash chain visualizer + tamper / restore
      Workflow.tsx       # 13-step guided demo with live data
      SmsSimulator.tsx   # Phone-style SMS bot demo
    components/
      Shell.tsx          # Role-aware nav + floating Demo Controls panel
      Qr.tsx             # Real scannable QR + camera scanner + printable sticker
      PhotoCapture.tsx   # Camera capture + thumbnail viewer
      Inspect.tsx        # AI sack-quality modal
      CarbonImpact.tsx   # Climate impact + EPR credit displays
      EmptyState.tsx     # Day-1 onboarding states
      Map.tsx · ui.tsx
    session.ts           # Current user + freshMode + judgeMode
    api.ts               # Typed API client
    i18n.ts              # EN / Hindi / Kannada

docs/DEMO.md             # Step-by-step demo script (backup if needed)
scripts/                 # PowerShell launchers
```

---

## 13 · How to run

```powershell
# One-time setup
cd backend  ; python -m pip install -r requirements.txt
cd frontend ; npm install

# Every demo
scripts/seed.ps1                # fresh multi-deployment seed (~2 sec)
scripts/start-backend.ps1       # http://127.0.0.1:8765
scripts/start-frontend.ps1      # http://127.0.0.1:5173
```

Open `http://127.0.0.1:5173` and the landing page tells you the rest.
