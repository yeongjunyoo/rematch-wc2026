# -*- coding: utf-8 -*-
"""REMATCH 시연영상 마감본 — 실제 플레이를 먼저 보여 주는 45~60초 컷다운.

python packaging/produce_demo.py packaging/_footage/<run>
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

# 윈도우 콘솔 기본 코드페이지(cp949)에서는 em dash 같은 글자가 UnicodeEncodeError를 낸다.
# 게이트가 잡은 진단을 출력하다 스크립트가 죽으면 게이트가 없는 것만 못하다.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

W, H, FPS = 1280, 720, 30
ROOT = Path(__file__).resolve().parent
URL = "https://rematch-wc2026.vercel.app"
VOICE = "ko-KR-InJoonNeural"
CAPTION_MIN_SECONDS = 1.5
CAPTION_MAX_CPS = 17.0

# (raw 시작초, 길이, 선택 캡션). None은 화면과 내레이션만으로 읽히는 구간이다.
# 구간은 record_demo.py의 20260803 녹화 표식에 맞춘다. 긴 상호작용과 리포트에 체류한다.
BEATS = [
    (3.50, 3.40, "63분, 선택은 지금부터"),
    (5.50, 2.60, None),
    (10.45, 2.60, "실제 결과에서 멈춘다"),
    (13.90, 2.30, None),
    (16.10, 3.70, "손흥민 투입. 전술도 바꾼다"),
    (19.90, 2.70, None),
    (22.40, 5.80, "한 번의 교체가 이후 기록을 바꾼다"),
    (28.60, 4.80, None),
    (36.70, 7.10, "결과는 리포트로 남는다"),
    (43.80, 4.30, None),
    (47.55, 2.65, "다섯 경기, 다시 지휘한다"),
]

# (합성 타임라인 시작초, 문장). 각 문장은 다음 문장 전과 영상 종료 전 끝나야 한다.
NARRATION = [
    (0.25, "63분, 손흥민은 벤치에 있었습니다."),
    (5.90, "실제 결과에서 멈춥니다."),
    (8.80, "선수와 전술을 직접 바꿉니다."),
    (14.80, "손흥민을 넣고, 한 번의 교체를 확정합니다."),
    (22.40, "그 선택 뒤의 경기 기록까지 확인합니다."),
    (30.50, "결과는 실제 역사와 나란히 남습니다."),
    (39.40, "다섯 경기를 다시 지휘하세요."),
    (43.30, "리매치. 브라우저에서 바로."),
]

FONT = None
for candidate in (
    "C:/Windows/Fonts/malgunbd.ttf",
    "C:/Windows/Fonts/malgun.ttf",
    "C:/Windows/Fonts/NanumGothicBold.ttf",
):
    if Path(candidate).exists():
        FONT = candidate
        break
if FONT is None:
    raise SystemExit("한글 폰트를 찾지 못했습니다.")
FONT_ESC = FONT.replace(":", "\\:")


def run(args: list[str]) -> None:
    proc = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if proc.returncode != 0:
        print(" ".join(args[:12]), "...")
        print(proc.stderr[-2500:])
        raise SystemExit(f"명령 실패 rc={proc.returncode}")


def duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    return float(out)


def media_probe(path: Path) -> dict:
    proc = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries",
         "format=duration,bit_rate:stream=codec_name,profile,width,height,avg_frame_rate,bit_rate,sample_rate,channels",
         "-of", "json", str(path)],
        capture_output=True, text=True, check=True, encoding="utf-8",
    )
    return json.loads(proc.stdout)


def esc(text: str) -> str:
    return text.replace("\\", "\\\\").replace(":", "\\:").replace("'", "’").replace("%", "\\%")


def caption_cps(text: str, seconds: float) -> float:
    return len("".join(text.split())) / seconds


def validate_captions() -> None:
    violations = []
    for i, (_, seconds, caption) in enumerate(BEATS):
        if caption is None:
            continue
        cps = caption_cps(caption, seconds)
        if seconds < CAPTION_MIN_SECONDS:
            violations.append(f"beat {i}: {seconds:.2f}s < 최소 {CAPTION_MIN_SECONDS:.1f}s")
        if cps > CAPTION_MAX_CPS:
            violations.append(f"beat {i}: {cps:.1f} CPS > 상한 {CAPTION_MAX_CPS:.1f}")
    if violations:
        raise SystemExit("자막 게이트 위반:\n  " + "\n  ".join(violations))


def make_end_card(out: Path, seconds: float) -> None:
    draw = (
        f"drawtext=fontfile='{FONT_ESC}':text='REMATCH':fontsize=72:fontcolor=#f4f5f2:"
        f"x=(w-text_w)/2:y=(h/2)-120,"
        f"drawtext=fontfile='{FONT_ESC}':text='{esc('전술로 결과를 다시 쓰는 게임')}':fontsize=32:"
        f"fontcolor=#9fbdb4:x=(w-text_w)/2:y=(h/2)-34,"
        f"drawtext=fontfile='{FONT_ESC}':text='{esc(URL)}':fontsize=34:fontcolor=#d8f0a4:"
        f"x=(w-text_w)/2:y=(h/2)+52,"
        f"drawtext=fontfile='{FONT_ESC}':text='{esc('설치도 가입도 결제도 없이 브라우저에서 바로')}':fontsize=25:"
        f"fontcolor=#7f918c:x=(w-text_w)/2:y=(h/2)+120"
    )
    run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i",
         f"color=c=#12211e:s={W}x{H}:r={FPS}:d={seconds:.2f}", "-vf", draw,
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", str(out)])


def cut_beat(raw: Path, out: Path, start: float, length: float, caption: str | None) -> None:
    """플레이 화면을 원래 해상도로 유지하고, 필요한 샷에만 짧은 캡션을 얹는다.

    캡션은 하단 밴드다. 상단에 두면 제품이 그 자리에 쓰는 경기명과 시도 번호를 덮어
    "무슨 경기를 보고 있는지"가 사라진다. 근거 = NAN 2026 「18 플레이 영상 도시에」
    ①-6, 캡션은 화면 글자와 겹치지 않는 하단 단색 밴드에 둔다.
    """
    vf = "null"
    if caption:
        vf = (
            "drawbox=x=0:y=ih-84:w=iw:h=84:color=#12211e@0.82:t=fill,"
            f"drawtext=fontfile='{FONT_ESC}':text='{esc(caption)}':fontsize=30:fontcolor=#f4f5f2:"
            "x=(w-text_w)/2:y=h-56"
        )
    run(["ffmpeg", "-v", "error", "-y", "-ss", f"{start:.2f}", "-t", f"{length:.2f}",
         "-i", str(raw), "-vf", vf, "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
         "-pix_fmt", "yuv420p", "-r", str(FPS), str(out)])


def tts(text: str, out: Path, synth: Path | None) -> None:
    """문장 하나를 음성으로. 같은 문장은 다시 합성하지 않는다.

    로컬 모델은 문장당 2분쯤 걸린다. 타이밍을 한 줄 고칠 때마다 전량을 다시 만들면
    한 번의 수정이 16분이 되고, 그 비용이 문장을 다듬는 일 자체를 막는다.
    문장 내용으로 캐시 키를 잡으므로 문장이 바뀌면 그 문장만 다시 만든다.
    """
    stamp = out.with_suffix(out.suffix + ".txt")
    if out.exists() and stamp.exists() and stamp.read_text(encoding="utf-8") == text:
        return
    _synthesize(text, out, synth)
    stamp.write_text(text, encoding="utf-8")


def _synthesize(text: str, out: Path, synth: Path | None) -> None:
    if synth:
        runner = ("import importlib.util,sys;spec=importlib.util.spec_from_file_location('rematch_tts',sys.argv[1]);"
                  "module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);"
                  "module.synth(sys.argv[2],sys.argv[3])")
        run([sys.executable, "-c", runner, str(synth), text, str(out)])
    else:
        run([sys.executable, "-m", "edge_tts", "--voice", VOICE, "--rate", "+6%",
             "--text", text, "--write-media", str(out)])


def main() -> int:
    if len(sys.argv) < 2:
        raise SystemExit("사용법: python packaging/produce_demo.py packaging/_footage/<run>")
    run_dir = Path(sys.argv[1]).resolve()
    raw = run_dir / "raw.mp4"
    if not raw.exists():
        webm = sorted(run_dir.glob("*.webm"))
        if not webm:
            raise SystemExit(f"raw 영상을 찾지 못했습니다: {run_dir}")
        run(["ffmpeg", "-v", "error", "-y", "-i", str(webm[0]), "-c:v", "libx264", "-preset", "veryfast",
             "-crf", "20", "-pix_fmt", "yuv420p", "-r", str(FPS), str(raw)])
    raw_len = duration(raw)
    validate_captions()
    print(f"raw {raw_len:.2f}s; captions passed ({CAPTION_MIN_SECONDS:.1f}s minimum, {CAPTION_MAX_CPS:.0f} CPS maximum)")

    work = run_dir / "_work"
    if work.exists():
        shutil.rmtree(work)
    work.mkdir()
    parts: list[Path] = []
    for i, (start, length, caption) in enumerate(BEATS):
        if start + length > raw_len + 0.05:
            raise SystemExit(f"비트 {i}가 raw 길이를 넘습니다 ({start}+{length} > {raw_len:.2f})")
        beat = work / f"beat{i}.mp4"
        cut_beat(raw, beat, start, length, caption)
        parts.append(beat)
    end = work / "end.mp4"
    # 엔드 카드는 마지막 내레이션이 끝날 자리를 겸한다. 음성 길이는 백엔드마다 다르므로
    # 여기서 여유를 두지 않으면 백엔드를 바꿀 때마다 0.x초 때문에 전량을 다시 만든다.
    make_end_card(end, 6.2)
    parts.append(end)

    listing = work / "parts.txt"
    listing.write_text("".join(f"file '{p.as_posix()}'\n" for p in parts), encoding="utf-8")
    silent = work / "silent.mp4"
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(listing), "-c", "copy", str(silent)])
    total = duration(silent)
    print(f"무음 합성 {total:.2f}s (비트 {len(parts)}개)")

    # 백엔드 선택. 기본은 로컬(_tts/synth.py)이고, REMATCH_TTS=edge 로 기준선을 쓴다.
    # 두 후보를 같은 파이프라인에 태워야 사람이 같은 조건에서 귀로 비교할 수 있다.
    backend = os.environ.get("REMATCH_TTS", "local").strip().lower()
    synth = ROOT / "_tts" / "synth.py"
    use_synth = synth if (backend != "edge" and synth.exists()) else None
    print(f"내레이션 백엔드: {'로컬 ' + synth.name if use_synth else 'edge-tts ' + VOICE}")
    audio_ext = ".wav" if use_synth else ".mp3"
    # 내레이션 배치.
    #
    # 시작 시각을 손으로 박아 두면 안 된다. 로컬 TTS는 자기회귀 생성이라 같은 문장도
    # 실행마다 길이가 달라진다. 실제로 같은 대본이 한 번은 들어맞고 다음 실행에서
    # 0.2초씩 넘쳐 게이트에 걸렸다. 그래서 표에 적힌 값은 "이 컷 즈음에 나왔으면 하는
    # 희망 시각"으로만 쓰고, 실측 길이로 순차 배치해 겹침 자체를 만들지 않는다.
    GAP = 0.18
    vo_paths: list[tuple[float, Path, float]] = []
    cursor = 0.0
    for i, (desired, line) in enumerate(NARRATION):
        audio = work / f"vo{i}{audio_ext}"
        tts(line, audio, use_synth)
        dur = duration(audio)
        at = max(desired, cursor)
        vo_paths.append((at, audio, dur))
        cursor = at + dur + GAP
        if at > desired + 0.05:
            print(f"  밀림 VO{i}: 희망 {desired}s -> 실제 {round(at, 2)}s ({line[:26]})")

    # 밀다 보면 영상 끝을 넘을 수 있다. 그때는 늘릴 창이 없으니 문장이 길다는 뜻이다.
    last_at, _, last_dur = vo_paths[-1]
    if last_at + last_dur > total + 0.05:
        for i, (at, _, dur) in enumerate(vo_paths):
            print(f"  VO{i}: {round(at, 2)}s + {round(dur, 2)}s = {round(at + dur, 2)}s : {NARRATION[i][1][:34]}")
        raise SystemExit(
            f"내레이션이 영상({total:.2f}s)을 {round(last_at + last_dur - total, 2)}s 넘습니다. 문장을 줄이십시오."
        )

    args = ["ffmpeg", "-v", "error", "-y", "-i", str(silent)]
    for _, audio, _ in vo_paths:
        args += ["-i", str(audio)]
    chains = [f"[{i}:a]adelay={int(at * 1000)}|{int(at * 1000)}[a{i}]" for i, (at, _, _) in enumerate(vo_paths, start=1)]
    mix = "".join(f"[a{i}]" for i in range(1, len(vo_paths) + 1))
    chains += [f"{mix}amix=inputs={len(vo_paths)}:normalize=0[vo]", f"[vo]loudnorm=I=-14:TP=-1.5:LRA=11,apad=whole_dur={int(total * 1_000_000)}[aout]"]
    final = run_dir / "REMATCH_시연영상.mp4"
    args += ["-filter_complex", ";".join(chains), "-map", "0:v", "-map", "[aout]",
             "-c:v", "libx264", "-preset", "slow", "-profile:v", "high", "-pix_fmt", "yuv420p",
             "-r", str(FPS), "-g", "15", "-bf", "2", "-b:v", "5M", "-minrate", "5M", "-maxrate", "5M", "-bufsize", "10M", "-x264-params", "nal-hrd=cbr:force-cfr=1",
             "-c:a", "aac", "-b:a", "384k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", "-t", f"{total:.3f}", str(final)]
    run(args)

    report = {"raw_seconds": round(raw_len, 2), "final_seconds": round(duration(final), 2), "beats": len(BEATS),
              "narration_lines": len(NARRATION), "tts_backend": "packaging/_tts/synth.py" if use_synth else f"edge-tts:{VOICE}",
              "captions": [{"text": caption, "seconds": length, "cps": round(caption_cps(caption, length), 2)}
                           for _, length, caption in BEATS if caption], "media": media_probe(final), "bytes": final.stat().st_size, "url": URL}
    (run_dir / "produce-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"완성: {final}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
