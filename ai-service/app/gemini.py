"""Every Gemini call in the whole product goes through this file (task A1).

GeminiClient is the interface. RealGemini talks to the Gemini REST API over httpx.
FakeGemini serves fixtures/ai_raw/*.json so tests and other modules never need a key.

Model names come from the environment; use the names your key lists in AI Studio
(python -m eval.probe_models shows which ones answer right now):
  GEMINI_MODEL (text and video, default gemini-flash-latest), GEMINI_FALLBACK_MODELS (comma list),
  GEMINI_EMBED_MODEL (default gemini-embedding-001), GEMINI_TRANSCRIBE_MODEL (optional),
  GEMINI_TIMEOUT (seconds per attempt, default 25), GEMINI_DEADLINE (seconds for all fallbacks, default 50).
RealGemini has been written to the public REST docs but not yet run against the live API.
"""

from __future__ import annotations

import base64
import copy
import hashlib
import json
import os
import pathlib
import random
import time
from typing import Any

import httpx

from .errors import ApiError
from .prompts import PROMPTS

EMBED_DIM = 768
INLINE_AUDIO_LIMIT = 20 * 1024 * 1024  # above this, use the Files API
BASE_URL = "https://generativelanguage.googleapis.com"


def _google_reason(resp: httpx.Response) -> str:
    """Google's own error message (never contains the key), shortened for logs and error bodies."""
    try:
        message = resp.json().get("error", {}).get("message", "")
    except ValueError:
        message = ""
    message = " ".join(str(message).split())[:300]
    return f": {message}" if message else ""


def audio_path_for(size_bytes: int) -> str:
    return "files" if size_bytes > INLINE_AUDIO_LIMIT else "inline"


class GeminiClient:
    """What the endpoints depend on. Only these four methods exist."""

    def generate_json(self, task: str, payload: dict) -> dict:  # pragma: no cover - interface
        raise NotImplementedError

    def embed(self, texts: list[str]) -> list[list[float]]:  # pragma: no cover - interface
        raise NotImplementedError

    def transcribe(self, audio: bytes, mime: str, glossary: list[str], hints: list[str]) -> dict:  # pragma: no cover
        raise NotImplementedError

    def video_text(self, url: str) -> dict:  # pragma: no cover - interface
        raise NotImplementedError


# --------------------------------------------------------------------------- real client


DEFAULT_MODEL = "gemini-flash-latest"
DEFAULT_FALLBACKS = "gemini-3.5-flash,gemini-2.5-flash-lite"


def _model_chain(primary: str, fallbacks: str) -> list[str]:
    chain: list[str] = []
    for name in [primary, *fallbacks.split(",")]:
        name = name.strip().removeprefix("models/")
        if name and name not in chain:
            chain.append(name)
    return chain


def _should_fall_back(err: ApiError) -> bool:
    """Overloaded, rate-limited, timed out, or model not served to this key: try the next model."""
    return err.code in ("ai_unavailable", "rate_limited") or "(404)" in err.message


class RealGemini(GeminiClient):
    """Text calls try GEMINI_MODEL, then each of GEMINI_FALLBACK_MODELS, within GEMINI_DEADLINE seconds.

    Module B gives each call to A 60 seconds, so the default deadline (50 s) and per-attempt
    timeout (25 s) keep A's retries inside that window.
    """

    def __init__(self, api_key: str | None = None, client: httpx.Client | None = None, timeout: float | None = None,
                 deadline: float | None = None, clock=time.monotonic, sleep=time.sleep):
        self.api_key = api_key if api_key is not None else os.environ.get("GEMINI_API_KEY", "")
        self.model = os.environ.get("GEMINI_MODEL", DEFAULT_MODEL)
        self.models = _model_chain(self.model, os.environ.get("GEMINI_FALLBACK_MODELS", DEFAULT_FALLBACKS))
        self.embed_model = os.environ.get("GEMINI_EMBED_MODEL", "gemini-embedding-001")
        self.transcribe_model = os.environ.get("GEMINI_TRANSCRIBE_MODEL", "")
        self.timeout = timeout if timeout is not None else float(os.environ.get("GEMINI_TIMEOUT", "25"))
        self.deadline = deadline if deadline is not None else float(os.environ.get("GEMINI_DEADLINE", "50"))
        self.http = client or httpx.Client(timeout=self.timeout)
        self.clock, self.sleep = clock, sleep
        self.last_model: str | None = None  # which model answered the last text call (for reports)

    # -- low level
    def _headers(self) -> dict:
        if not self.api_key:
            raise ApiError("internal", "GEMINI_API_KEY is not set")
        return {"x-goog-api-key": self.api_key}

    def _request(self, method: str, url: str, **kwargs) -> httpx.Response:
        try:
            resp = self.http.request(method, url, headers={**self._headers(), **kwargs.pop("headers", {})}, **kwargs)
        except httpx.TimeoutException as exc:
            raise ApiError("ai_unavailable", "Gemini timed out") from exc
        except httpx.HTTPError as exc:
            raise ApiError("ai_unavailable", "Could not reach Gemini") from exc
        if resp.status_code == 429:
            raise ApiError("rate_limited", "Gemini rate limit reached")
        if resp.status_code >= 500:
            raise ApiError("ai_unavailable", f"Gemini error {resp.status_code}{_google_reason(resp)}")
        if resp.status_code >= 400:
            raise ApiError("internal", f"Gemini rejected the request ({resp.status_code}){_google_reason(resp)}")
        return resp

    def _with_fallback(self, models: list[str], call):
        """Run call(model) on each model in turn until one succeeds or the deadline passes."""
        start = self.clock()
        last: ApiError | None = None
        for i, model in enumerate(models):
            if i and self.clock() - start >= self.deadline:
                break
            try:
                result = call(model)
                self.last_model = model
                return result
            except ApiError as err:
                if not _should_fall_back(err):
                    raise
                last = err
                if i + 1 < len(models):
                    self.sleep(1.0)
        assert last is not None
        raise ApiError(last.code, f"{last.message} (tried: {', '.join(models[: i + 1])})")

    def _generate(self, model: str, parts: list[dict], system: str, json_out: bool = True) -> str:
        body: dict[str, Any] = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": {"temperature": 0.2, **({"responseMimeType": "application/json"} if json_out else {})},
        }
        resp = self._request("POST", f"{BASE_URL}/v1beta/models/{model}:generateContent", json=body)
        try:
            return resp.json()["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError, ValueError) as exc:
            raise ApiError("internal", "Gemini returned an unexpected response") from exc

    def _json_once(self, model: str, task: str, parts: list[dict]) -> dict:
        """One model: bad JSON is retried once, then becomes `internal`."""
        for attempt in range(2):
            text = self._generate(model, parts, PROMPTS[task])
            try:
                data = json.loads(text)
                if isinstance(data, dict):
                    return data
            except json.JSONDecodeError:
                pass
        raise ApiError("internal", "Gemini returned invalid JSON twice")

    def _json_task(self, models: list[str], task: str, parts: list[dict]) -> dict:
        return self._with_fallback(models, lambda m: self._json_once(m, task, parts))

    # -- interface
    def generate_json(self, task: str, payload: dict) -> dict:
        return self._json_task(self.models, task, [{"text": json.dumps(payload, ensure_ascii=False)}])

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        model = f"models/{self.embed_model}"
        body = {"requests": [
            {"model": model, "content": {"parts": [{"text": t}]}, "outputDimensionality": EMBED_DIM} for t in texts]}
        try:
            resp = self._request("POST", f"{BASE_URL}/v1beta/{model}:batchEmbedContents", json=body)
        except ApiError as err:  # one quick retry when overloaded or timed out
            if err.code != "ai_unavailable":
                raise
            self.sleep(1.0)
            resp = self._request("POST", f"{BASE_URL}/v1beta/{model}:batchEmbedContents", json=body)
        try:
            vectors = [e["values"] for e in resp.json()["embeddings"]]
        except (KeyError, ValueError) as exc:
            raise ApiError("internal", "Gemini returned an unexpected embedding response") from exc
        if len(vectors) != len(texts) or any(len(v) != EMBED_DIM for v in vectors):
            raise ApiError("internal", "Gemini returned embeddings of the wrong size")
        return vectors

    def _upload_file(self, audio: bytes, mime: str) -> str:
        start = self._request(
            "POST", f"{BASE_URL}/upload/v1beta/files",
            headers={"X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start",
                     "X-Goog-Upload-Header-Content-Length": str(len(audio)),
                     "X-Goog-Upload-Header-Content-Type": mime},
            json={"file": {"display_name": "lecture"}})
        upload_url = start.headers.get("x-goog-upload-url")
        if not upload_url:
            raise ApiError("internal", "Gemini did not return an upload URL")
        done = self._request("POST", upload_url, content=audio,
                             headers={"X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize"})
        try:
            return done.json()["file"]["uri"]
        except (KeyError, ValueError) as exc:
            raise ApiError("internal", "Gemini file upload failed") from exc

    def transcribe(self, audio: bytes, mime: str, glossary: list[str], hints: list[str]) -> dict:
        if audio_path_for(len(audio)) == "files":
            audio_part = {"fileData": {"mimeType": mime, "fileUri": self._upload_file(audio, mime)}}
        else:
            audio_part = {"inlineData": {"mimeType": mime, "data": base64.b64encode(audio).decode()}}
        vocab = sorted({*glossary, *hints})
        parts = [{"text": "Vocabulary: " + json.dumps(vocab, ensure_ascii=False)}, audio_part]
        models = [self.transcribe_model] if self.transcribe_model else self.models
        return self._json_task(models, "transcribe", parts)

    def video_text(self, url: str) -> dict:
        parts = [{"fileData": {"fileUri": url}}, {"text": "Transcribe this video."}]
        return self._json_task(self.models, "video_text", parts)


# --------------------------------------------------------------------------- fake client


def _default_fixtures_dir() -> pathlib.Path:
    env = os.environ.get("STUDYWEAVE_FIXTURES")
    return pathlib.Path(env) if env else pathlib.Path(__file__).resolve().parents[2] / "fixtures"


class FakeGemini(GeminiClient):
    """Serves fixtures/ai_raw/<task>.json as the model's answer.

    overrides: {task: raw_dict} to script a specific model answer in a test.
    fail_with: an ApiError code; every call raises it (failure drills).
    calls: list of (method, detail) so tests can see what was passed.
    """

    def __init__(self, overrides: dict | None = None, fail_with: str | None = None, fixtures_dir: pathlib.Path | None = None):
        self.overrides = overrides or {}
        self.fail_with = fail_with
        self.dir = fixtures_dir or _default_fixtures_dir()
        self.calls: list[tuple[str, Any]] = []

    def _maybe_fail(self) -> None:
        if self.fail_with:
            raise ApiError(self.fail_with, f"fake Gemini failure: {self.fail_with}")

    def _raw(self, task: str) -> dict:
        if task in self.overrides:
            return copy.deepcopy(self.overrides[task])
        return json.loads((self.dir / "ai_raw" / f"{task}.json").read_text(encoding="utf-8"))

    def generate_json(self, task: str, payload: dict) -> dict:
        self.calls.append(("generate_json", {"task": task, "payload": payload}))
        self._maybe_fail()
        return self._raw(task)

    def embed(self, texts: list[str]) -> list[list[float]]:
        self.calls.append(("embed", len(texts)))
        self._maybe_fail()
        out = []
        for t in texts:  # deterministic: same text, same vector; similar texts are NOT similar (it is a fake)
            rng = random.Random(int(hashlib.sha256(t.encode()).hexdigest(), 16))
            out.append([round(rng.uniform(-1, 1), 6) for _ in range(EMBED_DIM)])
        return out

    def transcribe(self, audio: bytes, mime: str, glossary: list[str], hints: list[str]) -> dict:
        self.calls.append(("transcribe", {"path": audio_path_for(len(audio)), "mime": mime, "glossary": glossary, "hints": hints}))
        self._maybe_fail()
        return self._raw("transcribe")

    def video_text(self, url: str) -> dict:
        self.calls.append(("video_text", url))
        self._maybe_fail()
        return self._raw("video_text")


# --------------------------------------------------------------------------- selection

_client: GeminiClient | None = None


def get_gemini() -> GeminiClient:
    """FastAPI dependency. FAKE_GEMINI=1 selects the fake; tests override this function."""
    global _client
    if _client is None:
        _client = FakeGemini() if os.environ.get("FAKE_GEMINI") == "1" else RealGemini()
    return _client
