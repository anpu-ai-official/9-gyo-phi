"""Unified, layout-aware document parsing backed by Docling.

Docling gives the reader one semantic document model for PDF, EPUB, HTML and
Markdown.  Imports stay lazy so the voice engine can still start when the
optional layout stack is unavailable; callers may fall back to the lightweight
PDF.js parser in that case.
"""

from __future__ import annotations

import re
import os
import threading
import time
from io import BytesIO
from pathlib import Path
from typing import Any


SUPPORTED_EXTENSIONS = {"pdf", "epub", "html", "htm", "xhtml", "md", "markdown"}
SKIPPED_LABELS = {"page_header", "page_footer"}
HEADING_LABELS = {"title", "section_header", "subtitle"}
CODE_LABELS = {"code", "formula"}

_converter: Any = None
_converter_lock = threading.RLock()


def docling_available() -> bool:
    try:
        import docling  # noqa: F401

        return True
    except Exception:
        return False


def _get_converter():
    global _converter
    if _converter is None:
        with _converter_lock:
            if _converter is None:
                from docling.datamodel.base_models import InputFormat
                from docling.datamodel.pipeline_options import PdfPipelineOptions
                from docling.document_converter import (
                    DocumentConverter,
                    PdfFormatOption,
                )

                pdf_options = PdfPipelineOptions()
                # The reader currently accepts selectable-text PDFs. Avoid a
                # surprise OCR model download and keep native text exact; OCR
                # can be exposed later as an explicit repair action.
                pdf_options.do_ocr = False
                pdf_options.do_table_structure = True
                local_artifacts = Path(
                    os.environ.get(
                        "DOCLING_ARTIFACTS_PATH",
                        Path.home()
                        / "Library"
                        / "Application Support"
                        / "9-gyo-phi"
                        / "layout-models",
                    )
                )
                if local_artifacts.exists():
                    pdf_options.artifacts_path = local_artifacts
                _converter = DocumentConverter(
                    format_options={
                        InputFormat.PDF: PdfFormatOption(
                            pipeline_options=pdf_options,
                        )
                    }
                )
    return _converter


def _extension(filename: str) -> str:
    return Path(filename).suffix.lower().lstrip(".")


def _article_html(data: bytes) -> bytes:
    """Remove interactive chrome before Docling constructs reading order."""

    from bs4 import BeautifulSoup

    soup = BeautifulSoup(data, "html.parser")
    for node in soup.select(
        "script, style, template, noscript, svg, canvas, form, button, input, "
        "select, textarea, nav, footer, [hidden], [aria-hidden='true'], "
        "[role='navigation'], [role='search'], [role='contentinfo']"
    ):
        node.decompose()

    candidates = [
        node
        for node in [*soup.find_all("article"), *soup.find_all("main")]
        if len(node.get_text(" ", strip=True)) >= 100
    ]
    if not candidates:
        return str(soup).encode("utf-8")
    content = max(candidates, key=lambda node: len(node.get_text(" ", strip=True)))
    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    clean = BeautifulSoup("<!doctype html><html><head></head><body></body></html>", "html.parser")
    if title:
        title_node = clean.new_tag("title")
        title_node.string = title
        clean.head.append(title_node)
    clean.body.append(content.extract())
    return str(clean).encode("utf-8")


def _label_value(item: Any) -> str:
    label = getattr(item, "label", "text")
    return str(getattr(label, "value", label)).lower()


def _role_for(label: str) -> str:
    if label in HEADING_LABELS:
        return "heading"
    if label == "list_item":
        return "list-item"
    if label in CODE_LABELS:
        return "code" if label == "code" else "formula"
    if label == "table":
        return "table"
    if label in {"caption", "footnote"}:
        return label
    return "paragraph"


def _item_text(item: Any, document: Any, label: str) -> str:
    text = getattr(item, "text", None)
    if isinstance(text, str) and text.strip():
        return text.strip()
    if label == "table" and hasattr(item, "export_to_markdown"):
        try:
            return item.export_to_markdown(document).strip()
        except Exception:
            return ""
    if label == "picture" and hasattr(item, "caption_text"):
        try:
            return item.caption_text(document).strip()
        except Exception:
            return ""
    return ""


def _page_size(document: Any, page_number: int):
    page = getattr(document, "pages", {}).get(page_number)
    size = getattr(page, "size", None)
    if size is None:
        return None
    return float(size.width), float(size.height)


def _boxes_for(item: Any, document: Any) -> tuple[int, list[dict[str, float]]]:
    boxes: list[dict[str, float]] = []
    first_page = 0
    for provenance in getattr(item, "prov", []) or []:
        page_number = int(getattr(provenance, "page_no", 1) or 1)
        dimensions = _page_size(document, page_number)
        bbox = getattr(provenance, "bbox", None)
        if dimensions is None or bbox is None:
            continue
        width, height = dimensions
        if width <= 0 or height <= 0:
            continue
        try:
            bbox = bbox.to_top_left_origin(height)
        except Exception:
            pass
        left = max(0.0, min(width, float(bbox.l)))
        top = max(0.0, min(height, float(bbox.t)))
        right = max(left, min(width, float(bbox.r)))
        bottom = max(top, min(height, float(bbox.b)))
        if right <= left or bottom <= top:
            continue
        if not boxes:
            first_page = max(0, page_number - 1)
        boxes.append(
            {
                "x": round(left / width * 100, 2),
                "y": round(top / height * 100, 2),
                "w": round((right - left) / width * 100, 2),
                "h": round((bottom - top) / height * 100, 2),
            }
        )
    return first_page, boxes


def _natural_parts(text: str, role: str, limit: int = 700) -> list[str]:
    clean = re.sub(r"[ \t]+", " ", text).strip()
    if not clean:
        return []
    if len(clean) <= limit:
        return [clean]

    if role == "code":
        units = [line.strip() for line in text.splitlines() if line.strip()]
    else:
        units = re.split(r"(?<=[.!?…])\s+", clean)

    parts: list[str] = []
    current = ""
    for unit in units:
        if not unit:
            continue
        if current and len(current) + len(unit) + 1 > limit:
            parts.append(current)
            current = ""
        if len(unit) > limit:
            words = unit.split()
            for word in words:
                if current and len(current) + len(word) + 1 > limit:
                    parts.append(current)
                    current = ""
                current += (" " if current else "") + word
        else:
            current += ("\n" if role == "code" and current else " ") + unit
    if current:
        parts.append(current)
    return parts


def _speech_metadata(text: str, is_code: bool) -> dict[str, Any]:
    from verbalizer import verbalize_segment

    if is_code and "\n" in text:
        lines = [
            verbalize_segment(line, is_code=True, use_llm=False)
            for line in text.splitlines()
            if line.strip()
        ]
        return {
            "speech_text": ". ".join(line["speech_text"] for line in lines),
            "transformed": any(line["transformed"] for line in lines),
            "verbalizer": "rules" if any(line["transformed"] for line in lines) else "none",
            "explanation": "Code block",
        }
    return verbalize_segment(text, is_code=is_code, use_llm=False)


def parse_with_docling(
    data: bytes,
    filename: str,
    page_range: tuple[int, int] | None = None,
) -> dict[str, Any]:
    """Convert supported bytes into the app's stable segment contract."""

    extension = _extension(filename)
    if extension not in SUPPORTED_EXTENSIONS:
        raise ValueError(f"Unsupported document type: .{extension or 'unknown'}")
    if not data:
        raise ValueError("The document is empty")

    from docling.datamodel.base_models import DocumentStream

    started = time.perf_counter()
    parser_data = _article_html(data) if extension in {"html", "htm", "xhtml"} else data
    stream = DocumentStream(name=filename, stream=BytesIO(parser_data))
    # DocumentConverter owns model objects which are not safe to drive from two
    # threads concurrently. Keep imports deterministic and memory bounded.
    with _converter_lock:
        convert_options = {"page_range": page_range} if page_range else {}
        result = _get_converter().convert(stream, **convert_options)
    document = result.document

    pages = []
    for page_number, page in sorted(getattr(document, "pages", {}).items()):
        size = getattr(page, "size", None)
        if size is not None:
            pages.append(
                {
                    "page": max(0, int(page_number) - 1),
                    "width": round(float(size.width), 1),
                    "height": round(float(size.height), 1),
                }
            )

    segments: list[dict[str, Any]] = []
    current_heading = ""
    for item, hierarchy_level in document.iterate_items():
        label = _label_value(item)
        layer = str(getattr(getattr(item, "content_layer", "body"), "value", getattr(item, "content_layer", "body"))).lower()
        if label in SKIPPED_LABELS or layer == "furniture":
            continue
        text = _item_text(item, document, label)
        if not text:
            continue
        role = _role_for(label)
        if role == "heading":
            current_heading = text
        page, boxes = _boxes_for(item, document)
        for part in _natural_parts(text, role):
            is_code = role in {"code", "formula"}
            verbalized = _speech_metadata(part, is_code)
            segments.append(
                {
                    "id": len(segments),
                    "page": page,
                    "text": verbalized["speech_text"],
                    "original_text": part,
                    "speech_text": verbalized["speech_text"],
                    "boxes": boxes,
                    "is_code": is_code,
                    "transformed": verbalized["transformed"],
                    "verbalizer": verbalized["verbalizer"],
                    "explanation": verbalized["explanation"],
                    "role": role,
                    "level": int(getattr(item, "level", hierarchy_level) or hierarchy_level or 1),
                    "section": current_heading,
                }
            )

    if not segments:
        raise ValueError("No readable content was found in this document")

    return {
        "parser": "docling",
        "format": extension,
        "title": getattr(document, "name", "") or Path(filename).stem,
        "num_pages": len(pages),
        "pages": pages,
        "segments": segments,
        "total_segments": len(segments),
        "parse_time_ms": round((time.perf_counter() - started) * 1000),
    }
