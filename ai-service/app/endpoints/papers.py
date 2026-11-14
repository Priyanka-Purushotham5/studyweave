"""POST /v1/papers/tag: past-paper questions mapped to known concept names (task A14)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..gemini import GeminiClient, get_gemini
from ..models import Page

router = APIRouter()


class PapersTagRequest(BaseModel):
    pages: list[Page] = Field(min_length=1)
    concepts: list[str]


@router.post("/v1/papers/tag")
def tag(req: PapersTagRequest, gem: GeminiClient = Depends(get_gemini)):
    raw = gem.generate_json(
        "papers_tag",
        {"pages": [p.model_dump(exclude_none=True) for p in req.pages], "concepts": req.concepts},
    )
    known = {c.strip().lower(): c for c in req.concepts if c.strip()}
    questions = []
    for item in raw.get("questions", []) if isinstance(raw.get("questions"), list) else []:
        if not isinstance(item, dict) or not isinstance(item.get("text"), str) or not item["text"].strip():
            continue
        names: list[str] = []
        for name in item.get("concepts") or []:
            canonical = known.get(name.strip().lower()) if isinstance(name, str) else None
            if canonical and canonical not in names:  # unknown names are dropped
                names.append(canonical)
        questions.append({"text": item["text"].strip(), "concepts": names})
    return {"questions": questions}
