import pytest
import sys
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent.parent / "engine"
sys.path.insert(0, str(ENGINE_DIR))

from verbalizer import verbalize_rule_based, verbalize_segment
from starlette.testclient import TestClient
from server import app

client = TestClient(app)

class TestVerbalizerRules:
    def test_include_stdio(self):
        spoken, transformed, expl = verbalize_rule_based("#include <stdio.h>")
        assert spoken == "hash includes standard header"
        assert transformed is True
        assert "Header" in expl

    def test_include_stdlib(self):
        spoken, transformed, expl = verbalize_rule_based("#include <stdlib.h>")
        assert spoken == "hash includes standard library header"
        assert transformed is True

    def test_include_math(self):
        spoken, transformed, expl = verbalize_rule_based("#include <math.h>")
        assert spoken == "hash includes math library header"
        assert transformed is True

    def test_main_function(self):
        spoken, transformed, expl = verbalize_rule_based("main()")
        assert "main function" in spoken
        assert transformed is True

    def test_braces(self):
        spoken_open, t_open, _ = verbalize_rule_based("{")
        spoken_close, t_close, _ = verbalize_rule_based("}")
        assert spoken_open == "open brace"
        assert spoken_close == "close brace"
        assert t_open is True
        assert t_close is True

    def test_printf_verbalization(self):
        spoken, transformed, expl = verbalize_rule_based('printf("hello, world\\n");')
        assert "print f" in spoken
        assert "hello, world" in spoken
        assert transformed is True

    def test_for_loop(self):
        spoken, transformed, expl = verbalize_rule_based("for (int i = 0; i < 10; i++)")
        assert "for loop" in spoken
        assert transformed is True

    def test_return_zero(self):
        spoken, transformed, expl = verbalize_rule_based("return 0;")
        assert spoken == "return zero"
        assert transformed is True

    def test_comment(self):
        spoken, transformed, expl = verbalize_rule_based("// compute total value")
        assert "comment" in spoken.lower()
        assert "compute total value" in spoken
        assert transformed is True

    def test_verbalize_segment_metadata(self):
        meta = verbalize_segment("#include <stdio.h>", is_code=True, use_llm=False)
        assert meta["original_text"] == "#include <stdio.h>"
        assert meta["speech_text"] == "hash includes standard header"
        assert meta["is_code"] is True
        assert meta["transformed"] is True
        assert "verbalizer" in meta
        assert "explanation" in meta
        assert "Header" in meta["explanation"]

    def test_verbalize_api_endpoint(self):
        response = client.post("/api/verbalize", json={
            "text": "#include <stdio.h>",
            "is_code": True,
            "use_llm": False
        })
        assert response.status_code == 200
        data = response.json()
        assert data["original_text"] == "#include <stdio.h>"
        assert data["speech_text"] == "hash includes standard header"
        assert data["transformed"] is True
