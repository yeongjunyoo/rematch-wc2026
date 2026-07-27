import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SCENARIOS } from "../../src/data/scenarios";
import { bestGrade, clearRecords, loadRecords, recordsAvailable, saveRecord } from "../../src/domain/records";
import type { MatchRecord } from "../../src/domain/records";
import { buildMatchCode, canReplay, deriveWorldSeed, formatMatchCode, parseMatchCode } from "../../src/domain/rng";
import { DATA_VERSION, ENGINE_VERSION } from "../../src/domain/version";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => { map.delete(key); },
    setItem: (key: string, value: string) => { map.set(key, value); },
  };
}

function sealedStorage(): Storage {
  const thrower = () => { throw new Error("storage is disabled"); };
  return {
    get length() { return 0; },
    clear: thrower,
    getItem: thrower,
    key: thrower,
    removeItem: thrower,
    setItem: thrower,
  } as unknown as Storage;
}

function record(overrides: Partial<MatchRecord> = {}): MatchRecord {
  return {
    scenarioId: "za-kor-2026",
    scenarioTitle: "남아공 1대0 대한민국",
    attemptIndex: 0,
    matchCode: "RM1.~za-kor-2026.0.~e1.~d1.00000000000000000000000000000000",
    grade: "B",
    userGoals: 1,
    opponentGoals: 1,
    decidedPhase: "regulation",
    derivedAchieved: true,
    savedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function installStorage(storage: Storage): void {
  (globalThis as { window?: unknown }).window = { localStorage: storage };
}

describe("명예의 전당 기록", () => {
  beforeEach(() => installStorage(memoryStorage()));
  afterEach(() => { delete (globalThis as { window?: unknown }).window; });

  it("저장한 기록을 최신순으로 읽는다", () => {
    saveRecord(record({ matchCode: "code-a", savedAt: 1 }));
    saveRecord(record({ matchCode: "code-b", savedAt: 2 }));
    expect(loadRecords().map((entry) => entry.matchCode)).toEqual(["code-b", "code-a"]);
  });

  it("같은 매치 코드는 한 건만 남는다", () => {
    saveRecord(record({ grade: "F" }));
    saveRecord(record({ grade: "S" }));
    const stored = loadRecords();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.grade).toBe("S");
  });

  it("전체 삭제가 기록을 비운다", () => {
    saveRecord(record());
    clearRecords();
    expect(loadRecords()).toEqual([]);
  });

  it("깨진 저장 내용은 빈 목록으로 취급한다", () => {
    const storage = memoryStorage();
    storage.setItem("rematch:hall-of-fame:v1", "{ this is not json");
    installStorage(storage);
    expect(loadRecords()).toEqual([]);
  });

  it("기록 형태가 아닌 항목은 걸러낸다", () => {
    const storage = memoryStorage();
    storage.setItem("rematch:hall-of-fame:v1", JSON.stringify([record(), { nope: true }, null]));
    installStorage(storage);
    expect(loadRecords()).toHaveLength(1);
  });

  it("시나리오별 최고 등급을 고른다", () => {
    saveRecord(record({ matchCode: "a", grade: "B" }));
    saveRecord(record({ matchCode: "b", grade: "S" }));
    saveRecord(record({ matchCode: "c", grade: "A", scenarioId: "kor-cze-2026" }));
    expect(bestGrade(loadRecords(), "za-kor-2026")).toBe("S");
    expect(bestGrade(loadRecords(), "kor-cze-2026")).toBe("A");
    expect(bestGrade(loadRecords(), "kor-ita-2002")).toBeNull();
  });

  it("저장소가 막힌 브라우저에서도 던지지 않고 비활성으로 보고한다", () => {
    installStorage(sealedStorage());
    expect(recordsAvailable()).toBe(false);
    expect(loadRecords()).toEqual([]);
    expect(() => saveRecord(record())).not.toThrow();
    expect(() => clearRecords()).not.toThrow();
  });
});

describe("화면에 노출되는 매치 코드", () => {
  it("현재 버전으로 만든 코드는 퍼센트 인코딩 없이 왕복한다", () => {
    for (const scenario of SCENARIOS) {
      const world = deriveWorldSeed(scenario.id, 0, scenario.publishedSeedDeck, ENGINE_VERSION, DATA_VERSION);
      const text = formatMatchCode(buildMatchCode(world));
      expect(text).not.toContain("%");
      expect(parseMatchCode(text)).toEqual(buildMatchCode(world));
    }
  });

  it("다른 엔진 버전으로 만든 코드는 재생을 거부한다", () => {
    const scenario = SCENARIOS[0]!;
    const stale = buildMatchCode(deriveWorldSeed(scenario.id, 0, scenario.publishedSeedDeck, "e0", DATA_VERSION));
    expect(canReplay(stale, { engineVersion: ENGINE_VERSION, dataVersion: DATA_VERSION }).ok).toBe(false);
    const current = buildMatchCode(deriveWorldSeed(scenario.id, 0, scenario.publishedSeedDeck, ENGINE_VERSION, DATA_VERSION));
    expect(canReplay(current, { engineVersion: ENGINE_VERSION, dataVersion: DATA_VERSION }).ok).toBe(true);
  });
});
