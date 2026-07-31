# -*- coding: utf-8 -*-
"""REMATCH 시연영상 마감본 — raw 워크스루에 훅 카드·캡션·내레이션·엔드 카드를 얹는다.

원칙(vault HarnessLab 리텐션 기준 + KB FFAC 크리틱 8라운드에서 남은 것):
  - 하드컷만. 전 컷 페이드는 아마추어 신호다.
  - 캡션은 화면 글자와 겹치지 않는 하단 단색 밴드에.
  - 내레이션은 자기 구간 안에서 끝난다. 넘치면 문장을 줄이지 창을 늘리지 않는다.
  - 파이프라인은 자기 산출물을 소스로 먹지 않는다. 소스는 항상 raw.mp4.

  python packaging/produce_demo.py packaging/_footage/<run>
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

W, H, FPS = 1280, 720, 30
ROOT = Path(__file__).resolve().parent
URL = "https://rematch-wc2026.vercel.app"
VOICE = "ko-KR-InJoonNeural"

# 훅 카드 (초, 화면 문구). 0~4초가 이탈이 갈리는 구간이라 문제부터 던진다.
HOOK = [
    (3.4, "2026 월드컵 남아공전, 63분", "손흥민은 벤치에 있었다"),
    (3.0, "대한민국 0 : 1", "그리고 아무것도 되돌릴 수 없었다"),
]

# (raw 시작초, 길이, 캡션). raw marks.txt 구간에 맞춘다.
BEATS = [
    (1.6, 5.4, "다섯 개의 실화. 되돌리고 싶은 순간을 고른다"),
    (7.0, 5.0, "실제 결과를 먼저 보여주고 그 지점에서 멈춘다"),
    (12.0, 4.4, "더그아웃에서 선수 배치와 전술을 바꾼다"),
    (16.4, 5.6, "벤치에서 손흥민을 고르고 뺄 선수를 누른다"),
    (22.0, 6.0, "개입을 확정하면 경기가 다시 흐른다. 토큰은 세 장뿐"),
    (28.0, 6.0, "종료까지 진행하면 결과 리포트가 나온다"),
    (34.5, 5.5, "내가 바꾼 것과 실제 역사가 나란히 놓인다"),
    (40.2, 2.6, "다섯 경기, 다섯 개의 다른 결말"),
]

# (합성 타임라인 시작초, 문장). 각 문장은 자기 구간 안에서 끝나야 한다.
# 넘치면 창을 늘리지 않고 문장을 줄인다. 아래 게이트가 막는다.
NARRATION = [
    (0.35, "손흥민은 벤치에 있었습니다"),
    (3.6, "그리고 우리는 졌습니다"),
    (6.7, "리매치는 그 순간부터 지휘권을 당신에게 넘깁니다"),
    (12.1, "실제 결과를 보여주고 그 지점에서 멈춥니다"),
    (17.1, "더그아웃에서 전술을 바꿉니다"),
    (21.5, "벤치에서 손흥민을 고르고 뺄 선수를 누릅니다"),
    (27.1, "확정하면 경기가 다시 흐릅니다. 토큰은 세 장뿐"),
    (33.1, "끝까지 진행하면 결과 리포트가 나옵니다"),
    (39.1, "내가 바꾼 것과 실제 역사가 나란히 놓입니다"),
    (47.2, "브라우저에서 바로 해 보세요"),
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


def esc(text: str) -> str:
    return text.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\u2019").replace("%", "\\%")


def make_card(out: Path, seconds: float, big: str, small: str) -> None:
    """무채색 카드 한 장. 포인트 색은 제품과 같은 진녹 하나만."""
    draw = (
        f"drawtext=fontfile='{FONT_ESC}':text='{esc(big)}':fontsize=54:fontcolor=#f4f5f2:"
        f"x=(w-text_w)/2:y=(h/2)-84,"
        f"drawtext=fontfile='{FONT_ESC}':text='{esc(small)}':fontsize=34:fontcolor=#9fbdb4:"
        f"x=(w-text_w)/2:y=(h/2)+6"
    )
    run([
        "ffmpeg", "-v", "error", "-y", "-f", "lavfi",
        "-i", f"color=c=#12211e:s={W}x{H}:r={FPS}:d={seconds:.2f}",
        "-vf", draw, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-pix_fmt", "yuv420p", str(out),
    ])


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
    run([
        "ffmpeg", "-v", "error", "-y", "-f", "lavfi",
        "-i", f"color=c=#12211e:s={W}x{H}:r={FPS}:d={seconds:.2f}",
        "-vf", draw, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-pix_fmt", "yuv420p", str(out),
    ])


def cut_beat(raw: Path, out: Path, start: float, length: float, caption: str) -> None:
    """구간을 잘라 캡션을 얹는다.

    캡션을 화면 위에 겹치면 제품 UI와 충돌한다. 첫 판본에서 하단 밴드가 「개입 확정」
    버튼을 덮어 둘 다 못 읽었다(KB FFAC 크리틱이 잡았던 것과 같은 결함). 그래서 겹치지
    않는다 — 화면을 위로 축소 배치하고 아래 빈 띠에만 캡션을 쓴다.
    """
    band_h = 90
    inner_w, inner_h = 1120, 630
    pad_x = (W - inner_w) // 2
    vf = (
        f"scale={inner_w}:{inner_h},"
        f"pad={W}:{H}:{pad_x}:0:color=#12211e,"
        f"drawtext=fontfile='{FONT_ESC}':text='{esc(caption)}':fontsize=30:fontcolor=#f4f5f2:"
        f"x=(w-text_w)/2:y={H - band_h + 26}"
    )
    run([
        "ffmpeg", "-v", "error", "-y", "-ss", f"{start:.2f}", "-t", f"{length:.2f}",
        "-i", str(raw), "-vf", vf, "-an",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-pix_fmt", "yuv420p", "-r", str(FPS), str(out),
    ])


def tts(text: str, out: Path) -> None:
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
        run(["ffmpeg", "-v", "error", "-y", "-i", str(webm[0]), "-c:v", "libx264",
             "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", str(FPS), str(raw)])
    raw_len = duration(raw)
    print(f"raw {raw_len:.2f}s")

    work = run_dir / "_work"
    if work.exists():
        shutil.rmtree(work)
    work.mkdir()

    parts: list[Path] = []
    for i, (sec, big, small) in enumerate(HOOK):
        card = work / f"hook{i}.mp4"
        make_card(card, sec, big, small)
        parts.append(card)

    for i, (start, length, caption) in enumerate(BEATS):
        if start + length > raw_len + 0.05:
            raise SystemExit(f"비트 {i}가 raw 길이를 넘습니다 ({start}+{length} > {raw_len:.2f})")
        beat = work / f"beat{i}.mp4"
        cut_beat(raw, beat, start, length, caption)
        parts.append(beat)

    end = work / "end.mp4"
    make_end_card(end, 4.0)
    parts.append(end)

    listing = work / "parts.txt"
    listing.write_text("".join(f"file '{p.as_posix()}'\n" for p in parts), encoding="utf-8")
    silent = work / "silent.mp4"
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(listing),
         "-c", "copy", str(silent)])
    total = duration(silent)
    print(f"무음 합성 {total:.2f}s (비트 {len(parts)}개)")

    # 내레이션
    vo_paths: list[tuple[float, Path, float]] = []
    for i, (at, line) in enumerate(NARRATION):
        mp3 = work / f"vo{i}.mp3"
        tts(line, mp3)
        vo_paths.append((at, mp3, duration(mp3)))

    overflow = []
    for i, (at, path, dur) in enumerate(vo_paths):
        end_at = at + dur
        nxt = vo_paths[i + 1][0] if i + 1 < len(vo_paths) else total
        if end_at > nxt + 0.05:
            overflow.append((i, round(end_at, 2), round(nxt, 2), NARRATION[i][1][:34]))
    if overflow:
        for i, e, n, t in overflow:
            print(f"  겹침 VO{i}: {e}s > 다음 {n}s — {t}")
        raise SystemExit("내레이션이 자기 구간을 넘습니다. 문장을 줄이십시오.")
    if vo_paths[-1][0] + vo_paths[-1][2] > total:
        raise SystemExit("마지막 내레이션이 영상보다 깁니다.")

    args = ["ffmpeg", "-v", "error", "-y", "-i", str(silent)]
    for _, path, _ in vo_paths:
        args += ["-i", str(path)]
    chains = []
    for i, (at, _, _) in enumerate(vo_paths, start=1):
        chains.append(f"[{i}:a]adelay={int(at * 1000)}|{int(at * 1000)}[a{i}]")
    mix = "".join(f"[a{i}]" for i in range(1, len(vo_paths) + 1))
    chains.append(f"{mix}amix=inputs={len(vo_paths)}:normalize=0[vo]")
    chains.append("[vo]loudnorm=I=-14:TP=-1.5:LRA=11[aout]")
    args += ["-filter_complex", ";".join(chains), "-map", "0:v", "-map", "[aout]",
             "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest"]
    final = run_dir / "REMATCH_시연영상.mp4"
    args.append(str(final))
    run(args)

    report = {
        "raw_seconds": round(raw_len, 2),
        "final_seconds": round(duration(final), 2),
        "beats": len(BEATS),
        "narration_lines": len(NARRATION),
        "bytes": final.stat().st_size,
        "url": URL,
    }
    (run_dir / "produce-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"완성: {final}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
