#!/usr/bin/env python3
"""
9-gyo-phi Engine & Model Management Server
Features:
1. On-Demand In-App Model Manager (download, inspect, delete, switch models).
2. Spatial 2D Layout Analysis (Recursive XY-Cut) for Multi-Column & Margin-Note PDFs.
3. Code-Aware Layout Engine: Preformatted syntax, braces, function signatures, captions.
4. Natural continuous human speech flow with silence trimming (~140ms breath gaps).
5. Fast streaming NDJSON audio endpoints with synchronized sentence timestamps.
"""
import sys
import os
import re
import io
import time
import wave
import json
import socket
import shutil
import base64
import asyncio
import threading
import math
import webbrowser
from pathlib import Path
from types import SimpleNamespace
from typing import List, Dict, Any, Tuple, Optional

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view
import uvicorn
from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import HTMLResponse, StreamingResponse, JSONResponse
from starlette.routing import Route, Mount
from starlette.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

# HuggingFace Hub for local cache inspection & on-demand downloads
from huggingface_hub import scan_cache_dir, snapshot_download, HfApi, hf_hub_download
from tqdm.auto import tqdm

# Apple Silicon MLX / Kokoro & Verbalizer
import mlx.core as mx
from mlx_audio.tts.utils import load_model
import pymupdf
from verbalizer import verbalize_segment, verbalize_rule_based, llm_engine

def _resolve_base_dir() -> Path:
    direct = Path(__file__).resolve().parent.parent
    if (direct / "src" / "static").exists():
        return direct

    curr = Path(__file__).resolve().parent
    for _ in range(12):
        if (curr / "src" / "static").exists():
            return curr
        curr = curr.parent

    for candidate_name in ["9-gyo-phi", "nine-gyo-phi"]:
        dev = Path.home() / "Desktop" / candidate_name
        if (dev / "src" / "static").exists():
            return dev

    if (Path.cwd() / "src" / "static").exists():
        return Path.cwd()

    return direct

BASE_DIR = _resolve_base_dir()
SRC_DIR = BASE_DIR / "src"
STATIC_DIR = SRC_DIR / "static"
HTML_FILE = SRC_DIR / "index.html"
STATIC_DIR.mkdir(parents=True, exist_ok=True)

MODEL_CATALOG = [
    {
        "id": "mlx-community/Kokoro-82M-bf16",
        "name": "Kokoro-82M (Default)",
        "type": "tts",
        "size_mb": 380,
        "required": True,
        "description": "Neural speech accelerated by Apple Silicon. Model files stay in your local cache."
    },
    {
        "id": "mlx-community/Qwen2.5-Coder-3B-Instruct-4bit",
        "name": "Qwen2.5-Coder-3B (Smart Code Verbalizer)",
        "type": "llm",
        "size_mb": 2150,
        "required": False,
        "description": "Optional local AI narrator: translates code syntax and equations into natural spoken lectures."
    },
    {
        "id": "mlx-community/Qwen2.5-7B-Instruct-4bit",
        "name": "Qwen2.5-7B (High-Precision Verbalizer)",
        "type": "llm",
        "size_mb": 4500,
        "required": False,
        "description": "Deep technical analysis and audio verbalization for complex research papers and math."
    }
]

DEFAULT_TTS_ID = "mlx-community/Kokoro-82M-bf16"
active_model_id = DEFAULT_TTS_ID
model = None
model_lock = threading.Lock()

def get_free_port(preferred: int = 8765) -> int:
    port = preferred
    while port < 65535:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", port)) != 0:
                return port
        port += 1
    return preferred

def get_cached_models_info() -> Dict[str, Dict[str, Any]]:
    installed = {}
    try:
        info = scan_cache_dir()
        for r in info.repos:
            installed[r.repo_id.lower()] = {
                "repo_id": r.repo_id,
                "size_str": r.size_on_disk_str,
                "size_bytes": r.size_on_disk,
                "repo_path": str(r.repo_path)
            }
    except Exception as e:
        print("[Model Manager] Cache scan error:", e)
    return installed

def is_model_installed(repo_id: str) -> Tuple[bool, str, int]:
    installed = get_cached_models_info()
    match = installed.get(repo_id.lower())
    if match:
        return True, match["size_str"], match["size_bytes"]
    return False, "0 MB", 0

def trim_silence_padding(wav_arr: np.ndarray, sample_rate: int = 24000, lead_ms: int = 40, trail_ms: int = 100, energy_threshold: float = 0.003) -> Tuple[np.ndarray, float]:
    arr = np.array(wav_arr, copy=False).flatten()
    window_size = int(0.04 * sample_rate)
    step = window_size // 4
    if len(arr) < window_size:
        return arr, 0.0

    windows = sliding_window_view(arr, window_size)[::step]
    energy = np.sqrt(np.mean(windows**2, axis=1))
    mask = energy >= energy_threshold
    if not np.any(mask):
        return arr, 0.0

    lead_samples = int((lead_ms / 1000.0) * sample_rate)
    trail_samples = int((trail_ms / 1000.0) * sample_rate)

    start = max(0, int(np.argmax(mask) * step - lead_samples))
    end = min(len(arr), int((len(mask) - 1 - np.argmax(mask[::-1])) * step + trail_samples))
    return arr[start:end], float(start / sample_rate)

def audio_to_wav_bytes(pcm_float_arr: np.ndarray, sample_rate: int = 24000) -> bytes:
    pcm16 = (np.clip(pcm_float_arr, -1.0, 1.0) * 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm16.tobytes())
    return buf.getvalue()

def merge_pipeline_results(results, sample_rate):
    """Preserve all audio and timestamp offsets when the model splits an input."""
    if len(results) == 1:
        return results[0]
    audio_parts, tokens = [], []
    offset = 0.0
    for result in results:
        audio = np.array(result.output.audio).flatten()
        audio_parts.append(audio)
        for token in result.tokens or []:
            tokens.append(SimpleNamespace(text=token.text, whitespace=token.whitespace,
                                          start_ts=token.start_ts + offset,
                                          end_ts=token.end_ts + offset))
        offset += len(audio) / sample_rate
    return SimpleNamespace(output=SimpleNamespace(audio=np.concatenate(audio_parts)), tokens=tokens)

def split_text_into_natural_chunks(text: str, max_words: int = 70) -> List[str]:
    text = text.strip()
    if not text:
        return []
    raw_paras = [p.strip() for p in re.split(r'\n\s*\n', text) if p.strip()]
    chunks = []
    for p in raw_paras:
        words = p.split()
        if len(words) <= max_words:
            p_clean = re.sub(r'\s+', ' ', p).strip()
            chunks.append(p_clean)
        else:
            sentences = re.split(r'(?<=[.?!…])\s+', p)
            cur_chunk = []
            cur_count = 0
            for s in sentences:
                s = re.sub(r'\s+', ' ', s).strip()
                if not s:
                    continue
                s_words = len(s.split())
                if cur_chunk and (cur_count + s_words > max_words):
                    chunks.append(' '.join(cur_chunk))
                    cur_chunk = [s]
                    cur_count = s_words
                else:
                    cur_chunk.append(s)
                    cur_count += s_words
            if cur_chunk:
                chunks.append(' '.join(cur_chunk))
    return chunks

# =======================================================================
# CODE & SPATIAL LAYOUT ENGINE
# =======================================================================

CODE_PATTERNS = [
    re.compile(r'^\s*#include\b'),
    re.compile(r'^\s*(import|from|def|class|function|fn|func|var|let|const|return|package|using|namespace)\b'),
    re.compile(r'^\s*(public|private|protected)?\s*(static)?\s*(void|int|float|double|char|bool|string)\b'),
    re.compile(r'^\s*[\{\}\(\)\[\];]\s*$'),
    re.compile(r';\s*$'),
    re.compile(r'^\s*\w+\s*\([^)]*\)\s*\{?\s*$'),
    re.compile(r'\b(printf|println|cout|console\.log|System\.out)\b')
]

def is_code_line(text: str, is_mono: bool = False) -> bool:
    t = text.strip()
    if not t:
        return False
    if is_mono:
        return True
    for pat in CODE_PATTERNS:
        if pat.search(t):
            return True
    return False

def clean_code_for_speech(text: str) -> str:
    spoken, _, _ = verbalize_rule_based(text)
    return spoken if spoken else text

def recursive_xy_cut(lines: List[Dict[str, Any]], min_gutter_width: float = 12.0, min_para_gap: float = 15.0) -> List[Dict[str, Any]]:
    if len(lines) <= 1:
        return lines

    # 1. First check for Vertical Gutters (X-Cuts dividing into columns)
    lines_x = sorted(lines, key=lambda l: l['bbox'][0])
    x_cuts = []
    current_max_x1 = lines_x[0]['bbox'][2]

    for i in range(1, len(lines_x)):
        curr_l = lines_x[i]
        gap = curr_l['bbox'][0] - current_max_x1
        if gap >= min_gutter_width:
            x_cuts.append(i)
        current_max_x1 = max(current_max_x1, curr_l['bbox'][2])

    if x_cuts:
        ordered = []
        start_idx = 0
        for cut_idx in x_cuts:
            col_lines = lines_x[start_idx:cut_idx]
            ordered.extend(recursive_xy_cut(col_lines, min_gutter_width, min_para_gap))
            start_idx = cut_idx
        col_lines = lines_x[start_idx:]
        ordered.extend(recursive_xy_cut(col_lines, min_gutter_width, min_para_gap))
        return ordered

    # 2. If no vertical gutter across all lines, find the largest Horizontal Gap (Y-Cut)
    lines_y = sorted(lines, key=lambda l: l['bbox'][1])
    current_max_y1 = lines_y[0]['bbox'][3]
    y_cut_idx = None
    max_gap = 0

    for i in range(1, len(lines_y)):
        curr_l = lines_y[i]
        gap = curr_l['bbox'][1] - current_max_y1
        if gap >= min_para_gap and gap > max_gap:
            max_gap = gap
            y_cut_idx = i
        current_max_y1 = max(current_max_y1, curr_l['bbox'][3])

    if y_cut_idx is not None:
        top_lines = lines_y[:y_cut_idx]
        bottom_lines = lines_y[y_cut_idx:]
        return recursive_xy_cut(top_lines, min_gutter_width, min_para_gap) + recursive_xy_cut(bottom_lines, min_gutter_width, min_para_gap)

    return lines_y

def parse_pdf_document(pdf_bytes: bytes) -> Dict[str, Any]:
    t0 = time.time()
    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    total_pages = len(doc)
    if total_pages > 500:
        doc.close()
        raise ValueError("PDFs must have 500 pages or fewer")
    pages_meta = []
    all_segments = []

    sentence_end_pattern = re.compile(r'[.?!…]$')
    seg_id = 0

    for page_idx in range(total_pages):
        page = doc[page_idx]
        pw, ph = page.rect.width, page.rect.height
        pages_meta.append({
            "page": page_idx,
            "width": round(pw, 1),
            "height": round(ph, 1)
        })

        d = page.get_text("dict")
        raw_lines = []

        for b in d.get("blocks", []):
            if b.get("type") == 0:
                for l in b.get("lines", []):
                    if (l["bbox"][1] < ph * 0.04 or l["bbox"][3] > ph * 0.96) and len(l.get("spans", [])) == 1:
                        span_text = l["spans"][0].get("text", "").strip()
                        if span_text.isdigit() or len(span_text) < 4:
                            continue

                    line_words = []
                    is_mono_line = False
                    for s in l.get("spans", []):
                        span_text = s.get("text", "")
                        font_name = s.get("font", "").lower()
                        flags = s.get("flags", 0)
                        if (flags & 8 != 0) or any(m in font_name for m in ["mono", "courier", "consolas", "inconsolata", "menlo", "typewriter", "fixed", "code", "source"]):
                            is_mono_line = True

                        words = span_text.split()
                        if not words:
                            continue
                        sx0, sy0, sx1, sy1 = s["bbox"]
                        sw = max(0.1, sx1 - sx0)
                        char_w = sw / max(1, len(span_text))

                        pos = 0
                        for w in words:
                            w_start = span_text.find(w, pos)
                            w_end = w_start + len(w)
                            pos = w_end
                            line_words.append({
                                "text": w,
                                "bbox": (sx0 + w_start * char_w, sy0, sx0 + w_end * char_w, sy1)
                            })

                    if line_words:
                        full_line_text = " ".join(w["text"] for w in line_words)
                        code_flag = is_code_line(full_line_text, is_mono=is_mono_line)
                        raw_lines.append({
                            "bbox": l["bbox"],
                            "words": line_words,
                            "text": full_line_text,
                            "is_code": code_flag
                        })

        if not raw_lines:
            continue

        ordered_lines = recursive_xy_cut(raw_lines)
        curr_prose_words = []
        prev_line_y1 = None

        def flush_prose():
            nonlocal seg_id, curr_prose_words
            if not curr_prose_words:
                return
            s_text = " ".join(x["text"] for x in curr_prose_words).strip()
            s_text = re.sub(r'(\w+)-\s+(\w+)', r'\1\2', s_text)
            # Strip footnote superscripts (e.g. "ML).1" -> "ML).", "development2" -> "development") without breaking decimals ("1.1")
            speech_clean = re.sub(r'([a-zA-Z\)])([.?!…])\d+\b', r'\1\2', s_text)
            speech_clean = re.sub(r'([a-zA-Z]{3,})\d+\b', r'\1', speech_clean)

            lines_map = {}
            for x in curr_prose_words:
                lid = x.get("line_id", 0)
                if lid not in lines_map:
                    lines_map[lid] = []
                lines_map[lid].append(x)

            boxes = []
            for lid, lw in lines_map.items():
                bx0 = round((min(item["bbox"][0] for item in lw) / pw) * 100, 2)
                by0 = round((min(item["bbox"][1] for item in lw) / ph) * 100, 2)
                bx1 = round((max(item["bbox"][2] for item in lw) / pw) * 100, 2)
                by1 = round((max(item["bbox"][3] for item in lw) / ph) * 100, 2)
                boxes.append({"x": bx0, "y": by0, "w": round(bx1 - bx0, 2), "h": round(by1 - by0, 2)})

            verb = verbalize_segment(speech_clean, is_code=False)
            if len(speech_clean) > 1:
                all_segments.append({
                    "id": seg_id,
                    "page": page_idx,
                    "text": verb["speech_text"],
                    "original_text": s_text,
                    "speech_text": verb["speech_text"],
                    "boxes": boxes,
                    "is_code": False,
                    "transformed": verb["transformed"],
                    "verbalizer": verb["verbalizer"],
                    "explanation": verb["explanation"]
                })
                seg_id += 1
            curr_prose_words = []

        for line_id, l in enumerate(ordered_lines):
            line_text = l["text"].strip()
            line_bbox = l["bbox"]
            is_code = l.get("is_code", False)

            if prev_line_y1 is not None:
                gap = line_bbox[1] - prev_line_y1
                line_height = line_bbox[3] - line_bbox[1]
                if gap > max(8.0, line_height * 1.3):
                    flush_prose()
            prev_line_y1 = line_bbox[3]

            if is_code:
                flush_prose()
                verb = verbalize_segment(line_text, is_code=True)
                bx0 = round((line_bbox[0] / pw) * 100, 2)
                by0 = round((line_bbox[1] / ph) * 100, 2)
                bx1 = round((line_bbox[2] / pw) * 100, 2)
                by1 = round((line_bbox[3] / ph) * 100, 2)
                all_segments.append({
                    "id": seg_id,
                    "page": page_idx,
                    "text": verb["speech_text"],
                    "original_text": line_text,
                    "speech_text": verb["speech_text"],
                    "boxes": [{"x": bx0, "y": by0, "w": round(bx1 - bx0, 2), "h": round(by1 - by0, 2)}],
                    "is_code": True,
                    "transformed": verb["transformed"],
                    "verbalizer": verb["verbalizer"],
                    "explanation": verb["explanation"]
                })
                seg_id += 1
                continue

            for w in l["words"]:
                w_copy = dict(w)
                w_copy["line_id"] = line_id
                curr_prose_words.append(w_copy)
                clean_w = re.sub(r'\d+$', '', w_copy["text"])
                if sentence_end_pattern.search(clean_w) and len(clean_w) > 1 and not re.search(r'\d+\.\d+$', w_copy["text"]):
                    flush_prose()

        flush_prose()

    doc.close()
    parse_time = time.time() - t0
    return {
        "num_pages": total_pages,
        "pages": pages_meta,
        "segments": all_segments,
        "total_segments": len(all_segments),
        "parse_time_ms": round(parse_time * 1000, 1)
    }

# =======================================================================
# HTTP & MODEL MANAGEMENT ROUTES
# =======================================================================

async def home(request):
    if not HTML_FILE.exists():
        return HTMLResponse("<h1>Error: index.html not found</h1>", status_code=500)
    return HTMLResponse(HTML_FILE.read_text(encoding="utf-8"))

async def health(request):
    tts_installed, size_str, _ = is_model_installed(active_model_id)
    return JSONResponse({
        "status": "ok",
        "model": active_model_id,
        "installed": tts_installed,
        "size": size_str
    })

class ModelDownloadManager:
    """
    Centralized, thread-safe model download manager.
    Features:
    - Decoupled from HTTP streams: downloads continue reliably if modal is closed.
    - Pre-queries Hugging Face metadata for exact, monotonic byte tracking.
    - Clean status names: no internal 'incomplete total...' strings.
    - Calculates smoothed download speed (MB/s) and estimated time remaining (ETA).
    - Supports clean user cancellation.
    - Asynchronous subscriber broadcast with non-blocking queue puts.
    """
    def __init__(self):
        self.lock = threading.Lock()
        self.active_task: Optional[Dict[str, Any]] = None
        self.cancel_event = threading.Event()
        self.subscribers: List[asyncio.Queue] = []
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        self.worker_thread: Optional[threading.Thread] = None

    def get_status(self) -> Optional[Dict[str, Any]]:
        with self.lock:
            if not self.active_task:
                return None
            return dict(self.active_task)

    def cancel_download(self, model_id: Optional[str] = None) -> Tuple[bool, str]:
        with self.lock:
            if not self.active_task or self.active_task.get("status") != "downloading":
                return False, "No active download in progress"
            if model_id and self.active_task.get("model_id", "").lower() != model_id.lower():
                return False, f"Active download is for {self.active_task.get('model_id')}"

            self.cancel_event.set()
            self.active_task["status"] = "cancelled"
            self.active_task["message"] = "Download cancelled by user"
            self.active_task["speed_mb"] = 0.0
            self.active_task["eta_seconds"] = 0
            self._broadcast_update_locked()
            return True, "Download cancelled successfully"

    def add_subscriber(self, q: asyncio.Queue):
        with self.lock:
            self.subscribers.append(q)

    def remove_subscriber(self, q: asyncio.Queue):
        with self.lock:
            if q in self.subscribers:
                self.subscribers.remove(q)

    def _broadcast_update_locked(self):
        if not self.loop or self.loop.is_closed():
            return
        snapshot = dict(self.active_task) if self.active_task else None
        if not snapshot:
            return
        for q in list(self.subscribers):
            try:
                self.loop.call_soon_threadsafe(self._safe_put_queue, q, snapshot)
            except Exception:
                pass

    @staticmethod
    def _safe_put_queue(q: asyncio.Queue, item: dict):
        try:
            if q.full():
                try:
                    q.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            q.put_nowait(item)
        except Exception:
            pass

    def start_download(self, model_id: str, loop: asyncio.AbstractEventLoop) -> Tuple[bool, str]:
        with self.lock:
            if self.active_task and self.active_task.get("status") == "downloading":
                if self.active_task.get("model_id", "").lower() == model_id.lower():
                    return True, "already_downloading"
                return False, f"Another download is in progress: {self.active_task.get('model_id')}"

            self.cancel_event.clear()
            self.loop = loop
            cat_entry = next((m for m in MODEL_CATALOG if m["id"].lower() == model_id.lower()), None)
            est_mb = float(cat_entry["size_mb"]) if cat_entry else 1500.0

            self.active_task = {
                "model_id": model_id,
                "status": "downloading",
                "percent": 0.0,
                "current_mb": 0.0,
                "total_mb": est_mb,
                "speed_mb": 0.0,
                "eta_seconds": 0,
                "filename": "Querying model metadata...",
                "message": "Connecting to repository...",
                "error": None
            }
            self.worker_thread = threading.Thread(
                target=self._worker,
                args=(model_id,),
                daemon=True
            )
            self.worker_thread.start()
            return True, "started"

    def _worker(self, model_id: str):
        try:
            api = HfApi()
            files_to_download = []
            total_bytes = 0
            try:
                info = api.model_info(model_id, files_metadata=True)
                files_to_download = [
                    s for s in info.siblings
                    if s.size and not s.rfilename.startswith(".") and not s.rfilename.endswith(".md")
                ]
                total_bytes = sum(s.size for s in files_to_download)
            except Exception as e:
                print(f"[Model Manager] Note: model_info query returned: {e}")

            cat_entry = next((m for m in MODEL_CATALOG if m["id"].lower() == model_id.lower()), None)
            total_mb = round(total_bytes / (1024 * 1024), 1) if total_bytes > 0 else (float(cat_entry["size_mb"]) if cat_entry else 1500.0)

            with self.lock:
                if self.cancel_event.is_set():
                    return
                self.active_task["total_mb"] = total_mb
                self.active_task["message"] = f"Downloading {len(files_to_download)} files..."
                self._broadcast_update_locked()

            completed_bytes = 0
            start_time = time.time()
            last_calc_time = start_time
            last_calc_bytes = 0
            current_speed = 0.0

            if files_to_download:
                for f_info in files_to_download:
                    if self.cancel_event.is_set():
                        break

                    f_name = f_info.rfilename
                    f_size = f_info.size
                    clean_name = f_name.split("/")[-1]

                    with self.lock:
                        self.active_task["filename"] = clean_name
                        self.active_task["message"] = f"Downloading {clean_name}"
                        self._broadcast_update_locked()

                    class FileTqdm:
                        def __init__(_s, *args, **kwargs):
                            _s.n = 0
                            _s.total = f_size or kwargs.get('total', 0)
                            _s.last_update = 0.0

                        def __enter__(_s):
                            return _s

                        def __exit__(_s, *args):
                            pass

                        def close(_s):
                            pass

                        def reset(_s, total=None):
                            if total is not None:
                                _s.total = total

                        def update(_s, n=1):
                            nonlocal completed_bytes, last_calc_time, last_calc_bytes, current_speed
                            if self.cancel_event.is_set():
                                raise RuntimeError("Download cancelled by user")
                            _s.n += n
                            now = time.time()
                            if (now - _s.last_update >= 0.1) or (_s.n >= _s.total):
                                _s.last_update = now
                                cum_bytes = completed_bytes + _s.n

                                dt = now - last_calc_time
                                if dt >= 0.5:
                                    db = cum_bytes - last_calc_bytes
                                    inst_speed = (db / dt) / (1024 * 1024)
                                    current_speed = (0.65 * current_speed + 0.35 * inst_speed) if current_speed > 0 else inst_speed
                                    last_calc_time = now
                                    last_calc_bytes = cum_bytes

                                pct = round((cum_bytes / total_bytes) * 100, 1) if total_bytes > 0 else 0.0
                                pct = min(99.8, max(0.0, pct))
                                cur_mb = round(cum_bytes / (1024 * 1024), 1)

                                rem_bytes = max(0, total_bytes - cum_bytes)
                                eta = int(rem_bytes / (current_speed * 1024 * 1024)) if current_speed > 0.05 else 0

                                with self.lock:
                                    self.active_task["current_mb"] = cur_mb
                                    self.active_task["percent"] = pct
                                    self.active_task["speed_mb"] = round(current_speed, 1)
                                    self.active_task["eta_seconds"] = eta
                                    self.active_task["filename"] = clean_name
                                    self._broadcast_update_locked()

                    hf_hub_download(
                        repo_id=model_id,
                        filename=f_name,
                        tqdm_class=FileTqdm
                    )
                    completed_bytes += f_size
            else:
                snapshot_download(repo_id=model_id)

            if self.cancel_event.is_set():
                with self.lock:
                    self.active_task["status"] = "cancelled"
                    self.active_task["message"] = "Download cancelled by user"
                    self._broadcast_update_locked()
                return

            with self.lock:
                self.active_task["filename"] = "Verifying..."
                self.active_task["message"] = "Validating local model cache..."
                self.active_task["percent"] = 99.5
                self._broadcast_update_locked()

            snapshot_download(repo_id=model_id, local_files_only=True)

            with self.lock:
                self.active_task["status"] = "completed"
                self.active_task["percent"] = 100.0
                self.active_task["current_mb"] = self.active_task["total_mb"]
                self.active_task["speed_mb"] = 0.0
                self.active_task["eta_seconds"] = 0
                self.active_task["filename"] = "Ready"
                self.active_task["message"] = "Model ready!"
                self._broadcast_update_locked()

        except Exception as err:
            if self.cancel_event.is_set():
                with self.lock:
                    self.active_task["status"] = "cancelled"
                    self.active_task["message"] = "Download cancelled"
                    self._broadcast_update_locked()
            else:
                print(f"[Model Manager] Download error: {err}")
                with self.lock:
                    self.active_task["status"] = "error"
                    self.active_task["error"] = str(err)
                    self.active_task["message"] = f"Download error: {str(err)}"
                    self._broadcast_update_locked()

download_manager = ModelDownloadManager()

async def models_status(request):
    catalog_status = []
    active_dl = download_manager.get_status()
    for m in MODEL_CATALOG:
        installed, size_str, size_bytes = is_model_installed(m["id"])
        is_dl = (
            active_dl is not None
            and active_dl.get("status") == "downloading"
            and active_dl.get("model_id", "").lower() == m["id"].lower()
        )
        catalog_status.append({
            **m,
            "installed": installed,
            "downloading": is_dl,
            "size_str": size_str,
            "size_bytes": size_bytes,
            "active": m["id"].lower() == active_model_id.lower()
        })
    return JSONResponse({
        "models": catalog_status,
        "active_download": active_dl
    })

async def download_model_endpoint(request):
    """
    Download a model with streaming progress updates.
    """
    try:
        data = await request.json()
        if not isinstance(data, dict):
            raise ValueError("Expected a JSON object")
    except Exception:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    repo_id = str(data.get("model_id", "")).strip()
    if not repo_id:
        return JSONResponse({"error": "Model ID required"}, status_code=400)
    if repo_id not in {entry["id"] for entry in MODEL_CATALOG}:
        return JSONResponse({"error": f"Model {repo_id} not found"}, status_code=404)

    loop = asyncio.get_running_loop()
    success, msg = download_manager.start_download(repo_id, loop)
    if not success:
        return JSONResponse({"error": msg}, status_code=409)

    q = asyncio.Queue(maxsize=64)
    download_manager.add_subscriber(q)

    cur_st = download_manager.get_status()
    if cur_st:
        try:
            q.put_nowait(cur_st)
        except Exception:
            pass

    async def event_generator():
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    item = await asyncio.wait_for(q.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    st = download_manager.get_status()
                    if st:
                        yield json.dumps(st) + "\n"
                        if st.get("status") in ["completed", "error", "cancelled"]:
                            break
                    continue
                yield json.dumps(item) + "\n"
                if item.get("status") in ["completed", "error", "cancelled"]:
                    break
        finally:
            download_manager.remove_subscriber(q)

    return StreamingResponse(
        event_generator(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )

async def cancel_download_endpoint(request):
    try:
        data = await request.json()
        if not isinstance(data, dict):
            raise ValueError("Expected a JSON object")
        model_id = data.get("model_id")
    except Exception:
        model_id = None
    success, msg = download_manager.cancel_download(model_id)
    status_str = "cancelled" if success else "idle"
    return JSONResponse({"success": success, "status": status_str, "message": msg})

async def delete_model_endpoint(request):
    try:
        data = await request.json()
        if not isinstance(data, dict):
            raise ValueError("Expected a JSON object")
    except Exception:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    repo_id = str(data.get("model_id", "")).strip().lower()
    if repo_id not in {entry["id"].lower() for entry in MODEL_CATALOG}:
        return JSONResponse({"error": "Model is not managed by this app"}, status_code=400)
    if repo_id == active_model_id.lower() or repo_id == llm_engine.model_id.lower():
        return JSONResponse({"error": "Active models cannot be removed while the engine is running"}, status_code=409)
    installed = get_cached_models_info()
    match = installed.get(repo_id)
    if not match:
        return JSONResponse({"status": "not_found", "error": "Model not in local cache", "message": "Model not in local cache"}, status_code=400)

    try:
        await run_in_threadpool(shutil.rmtree, match["repo_path"])
        return JSONResponse({"status": "deleted", "model_id": repo_id})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

async def pdf_parse_endpoint(request):
    try:
        pdf_bytes = await request.body()
        if not pdf_bytes:
            return JSONResponse({"error": "Empty PDF file"}, status_code=400)
        if len(pdf_bytes) > 25 * 1024 * 1024:
            return JSONResponse({"error": "PDF exceeds the 25 MB limit"}, status_code=413)
        if len(pdf_bytes) < 100 or not pdf_bytes.startswith(b"%PDF"):
            return JSONResponse({"error": "Failed to parse PDF: Corrupt or invalid PDF file"}, status_code=400)
        data = await run_in_threadpool(parse_pdf_document, pdf_bytes)
        return JSONResponse(data)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"error": f"Failed to parse PDF: {str(e)}"}, status_code=500)

async def verbalize_endpoint(request):
    try:
        data = await request.json()
        if not isinstance(data, dict):
            raise ValueError("Expected a JSON object")
    except Exception:
        return JSONResponse({"error": "Invalid JSON body"}, status_code=400)
    text = data.get("text", "")
    if not isinstance(text, str) or len(text) > 100_000:
        return JSONResponse({"error": "Text must be a string under 100,000 characters"}, status_code=400)
    is_code = bool(data.get("is_code", True))
    use_llm = bool(data.get("use_llm", True))
    res = await run_in_threadpool(verbalize_segment, text, is_code=is_code, use_llm=use_llm)
    return JSONResponse(res)

async def stream_tts(request):
    global model
    try:
        data = await request.json()
        if not isinstance(data, dict):
            raise ValueError("Expected a JSON object")
    except Exception:
        return JSONResponse({"error": "Invalid JSON body"}, status_code=400)

    raw_text = data.get("text", "")
    if not isinstance(raw_text, str) or len(raw_text) > 100_000:
        return JSONResponse({"error": "Text must be a string under 100,000 characters"}, status_code=400)
    text = raw_text.strip()
    voice = data.get("voice", "af_heart")
    try:
        speed = float(data.get("speed", 1.0))
        if not math.isfinite(speed) or not 0.5 <= speed <= 2.5:
            raise ValueError("Invalid speed")
    except (ValueError, TypeError):
        return JSONResponse({"error": "Speed must be between 0.5 and 2.5"}, status_code=400)
    if not isinstance(voice, str) or not re.fullmatch(r"[a-z]{2}_[a-z]+", voice):
        return JSONResponse({"error": "Choose a valid neural voice"}, status_code=400)
    use_llm = bool(data.get("use_llm", True))

    if not text:
        return JSONResponse({"error": "Text cannot be empty"}, status_code=400)

    if use_llm:
        processed_lines = []
        for line in text.split("\n"):
            if is_code_line(line):
                v = verbalize_segment(line, is_code=True)
                processed_lines.append(v["speech_text"])
            else:
                processed_lines.append(line)
        text = "\n".join(processed_lines)

    if model is None:
        await run_in_threadpool(init_and_warmup)
    if model is None:
        return JSONResponse({"error": "Install the Kokoro model before starting playback"}, status_code=503)

    lang_code = voice[0] if voice else "a"
    if lang_code not in ["a", "b", "e", "f", "h", "i", "p", "j", "z"]:
        lang_code = "a"

    chunks = split_text_into_natural_chunks(text)
    total_chunks = len(chunks)

    loop = asyncio.get_running_loop()
    queue = asyncio.Queue(maxsize=8)
    stop_event = threading.Event()

    def producer():
        try:
            for idx, chunk in enumerate(chunks):
                if stop_event.is_set():
                    break

                t0 = time.time()
                with model_lock:
                    pipeline = model._get_pipeline(lang_code)
                    results = list(pipeline(chunk, voice=voice, speed=speed))

                if not results or stop_event.is_set():
                    continue

                res = merge_pipeline_results(results, model.sample_rate)
                raw_audio = np.array(res.output.audio).flatten()
                trimmed_audio, lead_cut = trim_silence_padding(raw_audio, model.sample_rate)
                wav_bytes = audio_to_wav_bytes(trimmed_audio, model.sample_rate)
                b64_audio = base64.b64encode(wav_bytes).decode("ascii")
                duration = float(len(trimmed_audio) / model.sample_rate)

                sentences_meta = []
                if res.tokens:
                    curr = []
                    for t in res.tokens:
                        curr.append(t)
                        if t.text in ['.', '!', '?', '...']:
                            s_text = ''.join(tok.text + (' ' if tok.whitespace else '') for tok in curr).strip()
                            s_start = max(0.0, curr[0].start_ts - lead_cut)
                            s_end = max(0.0, curr[-1].end_ts - lead_cut)
                            sentences_meta.append({"text": s_text, "start": round(s_start, 2), "end": round(s_end, 2)})
                            curr = []
                    if curr:
                        s_text = ''.join(tok.text + (' ' if tok.whitespace else '') for tok in curr).strip()
                        s_start = max(0.0, curr[0].start_ts - lead_cut)
                        s_end = max(0.0, curr[-1].end_ts - lead_cut)
                        sentences_meta.append({"text": s_text, "start": round(s_start, 2), "end": round(s_end, 2)})

                payload = {
                    "chunk_idx": idx,
                    "total_chunks": total_chunks,
                    "text": chunk,
                    "duration": duration,
                    "gen_time": round(time.time() - t0, 3),
                    "audio_b64": b64_audio,
                    "sentences": sentences_meta
                }

                while not stop_event.is_set():
                    try:
                        fut = asyncio.run_coroutine_threadsafe(queue.put(payload), loop)
                        fut.result(timeout=0.25)
                        break
                    except Exception:
                        if stop_event.is_set():
                            break
                        continue

            if not stop_event.is_set():
                try:
                    asyncio.run_coroutine_threadsafe(queue.put({"done": True, "total_chunks": total_chunks}), loop).result(timeout=1.0)
                except Exception:
                    pass
        except Exception as err:
            if not stop_event.is_set():
                try:
                    asyncio.run_coroutine_threadsafe(queue.put({"error": str(err)}), loop).result(timeout=1.0)
                except Exception:
                    pass

    threading.Thread(target=producer, daemon=True).start()

    async def event_generator():
        try:
            while True:
                if await request.is_disconnected():
                    stop_event.set()
                    break
                try:
                    item = await asyncio.wait_for(queue.get(), timeout=0.1)
                except asyncio.TimeoutError:
                    continue
                yield json.dumps(item) + "\n"
                if item.get("done") or item.get("error"):
                    break
        finally:
            stop_event.set()

    return StreamingResponse(
        event_generator(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )

async def stream_pdf_segments(request):
    global model
    try:
        data = await request.json()
        if not isinstance(data, dict):
            raise ValueError("Expected a JSON object")
    except Exception:
        return JSONResponse({"error": "Invalid JSON body"}, status_code=400)

    segments = data.get("segments", [])
    voice = data.get("voice", "af_heart")
    try:
        speed = float(data.get("speed", 1.0))
        if not math.isfinite(speed) or not 0.5 <= speed <= 2.5:
            raise ValueError("Invalid speed")
    except (ValueError, TypeError):
        return JSONResponse({"error": "Speed must be between 0.5 and 2.5"}, status_code=400)
    if not isinstance(voice, str) or not re.fullmatch(r"[a-z]{2}_[a-z]+", voice):
        return JSONResponse({"error": "Choose a valid neural voice"}, status_code=400)
    use_llm = bool(data.get("use_llm", True))

    if not isinstance(segments, list) or len(segments) > 20_000 or any(not isinstance(segment, dict) or any(not isinstance(segment.get(key, ""), str) for key in ("text", "speech_text", "original_text")) for segment in segments):
        return JSONResponse({"error": "Invalid segments"}, status_code=400)
    if not segments:
        return JSONResponse({"error": "No segments provided"}, status_code=400)

    if model is None:
        await run_in_threadpool(init_and_warmup)
    if model is None:
        return JSONResponse({"error": "Install the Kokoro model before starting playback"}, status_code=503)

    lang_code = voice[0] if voice else "a"
    if lang_code not in ["a", "b", "e", "f", "h", "i", "p", "j", "z"]:
        lang_code = "a"

    speech_units = []
    curr_unit_segs = []
    curr_words_count = 0

    for seg in segments:
        spoken = seg.get("speech_text", seg.get("text", "")).strip() if use_llm else seg.get("original_text", seg.get("text", "")).strip()
        if not spoken:
            continue
        words_count = len(spoken.split())

        if curr_unit_segs and ((curr_words_count + words_count > 55) or (seg.get("page") != curr_unit_segs[0].get("page"))):
            speech_units.append(curr_unit_segs)
            curr_unit_segs = [seg]
            curr_words_count = words_count
        else:
            curr_unit_segs.append(seg)
            curr_words_count += words_count

    if curr_unit_segs:
        speech_units.append(curr_unit_segs)

    loop = asyncio.get_running_loop()
    queue = asyncio.Queue(maxsize=8)
    stop_event = threading.Event()

    def producer():
        try:
            for unit in speech_units:
                if stop_event.is_set():
                    break

                t0 = time.time()
                combined_text = " ".join((s.get("speech_text") or s.get("text", "")) if use_llm else (s.get("original_text") or s.get("text", "")) for s in unit)
                with model_lock:
                    pipeline = model._get_pipeline(lang_code)
                    results = list(pipeline(combined_text, voice=voice, speed=speed))

                if not results or stop_event.is_set():
                    continue

                res = merge_pipeline_results(results, model.sample_rate)
                raw_audio = np.array(res.output.audio).flatten()
                trimmed_audio, lead_cut = trim_silence_padding(raw_audio, model.sample_rate)

                wav_bytes = audio_to_wav_bytes(trimmed_audio, model.sample_rate)
                b64_audio = base64.b64encode(wav_bytes).decode("ascii")
                duration = float(len(trimmed_audio) / model.sample_rate)

                unit_sentences_meta = []
                if len(unit) == 1:
                    u0 = unit[0]
                    unit_sentences_meta.append({
                        "id": u0["id"],
                        "start": 0.0,
                        "end": duration,
                        "original_text": u0.get("original_text", u0.get("text", "")),
                        "speech_text": u0.get("speech_text", u0.get("text", "")),
                        "is_code": u0.get("is_code", False),
                        "transformed": u0.get("transformed", False),
                        "explanation": u0.get("explanation", "")
                    })
                else:
                    total_chars = max(1, sum(len((s.get("speech_text") or s.get("text", ""))) for s in unit))
                    acc_time = 0.0
                    for s in unit:
                        s_spoken = s.get("speech_text") or s.get("text", "")
                        prop = len(s_spoken) / total_chars
                        s_dur = duration * prop
                        unit_sentences_meta.append({
                            "id": s["id"],
                            "start": round(acc_time, 2),
                            "end": round(acc_time + s_dur, 2),
                            "original_text": s.get("original_text", s.get("text", "")),
                            "speech_text": s_spoken,
                            "is_code": s.get("is_code", False),
                            "transformed": s.get("transformed", False),
                            "explanation": s.get("explanation", "")
                        })
                        acc_time += s_dur

                payload = {
                    "sentences": unit_sentences_meta,
                    "duration": duration,
                    "gen_time": round(time.time() - t0, 3),
                    "audio_b64": b64_audio,
                }

                while not stop_event.is_set():
                    try:
                        fut = asyncio.run_coroutine_threadsafe(queue.put(payload), loop)
                        fut.result(timeout=0.25)
                        break
                    except Exception:
                        if stop_event.is_set():
                            break
                        continue

            if not stop_event.is_set():
                try:
                    asyncio.run_coroutine_threadsafe(queue.put({"done": True}), loop).result(timeout=1.0)
                except Exception:
                    pass
        except Exception as err:
            if not stop_event.is_set():
                try:
                    asyncio.run_coroutine_threadsafe(queue.put({"error": str(err)}), loop).result(timeout=1.0)
                except Exception:
                    pass

    threading.Thread(target=producer, daemon=True).start()

    async def event_generator():
        try:
            while True:
                if await request.is_disconnected():
                    stop_event.set()
                    break
                try:
                    item = await asyncio.wait_for(queue.get(), timeout=0.1)
                except asyncio.TimeoutError:
                    continue
                yield json.dumps(item) + "\n"
                if item.get("done") or item.get("error"):
                    break
        finally:
            stop_event.set()

    return StreamingResponse(
        event_generator(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )

app = Starlette(
    debug=False,
    middleware=[
        Middleware(
            CORSMiddleware,
            allow_origins=["http://127.0.0.1:8765", "http://localhost:8765", "http://127.0.0.1:8766", "http://localhost:8766", "tauri://localhost", "http://tauri.localhost", "https://tauri.localhost"],
            allow_methods=["*"],
            allow_headers=["*"],
        )
    ],
    routes=[
        Route("/", home, methods=["GET"]),
        Route("/api/health", health, methods=["GET"]),
        Route("/api/models/status", models_status, methods=["GET"]),
        Route("/api/models/download", download_model_endpoint, methods=["POST"]),
        Route("/api/models/cancel", cancel_download_endpoint, methods=["POST"]),
        Route("/api/models/delete", delete_model_endpoint, methods=["POST"]),
        Route("/api/stream", stream_tts, methods=["POST"]),
        Route("/api/verbalize", verbalize_endpoint, methods=["POST"]),
        Route("/api/pdf/parse", pdf_parse_endpoint, methods=["POST"]),
        Route("/api/pdf/stream", stream_pdf_segments, methods=["POST"]),
        Mount("/static", app=StaticFiles(directory=STATIC_DIR)),
    ]
)

def init_and_warmup():
    global model
    installed, _, _ = is_model_installed(active_model_id)
    if not installed:
        print(f"\033[1;33m[9-gyo-phi TTS]\033[0m Model {active_model_id} not installed yet. Ready for download via UI.")
        return

    print(f"\033[1;36m[9-gyo-phi TTS]\033[0m Initializing model {active_model_id} on Apple Silicon Metal...")
    t0 = time.time()
    model = load_model(active_model_id)
    list(model.generate("Model ready.", voice="af_heart"))
    print(f"\033[1;32m[9-gyo-phi TTS]\033[0m Model ready & warmed up in {time.time()-t0:.2f}s!")

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Start 9-gyo-phi Engine")
    parser.add_argument("port", nargs="?", type=int, default=None, help="Port to listen on (default: 8765)")
    parser.add_argument("--no-open", action="store_true", help="Don't open browser automatically")
    args = parser.parse_args()

    port = get_free_port(args.port if args.port else 8765)
    url = f"http://localhost:{port}"
    print(f"\n\033[1;32m========================================================\033[0m")
    print(f"  🎙️  \033[1;37m9-gyo-phi Desktop Engine is running!\033[0m")
    print(f"  👉  URL: \033[1;34m{url}\033[0m")
    print(f"  📦  Model Manager: In-App Model Downloader & Registry Active")
    print(f"  Press \033[1;31mCtrl+C\033[0m to stop server")
    print(f"\033[1;32m========================================================\033[0m\n")

    if not args.no_open:
        def open_browser():
            time.sleep(0.8)
            webbrowser.open(url)
        threading.Thread(target=open_browser, daemon=True).start()

    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")

if __name__ == "__main__":
    main()
