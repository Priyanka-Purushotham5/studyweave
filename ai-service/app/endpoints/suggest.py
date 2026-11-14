"""POST /v1/suggest-module: Smart Save module suggestion (task A17, Could)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..gemini import GeminiClient, get_gemini

router = APIRouter()
CONFIDENCE_THRESHOLD = 0.5


class ModuleOption(BaseModel):
    id: str
    path: str


class SuggestModuleRequest(BaseModel):
    title: str
    snippet: str
    modules: list[ModuleOption]


@router.post("/v1/suggest-module")
def suggest(req: SuggestModuleRequest, gem: GeminiClient = Depends(get_gemini)):
    if not req.modules:
        return {"moduleId": None, "confidence": 0.0}
    raw = gem.generate_json(
        "suggest_module",
        {"title": req.title, "snippet": req.snippet[:2000], "modules": [m.model_dump() for m in req.modules]},
    )
    module_id, confidence = raw.get("moduleId"), raw.get("confidence")
    valid = {m.id for m in req.modules}
    if isinstance(confidence, bool) or not isinstance(confidence, (int, float)):
        confidence = 0.0
    confidence = max(0.0, min(1.0, float(confidence)))
    if module_id not in valid or confidence < CONFIDENCE_THRESHOLD:  # never an id that was not offered
        return {"moduleId": None, "confidence": confidence if module_id in valid else 0.0}
    return {"moduleId": module_id, "confidence": confidence}
