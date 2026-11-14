"""POST /v1/glossary: technical terms from pages (task A9)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..gemini import GeminiClient, get_gemini
from ..models import Page

router = APIRouter()
MIN_CHARS = 3
MAX_TERMS = 200


class GlossaryRequest(BaseModel):
    pages: list[Page] = Field(min_length=1)


def clean_terms(raw_terms: object) -> list[dict]:
    """Dedupe case-insensitively (first spelling wins), drop short terms, cap at 200."""
    out: list[dict] = []
    seen: set[str] = set()
    if not isinstance(raw_terms, list):
        return out
    for item in raw_terms:
        if not isinstance(item, dict) or not isinstance(item.get("term"), str):
            continue
        term = item["term"].strip()
        key = term.lower()
        if len(term) < MIN_CHARS or key in seen:
            continue
        seen.add(key)
        definition = item.get("definition")
        out.append({"term": term, "definition": definition.strip() if isinstance(definition, str) else ""})
        if len(out) == MAX_TERMS:
            break
    return out


@router.post("/v1/glossary")
def glossary(req: GlossaryRequest, gem: GeminiClient = Depends(get_gemini)):
    raw = gem.generate_json("glossary", {"pages": [p.model_dump(exclude_none=True) for p in req.pages]})
    return {"terms": clean_terms(raw.get("terms"))}
