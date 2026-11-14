"""POST /v1/embed: one 768-number vector per text (task A5)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..gemini import GeminiClient, get_gemini

router = APIRouter()
BATCH_SIZE = 100


class EmbedRequest(BaseModel):
    texts: list[str]


@router.post("/v1/embed")
def embed(req: EmbedRequest, gem: GeminiClient = Depends(get_gemini)):
    vectors: list[list[float]] = []
    for i in range(0, len(req.texts), BATCH_SIZE):
        vectors.extend(gem.embed(req.texts[i : i + BATCH_SIZE]))
    return {"vectors": vectors}
