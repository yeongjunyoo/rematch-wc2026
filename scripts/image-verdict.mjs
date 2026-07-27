/**
 * 화면 갈무리 판정 산출기.
 *
 * 캡처한 PNG를 실제로 디코딩해 크기와 색 분포와 구조 변화를 재고, 각 이미지가
 * 빈 화면이나 단색이 아님을 수치로 판정한다. 픽셀을 만들지 않고 이미 찍힌 것을 읽기만 한다.
 *
 *   node scripts/image-verdict.mjs
 */
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { inflateSync } from "node:zlib";

const SOURCES = ["artifacts/redteam", "artifacts/evidence", "artifacts/smoke"];
const OUT = resolve("artifacts/evidence/image-verdict.json");

function decodePng(buffer) {
  let offset = 8;
  let header = null;
  const idat = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("latin1", offset + 4, offset + 8);
    if (type === "IHDR") {
      header = {
        width: buffer.readUInt32BE(offset + 8),
        height: buffer.readUInt32BE(offset + 12),
        depth: buffer[offset + 16],
        colorType: buffer[offset + 17],
        interlace: buffer[offset + 20],
      };
    } else if (type === "IDAT") {
      idat.push(buffer.subarray(offset + 8, offset + 8 + length));
    }
    offset += 12 + length;
    if (type === "IEND") break;
  }
  if (header === null || header.depth !== 8 || header.interlace !== 0) return null;
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[header.colorType];
  if (channels === undefined) return null;

  const raw = inflateSync(Buffer.concat(idat));
  const stride = header.width * channels;
  const pixels = Buffer.alloc(header.height * stride);
  let previous = Buffer.alloc(stride);
  for (let row = 0; row < header.height; row += 1) {
    const filter = raw[row * (stride + 1)];
    const line = raw.subarray(row * (stride + 1) + 1, row * (stride + 1) + 1 + stride);
    const out = pixels.subarray(row * stride, (row + 1) * stride);
    for (let index = 0; index < stride; index += 1) {
      const left = index >= channels ? out[index - channels] : 0;
      const up = previous[index];
      const upLeft = index >= channels ? previous[index - channels] : 0;
      let value = line[index];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upLeft;
        const dLeft = Math.abs(p - left);
        const dUp = Math.abs(p - up);
        const dUpLeft = Math.abs(p - upLeft);
        value += dLeft <= dUp && dLeft <= dUpLeft ? left : dUp <= dUpLeft ? up : upLeft;
      }
      out[index] = value & 0xff;
    }
    previous = out;
  }
  return { ...header, channels, stride, pixels };
}

function analyse(path) {
  const image = decodePng(readFileSync(path));
  if (image === null) return { path, readable: false };

  const counts = new Map();
  let edges = 0;
  let samples = 0;
  for (let row = 0; row < image.height; row += 2) {
    const base = row * image.stride;
    let last = null;
    for (let column = 0; column < image.width; column += 2) {
      const at = base + column * image.channels;
      const key = (image.pixels[at] << 16) | (image.pixels[at + 1] << 8) | image.pixels[at + 2];
      counts.set(key, (counts.get(key) ?? 0) + 1);
      samples += 1;
      if (last !== null && last !== key) edges += 1;
      last = key;
    }
  }
  const dominant = Math.max(...counts.values());
  return {
    path,
    readable: true,
    width: image.width,
    height: image.height,
    distinctColors: counts.size,
    dominantColorShare: Number((dominant / samples).toFixed(4)),
    // 이웃 픽셀이 서로 다른 비율. 단색이나 빈 화면이면 0에 가깝다.
    horizontalChangeRatio: Number((edges / samples).toFixed(4)),
    verdict: counts.size >= 32 && dominant / samples < 0.995 && edges / samples > 0.01 ? "non-uniform" : "uniform",
  };
}

const files = SOURCES.flatMap((dir) => (existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith(".png")).map((name) => join(dir, name)) : []));
const images = files.map(analyse);
const nonUniform = images.filter((image) => image.verdict === "non-uniform");

mkdirSync(resolve("artifacts/evidence"), { recursive: true });
writeFileSync(OUT, JSON.stringify({
  schemaVersion: 1,
  kind: "image-verdict",
  surface: "web",
  tool: "chrome-devtools-protocol",
  generatedAt: new Date().toISOString(),
  method: "PNG를 필터 복원까지 포함해 직접 디코딩한 뒤 색 분포와 이웃 픽셀 변화율을 측정했다.",
  totalImages: images.length,
  nonUniformImages: nonUniform.length,
  verdict: nonUniform.length > 0 ? "passed" : "failed",
  images,
}, null, 2), "utf8");

for (const image of images) {
  console.log(`${image.verdict === "non-uniform" ? "OK  " : "FLAT"} ${image.path} ${image.width}x${image.height} distinct=${image.distinctColors} dominant=${image.dominantColorShare} change=${image.horizontalChangeRatio}`);
}
console.log(`\n${nonUniform.length}/${images.length}개가 단색이 아님. 결과: ${OUT}`);
