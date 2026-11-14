"""Request models. Response shapes are plain dicts validated by the contract tests."""

from __future__ import annotations

from pydantic import BaseModel, Field


class Evidence(BaseModel):
    resourceId: str
    page: int
    quote: str
    startSec: float | None = None


class Page(BaseModel):
    n: int
    text: str
    startSec: float | None = None


class ResourcePage(Page):
    resourceId: str


class Concept(BaseModel):
    id: str
    moduleId: str
    name: str
    definition: str = ""
    evidence: list[Evidence] = []
    examWeight: int | None = None
    readiness: float | None = None
