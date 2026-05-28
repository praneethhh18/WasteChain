from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import Base, engine
from .routers import auth, batches, bids, handoffs, sms, trust, municipality, upstream, inspect, organizations, anomalies
from . import models  # noqa: F401 — register models with metadata

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
