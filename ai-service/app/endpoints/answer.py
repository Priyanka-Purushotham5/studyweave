"""POST /v1/answer: grounded answers, summaries and formula sheets with refusal (task A8)."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, model_validator

from ..common import page_map, verified_list
from ..errors import ApiError
from ..gemini import GeminiClient, get_gemini
from ..models import ResourcePage

router = APIRouter()
REFUSAL = {"refused": True, "reason": "not_in_materials"}


class AnswerRequest(BaseModel):
    pages: list[ResourcePage] = Field(min_length=1)
    question: str | None = None
    kind: Literal["summary", "formula_sheet"] | None = None

    @model_validator(mode="after")
    def _exactly_one(self):
        if bool(self.question and self.question.strip()) == bool(self.kind):
            raise ValueError("send either question or kind")
        return self


@router.post("/v1/answer")
def answer(req: AnswerRequest, gem: GeminiClient = Depends(get_gemini)):
    raw = gem.generate_json(
        "answer",
        {
            "question": req.question,
            "kind": req.kind,
            "pages": [p.model_dump(exclude_none=True) for p in req.pages],
        },
    )
    if raw.get("refused") is True:
        return dict(REFUSAL)
    text = raw.get("answer")
    citations = verified_list(raw.get("citations"), page_map(req.pages))
    if not isinstance(text, str) or not text.strip() or not citations:
        return dict(REFUSAL)  # no verifiable citation: refuse instead of guessing
    return {"answer": text.strip(), "citations": citations}
