import pytest
import sys
from pathlib import Path

# Add engine directory to path
ENGINE_DIR = Path(__file__).resolve().parent.parent / "engine"
sys.path.insert(0, str(ENGINE_DIR))

from server import is_code_line, clean_code_for_speech, recursive_xy_cut

class TestCodeClassification:
    def test_c_includes_and_headers(self):
        assert is_code_line("#include <stdio.h>") is True
        assert is_code_line("#include \"my_header.h\"") is True
        assert is_code_line("main()") is True
        assert is_code_line("int main(int argc, char* argv[])") is True

    def test_braces_and_syntax_terminators(self):
        assert is_code_line("{") is True
        assert is_code_line("}") is True
        assert is_code_line("    printf(\"hello, world\\n\");") is True
        assert is_code_line("return 0;") is True

    def test_modern_languages_keywords(self):
        assert is_code_line("import numpy as np") is True
        assert is_code_line("from typing import List, Dict") is True
        assert is_code_line("def calculate_metrics(y_true, y_pred):") is True
        assert is_code_line("const token = jwt.sign(payload);") is True
        assert is_code_line("fn main() {") is True

    def test_prose_is_not_code(self):
        assert is_code_line("The first C program was written at Bell Labs.") is False
        assert is_code_line("In this chapter, we explore neural text-to-speech.") is False
        assert is_code_line("no arguments, which is indicated by the empty list ( ).") is False

    def test_monospace_flag_override(self):
        # Even if text looks like prose, monospace font flag marks it as code/listing
        assert is_code_line("some inline identifier", is_mono=True) is True

class TestCodeSpeechCleanup:
    def test_brace_pronunciation(self):
        assert clean_code_for_speech("{") == "open brace"
        assert clean_code_for_speech("}") == "close brace"
        assert clean_code_for_speech("(") == "open parenthesis"
        assert clean_code_for_speech(")") == "close parenthesis"
        assert clean_code_for_speech(";") == "semicolon"

    def test_symbol_normalization(self):
        cleaned = clean_code_for_speech("printf(\"hello\\n\");")
        assert "backslash n" in cleaned
        assert clean_code_for_speech("if (x != y)") == "if (x not equals y)"
        assert clean_code_for_speech("x -> y") == "x arrow y"

class TestRecursiveXYCut:
    def test_single_column_preserves_top_to_bottom(self):
        lines = [
            {"bbox": (72, 100, 300, 114), "text": "Line 1"},
            {"bbox": (72, 120, 300, 134), "text": "Line 2"},
            {"bbox": (72, 140, 300, 154), "text": "Line 3"},
        ]
        ordered = recursive_xy_cut(lines)
        texts = [l["text"] for l in ordered]
        assert texts == ["Line 1", "Line 2", "Line 3"]

    def test_two_columns_separated_by_gutter(self):
        # Left column: x in [70, 250], y in [100, 200]
        # Right column: x in [280, 500], y in [100, 200]
        lines = [
            {"bbox": (70, 100, 250, 115), "text": "Left Col L1"},
            {"bbox": (280, 100, 500, 115), "text": "Right Col L1"},
            {"bbox": (70, 125, 250, 140), "text": "Left Col L2"},
            {"bbox": (280, 125, 500, 140), "text": "Right Col L2"},
        ]
        ordered = recursive_xy_cut(lines, min_gutter_width=15)
        texts = [l["text"] for l in ordered]
        # Must read Left Col L1 -> Left Col L2 -> Right Col L1 -> Right Col L2
        assert texts == ["Left Col L1", "Left Col L2", "Right Col L1", "Right Col L2"]

    def test_full_width_header_above_columns(self):
        lines = [
            {"bbox": (70, 50, 500, 70), "text": "Full Width Header Title"},
            {"bbox": (70, 100, 250, 115), "text": "Left Col 1"},
            {"bbox": (280, 100, 500, 115), "text": "Right Col 1"},
            {"bbox": (70, 125, 250, 140), "text": "Left Col 2"},
        ]
        ordered = recursive_xy_cut(lines, min_gutter_width=15, min_para_gap=10)
        texts = [l["text"] for l in ordered]
        assert texts[0] == "Full Width Header Title"
        assert texts[1] == "Left Col 1"
        assert texts[2] == "Left Col 2"
        assert texts[3] == "Right Col 1"
