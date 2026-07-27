/**
 * 브라우저 구동 공통 계층.
 *
 * 종단 시험(e2e)과 자동 플레이테스트(playtest)가 같은 브라우저 제어 코드를 쓴다.
 * 두 벌로 두면 한쪽만 고쳐지고 다른 쪽이 조용히 낡는다.
 * Chrome DevTools Protocol을 Node 내장 WebSocket으로 직접 말하므로 새 의존성이 없다.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";

export function findHeadlessShell() {
  const root = join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
  if (!existsSync(root)) throw new Error("ms-playwright 캐시를 찾을 수 없습니다.");
  const pack = readdirSync(root).filter((entry) => entry.startsWith("chromium_headless_shell-")).sort().pop();
  if (pack === undefined) throw new Error("chromium headless shell이 설치되어 있지 않습니다.");
  const binary = join(root, pack, "chrome-headless-shell-win64", "chrome-headless-shell.exe");
  if (!existsSync(binary)) throw new Error(`실행 파일이 없습니다: ${binary}`);
  return binary;
}

export async function waitFor(check, timeoutMs, label) {
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

export function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

/** 로컬 dist를 미리보기로 띄운다. REMATCH_BASE가 있으면 띄우지 않는다. */
export function startPreview(port, remote) {
  if (remote !== undefined) return null;
  return spawn(
    process.execPath,
    [resolve("node_modules/vite/bin/vite.js"), "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    { stdio: "ignore" },
  );
}

export function baseUrlFor(port, remote) {
  return remote === undefined ? `http://127.0.0.1:${port}/` : remote.replace(/\/*$/, "/");
}

export function launchBrowser(cdpPort, viewport = "390,844") {
  const binary = findHeadlessShell();
  const profile = mkdtempSync(join(tmpdir(), "rematch-cdp-"));
  const proc = spawn(binary, [
    "--headless",
    "--disable-gpu",
    "--no-sandbox",
    "--hide-scrollbars",
    `--window-size=${viewport}`,
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ], { stdio: "ignore" });
  return { proc, profile };
}

export function killBrowser(handle) {
  if (handle === null || handle === undefined) return;
  handle.proc.kill();
  try {
    execFileSync("taskkill", ["/pid", String(handle.proc.pid), "/T", "/F"], { stdio: "ignore" });
  } catch {
    // 이미 종료됨
  }
  rmSync(handle.profile, { recursive: true, force: true });
}

export class Page {
  #socket;
  #nextId = 1;
  #pending = new Map();

  static async attach(cdpPort, url) {
    const created = await (await fetch(`http://127.0.0.1:${cdpPort}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
    const page = new Page();
    page.#socket = new WebSocket(created.webSocketDebuggerUrl);
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
    await waitFor(() => this.evaluate('document.querySelector("#root").children.length > 0'), 5000, `${hash} 렌더 실패`);
  }

  text() {
    return this.evaluate("document.body.innerText");
  }

  /** 제품이 노출하는 읽기 전용 스냅샷. 에이전트는 이것만 본다. */
  snapshot() {
    return this.evaluate("window.__REMATCH__ ? window.__REMATCH__.snapshot() : null");
  }

  clickText(label) {
    return this.evaluate(`(() => {
      const nodes = [...document.querySelectorAll("button, a")];
      const exact = nodes.find((node) => node.innerText.trim() === ${JSON.stringify(label)});
      const loose = nodes.find((node) => node.innerText.includes(${JSON.stringify(label)}));
      const target = exact ?? loose;
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
