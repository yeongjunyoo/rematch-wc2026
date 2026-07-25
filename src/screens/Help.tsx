export function Help() {
  return (
    <main className="page narrow-page">
      <header className="screen-header"><p className="eyebrow">도움말</p><h1>REMATCH 안내</h1></header>
      <section className="help-section"><h2>조작 예정</h2><p>다음 단계에서 전술과 개입 토큰을 조정하고 경기를 진행할 수 있습니다. 현재는 시나리오와 경기 형식을 살펴보는 화면입니다.</p></section>
      <section className="help-section"><h2>데이터 출처와 라이선스</h2><p>경기 결과, 일정, 선수명 같은 사실 정보만 사용했으며 공개 보도와 공개 기록을 참고해 직접 재구성했습니다.</p><p>FIFA와 각 연맹과 구단의 엠블럼, 선수 사진, 중계 영상, 공식 폰트는 사용하지 않습니다. 국기와 유니폼 표현은 자체 제작한 인라인 SVG 도형만 사용합니다.</p><p>모든 시나리오는 실존 인물과 팀을 존중하고 헌정하는 톤으로 작성합니다.</p></section>
      <a className="button-link" href="#/">홈으로 돌아가기</a>
    </main>
  );
}
