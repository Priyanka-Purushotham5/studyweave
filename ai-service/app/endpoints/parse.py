"""POST /v1/parse: PDF or PPTX to pages (task A3)."""

from __future__ import annotations

import io
import zipfile

from fastapi import APIRouter, UploadFile

from ..errors import ApiError

router = APIRouter()


def _kind(filename: str, data: bytes) -> str:
    name = (filename or "").lower()
    if name.endswith(".pdf") or data[:5] == b"%PDF-":
        return "pdf"
    if name.endswith(".pptx") or (data[:2] == b"PK" and zipfile.is_zipfile(io.BytesIO(data))):
        return "pptx"
    raise ApiError("bad_request", "Only PDF and PPTX files are supported")


def parse_pdf(data: bytes) -> list[dict]:
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted and not reader.decrypt(""):
            raise ApiError("bad_request", "This PDF is password protected")
        pages = [{"n": i + 1, "text": (p.extract_text() or "").strip()} for i, p in enumerate(reader.pages)]
    except ApiError:
        raise
    except Exception as exc:  # corrupt file
        raise ApiError("bad_request", "Could not read this PDF") from exc
    if not any(p["text"] for p in pages):
        raise ApiError(
            "scanned_pdf",
            "This PDF looks like scanned images, so there is no text to read. Try a PDF with selectable text.",
        )
    return pages


def parse_pptx(data: bytes) -> list[dict]:
    from pptx import Presentation

    try:
        prs = Presentation(io.BytesIO(data))
    except Exception as exc:
        raise ApiError("bad_request", "Could not read this PowerPoint file") from exc
    pages = []
    for i, slide in enumerate(prs.slides, start=1):
        lines = []
        for shape in slide.shapes:
            if shape.has_text_frame and shape.text_frame.text.strip():
                lines.append(shape.text_frame.text.strip())
        if slide.has_notes_slide and slide.notes_slide.notes_text_frame is not None:
            notes = slide.notes_slide.notes_text_frame.text.strip()
            if notes:
                lines.append(notes)
        pages.append({"n": i, "text": "\n".join(lines)})
    if not any(p["text"] for p in pages):
        raise ApiError("bad_request", "This PowerPoint file has no text")
    return pages


@router.post("/v1/parse")
async def parse(file: UploadFile):
    data = await file.read()
    if not data:
        raise ApiError("bad_request", "The file is empty")
    kind = _kind(file.filename or "", data)
    return {"pages": parse_pdf(data) if kind == "pdf" else parse_pptx(data)}
