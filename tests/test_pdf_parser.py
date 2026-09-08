import pytest
import sys
import pymupdf
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent.parent / "engine"
sys.path.insert(0, str(ENGINE_DIR))

from server import parse_pdf_document

def generate_synthetic_pdf():
    doc = pymupdf.open()
    page = doc.new_page(width=612, height=792)

    # 1. Prose sentence
    page.insert_text((72, 80), "Welcome to the 9-gyo-phi audio reader system.", fontsize=12)

    # 2. Left column code block
    page.insert_text((72, 140), "#include <stdio.h>", fontsize=10)
    page.insert_text((72, 160), "main()", fontsize=10)
    page.insert_text((72, 180), "{", fontsize=10)
    page.insert_text((90, 200), "printf(\"hello, world\\n\");", fontsize=10)
    page.insert_text((72, 220), "}", fontsize=10)

    # 3. Right column explanation
    page.insert_text((300, 140), "include standard header", fontsize=10)
    page.insert_text((300, 160), "main function entrypoint", fontsize=10)
    page.insert_text((300, 200), "print output string", fontsize=10)

    # 4. Caption
    page.insert_text((220, 260), "Listing 1.1 - The C Program", fontsize=12)
    return doc.tobytes()


def generate_repeated_margin_pdf():
    doc = pymupdf.open()
    for number in (1, 2):
        page = doc.new_page(width=612, height=792)
        page.insert_text((72, 22), "Journal of Examples", fontsize=9)
        page.insert_text((72, 100), f"Body sentence {number}.", fontsize=11)
        page.insert_text((72, 782), "Confidential", fontsize=9)
        page.insert_text((300, 782), str(number), fontsize=9)
    return doc.tobytes()

class TestPDFParserContract:
    def test_parse_returns_expected_schema(self):
        pdf_bytes = generate_synthetic_pdf()
        result = parse_pdf_document(pdf_bytes)
        assert "num_pages" in result
        assert "pages" in result
        assert "segments" in result
        assert "total_segments" in result
        assert "parse_time_ms" in result
        assert result["num_pages"] == 1
        assert result["total_segments"] >= 7

    def test_bounding_boxes_are_valid_percentages(self):
        pdf_bytes = generate_synthetic_pdf()
        result = parse_pdf_document(pdf_bytes)
        for seg in result["segments"]:
            assert "id" in seg
            assert "page" in seg
            assert "text" in seg
            assert "boxes" in seg
            assert len(seg["boxes"]) > 0
            for box in seg["boxes"]:
                assert 0.0 <= box["x"] <= 100.0
                assert 0.0 <= box["y"] <= 100.0
                assert 0.0 < box["w"] <= 100.0
                assert 0.0 < box["h"] <= 100.0

    def test_code_lines_are_not_skipped(self):
        pdf_bytes = generate_synthetic_pdf()
        result = parse_pdf_document(pdf_bytes)
        all_originals = [s.get("original_text", s["text"]) for s in result["segments"]]
        all_speech = [s.get("speech_text", s["text"]) for s in result["segments"]]

        # Verify original raw code lines are preserved
        assert any("#include <stdio.h>" in t for t in all_originals)
        assert any("main()" in t for t in all_originals)
        assert any("{" in t for t in all_originals)
        assert any("printf" in t for t in all_originals)
        assert any("}" in t for t in all_originals)
        assert any("Listing 1.1" in t for t in all_originals)

        # Verify speech text contains natural spoken lecture verbalizations
        assert any("hash includes standard header" in t for t in all_speech)
        assert any("main function with no arguments" in t for t in all_speech)
        assert any("open brace" in t for t in all_speech)
        assert any("close brace" in t for t in all_speech)

    def test_segments_contain_is_code_flag(self):
        pdf_bytes = generate_synthetic_pdf()
        result = parse_pdf_document(pdf_bytes)
        for seg in result["segments"]:
            assert "is_code" in seg
            assert isinstance(seg["is_code"], bool)
            assert "original_text" in seg
            assert "speech_text" in seg
            assert "transformed" in seg
            assert "verbalizer" in seg

        code_segs = [s for s in result["segments"] if s["is_code"]]
        assert len(code_segs) > 0
        assert any("open brace" in s["speech_text"] for s in code_segs)

    def test_repeated_headers_footers_and_page_numbers_are_ignored(self):
        result = parse_pdf_document(generate_repeated_margin_pdf())
        transcript = " ".join(segment["original_text"] for segment in result["segments"])
        assert "Body sentence 1." in transcript
        assert "Body sentence 2." in transcript
        assert "Journal of Examples" not in transcript
        assert "Confidential" not in transcript
