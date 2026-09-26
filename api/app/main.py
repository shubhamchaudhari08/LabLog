"""LabLog FastAPI application.

Two responsibilities only: mint the voice session credential, and be the single
validated path through which every state change passes. Audio never touches
this service (plan.md §A1).
"""

from __future__ import annotations

import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import health, protocols, settings, tools, voice

load_dotenv()

app = FastAPI(
    title="LabLog API",
    description="Validated tool layer and voice bootstrap for the LabLog laboratory notebook.",
    version="0.1.0",
)

_origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins or ["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(health.router)
app.include_router(voice.router)
app.include_router(tools.router)
app.include_router(settings.router)
app.include_router(protocols.router)
