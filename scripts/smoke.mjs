/**
 * 라우트 연기 시험.
 *
 * 빌드된 번들을 실제 브라우저 엔진으로 열어 각 화면이 살아서 렌더되는지 본다.
 * 단위 테스트는 도메인이 옳다는 것만 말해주고, 화면이 흰 화면으로 죽는 사고는
 * 잡지 못한다. 그래서 배포 전 게이트는 항상 이 파일을 통과해야 한다.
 *
 *   node scripts/smoke.mjs            빌드된 dist를 미리보기로 띄워 검사
 *   node scripts/smoke.mjs --shots    검사와 함께 화면 갈무리 저장
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";

/**
 * REMATCH_BASE를 주면 그 주소를 그대로 검사한다(배포된 production 검증).
 * 주지 않으면 로컬 dist를 미리보기로 띄워 검사한다.
 */
const REMOTE = process.env.REMATCH_BASE;
const PORT = 4178;
const BASE = REMOTE === undefined ? `http://127.0.0.1:${PORT}/` : REMOTE.replace(/\/*$/, "/");
const SHOT_DIR = resolve("artifacts/smoke");
const WANT_SHOTS = process.argv.includes("--shots");

const VIEWPORTS = [
  { name: "mobile", size: "390,844" },
  { name: "desktop", size: "1280,900" },
];

/** 각 화면이 살아 있으면 반드시 담고 있어야 하는 문자열. */
const ROUTES = [
  { hash: "#/", must: ["REMATCH", "벤치에 앉을 경기", "손흥민이 벤치에 있던"] },
  { hash: "#/match/za-kor-2026", must: ["매치룸", "더그아웃 열기", "개입 토큰", "경기 재개", "매치 코드"], shot: true },
  { hash: "#/match/za-kor-2026/3", must: ["4번째 시도"] },
  { hash: "#/match/kor-cze-2026", must: ["매치룸", "체코"] },
  { hash: "#/match/esp-arg-2026-final", must: ["매치룸", "아르헨티나"] },
  { hash: "#/match/ger-par-2026-r32", must: ["매치룸", "파라과이"] },
  { hash: "#/match/kor-ita-2002", must: ["매치룸", "이탈리아"] },
  { hash: "#/report/za-kor-2026", must: ["결과 리포트", "실제 역사 결과", "미션과 등급"], shot: true },
  { hash: "#/report/kor-ita-2002", must: ["결과 리포트", "골든골"] },
  { hash: "#/hall-of-fame", must: ["명예의 전당"], shot: true },
  { hash: "#/help", must: ["REMATCH 안내", "데이터 출처와 라이선스", "매치 코드가 같으면"] },
  { hash: "#/match/nope", must: ["경로를 찾을 수 없습니다"] },
  { hash: "#/match/za-kor-2026/99", must: ["경로를 찾을 수 없습니다"] },
  { hash: "#/nonsense", must: ["경로를 찾을 수 없습니다"] },
];

function findHeadlessShell() {
  const root = join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
  if (!existsSync(root)) throw new Error("ms-playwright 캐시를 찾을 수 없습니다.");
  const pack = readdirSync(root).filter((entry) => entry.startsWith("chromium_headless_shell-")).sort().pop();
  if (pack === undefined) throw new Error("chromium headless shell이 설치되어 있지 않습니다.");
  const binary = join(root, pack, "chrome-headless-shell-win64", "chrome-headless-shell.exe");
  if (!existsSync(binary)) throw new Error(`실행 파일이 없습니다: ${binary}`);
  return binary;
}

function dumpDom(binary, url, size) {
  return execFileSync(binary, [
    "--headless",
    "--disable-gpu",
    "--no-sandbox",
    "--hide-scrollbars",
    `--window-size=${size}`,
    "--virtual-time-budget=2500",
    "--dump-dom",
    url,
  ], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
}

function screenshot(binary, url, size, file) {
  execFileSync(binary, [
    "--headless",
    "--disable-gpu",
    "--no-sandbox",
    "--hide-scrollbars",
    `--window-size=${size}`,
    "--virtual-time-budget=2500",
    `--screenshot=${file}`,
    url,
  ], { stdio: "ignore" });
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // 아직 준비되지 않았다.
    }
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error(`미리보기 서버가 ${timeoutMs}ms 안에 뜨지 않았습니다.`);
}

const binary = findHeadlessShell();
// vite를 직접 자식으로 띄운다. 셸을 거치면 kill이 셸만 죽이고 서버가 포트를 붙든 채 남는다.
const server = REMOTE === undefined
  ? spawn(process.execPath, [resolve("node_modules/vite/bin/vite.js"), "preview", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { stdio: "ignore" })
  : null;
console.log(`검사 대상: ${BASE}`);
let failures = 0;

try {
  await waitForServer(BASE, 20000);
  if (WANT_SHOTS) {
    rmSync(SHOT_DIR, { recursive: true, force: true });
    mkdirSync(SHOT_DIR, { recursive: true });
  }

  for (const route of ROUTES) {
    for (const viewport of VIEWPORTS) {
      const url = `${BASE}${route.hash}`;
      const dom = dumpDom(binary, url, viewport.size);
      const missing = route.must.filter((needle) => !dom.includes(needle));
      const emptyRoot = /<div id="root"><\/div>/.test(dom);
      if (missing.length > 0 || emptyRoot) {
        failures += 1;
        console.error(`FAIL ${viewport.name} ${route.hash}${emptyRoot ? " (root가 비어 있음)" : ""}`);
        for (const needle of missing) console.error(`     없는 문구: ${needle}`);
      } else {
        console.log(`ok   ${viewport.name} ${route.hash}`);
      }
    }
    if (WANT_SHOTS && route.shot === true) {
      for (const viewport of VIEWPORTS) {
        const safe = route.hash.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";
        screenshot(binary, `${BASE}${route.hash}`, viewport.size, join(SHOT_DIR, `${safe}-${viewport.name}.png`));
      }
    }
  }
} finally {
  server?.kill();
}

if (failures > 0) {
  console.error(`\n연기 시험 실패 ${failures}건.`);
  process.exit(1);
}
console.log("\n모든 라우트가 렌더됐습니다.");
