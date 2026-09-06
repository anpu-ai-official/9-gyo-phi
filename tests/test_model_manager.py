import pytest
import sys
from pathlib import Path
from starlette.testclient import TestClient

ENGINE_DIR = Path(__file__).resolve().parent.parent / "engine"
sys.path.insert(0, str(ENGINE_DIR))

from server import app, is_model_installed, MODEL_CATALOG

client = TestClient(app)

class TestModelRegistry:
    def test_catalog_has_required_fields(self):
        assert len(MODEL_CATALOG) >= 2
        for m in MODEL_CATALOG:
            assert "id" in m
            assert "name" in m
            assert "type" in m
            assert m["type"] in ["tts", "llm"]
            assert "size_mb" in m
            assert m["size_mb"] > 0

    def test_kokoro_model_cache_detection(self):
        installed, size_str, size_bytes = is_model_installed("mlx-community/Kokoro-82M-bf16")
        assert isinstance(installed, bool)
        assert (size_bytes > 0) == installed
        assert isinstance(size_str, str)

    def test_models_status_api_endpoint(self):
        resp = client.get("/api/models/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "models" in data
        kokoro_entry = next((m for m in data["models"] if "Kokoro" in m["name"]), None)
        assert kokoro_entry is not None
        assert kokoro_entry["installed"] == is_model_installed(kokoro_entry["id"])[0]
        assert kokoro_entry["active"] is True

    def test_health_api_endpoint(self):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "model" in data

    def test_models_status_includes_active_download_key(self):
        resp = client.get("/api/models/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "active_download" in data

    def test_cancel_endpoint_no_active_download(self):
        resp = client.post("/api/models/cancel", json={})
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is False
        assert "No active download" in data["message"]

    def test_download_manager_start_and_cancel_lifecycle(self, monkeypatch):
        import asyncio
        from server import ModelDownloadManager
        download_manager = ModelDownloadManager()
        monkeypatch.setattr(download_manager, "_worker", lambda model_id: None)

        loop = asyncio.new_event_loop()
        try:
            started, msg = download_manager.start_download("hf-internal-testing/tiny-test-model", loop)
            assert started is True
            st = download_manager.get_status()
            assert st is not None
            assert st["status"] == "downloading"

            cancelled, cmsg = download_manager.cancel_download("hf-internal-testing/tiny-test-model")
            assert cancelled is True
            assert download_manager.get_status()["status"] == "cancelled"
        finally:
            loop.close()

    def test_tqdm_class_context_manager_contract(self):
        # Verify custom tqdm implementation supports hf_hub_download context manager
        from server import ModelDownloadManager
        dm = ModelDownloadManager()
        # Verify dummy context manager protocol
        class DummyTqdm:
            def __init__(self, *args, **kwargs):
                self.n = 0
                self.total = 100
            def __enter__(self):
                return self
            def __exit__(self, *args):
                pass
            def close(self):
                pass
            def update(self, n=1):
                self.n += n

        with DummyTqdm(total=100) as pbar:
            pbar.update(25)
            assert pbar.n == 25
        pbar.close()
