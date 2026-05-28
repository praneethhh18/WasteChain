# WasteChain — 90-second demo script

Total runtime: **~90 seconds**. The script below walks through the **full 5-stage chain**: from a municipal truck logging house pickups all the way to a recycler confirming receipt — and finally tampering with the chain to show audit integrity.

## Setup (before judges sit down)

```powershell
scripts/start-backend.ps1     # leave running
scripts/start-frontend.ps1    # leave running
scripts/seed.ps1              # clean state — recommended
```

Open three browser tabs to **`http://127.0.0.1:5173`**:

- **Tab A**: `/collector`
- **Tab B**: `/provenance`
- **Tab C**: `/municipality`

Make sure your browser will share location (Chrome prompts the first time GPS is requested).

---

## The script

### 0:00 — Pitch (~8 sec)

> "India already moves recyclable waste through this chain every day: household, municipal truck, ragpicker, kabadiwala, recycler. Five stages. The chain physically works — it just leaves no data trace. WasteChain is the intelligent layer on top."

Open Tab A.

### 0:08 — Stage 2 — Collector PWA (~22 sec)

Top-right persona pill → **[demo driver] (Truck DEMO-XXX)**. The "Collector PWA · Stage 2" view loads.

> "This is what a truck driver runs on a phone duct-taped to the dashboard. No call centre, no paperwork."

Tap the big green **▶ Start new route** button. Chrome asks for GPS permission — say yes. Route `CR-2026-00XX` starts, status flips to **ON ROUTE**.

Tap **📍 Log pickup here** three times in a row.

> "Each tap captures the phone's GPS at that instant and hashes it into the chain. That's three houses just logged in 6 seconds."

The pickup map fills in with three pins connected by a yellow dashed path. The counter shows **3 pickups**.

Tap **End route & dump at aggregation point** → pick **"a transfer station"** → type **60** (kg) → **Finalize route**. Route closes, chain hash visible.

### 0:30 — Stage 3 — Ragpicker (~12 sec)

Top-right → switch to **[demo ragpicker] (RP-002)**.

> "[demo ragpicker] is a ragpicker. She doesn't have a phone, doesn't have an app. Her identity is a QR booklet number — RP-002. This is the kiosk view she sees when an NGO worker shows up to verify her earnings."

Point at the stats: total kg recovered, total earnings, today's collection. Then the grid of QR receipt cards.

> "Every sack she's ever sold has a paper QR receipt. Click one."

Click any QR card → modal pops up with a big QR + the price she was paid + the on-chain hash.

> "She can prove she was paid this amount for this material. Middlemen can't shave her on price anymore — it's all hashed."

### 0:42 — Stage 4 — Kabadiwala over SMS (~18 sec)

Top-right → switch to **[demo kabadiwala]** (demo area kabadiwala, Kannada speaker).

Click **SMS Simulator** in the nav.

> "[demo kabadiwala] doesn't open an app either. She uses plain SMS. Watch."

Use the quick-reply chips: `HI` → `1` → `1` → type `42` → Send → `1`.

The bot replies in Kannada:

> *"ಲಾಗ್ ಆಯಿತು. ಬ್ಯಾಚ್ WC-2026-00XX. ಹ್ಯಾಶ್ fb7c… **ಅತ್ಯುತ್ತಮ ಖರೀದಿದಾರ: [Demo] PET Recycler — demo area ₹21/kg = ₹882 (+₹336 vs usual)**"*

> "30 seconds. Numbered menus. Works on a ₹800 feature phone with no data plan. And the bot just told her she's about to make ₹336 more than her usual middleman."

### 1:00 — Stages 4→5 — Handoff chain (~15 sec)

Nav → **Kabadiwala**. Her new batch sits at top with the top match highlighted.

Click **Accept** on the top match → status flips to **MATCHED** → click **→ [Demo] Aggregator**.

Switch persona → **[Demo] Aggregator**. Incoming handoff shows 42 kg from [demo kabadiwala] → click **Confirm receipt** → in the modal, type **38** (a 10% short) → Confirm.

The handoff goes **DISPUTED**, weight column flashes red, both parties' reputation dips.

> "5% threshold for natural moisture loss. 10% is genuine cheating — both parties get flagged and their reputation drops. They'll get deprioritised in future matching until they fix it."

Confirm a second batch at full weight to show the happy path.

Switch persona → **[Demo] PET Recycler — demo area** (recycler). Confirm a batch at full weight. Chain complete.

### 1:15 — The wow moment — Provenance trace (~10 sec)

Switch to Tab B. Click any of the recovered-batch cards.

> "Pick any batch. This is the full chain we can prove for it."

Five stages laid out vertically with hashes:
- Stage 1 — Households (X houses picked up)
- Stage 2 — Collector route + driver name + total weight + hash
- Stage 3 — Aggregation point
- Stage 4 — Ragpicker who recovered it + weight + price + hash
- Stage 5 — Kabadiwala who bought it + downstream handoffs

Below it, the geographic trail: pickups → aggregation point → recovery, drawn on the map.

> "From your dustbin to the factory. Every single link auditable."

### 1:25 — Tamper test (~10 sec)

Click **Trust Layer** in the nav.

> "Every record in the chain is hashed with the previous record's hash. So if anyone changes even one byte after the fact, every downstream record diverges."

Find any historical batch → click **Tamper this record**.

The whole chain south of that record flips red. Top stats jump to **Broken links: 100+**.

> "Production deployment would page on-call before anyone could close the audit window. Click restore."

Click **Restore chain**. All green.

### 1:35 — Municipality close (~5 sec)

Switch to Tab C. Live numbers update — collected today, recovered today, diversion %, flagged handoffs. Map shows every batch in the region.

> "The municipality gets all of this from data the truck driver, ragpicker, and kabadiwala generated by doing their normal jobs. No new behaviour required, no new app to learn, no personal info collected. That's WasteChain."

---

## Backup paths if something breaks

- **GPS permission denied** → the PWA falls back to the user's registered location and logs a warning. Demo still works, you just say "in production this would use real GPS".
- **API down** → `scripts/start-backend.ps1` again, then refresh.
- **Database in weird state** → `scripts/seed.ps1` reseeds in 2 seconds.
- **Tamper button leaves the chain dirty** → "Restore chain" button on the Trust page.
- **Wi-Fi cuts out** → everything runs on localhost.
- **Map tiles don't load** → tiles come from OpenStreetMap over the internet. UI still renders cleanly; just acknowledge it.

---

## Demo personas

| Role | Name | Phone / ID | Why use this one |
|---|---|---|---|
| Collector | [demo driver] (Truck DEMO-XXX) | +919900500001 | Default for collector demo — has the cleanest historical routes |
| Ragpicker | [demo ragpicker] (RP-002) | RP-002 | Most sold recoveries — best for kiosk view |
| Kabadiwala | [demo kabadiwala] | +919900100002 | Kannada speaker — shows multilingual SMS bot |
| Kabadiwala (backup) | [demo kabadiwala] | +919900100005 | Hindi speaker |
| Aggregator | [Demo] Aggregator | +919900200002 | Closest to demo area |
| Recycler | [Demo] PET Recycler — demo area | +919900300001 | Highest-paying PET bid |
| Municipality | [Demo] Municipal Corporation | +919900400001 | Read-only analytics |
