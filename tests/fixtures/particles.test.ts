import { describe, expect, it } from "vitest";
import { SCENARIOS } from "../../src/data/scenarios";
import type { FormationPreset } from "../../src/domain/types";
import { directionParticle, hasFinalConsonant, objectParticle, subjectParticle, topicParticle } from "../../src/ui/commentary";

/**
 * 조사는 이 제품에서 두 번 사고를 냈다. 07-31에 "손흥민를 넣고"가 나갔고,
 * 08-03에 골 연출 헤드라인의 "대한민국가 흐름을 뒤집습니다"와
 * 포메이션 전환의 "4-4-2으로"가 같은 계열로 발견됐다.
 *
 * 사람 눈으로 다시 잡지 않도록 화면에 실제로 오르는 값으로 고정한다.
 */
describe("조사 판정", () => {
  it("한글 받침을 읽는다", () => {
    expect(hasFinalConsonant("대한민국")).toBe(true);
    expect(hasFinalConsonant("파라과이")).toBe(false);
    expect(hasFinalConsonant("손흥민")).toBe(true);
    expect(hasFinalConsonant("오현규")).toBe(false);
  });

  it("숫자는 글자가 아니라 읽는 소리로 받침을 판정한다", () => {
    // 영 일 삼 육 칠 팔 = 받침, 이 사 오 구 = 없음
    expect(hasFinalConsonant("0")).toBe(true);
    expect(hasFinalConsonant("1")).toBe(true);
    expect(hasFinalConsonant("2")).toBe(false);
    expect(hasFinalConsonant("3")).toBe(true);
    expect(hasFinalConsonant("4")).toBe(false);
  });

  it("주격과 목적격과 보조사가 받침을 따른다", () => {
    expect(subjectParticle("대한민국")).toBe("대한민국이");
    expect(subjectParticle("파라과이")).toBe("파라과이가");
    expect(objectParticle("손흥민")).toBe("손흥민을");
    expect(objectParticle("오현규")).toBe("오현규를");
    expect(topicParticle("대한민국")).toBe("대한민국은");
    expect(topicParticle("파라과이")).toBe("파라과이는");
  });

  it("방향격은 ㄹ 받침을 예외로 둔다", () => {
    // "일로"이지 "일으로"가 아니다.
    expect(directionParticle("0대1")).toBe("0대1로");
    expect(directionParticle("4-3-3")).toBe("4-3-3으로");
    expect(directionParticle("4-4-2")).toBe("4-4-2로");
    expect(directionParticle("서울")).toBe("서울로");
    expect(directionParticle("정규시간")).toBe("정규시간으로");
  });

  it("화면에 실제로 오르는 팀 이름과 포메이션 전부에서 조사가 성립한다", () => {
    for (const scenario of SCENARIOS) {
      for (const team of [scenario.userTeam.displayName, scenario.opponentTeam.displayName]) {
        expect(subjectParticle(team).endsWith("이") || subjectParticle(team).endsWith("가")).toBe(true);
        // 받침이 있는 이름에 "가"가 붙는 일이 없어야 한다.
        if (hasFinalConsonant(team)) expect(subjectParticle(team)).toBe(`${team}이`);
        else expect(subjectParticle(team)).toBe(`${team}가`);
      }
    }
    // 제품이 쓰는 포메이션 프리셋 전량. 타입과 같은 목록이라 새 프리셋이 생기면 컴파일이 막는다.
    const presets: readonly FormationPreset[] = ["4-3-3", "4-2-3-1", "3-4-3", "3-5-2", "5-4-1"];
    for (const preset of presets) {
      const applied = directionParticle(preset);
      expect(applied.startsWith(preset)).toBe(true);
      expect(applied.endsWith("로")).toBe(true);
    }
  });
});
