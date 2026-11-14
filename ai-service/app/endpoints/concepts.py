"""POST /v1/concepts/extract: concepts with verified page evidence (task A4)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..common import page_map, verified_list
from ..gemini import GeminiClient, get_gemini
from ..models import ResourcePage

router = APIRouter()


class ConceptsExtractRequest(BaseModel):
    moduleId: str
    pages: list[ResourcePage] = Field(min_length=1)


@router.post("/v1/concepts/extract")
def extract(req: ConceptsExtractRequest, gem: GeminiClient = Depends(get_gemini)):
    raw = gem.generate_json(
        "concepts_extract",
        {"moduleId": req.moduleId, "pages": [p.model_dump(exclude_none=True) for p in req.pages]},
    )
    pmap = page_map(req.pages)
    concepts, dropped, seen = [], 0, set()
    for item in raw.get("concepts", []) if isinstance(raw.get("concepts"), list) else []:
        name = item.get("name") if isinstance(item, dict) else None
        if not isinstance(name, str) or not name.strip() or name.strip().lower() in seen:
            dropped += 1
            continue
        evidence = verified_list(item.get("evidence"), pmap)
        if not evidence:  # no verifiable quote: never served
            dropped += 1
            continue
        seen.add(name.strip().lower())
        definition = item.get("definition")
        concepts.append(
            {"name": name.strip(), "definition": definition.strip() if isinstance(definition, str) else "", "evidence": evidence}
        )
    return {"concepts": concepts, "dropped": dropped}
