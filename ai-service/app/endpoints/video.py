"""POST /v1/video/text: public YouTube link to text pages (task A15)."""

from __future__ import annotations

from urllib.parse import urlparse

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..errors import ApiError
from ..gemini import GeminiClient, get_gemini

router = APIRouter()
YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"}
MAX_TIMESTAMP_SECONDS = 600  # timestamps only for videos of 10 minutes or less


class VideoTextRequest(BaseModel):
    url: str


@router.post("/v1/video/text")
def video_text(req: VideoTextRequest, gem: GeminiClient = Depends(get_gemini)):
    parsed = urlparse(req.url.strip())
    if parsed.scheme not in ("http", "https") or (parsed.hostname or "").lower() not in YOUTUBE_HOSTS:
        raise ApiError("bad_request", "Only public YouTube links are supported")
    raw = gem.video_text(req.url.strip())
    duration = raw.get("durationSec")
    keep_times = isinstance(duration, (int, float)) and 0 < duration <= MAX_TIMESTAMP_SECONDS
    pages = []
    for i, item in enumerate(raw.get("pages", []) if isinstance(raw.get("pages"), list) else [], start=1):
        if not isinstance(item, dict) or not isinstance(item.get("text"), str) or not item["text"].strip():
            continue
        page = {"n": i, "text": item["text"].strip()}
        start = item.get("startSec")
        if keep_times and isinstance(start, (int, float)) and not isinstance(start, bool):
            page["startSec"] = float(start)
        pages.append(page)
    if not pages:
        raise ApiError("ai_unavailable", "Could not get text from this video")
    return {"pages": pages, "approximateTimestamps": any("startSec" in p for p in pages)}
