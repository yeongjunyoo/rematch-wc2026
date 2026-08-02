# REMATCH Korean local-TTS comparison

Created 2026-08-02. Every numbered WAV uses the identical ordered script below; `11.wav` is the required number/proper-noun stress sentence. `ALL.mp3` is the FFmpeg concat of `01.wav` through `11.wav`. Audio output was mechanically checked with `ffprobe`; no listening-based quality claim is made here.

## Script

1. 손흥민은 벤치에 있었습니다
2. 그리고 우리는 졌습니다
3. 리매치는 그 순간부터 지휘권을 당신에게 넘깁니다
4. 실제 결과를 보여주고 그 지점에서 멈춥니다
5. 더그아웃에서 전술을 바꿉니다
6. 벤치에서 손흥민을 고르고 뺄 선수를 누릅니다
7. 확정하면 경기가 다시 흐릅니다. 토큰은 세 장뿐
8. 끝까지 진행하면 결과 리포트가 나옵니다
9. 내가 바꾼 것과 실제 역사가 나란히 놓입니다
10. 브라우저에서 바로 해 보세요
11. 후반 63분, 대한민국 0대 1. 손흥민을 투입합니다.

## Candidate matrix

| Candidate | Korean support — primary source | License — primary source | Installation / run result | Measured synthesis time | Number/name result | Samples | Decision |
|---|---|---|---|---|---|---|---|
| **Qwen3-TTS 0.6B CustomVoice (Sohee)** | [Model card](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice): `language: ko`, text explicitly lists Korean and native Korean speaker `Sohee`. | Same [model card](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice): `license: apache-2.0`; [upstream README](https://github.com/QwenLM/Qwen3-TTS) is Apache-2.0. | `uv` Python 3.12 isolated `.qwen-venv`; `qwen-tts==0.1.1`; CPU-only Torch on this host. Model downloaded and all 11 generated. FlashAttention unavailable warning; SoX executable warning did not stop WAV output. | `synth()` wall time: **77.310 s** for sentence 10 (model load + CPU synthesis, 3.52 s output). | **Unverified**: no ASR/listening was used, so numeric reading and “손흥민” pronunciation are not asserted. | [`qwen3-tts-0.6b-customvoice/`](qwen3-tts-0.6b-customvoice/) — `01.wav`…`11.wav`, `ALL.mp3` (52.640 s, MP3/24 kHz/mono). | **Adopt, pending human A/B**. This is the implementation behind `synth.py`: verified local WAV output, explicit Korean checkpoint and Apache-2.0 checkpoint license. This is a licensing/integration decision, not a naturalness judgment. |
| Chatterbox Multilingual V3 | [Model card](https://huggingface.co/ResembleAI/chatterbox): front matter includes `ko`; its Multilingual section explicitly lists Korean. | Same [model card](https://huggingface.co/ResembleAI/chatterbox): `license: mit`. | Python 3.12 `.venv`, installed from the [upstream GitHub repo](https://github.com/resemble-ai/chatterbox) because PyPI `chatterbox-tts==0.1.7` lacked the V3 `t3_model` argument. CPU-only Torch; all 11 generated. | **1572.968 s** wall time for all 11 (model load + CPU synthesis). | **Unverified** (no ASR/listening). | [`chatterbox-multilingual-v3/`](chatterbox-multilingual-v3/) — `01.wav`…`11.wav`, `ALL.mp3` (31.640 s, MP3/24 kHz/mono). | Eligible fallback only. MIT model card and successful local output, but CPU batch time is much larger than Qwen’s one-sentence measured probe; select only after human listening comparison. |
| MeloTTS | [Upstream README](https://github.com/myshell-ai/MeloTTS) explicitly lists Korean and provides a Korean sample link. | Same [README](https://github.com/myshell-ai/MeloTTS), License section: MIT and commercial/non-commercial use. | **Failed before synthesis**: `uv pip install MeloTTS` on Python 3.12 failed building `melotts==0.1.1`; `setup.py` looks for an absent `requirements.txt` in its source distribution (`FileNotFoundError`). | N/A — install failure. | N/A. | None. | Not adopted. Failure is recorded rather than substituted with an unverified fork/package.

### Additional investigated local option

| Candidate | Korean / license primary source | Status |
|---|---|---|
| CosyVoice | [Upstream README](https://github.com/FunAudioLLM/CosyVoice) explicitly lists Korean in language coverage; [repo](https://github.com/FunAudioLLM/CosyVoice) is Apache-2.0. | Not installed for this deadline pass: the upstream install instructions require a separate Python 3.10 Conda environment and model/resource downloads. No sample, no adoption. Check the specific checkpoint card’s license again before any later install; repo license alone is not a checkpoint-license substitute. |

## Baseline (not a local-license candidate)

| Baseline | Command used | Measured synthesis time | Samples / mechanical inspection | Rights status |
|---|---|---:|---|---|
| `edge-tts`, `ko-KR-InJoonNeural`, `+6%` | Exactly the existing `produce_demo.py` form: `python -m edge_tts --voice ko-KR-InJoonNeural --rate +6% --text TEXT --write-media OUT.mp3`; each MP3 was converted to WAV before concat. | **12.929 s** for all 11, including conversion/concat work. | [`edge-tts-injoon-baseline/`](edge-tts-injoon-baseline/) — `01.wav`…`11.wav`, `ALL.mp3` (45.840 s, MP3/24 kHz/mono). Numeric/proper-name pronunciation **unverified** without ASR/listening. | **Do not treat as cleared for prize/contest use.** The [edge-tts README](https://github.com/rany2/edge-tts) says it uses Microsoft Edge’s *online* TTS service without Edge or an API key; it is not an output-rights grant. Microsoft’s [Services Agreement](https://www.microsoft.com/en-us/servicesagreement) governs consumer online services and can change; neither source supplied here is a specific commercial/contest output license for this unofficial endpoint invocation. This is a risk statement, not a claim that use is prohibited. |

## Integration

`produce_demo.py` currently invokes an `edge_tts` subprocess in `tts(text, out)`. Replace only that call with an import/path call to `packaging/_tts/synth.py` and call:

```python
from synth import synth
synth(text, out_wav)
```

`synth(text, out_path)` is a minimal standard-library frontend that launches `.qwen-venv/Scripts/python.exe` and produces a 24 kHz mono WAV. It was directly executed with `리매치 전술 시연을 시작합니다.` (3.520 s WAV) and a timed sentence-10 probe (77.310 s wall time). Because it writes WAV, the caller must use a `.wav` temporary/path or let its existing FFmpeg input handling consume WAV; it must not retain an `.mp3` filename for PCM output.

## Human review gate

Listen to the three `ALL.mp3` files and specifically `11.wav` before finalizing. This report does **not** declare any voice natural, nor does it claim how `63분`, `0대 1`, `대한민국`, or `손흥민` was spoken. The selected Qwen implementation is permitted by the documented Apache-2.0 checkpoint label and has successful local output; naturalness and pronunciation remain human acceptance criteria.
