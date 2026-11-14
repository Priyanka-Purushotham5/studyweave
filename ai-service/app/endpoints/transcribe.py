"""POST /v1/transcribe: audio plus vocabulary to timestamped words (task A10)."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Form, UploadFile

from ..errors import ApiError
from ..gemini import GeminiClient, get_gemini

router = APIRouter()


def _string_list(value: str, field: str) -> list[str]:
    try:
        data = json.loads(value or "[]")
    except json.JSONDecodeError as exc:
        raise ApiError("bad_request", f"{field} must be JSON") from exc
    if not isinstance(data, list):
        raise ApiError("bad_request", f"{field} must be a list")
    out = []
    for item in data:
        if isinstance(item, dict):  # accept the glossary shape {term, definition}
            item = item.get("term")
        if isinstance(item, str) and item.strip():
            out.append(item.strip())
    return out


def clean_words(raw_words: object) -> list[dict]:
    words = []
    if not isinstance(raw_words, list):
        return words
    for item in raw_words:
        if not isinstance(item, dict) or not isinstance(item.get("w"), str) or not item["w"].strip():
            continue
        s, e = item.get("startSec"), item.get("endSec")
        if isinstance(s, bool) or isinstance(e, bool) or not isinstance(s, (int, float)) or not isinstance(e, (int, float)):
            continue
        words.append({"w": item["w"].strip(), "startSec": float(s), "endSec": float(max(e, s))})
    words.sort(key=lambda w: w["startSec"])  # stable: keeps spoken order for equal times
    return words


@router.post("/v1/transcribe")
async def transcribe(
    file: UploadFile,
    glossary: str = Form("[]"),
    hints: str = Form("[]"),
    gem: GeminiClient = Depends(get_gemini),
):
    audio = await file.read()
    if not audio:
        raise ApiError("bad_request", "The audio file is empty")
    raw = gem.transcribe(
        audio,
        file.content_type or "audio/mpeg",
        _string_list(glossary, "glossary"),
        _string_list(hints, "hints"),
    )
    words = clean_words(raw.get("words"))
    return {"words": words, "text": " ".join(w["w"] for w in words)}
