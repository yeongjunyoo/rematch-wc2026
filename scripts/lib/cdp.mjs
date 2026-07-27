/**
 * 브라우저 구동 공통 계층.
 *
 * 종단 시험(e2e)과 자동 플레이테스트(playtest)가 같은 브라우저 제어 코드를 쓴다.
 * 두 벌로 두면 한쪽만 고쳐지고 다른 쪽이 조용히 낡는다.
 * Chrome DevTools Protocol을 Node 내장 WebSocket으로 직접 말하므로 새 의존성이 없다.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";

/**
 * 화면 갈무리 PNG를 IDAT 한 덩어리로 다시 묶는다.
 *
 * 브라우저는 IDAT를 4096바이트 단위로 잘라 내보낸다. 첫 IDAT만 읽는 소비자는
 * 잘린 스트림을 펼쳐 거의 단색으로 보게 되고, 실제로는 내용이 가득한 갈무리가
 * 빈 화면으로 판정된다. 픽셀은 그대로 두고 담는 방식만 표준적인 한 덩어리로 바꾼다.
 */
export function repackPng(buffer) {
  if (buffer.length < 8 || buffer.readUInt32BE(0) !== 0x89504e47) return buffer;
  const head = [];
  const tail = [];
  const idat = [];
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("latin1", offset + 4, offset + 8);
    const chunk = buffer.subarray(offset, offset + 12 + length);
    if (type === "IDAT") idat.push(buffer.subarray(offset + 8, offset + 8 + length));
    else if (idat.length === 0) head.push(chunk);
    else tail.push(chunk);
    offset += 12 + length;
    if (type === "IEND") break;
  }
  if (idat.length <= 1) return buffer;

  const raw = inflateSync(Buffer.concat(idat));
  const packed = deflateSync(raw, { level: 9 });
  const body = Buffer.alloc(packed.length + 12);
  body.writeUInt32BE(packed.length, 0);
  body.write("IDAT", 4, "latin1");
  packed.copy(body, 8);
  body.writeInt32BE(crc32(body.subarray(4, packed.length + 8)), packed.length + 8);
  return Buffer.concat([buffer.subarray(0, 8), ...head, body, ...tail]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value;
  }
  return table;
})();

function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return crc ^ -1;
}

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

function normalizeHash(hash) {
  return hash === "" || hash === "#" || hash === "#/" ? "#/" : hash;
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
    const targetHash = normalizeHash(hash);
    await this.evaluate(`(() => { window.location.hash = ${JSON.stringify(hash)}; return true; })()`);
    await waitFor(async () => {
      const snapshot = await this.snapshot();
      const actualHash = snapshot === null ? "스냅샷 없음" : String(snapshot.hash);
      if (snapshot !== null && normalizeHash(actualHash) === targetHash) return true;
      throw new Error(`목표 해시 ${targetHash}, 실제 해시 ${actualHash}`);
    }, 5000, `목표 해시 ${targetHash} 도달 실패`);
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
      const nodes = [...document.querySelectorAll("button, a, summary")];
      const exact = nodes.find((node) => node.innerText.trim() === ${JSON.stringify(label)});
      const loose = nodes.find((node) => node.innerText.includes(${JSON.stringify(label)}));
      const target = exact ?? loose;
      if (!target) return false;
      if (target.disabled) return false;
      target.click();
      return true;
    })()`);
  }

  /**
   * 특정 요소만 잘라 담은 화면 갈무리.
   * 페이지 전체를 담으면 여백이 대부분을 차지해 무엇을 확인했는지 증거에서 사라진다.
   */
  async screenshotClip(selector, path) {
    const box = await this.evaluate(`(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return { x: rect.x + window.scrollX, y: rect.y + window.scrollY, width: rect.width, height: rect.height };
    })()`);
    if (box === null || box.width < 8 || box.height < 8) return null;
    const result = await this.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: { x: box.x, y: box.y, width: box.width, height: box.height, scale: 2 },
    });
    writeFileSync(path, repackPng(Buffer.from(result.data, "base64")));
    return path;
  }

  close() {
    this.#socket.close();
  }
}
