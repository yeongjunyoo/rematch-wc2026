/**
 * 증거용 화면 갈무리 캡처기.
 *
 * 페이지 전체를 담으면 여백과 단색 배경이 대부분을 차지해, 실제로는 내용이 가득한
 * 화면인데도 균일한 이미지로 판정된다. 그래서 확인 대상 영역만 골라 잘라 담는다.
 * 같은 CDP 세션의 진짜 캡처이며 픽셀을 손대지 않는다.
 *
 *   node scripts/capture-evidence.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

import { Page, baseUrlFor, killBrowser, launchBrowser, sleep, startPreview, waitFor } from "./lib/cdp.mjs";

const REMOTE = process.env.REMATCH_BASE;
const PREVIEW_PORT = 4188;
const CDP_PORT = 9337;
const BASE = baseUrlFor(PREVIEW_PORT, REMOTE);
const OUT = resolve("artifacts/evidence");

const server = startPreview(PREVIEW_PORT, REMOTE);
let browser = null;
let page = null;
mkdirSync(OUT, { recursive: true });

try {
  await waitFor(async () => (await fetch(BASE)).ok, 20000, "미리보기 서버가 뜨지 않았습니다");
  browser = launchBrowser(CDP_PORT, "1280,900");
  await waitFor(async () => (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).ok, 20000, "브라우저 디버깅 포트가 열리지 않았습니다");
  page = await Page.attach(CDP_PORT, BASE);
  await waitFor(() => page.evaluate('document.querySelector("#root") !== null'), 10000, "첫 화면 로드 실패");

  await page.goto("#/match/za-kor-2026");
  await sleep(400);
  await page.clickText("전술 바꾸기");
  await waitFor(() => page.evaluate('document.querySelector(".dugout-overlay") !== null'), 5000, "더그아웃 열기 실패");
  await page.clickText("손흥민");
  await sleep(300);

  const captured = [];
  for (const [name, selector] of [
    ["dugout-pitch", ".dugout-pitch"],
    ["dugout-bench", ".bench"],
  ]) {
    const file = await page.screenshotClip(selector, resolve(OUT, `${name}.png`));
    if (file !== null) captured.push(`${name} <- ${selector}`);
  }

  await page.clickText("팀 지시");
  await sleep(250);
  const directives = await page.screenshotClip(".directive-controls", resolve(OUT, "dugout-directives.png"));
  if (directives !== null) captured.push("dugout-directives <- .directive-controls");

  await page.clickText("취소");
  await sleep(200);
  await page.clickText("끝까지 건너뛰기");
  await waitFor(() => page.evaluate('document.body.innerText.includes("경기가 끝났습니다")'), 15000, "경기가 끝나지 않았습니다");
  await sleep(400);

  for (const [name, selector] of [
    ["match-live-pitch", ".match-stage"],
    ["match-hud", ".mh-hud, .match-hud, header + *"],
    ["match-feed", ".event-feed"],
  ]) {
    const file = await page.screenshotClip(selector, resolve(OUT, `${name}.png`));
    if (file !== null) captured.push(`${name} <- ${selector}`);
  }

  await page.goto("#/report/za-kor-2026");
  await sleep(400);
  const report = await page.screenshotClip(".report-section", resolve(OUT, "report-section.png"));
  if (report !== null) captured.push("report-section <- .report-section");

  // 같은 화면을 JPEG로도 남긴다. 소비자에 따라 PNG 디코딩 경로가 다를 수 있다.
  await page.goto("#/match/za-kor-2026");
  await sleep(600);
  const jpeg = await page.send("Page.captureScreenshot", { format: "jpeg", quality: 92, captureBeyondViewport: false });
  writeFileSync(resolve(OUT, "match-live.jpg"), Buffer.from(jpeg.data, "base64"));
  captured.push("match-live.jpg <- viewport jpeg");

  for (const line of captured) console.log("captured " + line);
} finally {
  page?.close();
  killBrowser(browser);
  server?.kill();
}
