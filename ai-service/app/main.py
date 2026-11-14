"""Module A: AI service. Stateless. The only module that calls Gemini (later tasks)."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator

from .errors import ApiError
from .endpoints import answer, concepts, edges, embed, glossary, papers, parse, questions, suggest, transcribe, video
from .flagging import flag

app = FastAPI(title="StudyWeave AI service")
for _module in (parse, video, glossary, transcribe, concepts, embed, edges, questions, papers, answer, suggest):
    app.include_router(_module.router)


@app.exception_handler(ApiError)
async def _api_error(_: Request, exc: ApiError):
    return JSONResponse(status_code=exc.status, content=exc.body())


@app.exception_handler(RequestValidationError)
async def _validation_error(_: Request, exc: RequestValidationError):
    err = ApiError("bad_request", "invalid request body")
    return JSONResponse(status_code=err.status, content=err.body())


@app.exception_handler(Exception)
async def _unexpected(_: Request, exc: Exception):
    err = ApiError("internal", "unexpected error")
    return JSONResponse(status_code=err.status, content=err.body())


@app.get("/healthz")
def healthz():
    return {"ok": True}


class Word(BaseModel):
    w: str
    startSec: float
    endSec: float


class Correction(BaseModel):
    heard: str
    correct: str
    count: int


class FlagRequest(BaseModel):
    words: list[Word]
    glossary: list[str]
    corrections: list[Correction] = []

    @field_validator("glossary", mode="before")
    @classmethod
    def _terms(cls, value):
        # Accept the /v1/glossary shape ({term, definition}) as well as plain strings.
        if isinstance(value, list):
            return [v["term"] if isinstance(v, dict) else v for v in value]
        return value


@app.post("/v1/flag")
def flag_endpoint(req: FlagRequest):
    flags, auto_fixed = flag(
        [w.model_dump() for w in req.words],
        req.glossary,
        [c.model_dump() for c in req.corrections],
    )
    return {"flags": flags, "autoFixed": auto_fixed}
