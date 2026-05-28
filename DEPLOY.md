# WasteChain — Deployment Guide

Two services, two free tiers. **Total time: ~25-35 minutes** if everything goes smoothly.

```
Frontend (Vite/React)  →  Vercel free tier   →  https://wastechain.vercel.app
                                                        │ HTTPS
                                                        ▼
Backend  (FastAPI)     →  Render free tier   →  https://wastechain-api.onrender.com
                                  │
                                  └──→  Render free Postgres  (auto-provisioned)
```

---

## Step 1 — Deploy the backend (Render)

### 1a. Create a Render account
- Go to https://render.com
- Sign in with your GitHub account (same one that owns the WasteChain repo)
- Authorize Render to read your repos

### 1b. Provision via blueprint
- From the Render dashboard: **New +** → **Blueprint**
- Connect your `WasteChain` repo
- Render detects `render.yaml` automatically
- It creates **two resources**:
  - `wastechain-api` — Python web service
  - `wastechain-db` — Postgres database (free, 90-day expiry)
- Hit **Apply**

### 1c. Wait for the first build (~5-8 min)
- The build does: `pip install -r requirements.txt`
- The start command is: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- On first boot, the app **auto-seeds** the empty Postgres (see `main.py`)

### 1d. Get the URL
- After deploy succeeds, you'll see something like:
  - `https://wastechain-api-abc1.onrender.com`
- **Save this URL.** You'll need it in Step 2.

### 1e. Verify
- Visit `<your-render-url>/healthz` → should return `{"ok":true}`
- Visit `<your-render-url>/organizations` → should return JSON with 7 orgs

---

## Step 2 — Deploy the frontend (Vercel)

### 2a. Create a Vercel account
- Go to https://vercel.com
- Sign in with your GitHub account

### 2b. Import the project
- Vercel dashboard: **Add New** → **Project**
- Find `WasteChain` in your repo list → **Import**
- **Root Directory**: click "Edit" and set it to `frontend`
- **Framework**: Vercel auto-detects Vite ✓
- **Build Command**: `npm run build` (auto-filled)
- **Output Directory**: `dist` (auto-filled)

### 2c. Set the API URL env var
- Before clicking Deploy, expand **Environment Variables**
- Add a new variable:
  - **Name**: `VITE_API_BASE`
  - **Value**: your Render URL from Step 1d (e.g. `https://wastechain-api-abc1.onrender.com`)
  - **No trailing slash.**
- Click **Deploy**

### 2d. Wait for deploy (~2-3 min)
- Vercel builds and gives you a URL like `https://wastechain-xyz.vercel.app`
- **Save this URL.** This is your live demo.

---

## Step 3 — Allow the Vercel URL in backend CORS

The backend is configured to accept any origin (`*`) by default, but for safety let's restrict.

### 3a. In Render dashboard
- Open `wastechain-api` → **Environment**
- Edit `CORS_ORIGINS` env var:
  - Value: your Vercel URL (e.g. `https://wastechain-xyz.vercel.app`)
- Click **Save Changes** — Render auto-redeploys (~1-2 min)

---

## Step 4 — Smoke-test the live demo

1. Open your Vercel URL: `https://wastechain-xyz.vercel.app`
2. Landing page should load with hero + role grid + live stats strip
3. Click **🏛️ Municipality** in the role grid → should sign you in and drop on the Municipality dashboard with all the carbon impact data
4. Click **🛰️ Live network** in the nav → live map should render with 7 deployments + markers
5. Click **⚠ Risk patterns** in the nav → 7 anomaly findings should appear
6. Click **🌊 Material flows** in the nav → Sankey diagram should render

If all 6 steps work → **you're live. Paste the Vercel URL in your Devpost "Try it out" field.**

---

## Known limitations of the free tier

### ⚠ Cold start lag (Render free)
Render's free tier spins down web services after 15 min of inactivity. The first request after idle takes **~30-50 seconds** to wake up. This is annoying for judges.

**Mitigation**: Before your demo / right before submitting Devpost link, hit `<your-render-url>/healthz` once to wake the backend. Then it stays warm for 15 min.

You can also use a free uptime monitor like https://uptimerobot.com to ping `/healthz` every 5 minutes — keeps the free tier always warm. **Optional, ~5 min to set up.**

### ⚠ Postgres free tier expires after 90 days
Render's free Postgres expires after 90 days. After the hackathon you'd need to upgrade (~$7/mo) or migrate. For the hackathon demo, plenty of headroom.

### ⚠ HTTPS-only features (QR scanner, GPS, camera)
Both Vercel and Render serve HTTPS by default, so the camera-based QR scanner, GPS streaming, and photo capture all work in production. ✓

---

## Troubleshooting

### Backend deploy fails
- Check the Render build log for the failing step
- Common cause: `psycopg2-binary` failing to install → upgrade Python version to 3.11 in `render.yaml`

### Frontend deploys but APIs return CORS errors
- Verify `CORS_ORIGINS` on Render matches the Vercel URL exactly (no trailing slash)
- Or set `CORS_ORIGINS=*` temporarily to confirm it's a CORS issue

### Frontend loads but shows "Loading…" forever
- Check browser DevTools Network tab — what URL is the frontend calling?
- If it's calling `localhost`, the `VITE_API_BASE` env var didn't get picked up → re-deploy from Vercel
- If it's calling the right URL but 503'ing → backend is cold-starting, wait 30s

### Live map blank
- Check console for Leaflet errors
- OSM tile loading sometimes needs HTTPS — confirmed working on both Vercel and Render

---

## Updating after the first deploy

Both Vercel and Render watch the `main` branch. Push to `main` → both auto-redeploy.

```powershell
git add . ; git commit -m "<simple message>" ; git push
```

That's it.
