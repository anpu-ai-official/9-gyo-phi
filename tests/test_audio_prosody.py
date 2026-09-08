import pytest
import sys
import io
import wave
import numpy as np
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent.parent / "engine"
sys.path.insert(0, str(ENGINE_DIR))

from server import split_text_into_natural_chunks, trim_silence_padding, audio_to_wav_bytes

class TestSemanticChunking:
    def test_empty_string_returns_empty_list(self):
        assert split_text_into_natural_chunks("") == []
        assert split_text_into_natural_chunks("   \n\t  ") == []

    def test_preserves_single_paragraphs_under_limit(self):
        text = "This is a clean sentence. It has natural flow: no choppy clause splitting; and semicolons remain intact."
        chunks = split_text_into_natural_chunks(text, max_words=70)
        assert len(chunks) == 1
        assert "no choppy clause splitting;" in chunks[0]

    def test_paragraph_breaks_split_cleanly(self):
        p1 = "First complete paragraph introducing the topic."
        p2 = "Second paragraph continuing the narrative."
        full = f"{p1}\n\n{p2}"
        chunks = split_text_into_natural_chunks(full, max_words=70)
        assert len(chunks) == 2
        assert chunks[0] == p1
        assert chunks[1] == p2

    def test_splits_oversized_paragraphs_only_on_sentence_terminals(self):
        # 4 sentences each ~10 words, max_words=25 -> should group into 2 chunks
        s1 = "This is the very first sentence of the story."
        s2 = "Then the second sentence follows immediately after."
        s3 = "A third sentence adds further details to the context."
        s4 = "Finally the fourth sentence concludes this specific thought."
        para = f"{s1} {s2} {s3} {s4}"
        chunks = split_text_into_natural_chunks(para, max_words=25)
        assert len(chunks) >= 2
        for c in chunks:
            # Ensure no chunk ends mid-clause (e.g. at comma or colon)
            assert c.endswith((".", "!", "?"))

class TestSilenceTrimmer:
    def test_synthetic_padded_audio_is_trimmed(self):
        sr = 24000
        silence_lead = np.zeros(int(0.5 * sr), dtype=np.float32) # 500ms dead air
        silence_trail = np.zeros(int(0.5 * sr), dtype=np.float32) # 500ms dead air
        tone = (0.3 * np.sin(2 * np.pi * 440 * np.linspace(0, 1, sr))).astype(np.float32) # 1s audible tone
        signal = np.concatenate([silence_lead, tone, silence_trail])

        trimmed, lead_sec = trim_silence_padding(signal, sample_rate=sr, lead_ms=40, trail_ms=100)
        dur = len(trimmed) / sr
        # Should cut out ~860ms of dead air, leaving ~1.14s (tone + 40ms attack + 100ms decay)
        assert 1.05 <= dur <= 1.25
        assert 0.40 <= lead_sec <= 0.50

class TestWavEncoding:
    def test_valid_pcm16_wav_bytes(self):
        sr = 24000
        audio = np.linspace(-0.5, 0.5, sr, dtype=np.float32)
        wav_bytes = audio_to_wav_bytes(audio, sample_rate=sr)
        assert len(wav_bytes) > 44 # Header is 44 bytes
        assert wav_bytes[:4] == b"RIFF"
        assert wav_bytes[8:12] == b"WAVE"

        # Verify wave module can read it
        buf = io.BytesIO(wav_bytes)
        with wave.open(buf, "rb") as wf:
            assert wf.getnchannels() == 1
            assert wf.getsampwidth() == 2 # 16-bit
            assert wf.getframerate() == 24000
            assert wf.getnframes() == sr

class TestPipelineCompleteness:
    def test_multiple_model_results_preserve_audio_and_offset_timestamps(self):
        from types import SimpleNamespace
        from server import merge_pipeline_results
        def result(text):
            return SimpleNamespace(output=SimpleNamespace(audio=np.ones(24000)), tokens=[SimpleNamespace(text=text, whitespace=True, start_ts=0.1, end_ts=0.5)])
        combined = merge_pipeline_results([result('First'), result('Second')], 24000)
        assert len(combined.output.audio) == 48000
        assert combined.tokens[1].start_ts == 1.1
        assert combined.tokens[1].end_ts == 1.5

    def test_missing_model_timestamps_do_not_break_multi_result_audio(self):
        from types import SimpleNamespace
        from server import merge_pipeline_results
        def result(text):
            return SimpleNamespace(output=SimpleNamespace(audio=np.ones(24000)), tokens=[SimpleNamespace(text=text, whitespace=True, start_ts=None, end_ts=None)])
        combined = merge_pipeline_results([result('First'), result('Second')], 24000)
        assert len(combined.output.audio) == 48000
        assert combined.tokens[0].start_ts is None
        assert combined.tokens[1].end_ts is None
