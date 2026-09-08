import pytest
import sys
from types import SimpleNamespace
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent.parent / "engine"
sys.path.insert(0, str(ENGINE_DIR))

from verbalizer import LLMVerbalizerEngine, verbalize_rule_based, verbalize_segment
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

    @pytest.mark.parametrize("source", [
        "def func(x, y):",
        "function func(x, y) {",
        "fn func(x, y) {",
    ])
    def test_function_definition_is_spoken_naturally(self, source):
        spoken, transformed, expl = verbalize_rule_based(source)
        assert spoken == "function definition for a function named func with two arguments x and y"
        assert transformed is True
        assert expl == "Function Definition"

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

    def test_static_assertion_is_faithful_and_complete(self):
        spoken, transformed, explanation = verbalize_rule_based(
            "static_assert(sizeof(void*) == 8);"
        )
        assert spoken == (
            "static assertion requiring size of void pointer equals 8 "
            "to be true at compile time"
        )
        assert transformed is True
        assert explanation == "Static Assertion"

    def test_punctuation_only_cleanup_does_not_hide_complex_code_from_llm(self):
        spoken, transformed, explanation = verbalize_rule_based(
            "foo<T>(bar, [](auto x) { return x.value(); });"
        )
        assert spoken == "foo<T>(bar, [](auto x) { return x.value(); });"
        assert transformed is False
        assert explanation == ""

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


def test_llm_accepts_the_first_complete_sentence(monkeypatch):
    engine = LLMVerbalizerEngine("fixture")
    engine._model = object()
    engine._tokenizer = SimpleNamespace(encode=lambda text: text.split())
    monkeypatch.setitem(
        sys.modules,
        "mlx_lm",
        SimpleNamespace(
            generate=lambda *args, **kwargs: (
                "Visible syntax calls a generic function. This extra sentence is ignored."
            )
        ),
    )

    assert engine.verbalize("complex<T>();") == "Visible syntax calls a generic function."


def test_llm_retries_output_that_hits_the_token_ceiling(monkeypatch):
    engine = LLMVerbalizerEngine("fixture")
    engine._model = object()
    engine._tokenizer = SimpleNamespace(encode=lambda text: text.split())
    calls = []

    def generate(*args, **kwargs):
        calls.append(kwargs["max_tokens"])
        if len(calls) == 1:
            return " ".join(["unfinished"] * kwargs["max_tokens"])
        return "A complete explanation."

    monkeypatch.setitem(sys.modules, "mlx_lm", SimpleNamespace(generate=generate))

    assert engine.verbalize("complex();", max_tokens=8) == "A complete explanation."
    assert calls == [8, 16]
