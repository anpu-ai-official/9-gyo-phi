import sys
import zipfile
from io import BytesIO
from pathlib import Path

import pytest


pytest.importorskip("docling")

ENGINE_DIR = Path(__file__).resolve().parent.parent / "engine"
sys.path.insert(0, str(ENGINE_DIR))

from document_parser import parse_with_docling


def test_markdown_preserves_semantic_reading_order_and_code():
    source = b"""# Reliable reading

First paragraph.

## Code example

```python
def func(x, y):
    return x + y
```

- First idea
- Second idea
"""
    result = parse_with_docling(source, "fixture.md")

    assert result["parser"] == "docling"
    assert [segment["role"] for segment in result["segments"]] == [
        "heading",
        "paragraph",
        "heading",
        "code",
        "list-item",
        "list-item",
    ]
    code = result["segments"][3]
    assert code["is_code"] is True
    assert "function definition for a function named func" in code["speech_text"]


def test_html_ignores_navigation_and_footer_furniture():
    source = b"""<!doctype html><html><head><title>Fixture</title></head><body>
    <nav>Skip this navigation</nav><main><h1>Listen to this</h1>
    <p>Body paragraph with enough useful article content for semantic selection.</p>
    <button>Previous lesson</button><form><input placeholder="Search words"></form>
    <pre><code>const answer = 42;</code></pre></main>
    <footer>Skip this footer</footer></body></html>"""
    result = parse_with_docling(source, "fixture.html")
    transcript = " ".join(segment["original_text"] for segment in result["segments"])

    assert "Listen to this" in transcript
    assert "Body paragraph" in transcript
    assert "const answer" in transcript
    assert "navigation" not in transcript
    assert "footer" not in transcript
    assert "Previous lesson" not in transcript
    assert "Search words" not in transcript


def _epub_bytes():
    output = BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        archive.writestr(
            "mimetype",
            "application/epub+zip",
            compress_type=zipfile.ZIP_STORED,
        )
        archive.writestr(
            "META-INF/container.xml",
            """<?xml version="1.0"?>
            <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
              <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
            </container>""",
        )
        archive.writestr(
            "OEBPS/content.opf",
            """<?xml version="1.0" encoding="UTF-8"?>
            <package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id">
              <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
                <dc:identifier id="book-id">fixture</dc:identifier>
                <dc:title>EPUB fixture</dc:title><dc:language>en</dc:language>
              </metadata>
              <manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest>
              <spine><itemref idref="chapter"/></spine>
            </package>""",
        )
        archive.writestr(
            "OEBPS/chapter.xhtml",
            """<?xml version="1.0" encoding="UTF-8"?>
            <html xmlns="http://www.w3.org/1999/xhtml"><head><title>One</title></head>
            <body><h1>Chapter one</h1><p>An EPUB passage ready to hear.</p></body></html>""",
        )
    return output.getvalue()


def test_epub_spine_becomes_ordered_listening_segments():
    result = parse_with_docling(_epub_bytes(), "fixture.epub")
    transcript = [segment["original_text"] for segment in result["segments"]]

    assert transcript[:2] == ["Chapter one", "An EPUB passage ready to hear."]
    assert result["format"] == "epub"
