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

  it("worldDraw는 개입과 무관하게 고정된다", () => {
    const unchanged = intervention();
    const changed = intervention({ directives: { ...directives, tempo: 1 } });

    expect(fingerprintIntervention(unchanged)).not.toBe(fingerprintIntervention(changed));
    expect(worldDraw(world, "chance", 72)).toBe(worldDraw(world, "chance", 72));
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
