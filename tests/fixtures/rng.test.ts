import { describe, expect, it } from "vitest";
import type { Intervention, TacticalDirectives } from "../../src/domain/types";
import {
  buildMatchCode,
  canReplay,
  createRng,
  decisionDraw,
  deriveWorldSeed,
  diffIntervention,
  fingerprintIntervention,
  formatMatchCode,
  parseMatchCode,
  worldDraw,
} from "../../src/domain/rng";

const directives: TacticalDirectives = {
  defensiveLine: 0,
  pressing: 0,
  tempo: 0,
  attackRoute: 0,
  mindset: 0,
};

function intervention(overrides: Partial<Intervention> = {}): Intervention {
  return {
    tokenIndex: 1,
    atMinute: 60,
    directives,
    formation: "4-3-3",
    placements: [
      { playerId: "p1", slot: { x: 20, y: 40 } },
      { playerId: "p2", slot: { x: 60, y: 70 } },
    ],
    substitutions: [],
    ...overrides,
  };
}

const world = deriveWorldSeed("final", 3, ["seed-a", "seed-b"], "1.0.0", "2026.1");

describe("rng", () => {
  it("같은 시드의 앞 20개 추출을 재현한다", () => {
    const left = createRng("same-seed");
    const right = createRng("same-seed");

    expect(Array.from({ length: 20 }, left)).toEqual(Array.from({ length: 20 }, right));
  });

  it("다른 시드는 다른 수열을 만든다", () => {
    const first = createRng("seed-one");
    const second = createRng("seed-two");

    expect(Array.from({ length: 20 }, first)).not.toEqual(Array.from({ length: 20 }, second));
  });

  it("worldDraw는 지문을 받지 않는다: 원시 함수 수준의 결정론과 API 분리", () => {
    const unchanged = intervention();
    const changed = intervention({ directives: { ...directives, tempo: 1 } });
    const fpA = fingerprintIntervention(unchanged);
    const fpB = fingerprintIntervention(changed);

    expect(fpA).not.toBe(fpB);
    expect(worldDraw.length).toBe(3);

    // 원시 함수 수준에서 worldDraw는 같은 인자를 받으면 같은 외생 추출을 반환한다.
    // 진짜 반사실 검증은 D2에 시뮬레이션 runner가 생기면 그 runner가 방출한 world trace를 두 개입 경로에서 비교하는 통합 테스트로 한다.
    const traceFor = (): number[] => {
      const out: number[] = [];
      for (let minute = 63; minute <= 90; minute += 1) {
        out.push(worldDraw(world, "chance", minute));
        out.push(worldDraw(world, "lane", minute));
        out.push(worldDraw(world, "conversion", minute));
      }
      return out;
    };

    const traceA = traceFor();
    const traceB = traceFor();

    expect(traceA).toHaveLength(28 * 3);
    expect(traceB).toEqual(traceA);
    expect(new Set(traceA).size).toBeGreaterThan(1);

    // decisionDraw만 지문에 따라 갈린다.
    const decisionA = traceA.map((_, i) => decisionDraw(world, fpA, "ai-tiebreak", 63 + i));
    const decisionB = traceA.map((_, i) => decisionDraw(world, fpB, "ai-tiebreak", 63 + i));
    expect(decisionB).not.toEqual(decisionA);
  });

  it("decisionDraw는 행동 지문이 달라지면 바뀐다", () => {
    const first = fingerprintIntervention(intervention());
    const second = fingerprintIntervention(
      intervention({ directives: { ...directives, pressing: 1 } }),
    );

    expect(decisionDraw(world, first, "ai-tiebreak", 72)).not.toBe(
      decisionDraw(world, second, "ai-tiebreak", 72),
    );
  });

  it("지시 한 축 변경을 no-op가 아닌 변경으로 계산한다", () => {
    const previous = intervention();
    const next = intervention({ directives: { ...directives, tempo: 1 } });

    expect(diffIntervention(previous, next)).toMatchObject({
      isNoOp: false,
      changedDirectives: ["tempo"],
    });
  });

  it("아무것도 바꾸지 않은 개입을 no-op로 계산한다", () => {
    const previous = intervention();
    const next = intervention({ tokenIndex: 99, atMinute: 75 });

    expect(diffIntervention(previous, next).isNoOp).toBe(true);
  });

  it("배열 순서만 다른 같은 개입은 같은 지문을 만든다", () => {
    const first = intervention({
      substitutions: [
        { outId: "p1", inId: "p12" },
        { outId: "p2", inId: "p13" },
      ],
    });
    const second = intervention({
      placements: [...first.placements].reverse(),
      substitutions: [...first.substitutions].reverse(),
    });

    expect(fingerprintIntervention(first)).toBe(fingerprintIntervention(second));
  });

  it("매치 코드를 형식화하고 다시 읽어도 원본을 보존한다", () => {
    const code = buildMatchCode(world);
    const parsed = parseMatchCode(formatMatchCode(code));

    expect(code.seedChecksum).toMatch(/^[0-9a-f]{32}$/);
    expect(parsed).toEqual(code);
  });

  it("버전이 다르면 재생을 거부하고 이유를 반환한다", () => {
    const result = canReplay(buildMatchCode(world), {
      engineVersion: "2.0.0",
      dataVersion: "2026.1",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("버전");
    }
  });
});
