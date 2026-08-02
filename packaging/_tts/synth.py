# -*- coding: utf-8 -*-
"""Local Korean TTS using Qwen3-TTS 0.6B CustomVoice (Apache-2.0)."""
from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
VENV_PYTHON = ROOT / ".qwen-venv" / "Scripts" / "python.exe"
_MODEL = None


def synth(text: str, out_path: str | Path) -> None:
    """Synthesize Korean *text* to a WAV file at *out_path*.

    This starts the isolated Qwen runtime, so callers (including
    ``produce_demo.py``) need not import its model dependencies.
    """
    out = Path(out_path).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    if not VENV_PYTHON.is_file():
        raise RuntimeError(f"Qwen runtime is missing: {VENV_PYTHON}")
    result = subprocess.run([str(VENV_PYTHON), str(Path(__file__).resolve()), "--worker", text, str(out)])
    if result.returncode:
        raise RuntimeError(f"Qwen synthesis failed with exit code {result.returncode}")


def _worker(text: str, out_path: Path) -> None:
    global _MODEL
    import soundfile as sf
    from qwen_tts import Qwen3TTSModel

    if _MODEL is None:
        _MODEL = Qwen3TTSModel.from_pretrained(
            "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice", device_map="cpu", dtype="float32"
        )
    wavs, sample_rate = _MODEL.generate_custom_voice(
        text=text, language="Korean", speaker="Sohee"
    )
    sf.write(out_path, wavs[0], sample_rate)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--worker", action="store_true")
    parser.add_argument("text", nargs="?")
    parser.add_argument("out_path", nargs="?", type=Path)
    args = parser.parse_args()
    if not args.worker or args.text is None or args.out_path is None:
        parser.error("usage: synth.py --worker TEXT OUT.wav")
    _worker(args.text, args.out_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
