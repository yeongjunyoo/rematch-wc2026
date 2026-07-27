import type React from "react";
import "./teamCrest.css";

export interface TeamCrestProps {
  /** `src/data/scenarios/index.ts`의 crestKey. 알 수 없는 값이면 중립 도형을 그린다. */
  readonly crestKey: string;
  /**
   * 팀 표시명.
   * 이 표식은 장식이므로 접근성 트리에서 숨긴다. 팀 이름은 바로 옆 글자가 이미 전달하며
   * 여기서 또 읽으면 스크린리더가 같은 이름을 두 번 말한다. 이 값은 개발자 확인용이다.
   */
  readonly teamName: string;
  /** 지금은 이름 옆의 작은 표식으로만 쓴다. 실제 호출이 생길 때 크기를 늘린다. */
  readonly size: "small";
}

function CrestArt({ crestKey }: Pick<TeamCrestProps, "crestKey">): React.JSX.Element {
  switch (crestKey) {
    case "kr-minimal":
      return (
        <>
          <circle cx="18" cy="18" r="8" fill="#0d6261" />
          <path d="M23 30 34 16" fill="none" stroke="#7a3428" strokeWidth="5" strokeLinecap="round" />
        </>
      );
    case "za-minimal":
      return <path d="M10 10 39 24 10 38Z" fill="#396e5d" />;
    case "cz-minimal":
      return (
        <>
          <path d="M10 13 27 13 38 24 27 35 10 35Z" fill="#0d6261" />
          <circle cx="28" cy="24" r="5" fill="#f4f5f2" />
        </>
      );
    case "ar-minimal":
      return (
        <>
          <path d="M11 31 31 11" fill="none" stroke="#5e7da3" strokeWidth="7" strokeLinecap="round" />
          <circle cx="33" cy="31" r="5" fill="#5e7da3" />
        </>
      );
    case "es-minimal":
      return (
        <>
          <path d="M12 34V25h8v-7h8v-6h8v22Z" fill="#c57b2d" />
          <path d="M12 37h26" fill="none" stroke="#1e2528" strokeWidth="3" strokeLinecap="round" />
        </>
      );
    case "de-minimal":
      return (
        <>
          <circle cx="24" cy="24" r="13" fill="none" stroke="#7a3428" strokeWidth="6" />
          <path d="M24 11v13h13" fill="none" stroke="#f4f5f2" strokeWidth="4" strokeLinecap="square" />
        </>
      );
    case "py-minimal":
      return (
        <>
          <path d="m24 10 4 10 10 4-10 4-4 10-4-10-10-4 10-4Z" fill="#396e5d" />
          <circle cx="24" cy="24" r="4" fill="#d8f0a4" />
        </>
      );
    case "it-minimal":
      return (
        <>
          <path d="M11 17c5-7 10 7 15 0s10 7 15 0" fill="none" stroke="#0d6261" strokeWidth="5" strokeLinecap="round" />
          <path d="M11 31c5-7 10 7 15 0s10 7 15 0" fill="none" stroke="#7a3428" strokeWidth="5" strokeLinecap="round" />
        </>
      );
    default:
      return <path d="M15 15h18v18H15Z" fill="none" stroke="#62706d" strokeWidth="4" />;
  }
}

export function TeamCrest({ crestKey, teamName, size }: TeamCrestProps): React.JSX.Element {
  return (
    <span className={`tc-crest tc-crest-${size}`}>
      <svg className="tc-mark" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        {/** 단독 사용 변형에서는 aria-hidden을 제거하면 이 title이 팀 이름을 제공한다. */}
        <title>{teamName}</title>
        <circle className="tc-frame" cx="24" cy="24" r="22" />
        <CrestArt crestKey={crestKey} />
      </svg>
    </span>
  );
}
