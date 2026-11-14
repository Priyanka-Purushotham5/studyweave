"""POST /v1/edges/type: typed, two-sided-evidence edges for candidate pairs (task A6)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..common import page_map, verified
from ..gemini import GeminiClient, get_gemini
from ..models import Concept, ResourcePage

router = APIRouter()
EDGE_TYPES = {"prerequisite", "extends", "contrasts"}


class Pair(BaseModel):
    a: Concept
    b: Concept


class EdgesTypeRequest(BaseModel):
    pairs: list[Pair]
    pages: list[ResourcePage] = []


def build_edge(raw: object, pair: Pair, pmap: dict) -> dict | None:
    """A verified edge, or None. Direction stays prerequisite -> dependent (or base -> extension)."""
    if not isinstance(raw, dict) or raw.get("type") not in EDGE_TYPES:
        return None  # "none" and unknown types both become null
    side = raw.get("from_is")
    if side not in ("a", "b"):
        return None
    reason = raw.get("reason")
    if not isinstance(reason, str) or not reason.strip():
        return None
    ev_a, ev_b = verified(raw.get("evidence_a"), pmap), verified(raw.get("evidence_b"), pmap)
    if ev_a is None or ev_b is None:  # each side's quote must verify
        return None
    src, dst = (pair.a, pair.b) if side == "a" else (pair.b, pair.a)
    ev_src, ev_dst = (ev_a, ev_b) if side == "a" else (ev_b, ev_a)
    return {
        "id": f"e_{src.id}__{dst.id}",
        "from": src.id,
        "to": dst.id,
        "type": raw["type"],
        "reason": reason.strip(),
        "evidence": {"from": ev_src, "to": ev_dst},
    }


@router.post("/v1/edges/type")
def edges_type(req: EdgesTypeRequest, gem: GeminiClient = Depends(get_gemini)):
    if not req.pairs:
        return {"edges": []}
    raw = gem.generate_json(
        "edges_type",
        {
            "pairs": [{"pair": i, "a": p.a.model_dump(exclude_none=True), "b": p.b.model_dump(exclude_none=True)} for i, p in enumerate(req.pairs)],
            "pages": [p.model_dump(exclude_none=True) for p in req.pages],
        },
    )
    by_index = {}
    for item in raw.get("edges", []) if isinstance(raw.get("edges"), list) else []:
        if isinstance(item, dict) and isinstance(item.get("pair"), int) and item["pair"] not in by_index:
            by_index[item["pair"]] = item
    pmap = page_map(req.pages)
    return {"edges": [build_edge(by_index.get(i), pair, pmap) for i, pair in enumerate(req.pairs)]}
