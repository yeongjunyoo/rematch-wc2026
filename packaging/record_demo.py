# -*- coding: utf-8 -*-
"""REMATCH 시연영상 워크스루 녹화 — 배포본 실화면, 무음 raw.

요강 필수 4항목을 한 번의 플레이로 관통한다.
  1) 시작 화면          2) 선수 배치와 전술 설정
  3) 핵심 상호작용      4) 결과 화면

출력: packaging/_footage/<timestamp>/*.webm (Playwright video)
"""
import os
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = os.environ.get("REMATCH_BASE", "https://rematch-wc2026.vercel.app")
ROOT = Path(__file__).resolve().parent
OUT = ROOT / "_footage" / time.strftime("%Y%m%d-%H%M%S")
VIEWPORT = {"width": 1280, "height": 720}

MARKS: list[tuple[float, str]] = []
T0 = 0.0


def mark(label: str) -> None:
    MARKS.append((round(time.monotonic() - T0, 2), label))
    print(f"  [{MARKS[-1][0]:6.2f}s] {label}", flush=True)


def dwell(page, seconds: float) -> None:
    page.wait_for_timeout(int(seconds * 1000))


def click_name(page, name: str, timeout: int = 8000):
    """접근성 이름으로 버튼/링크를 누른다. 못 찾으면 예외."""
    loc = page.get_by_role("button", name=name).first
    if loc.count() == 0:
        loc = page.get_by_role("link", name=name).first
    loc.wait_for(state="visible", timeout=timeout)
    loc.scroll_into_view_if_needed()
    page.wait_for_timeout(250)
    loc.click()
    return loc


def click_text(page, text: str, timeout: int = 8000):
    loc = page.get_by_text(text, exact=False).first
    loc.wait_for(state="visible", timeout=timeout)
    loc.scroll_into_view_if_needed()
    page.wait_for_timeout(250)
    loc.click()
    return loc


def click_css_text(page, selector: str, text: str, timeout: int = 8000):
    """접근성 이름은 선택 상태에 따라 바뀐다. 화면에 보이는 이름으로 누른다."""
    loc = page.locator(selector, has_text=text).first
    loc.wait_for(state="visible", timeout=timeout)
    loc.scroll_into_view_if_needed()
    page.wait_for_timeout(250)
    loc.click()
    return loc


def smooth_scroll(page, to_y: int, steps: int = 24, per_step_ms: int = 40) -> None:
    start = page.evaluate("window.scrollY")
    for i in range(1, steps + 1):
        y = start + (to_y - start) * i / steps
        page.evaluate(f"window.scrollTo(0, {y})")
        page.wait_for_timeout(per_step_ms)


def main() -> int:
    global T0
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--force-color-profile=srgb", "--hide-scrollbars"])
        ctx = browser.new_context(
            viewport=VIEWPORT,
            device_scale_factor=1,
            locale="ko-KR",
            timezone_id="Asia/Seoul",
            record_video_dir=str(OUT),
            record_video_size=VIEWPORT,
        )
        page = ctx.new_page()
        T0 = time.monotonic()

        # 1. 시작 화면
        # 첫 프레임부터 실제 게임 화면을 남긴다. 홈 히어로를 짧게 보여 준 뒤 바로 미션으로 간다.
        page.goto(f"{BASE}/#/", wait_until="networkidle")
        dwell(page, 1.4)
        mark("home:hook")
        smooth_scroll(page, 620, steps=12)
        dwell(page, 1.4)
        mark("home:missions")
        smooth_scroll(page, 0, steps=12)
        dwell(page, 0.4)

        # 2. 미션 진입
        click_name(page, "대한민국 벤치 이어받기")
        page.wait_for_timeout(1200)
        mark("matchroom:briefing")
        dwell(page, 2.2)

        # 3. 선수 배치와 전술 설정
        click_name(page, "전술 바꾸기")
        page.wait_for_timeout(900)
        mark("dugout:open")
        dwell(page, 1.2)

        click_css_text(page, ".bench-card", "손흥민")
        page.wait_for_timeout(700)
        mark("dugout:pick-son")
        click_css_text(page, ".player-token", "오현규")
        page.wait_for_timeout(900)
        mark("dugout:swap-target")
        dwell(page, 1.0)

        click_name(page, "4-3-3")
        page.wait_for_timeout(800)
        mark("dugout:formation-433")
        dwell(page, 0.8)

        click_name(page, "개입 확정")
        page.wait_for_timeout(1200)
        mark("dugout:commit")
        dwell(page, 1.0)

        # 4. 핵심 상호작용 — 재개 직후와 사건 피드를 충분히 잡는다.
        mark("match:auto-resume")
        dwell(page, 1.0)
        click_name(page, "2배속")
        page.wait_for_timeout(400)
        mark("match:speed-2x")

        # 초기 피드 행은 이미 존재할 수 있으므로, 기준 행 수 이후의 새 이벤트를 기다린다.
        initial_feed = page.evaluate('document.querySelectorAll(".event-feed li").length')
        deadline = time.monotonic() + 24
        handled_prompt = False
        while time.monotonic() < deadline:
            page.wait_for_timeout(500)
            if page.evaluate('document.querySelector(".decision-prompt") !== null') and not handled_prompt:
                mark("match:decision-prompt")
                dwell(page, 1.2)
                loc = page.get_by_role("button", name="이대로 본다").first
                if loc.count() > 0 and loc.is_visible():
                    loc.click()
                    mark("match:decision-dismiss")
                handled_prompt = True
            feed = page.evaluate('document.querySelectorAll(".event-feed li").length')
            if time.monotonic() >= deadline - 16 and feed >= initial_feed + 2:
                break
        mark(f"match:events({initial_feed}->{page.evaluate('document.querySelectorAll(\".event-feed li\").length')})")
        dwell(page, 2.0)

        skip = page.get_by_role("button", name="끝까지 건너뛰기").first
        if skip.count() > 0 and skip.is_visible() and not skip.is_disabled():
            skip.click()
            mark("match:skip-to-end")
            page.wait_for_timeout(2500)

        # 5. 결과 화면
        page.goto(f"{BASE}/#/report/za-kor-2026", wait_until="networkidle")
        page.wait_for_timeout(1200)
        mark("report:top")
        dwell(page, 3.0)
        smooth_scroll(page, 700)
        dwell(page, 2.8)
        mark("report:grade")
        smooth_scroll(page, 1400, steps=20)
        dwell(page, 2.6)

        # 6. 명예의 전당
        page.goto(f"{BASE}/#/hall-of-fame", wait_until="networkidle")
        page.wait_for_timeout(1000)
        mark("hall-of-fame")
        dwell(page, 2.8)

        total = round(time.monotonic() - T0, 2)
        ctx.close()
        browser.close()

    videos = sorted(OUT.glob("*.webm"))
    log = OUT / "marks.txt"
    log.write_text(
        "\n".join(f"{t:.2f}\t{label}" for t, label in MARKS) + f"\n{total:.2f}\tEND\n",
        encoding="utf-8",
    )
    print(f"\nraw video: {[str(v) for v in videos]}")
    print(f"marks    : {log}")
    print(f"length   : {total:.2f}s (wall clock)")
    return 0 if videos else 1


if __name__ == "__main__":
    sys.exit(main())
