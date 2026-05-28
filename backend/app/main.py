import sys
import traceback

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import Base, engine
from .routers import auth, batches, bids, handoffs, sms, trust, municipality, upstream, inspect, organizations, anomalies
from . import models  # noqa: F401 — register models with metadata

# Force stdout/stderr to be unbuffered so Render captures logs in real time.
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

app = FastAPI(
    title="WasteChain API",
    description="Traceable waste flow network for the informal recycling economy.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)


# ─── Auto-seed on first boot ────────────────────────────────────────────
# When deployed (Render / Railway), the Postgres DB starts empty. Rather
# than ask the user to SSH in and run `python -m app.seed`, we detect an
# empty DB on first startup and seed it automatically. Subsequent boots
# see existing data and skip.
def _maybe_seed_on_first_boot() -> None:
    from .db import SessionLocal
    from .seed import seed as run_seed
    db = SessionLocal()
    try:
        n_orgs = db.query(models.Organization).count()
    finally:
        db.close()
    print(f"[WasteChain] boot — orgs in db: {n_orgs}", flush=True)
    if n_orgs == 0:
        print("[WasteChain] empty database detected — running first-boot seed...", flush=True)
        try:
            run_seed()
            print("[WasteChain] seed complete.", flush=True)
        except Exception as e:
            print(f"[WasteChain] seed failed: {e}", flush=True)
            traceback.print_exc()


_maybe_seed_on_first_boot()

app.include_router(auth.router)
app.include_router(batches.router)
app.include_router(handoffs.router)
app.include_router(bids.router)
app.include_router(sms.router)
app.include_router(trust.router)
app.include_router(municipality.router)
app.include_router(upstream.router)
app.include_router(inspect.router)
app.include_router(organizations.router)
app.include_router(anomalies.router)


@app.get("/")
def root():
    return {"service": "WasteChain", "status": "ok"}


@app.get("/healthz")
def healthz():
    return {"ok": True}


@app.post("/admin/seed")
def admin_seed(token: str):
    """One-shot manual seed trigger. Useful when the auto-seed on first boot
    fails silently or you need to re-seed after a DB reset. Gated by the
    SECRET_KEY env var so random visitors can't wipe the DB.
    """
    if token != settings.secret_key:
        raise HTTPException(403, "Invalid token")
    from .db import SessionLocal
    from .seed import seed as run_seed
    db = SessionLocal()
    try:
        n_orgs_before = db.query(models.Organization).count()
    finally:
        db.close()
    try:
        run_seed()
    except Exception as e:
        return {
            "ok": False,
            "orgs_before": n_orgs_before,
            "error": str(e),
            "traceback": traceback.format_exc(),
        }
    db = SessionLocal()
    try:
        n_orgs_after = db.query(models.Organization).count()
        n_users_after = db.query(models.User).count()
    finally:
        db.close()
    return {
        "ok": True,
        "orgs_before": n_orgs_before,
        "orgs_after": n_orgs_after,
        "users_after": n_users_after,
    }
