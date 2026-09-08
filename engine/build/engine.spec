# -*- mode: python ; coding: utf-8 -*-
# Builds the optional Apple Silicon engine (LLM verbalizer + MLX TTS) into a
# onedir bundle that the Tauri app embeds as a resource and launches on
# startup. Run via scripts/build_engine.sh rather than invoking pyinstaller
# directly, so paths/env are set up consistently.
import os

from PyInstaller.utils.hooks import collect_all

ENGINE_DIR = os.path.abspath(os.path.join(SPECPATH, ".."))

datas = []
binaries = []
hiddenimports = ["verbalizer"]

# These packages ship compiled extensions and/or dynamically-imported
# submodules (MLX's Metal kernels, mlx_audio's per-architecture model
# plugins) that PyInstaller's static analysis cannot discover on its own.
for pkg in (
    "mlx",
    "mlx_audio",
    "mlx_lm",
    "misaki",
    "en_core_web_sm",
    "pymupdf",
    "docling",
    "docling_core",
    "docling_parse",
    "docling_ibm_models",
    "bs4",
    "torch",
    "torchvision",
    "rapidocr",
    "huggingface_hub",
    "tqdm",
    "uvicorn",
    "starlette",
    "numpy",
):
    pkg_datas, pkg_binaries, pkg_hidden = collect_all(pkg)
    datas += pkg_datas
    binaries += pkg_binaries
    hiddenimports += pkg_hidden

a = Analysis(
    [os.path.join(ENGINE_DIR, "server.py")],
    pathex=[ENGINE_DIR],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="9-gyo-phi-engine",
    console=True,
    target_arch="arm64",
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="9-gyo-phi-engine",
)
