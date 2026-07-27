/**
 * 경기 루프 종단 시험.
 *
 * 연기 시험(scripts/smoke.mjs)은 화면이 렌더된다는 것까지만 증명한다. 이 파일은
 * 실제 브라우저에서 버튼을 눌러 경기 시계가 흐르고, 개입이 토큰을 소모하고,
 * 다섯 시나리오가 각자의 종료 경로로 끝나 리포트와 기록까지 이어지는지를 본다.
 *
 *   node scripts/e2e.mjs
 *
 * 새 의존성을 쓰지 않는다. Chrome DevTools Protocol을 Node 내장 WebSocket으로 직접 말한다.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";

const PREVIEW_PORT = 4179;
const CDP_PORT = 9333;
const BASE = `http://127.0.0.1:${PREVIEW_PORT}/`;

function findHeadlessShell() {
  const root = join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
  const pack = readdirSync(root).filter((entry) => entry.startsWith("chromium_headless_shell-")).sort().pop();
  if (pack === undefined) throw new Error("chromium headless shell이 설치되어 있지 않습니다.");
  const binary = join(root, pack, "chrome-headless-shell-win64", "chrome-headless-shell.exe");
  if (!existsSync(binary)) throw new Error(`실행 파일이 없습니다: ${binary}`);
  return binary;
}

async function waitFor(check, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await check();
      if (last === true) return;
    } catch (error) {
      last = error.message;
    }
    await new Promise((done) => setTimeout(done, 150));
  }
  throw new Error(`${label} (마지막 상태: ${JSON.stringify(last)})`);
}

class Page {
  #socket;
  #nextId = 1;
  #pending = new Map();

  static async open(wsUrl) {
    const page = new Page();
    page.#socket = new WebSocket(wsUrl);
    await new Promise((done, fail) => {
      page.#socket.addEventListener("open", done, { once: true });
      page.#socket.addEventListener("error", fail, { once: true });
    });
    page.#socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      const waiter = page.#pending.get(message.id);
      if (waiter === undefined) return;
      page.#pending.delete(message.id);
      if (message.error) waiter.fail(new Error(message.error.message));
      else waiter.done(message.result);
    });
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    return page;
  }

  send(method, params = {}) {
    const id = this.#nextId++;
    return new Promise((done, fail) => {
      this.#pending.set(id, { done, fail });
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? "평가 중 예외");
    return result.result.value;
  }

  async goto(hash) {
    await this.evaluate(`(() => { window.location.hash = ${JSON.stringify(hash)}; return true; })()`);
    await waitFor(() => this.evaluate(`document.querySelector("#root").children.length > 0`), 5000, `${hash} 렌더 실패`);
  }

  text() {
    return this.evaluate(`document.body.innerText`);
  }

  clickText(label) {
    return this.evaluate(`(() => {
      const nodes = [...document.querySelectorAll("button, a")];
      const target = nodes.find((node) => node.innerText.trim() === ${JSON.stringify(label)})
        ?? nodes.find((node) => node.innerText.includes(${JSON.stringify(label)}));
      if (!target) return false;
      if (target.disabled) return false;
      target.click();
      return true;
    })()`);
  }

  close() {
    this.#socket.close();
  }
}

const failures = [];
function check(label, condition, detail = "") {
  if (condition) console.log(`ok   ${label}`);
  else {
    failures.push(label);
    console.error(`FAIL ${label} ${detail}`);
  }
}

const binary = findHeadlessShell();
const profile = mkdtempSync(join(tmpdir(), "rematch-e2e-"));
const server = spawn(process.execPath, [resolve("node_modules/vite/bin/vite.js"), "preview", "--host", "127.0.0.1", "--port", String(PREVIEW_PORT), "--strictPort"], { stdio: "ignore" });
const browser = spawn(binary, [
  "--headless",
  "--disable-gpu",
  "--no-sandbox",
  "--hide-scrollbars",
  "--window-size=390,844",
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: "ignore" });

let page;
try {
  await waitFor(async () => (await fetch(BASE)).ok, 20000, "미리보기 서버가 뜨지 않았습니다");
  await waitFor(async () => (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).ok, 20000, "브라우저 디버깅 포트가 열리지 않았습니다");

  const created = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(BASE)}`, { method: "PUT" })).json();
  page = await Page.open(created.webSocketDebuggerUrl);
  await waitFor(() => page.evaluate(`document.querySelector("#root") !== null`), 10000, "첫 화면 로드 실패");

  // 1. 흐르는 경기 시계
  await page.goto("#/match/za-kor-2026");
  check("매치룸이 63분에서 멈춰 시작한다", (await page.text()).includes("63분"));
  check("4배속을 고를 수 있다", await page.clickText("4배속"));
  check("경기를 재개할 수 있다", await page.clickText("경기 재개"));
  await waitFor(async () => !(await page.evaluate(`document.querySelector(".match-clock b").innerText`)).startsWith("63"), 12000, "경기 시계가 흐르지 않았습니다");
  const advanced = await page.evaluate(`document.querySelector(".match-clock b").innerText`);
  check("경기 시계가 실제로 전진한다", advanced !== "63분", advanced);
  await waitFor(() => page.evaluate(`document.querySelectorAll(".event-feed li").length > 0`), 15000, "경기 피드가 채워지지 않았습니다");
  check("경기 피드에 장면이 쌓인다", await page.evaluate(`document.querySelectorAll(".event-feed li").length > 0`));

  // 2. 개입이 토큰을 소모한다
  check("일시정지할 수 있다", await page.clickText("일시정지"));
  check("더그아웃이 열린다", await page.clickText("더그아웃 열기"));
  await waitFor(() => page.evaluate(`document.querySelector(".dugout-overlay") !== null`), 5000, "더그아웃이 열리지 않았습니다");
  check("팀 지시 탭으로 이동한다", await page.clickText("팀 지시"));
  await page.evaluate(`(() => {
    const slider = document.querySelector(".directive-controls input[type=range]");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(slider, "2");
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  check("개입을 확정한다", await page.clickText("개입 확정"));
  await waitFor(() => page.evaluate(`document.querySelector(".dugout-overlay") === null`), 5000, "더그아웃이 닫히지 않았습니다");
  await waitFor(() => page.evaluate(`document.querySelectorAll(".token-row b.is-spent").length === 1`), 5000, "개입 토큰이 소모되지 않았습니다");
  check("개입 토큰이 하나 줄어든다", await page.evaluate(`document.querySelectorAll(".token-row b.is-spent").length === 1`));

  // 3. 바꾼 게 없으면 토큰을 쓰지 않는다
  check("더그아웃을 다시 연다", await page.clickText("더그아웃 열기"));
  await waitFor(() => page.evaluate(`document.querySelector(".dugout-overlay") !== null`), 5000, "더그아웃 재열기 실패");
  check("변화 없는 확정은 거절된다", await page.clickText("개입 확정"));
  await waitFor(() => page.evaluate(`(document.querySelector(".dugout-notice")?.innerText ?? "").includes("바뀐 전술이 없습니다")`), 5000, "no-op 안내가 뜨지 않았습니다");
  check("변화 없는 확정에 토큰이 소모되지 않는다", await page.evaluate(`document.querySelectorAll(".token-row b.is-spent").length === 1`));
  await page.clickText("취소");

  // 4. 다섯 시나리오가 각자의 종료 경로로 끝난다
  const scenarios = ["za-kor-2026", "kor-cze-2026", "esp-arg-2026-final", "ger-par-2026-r32", "kor-ita-2002"];
  for (const scenarioId of scenarios) {
    await page.goto(`#/match/${scenarioId}`);
    await page.clickText("끝까지 건너뛰기");
    await waitFor(() => page.evaluate(`document.body.innerText.includes("경기가 끝났습니다")`), 15000, `${scenarioId} 경기가 끝나지 않았습니다`);
    check(`${scenarioId} 경기가 종료된다`, true);

    await page.clickText("결과 리포트 보기");
    await waitFor(() => page.evaluate(`document.body.innerText.includes("등급")`), 5000, `${scenarioId} 리포트가 등급을 보여주지 않았습니다`);
    const report = await page.text();
    check(`${scenarioId} 리포트가 나의 결과를 보여준다`, report.includes("나의 결과"));
    check(`${scenarioId} 리포트가 등급을 판정한다`, /[SABF] 등급/.test(report));
    check(`${scenarioId} 리포트가 매치 코드를 남긴다`, report.includes("매치 코드"));
  }

  // 5. 기록이 남는다
  await page.goto("#/hall-of-fame");
  const hall = await page.text();
  check("명예의 전당이 다섯 경기를 모두 기록한다", /기록 5건/.test(hall), hall.split("\n").slice(0, 6).join(" | "));

  // 6. 없는 주소는 안내 화면으로 떨어진다
  await page.goto("#/match/za-kor-2026/99");
  check("없는 시도 번호는 안내 화면으로 간다", (await page.text()).includes("경로를 찾을 수 없습니다"));
} finally {
  page?.close();
  browser.kill();
  server.kill();
  try { execFileSync("taskkill", ["/pid", String(browser.pid), "/T", "/F"], { stdio: "ignore" }); } catch { /* 이미 종료됨 */ }
  rmSync(profile, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`\n종단 시험 실패 ${failures.length}건.`);
  process.exit(1);
}
console.log("\n경기 루프가 다섯 시나리오 전부에서 끝까지 이어집니다.");
