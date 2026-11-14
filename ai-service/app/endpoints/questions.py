"""POST /v1/questions/generate: grounded questions, zero unverified served (tasks A7, A13)."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..common import page_map, stable_id, verified_list
from ..gemini import GeminiClient, get_gemini
from ..models import Concept, ResourcePage
from ..numerics import double_solve

router = APIRouter()
LETTERS = ("A", "B", "C", "D")


class QuestionsGenerateRequest(BaseModel):
    concept: Concept
    pages: list[ResourcePage] = Field(min_length=1)
    kind: Literal["mcq", "conceptual", "numerical", "past_paper"]
    n: int = Field(ge=1, le=20)


def build_question(raw: object, concept: Concept, kind: str, pmap: dict) -> dict | None:
    if not isinstance(raw, dict):
        return None
    text = raw.get("text")
    if not isinstance(text, str) or not text.strip():
        return None
    difficulty = raw.get("difficulty")
    if isinstance(difficulty, bool) or difficulty not in (1, 2, 3):
        return None
    citations = verified_list(raw.get("citations"), pmap)
    if not citations:  # an unverified question is never served
        return None

    if kind in ("mcq", "past_paper"):
        options = raw.get("options")
        answer = raw.get("answer")
        if not (isinstance(options, list) and len(options) == 4 and all(isinstance(o, str) and o.strip() for o in options)):
            return None
        if answer not in LETTERS:
            return None
        options = [o.strip() for o in options]
    elif kind == "numerical":
        agreed = double_solve(raw.get("solveA"), raw.get("solveB"))
        if agreed is None:  # solves disagree or cannot be parsed
            return None
        options = []
        answer = raw["answer"].strip() if isinstance(raw.get("answer"), str) and raw["answer"].strip() else f"{agreed:g}"
    else:  # conceptual
        answer = raw.get("answer")
        if not isinstance(answer, str) or not answer.strip():
            return None
        options, answer = [], answer.strip()

    return {
        "id": stable_id("q", concept.id, kind, text.strip()),
        "conceptIds": [concept.id],
        "kind": kind,
        "text": text.strip(),
        "options": options,
        "answer": answer,
        "difficulty": difficulty,
        "citations": citations,
        "verified": True,
    }


@router.post("/v1/questions/generate")
def generate(req: QuestionsGenerateRequest, gem: GeminiClient = Depends(get_gemini)):
    raw = gem.generate_json(
        "questions_generate",
        {
            "concept": req.concept.model_dump(exclude_none=True),
            "kind": req.kind,
            "n": req.n,
            "pages": [p.model_dump(exclude_none=True) for p in req.pages],
        },
    )
    raw_questions = raw.get("questions") if isinstance(raw.get("questions"), list) else []
    if raw.get("insufficient") is True or not raw_questions:
        return {"questions": [], "dropped": 0, "refused": True}  # pages do not support the concept
    pmap = page_map(req.pages)
    built = [build_question(item, req.concept, req.kind, pmap) for item in raw_questions]
    good = [q for q in built if q is not None]
    seen, unique = set(), []
    for q in good:  # same text twice counts once
        if q["id"] not in seen:
            seen.add(q["id"])
            unique.append(q)
    return {"questions": unique[: req.n], "dropped": len(built) - len(good)}
