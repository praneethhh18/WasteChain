# WasteChain

**Traceable waste flow network for India's informal recycling economy.**

WasteChain is the data layer that sits on top of the chain that already moves recyclable waste through India every day:

```
Household → Municipal collector → Ragpicker → Kabadiwala → Recycler
```

Today this chain works physically but is data-blind. WasteChain tracks every event in the chain, hashes them into a tamper-evident ledger, matches recoverable material against live recycler demand, and gives the municipality real-time recovery analytics — without requiring any new behaviour from households or ragpickers.

Built for **Hackathon Grevoro**.

> **Note on demo data.** The pre-seeded deployment uses **fictional placeholder names** ("[Demo] Kabadiwala A1", "[Demo] PET Recycler", "Harithpur" demo city, etc.) and does not represent any real person, business, or municipality. The platform is multi-tenant by design — real city corporations, panchayats, recyclers, or NGOs register their own deployment via the `/setup` flow.

---

## The five stages, mapped to the system

| Stage | Real-world actor | How they enter the data layer |
|---|---|---|
| 1. Household | Resident throws bottle in bin | No tracking at the item level — too cheap to RFID |
| 2. Municipal collector | Truck driver or door-to-door worker | **Collector PWA** — `▶ Start route` → GPS-logs each house pickup → `End route` at an aggregation point |
| 3. Ragpicker | Informal worker sorting at the aggregation point | **QR receipt slip** — kabadiwala scans a slip and hands the paper to the ragpicker, no phone needed |
| 4. Kabadiwala | Neighbourhood scrap shop | **QR sticker on the sack** — becomes the batch ID for the rest of the journey. Or SMS for kabadiwalas who prefer a number-only flow |
| 5. Recycler | Factory / small-scale industry | **Scans QR on arrival**, dual-weight confirmation, chain completes |

Every event hashes into a single global SHA-256 chain. Any retroactive mutation flags every downstream record. Walk a batch upstream and you can prove it back to the houses it was picked up from.

---

## What's in the box

| Component | What it does |
|---|---|
| **Collector PWA** | Tap-to-log GPS pickups during a route. Big touch buttons, works offline, GPS via `navigator.geolocation`. Survives page reload mid-route. |
| **Ragpicker kiosk view** | Anonymous-by-default. Identified by a QR booklet ID, not a phone number. Shows every recovery + earnings + a printable QR slip for each. |
| **SMS bot** with numbered menus | 30-second batch logging on any ₹800 feature phone, in EN/HI/KN. Same endpoint a real Twilio/MSG91 webhook calls. |
| **Hash chain trust layer** | SHA-256 chains every batch, handoff, route, pickup, and recovery inside Postgres/SQLite. Tamper one row → every downstream record flags red. Live tamper-and-restore demo on stage. |
| **Provenance walker** | Pick any batch → trace it back through the ragpicker who recovered it, the aggregation point, the truck route, and every individual house pickup. The full 5-stage chain on one screen. |
| **Matching engine** | Scores open batches against live recycler bids on material, distance, price and reputation. Surfaces "₹X uplift vs your usual price". |
| **Dual confirmation + discrepancy detection** | Sender and receiver weights cross-checked. >5% variance flags both parties, docks reputation, deprioritises in matching. |
| **6 dashboards** | Collector / Ragpicker / Kabadiwala / Aggregator / Recycler / Municipality. Each with a demo region live map. |

---

## Why these specific choices?

- **QR sticker over phone number.** Brief explicitly suggests QR codes ("e.g., batch IDs, QR codes, weight-based logs") and asks "how will data be captured at each stage under low-tech constraints?". A pre-printed sticker roll costs ~₹0.20/sticker, bulk-distributed by NGOs/recyclers/municipalities to kabadiwalas — nobody buys a printer.
- **GPS at the truck, not at the house.** A bottle in a dustbin has no identity worth tracking. The collector's route + per-house pickup events are the first data points worth recording. After dump, ragpickers do the sorting and material becomes a discrete batch.
- **No personal info from kabadiwalas or ragpickers.** Anonymous-by-default. A kabadiwala's identity = the sticker roll they were issued. A ragpicker's identity = their QR booklet number. Privacy is structural, not a checkbox.
- **Hash chain inside Postgres, not blockchain.** Same tamper-evidence property, zero gas, runs on a free Railway/Render tier, auditable in 60 seconds on stage.
- **SMS is optional, not required.** Kabadiwalas who *want* notifications can opt in. The system works without it.

---

## Quick start

You need Python 3.10+ and Node 18+.

```powershell
scripts/start-backend.ps1     # http://127.0.0.1:8765
scripts/start-frontend.ps1    # http://127.0.0.1:5173
scripts/seed.ps1              # reseed any time
```

DB seeds with demo region data: 8 kabadiwalas, 4 collectors, 8 ragpickers, 3 aggregators, 4 recyclers, 4 aggregation points, 23 routes, 142 pickups, 72 recoveries, 55 batches, 60 handoffs — all chained into a single 352-record SHA-256 ledger.

---

## The 90-second demo

See [docs/DEMO.md](docs/DEMO.md) for the exact script. Headline flow:

**0:00–0:25 — Stage 2 (Collector PWA):** Switch to "[demo driver] (truck driver)". Tap *▶ Start route*. Tap *📍 Log pickup here* three times — each capturing real browser GPS. End route at "demo transfer station Transfer Station" with 60kg total. GPS pins appear on the map; chain hashes update live.

**0:25–0:40 — Stage 3 (Ragpicker):** Switch to "[demo ragpicker] (RP-002)". Show her recovery history — paper QR receipts she keeps in her pocket, no phone needed. Each receipt shows weight, price paid, hash, all immutable.

**0:40–1:00 — Stage 4 (Kabadiwala over SMS):** Switch to "[demo kabadiwala]". Open SMS Simulator. Text `HI → 1 → 1 → 42 → 1`. Bot replies in Kannada with batch code + ₹336 uplift vs usual price.

**1:00–1:15 — Stages 4→5 (Handoffs):** Accept the top match. Confirm receipt as aggregator (with 10% short to trigger discrepancy flag). Confirm as recycler. Chain complete.

**1:15–1:30 — Provenance + Trust:** Open `/provenance` → pick any batch → see all 5 stages: pickup → route → aggregation point → recovery → batch → handoffs, every hash listed. Then on Trust Layer: tamper one batch → 119 downstream records cascade red. Hit Restore. All green.

---

## File layout

```
backend/
  app/
    main.py              # FastAPI app
    config.py db.py
    models.py            # ORM (incl. ChainState singleton, AggregationPoint, CollectionRoute, PickupEvent, RagpickerRecovery)
    schemas.py           # Pydantic
    hash_chain.py        # SHA-256 chain across 5 record kinds; verify_chain walks by previous_hash pointers
    seed.py              # the demo deployment seed for all 5 stages
    routers/
      auth.py            # mock phone-based login
      batches.py         # batches + match acceptance
      handoffs.py        # dual-confirmation + discrepancy
      bids.py            # recycler bids
      trust.py           # /trust/chain + /trust/tamper + /trust/restore
      sms.py             # SMS gateway endpoint (same shape as Twilio/MSG91 webhook)
      municipality.py    # analytics (collected vs recovered, diversion %)
      upstream.py        # /collections/route/* + /recoveries + /provenance/batch
    services/
      batches.py matching.py reputation.py sms_bot.py
frontend/
  src/
    pages/               # Landing, Collector, Ragpicker, Kabadiwala, Aggregator, Recycler, Municipality, SmsSimulator, TrustLayer, Provenance
    components/          # Shell, Map (Leaflet), ui primitives
    api.ts               # typed API client
    i18n.ts              # EN/HI/KN bundles
    offlineSync.ts       # localStorage queue drain on `online`
docs/DEMO.md             # judge-facing demo script
scripts/                 # one-line PowerShell launchers
```

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│  React + Vite + Tailwind (port 5173)                                       │
│  Pages: Collector PWA, Ragpicker, Kabadiwala, Aggregator, Recycler,        │
│         Municipality, SMS Simulator, Trust Layer, Provenance               │
└──────────────────────────────┬─────────────────────────────────────────────┘
                               │ JSON
┌──────────────────────────────▼─────────────────────────────────────────────┐
│  FastAPI (port 8765)                                                       │
│  Upstream:   /collections/route/{start,pickup,end}                         │
│              /recoveries (+ /sell)                                         │
│              /aggregation-points                                           │
│              /provenance/batch/{id}                                        │
│  Material:   /batches  /batches/{id}/matches  /batches/{id}/accept-match   │
│  Handoffs:   /handoffs/{initiate,confirm}                                  │
│  Bids:       /bids                                                         │
│  Trust:      /trust/{chain,tamper,restore}                                 │
│  SMS bot:    /sms/inbound (Twilio/MSG91-shaped webhook)                    │
│  Analytics:  /municipality/stats                                           │
└──────────────────────────────┬─────────────────────────────────────────────┘
                               │ SQLAlchemy
┌──────────────────────────────▼─────────────────────────────────────────────┐
│  SQLite (dev) / PostgreSQL (prod)                                          │
│  ChainState singleton tracks current hash chain tip                        │
│  5-record-kind global chain: route → pickup → recovery → batch → handoff   │
└────────────────────────────────────────────────────────────────────────────┘
```

Postgres in production: set `DATABASE_URL=postgres://...` and install `requirements-postgres.txt`.

---

## What the judges will care about

This product was designed against the three explicit judging criteria:

1. **Problem understanding** — every design choice flows from a real-world constraint. SMS over WhatsApp because feature phones. Numbered menus because literacy. QR stickers over apps because no smartphone needed for the originator. Pre-printed rolls distributed by NGOs because no kabadiwala buys a printer. Anonymous-by-default because we don't need to dox informal workers to track waste. Ragpickers get a paper trail without owning any device.
2. **System design + core logic** — single global SHA-256 chain spanning five record kinds. Walks forward by `previous_hash` pointers (not timestamps), so offline-synced and backdated records still chain correctly via the `ChainState` singleton. Matching engine blends four normalised signals with explicit weights. Reputation events are append-only and bounded.
3. **Innovation with practicality** — runs on free-tier infrastructure, requires nothing of ragpickers, plugs into the existing weighing-scale workflow, makes everyone in the chain measurably better off on day one. Brief explicitly says "build system intelligence, not just a marketplace or UI" — we did exactly that.
