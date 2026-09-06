import sys
from pathlib import Path
import pytest
from starlette.testclient import TestClient
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'engine'))
from server import app
client = TestClient(app)

@pytest.mark.parametrize('body', [None, [], {'text': None}, {'text': 3}, {'text': 'x'*100001}, {'text': 'hello', 'speed': 'fast'}, {'text': 'hello', 'speed': -1}, {'text': 'hello', 'speed': 999}, {'text': 'hello', 'voice': ['af_heart']}])
def test_invalid_speech_input_is_a_client_error(body):
    assert client.post('/api/stream', json=body).status_code == 400

@pytest.mark.parametrize('body', [None, [], {'text': 3}, {'text': 'x'*100001}])
def test_invalid_verbalizer_input_is_a_client_error(body):
    assert client.post('/api/verbalize', json=body).status_code == 400

def test_unrelated_model_download_is_rejected():
    assert client.post('/api/models/download', json={'model_id':'unrelated/repo'}).status_code == 404

def test_active_model_deletion_is_protected():
    assert client.post('/api/models/delete', json={'model_id':'mlx-community/Kokoro-82M-bf16'}).status_code == 409

def test_cors_excludes_unknown_websites():
    response=client.options('/api/stream',headers={'Origin':'https://unknown.example','Access-Control-Request-Method':'POST'})
    assert response.status_code == 400
    assert response.headers.get('access-control-allow-origin') is None
