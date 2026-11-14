"""Helpers shared by endpoints that return evidence."""

from __future__ import annotations

import hashlib
import re

from .citations import verify_quote
from .models import ResourcePage

_EVIDENCE_KEYS = ("resourceId", "page", "quote", "startSec")


def page_map(pages: list[ResourcePage]) -> dict[tuple[str, int], str]:
    return {(p.resourceId, p.n): p.text for p in pages}


def clean_evidence(ev: object) -> dict | None:
    """Keep only contract keys; None when the shape is wrong."""
    if not isinstance(ev, dict):
        return None
    if not isinstance(ev.get("resourceId"), str) or not isinstance(ev.get("quote"), str):
        return None
    page = ev.get("page")
    if isinstance(page, bool) or not isinstance(page, int) or page < 1:
        return None
    out = {k: ev[k] for k in _EVIDENCE_KEYS if k in ev and ev[k] is not None}
    return out


def verified(ev: object, pmap: dict[tuple[str, int], str]) -> dict | None:
    """The cleaned evidence if its quote is really on the cited page, else None."""
    cleaned = clean_evidence(ev)
    if cleaned is None:
        return None
    if not verify_quote(cleaned["quote"], pmap.get((cleaned["resourceId"], cleaned["page"]), "")):
        return None
    return cleaned


def verified_list(items: object, pmap: dict[tuple[str, int], str]) -> list[dict]:
    if not isinstance(items, list):
        return []
    return [e for e in (verified(i, pmap) for i in items) if e is not None]


def stable_id(prefix: str, *parts: str) -> str:
    return f"{prefix}_{hashlib.sha1('|'.join(parts).encode()).hexdigest()[:10]}"


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
