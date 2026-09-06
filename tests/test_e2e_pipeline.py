import pytest
import sys
import json
import base64
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent.parent / "engine"
sys.path.insert(0, str(ENGINE_DIR))

from server import app, is_model_installed
try:
    from tests.test_pdf_parser import generate_synthetic_pdf
except ImportError:
    from test_pdf_parser import generate_synthetic_pdf
from starlette.testclient import TestClient

client = TestClient(app)

class TestE2EPipeline:
    """Complete End-to-End verification of the 9-gyo-phi application stack."""

    def test_e2e_health_and_root(self):
        # 1. Root endpoint serves frontend HTML
        root_resp = client.get("/")
        assert root_resp.status_code == 200
        assert "9-gyo-phi" in root_resp.text
        assert "Listening companion" in root_resp.text
        assert client.get("/static/app.js").status_code == 200

        # 2. Health endpoint reports TTS model readiness
        health_resp = client.get("/api/health")
        assert health_resp.status_code == 200
        health_data = health_resp.json()
        assert health_data["status"] == "ok"
        assert "Kokoro-82M" in health_data["model"]
        assert isinstance(health_data["installed"], bool)

    def test_e2e_model_status_and_registry(self):
        # Test model registry and status reporting
        resp = client.get("/api/models/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "models" in data
        assert len(data["models"]) >= 3
        model_ids = [m["id"] for m in data["models"]]
        assert "mlx-community/Kokoro-82M-bf16" in model_ids
        assert "mlx-community/Qwen2.5-Coder-3B-Instruct-4bit" in model_ids
        assert "active_download" in data

    @pytest.mark.skipif(not is_model_installed("mlx-community/Kokoro-82M-bf16")[0], reason="Optional cached neural model required; tests never download it")
    def test_e2e_pdf_parse_to_stream_pipeline(self):
        # Ingest PDF -> Parse Segments -> Stream Audio & Speech Metadata
        pdf_bytes = generate_synthetic_pdf()

        # Step 1: Parse PDF
        parse_resp = client.post("/api/pdf/parse", content=pdf_bytes, headers={"Content-Type": "application/pdf"})
        assert parse_resp.status_code == 200
        parse_data = parse_resp.json()
        assert parse_data["num_pages"] == 1
        assert len(parse_data["segments"]) >= 7

        code_segs = [s for s in parse_data["segments"] if s.get("is_code")]
        assert len(code_segs) > 0
        stdio_seg = next(s for s in code_segs if "#include <stdio.h>" in s["original_text"])
        assert stdio_seg["speech_text"] == "hash includes standard header"
        assert stdio_seg["transformed"] is True

        # Step 2: Stream PDF Segments to TTS Engine
        stream_resp = client.post("/api/pdf/stream", json={
            "segments": parse_data["segments"][:3],
            "voice": "af_heart",
            "speed": 1.0,
            "use_llm": True
        })
        assert stream_resp.status_code == 200

        received_events = []
        for line in stream_resp.iter_lines():
            if line.strip():
                received_events.append(json.loads(line))

        assert len(received_events) >= 2
        # Verify first event has audio and sentence timings
        first_event = received_events[0]
        assert "audio_b64" in first_event
        assert "sentences" in first_event
        assert first_event["duration"] > 0
        raw_audio = base64.b64decode(first_event["audio_b64"])
        assert len(raw_audio) > 1000  # Valid binary audio chunk

        # Verify final event marks stream completion
        last_event = received_events[-1]
        assert last_event.get("done") is True

    @pytest.mark.skipif(not is_model_installed("mlx-community/Kokoro-82M-bf16")[0], reason="Optional cached neural model required; tests never download it")
    def test_e2e_scratchpad_tts_streaming(self):
        # Text Scratchpad TTS streaming with technical verbalization
        code_input = "#include <stdio.h>\nmain()\n{\nprintf(\"hi\\n\");\n}"
        resp = client.post("/api/stream", json={
            "text": code_input,
            "voice": "af_heart",
            "speed": 1.15,
            "use_llm": True
        })
        assert resp.status_code == 200

        events = []
        for line in resp.iter_lines():
            if line.strip():
                events.append(json.loads(line))

        assert len(events) >= 2
        chunk_event = events[0]
        assert "audio_b64" in chunk_event
        assert chunk_event["chunk_idx"] == 0
        assert chunk_event["duration"] > 0
        audio_data = base64.b64decode(chunk_event["audio_b64"])
        assert len(audio_data) > 500

        done_event = events[-1]
        assert done_event.get("done") is True

    def test_e2e_verbalize_endpoint_contracts(self):
        # Test C preprocessor
        c_resp = client.post("/api/verbalize", json={
            "text": "#include <stdlib.h>",
            "is_code": True,
            "use_llm": False
        })
        assert c_resp.status_code == 200
        c_data = c_resp.json()
        assert c_data["speech_text"] == "hash includes standard library header"
        assert c_data["transformed"] is True

        # Test Function entry
        fn_resp = client.post("/api/verbalize", json={
            "text": "main()",
            "is_code": True
        })
        assert fn_resp.status_code == 200
        assert "main function" in fn_resp.json()["speech_text"]

    def test_e2e_model_management_api_flow(self):
        # Test download validation for invalid model
        dl_bad = client.post("/api/models/download", json={"model_id": "nonexistent/model"})
        assert dl_bad.status_code == 404

        # Test cancel download when none active
        cancel_resp = client.post("/api/models/cancel")
        assert cancel_resp.status_code == 200
        assert cancel_resp.json()["status"] == "idle"

        # Test delete protection for non-installed model
        del_resp = client.post("/api/models/delete", json={"model_id": "nonexistent/model"})
        assert del_resp.status_code == 400

    def test_e2e_error_handling_and_validations(self):
        # Empty text on stream returns 400
        empty_stream = client.post("/api/stream", json={"text": "", "voice": "af_heart"})
        assert empty_stream.status_code == 400

        # Invalid JSON body on stream returns 400
        bad_json_stream = client.post("/api/stream", content="not json", headers={"Content-Type": "application/json"})
        assert bad_json_stream.status_code == 400

        # Corrupt PDF bytes return a client validation error
        bad_pdf = client.post("/api/pdf/parse", content=b"not a valid pdf", headers={"Content-Type": "application/pdf"})
        assert bad_pdf.status_code == 400
        assert "Failed to parse PDF" in bad_pdf.json()["error"]

        # Invalid JSON on verbalize returns 400
        bad_verbalize = client.post("/api/verbalize", content="bad", headers={"Content-Type": "application/json"})
        assert bad_verbalize.status_code == 400
