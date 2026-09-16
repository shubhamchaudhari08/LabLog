"""Liveness endpoint. Also the target of the Gate 0 cross-origin check."""

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "lablog-api"}
