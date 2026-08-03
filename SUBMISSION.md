# 제출 체크리스트

DAKER 월간 해커톤 「내가 축구 감독이라면」. 하드 마감 **2026-08-03 10:00 KST**.

이 문서는 제출 직전 상태를 한 곳에 모읍니다. 에이전트가 할 수 있는 것과 사람이 해야 하는 것을 구분해 적었고, 확인하지 않은 것은 확인하지 않았다고 적었습니다.

## 세 링크

| 제출물 | 상태 | 값 | 남은 절차 |
|---|---|---|---|
| 배포 URL | **제출됨** | `https://rematch-wc2026.vercel.app` | 없음 |
| GitHub 저장소 | **공개 + 제출됨** (2026-08-03 00:1x) | `https://github.com/yeongjunyoo/rematch-wc2026` | 없음. 로그아웃 상태에서 저장소 페이지와 API와 raw README 전부 200 확인 |
| YouTube 시연영상 | **업로드 + 제출됨** (2026-08-03 02:3x, 재제작본) | `https://youtu.be/03DRd5TeQWE` | 없음. 로그아웃 상태에서 oEmbed 200 확인. 구 영상 `CKUmj5SzDvw`는 비공개 처리했다. 전체 공개 전환과 내레이션 음성 선택은 판단 사항 |

## 제출 완료 (2026-08-03 09:3x KST)

DAKER 3단계 「웹 링크 및 시연영상 제출」 **제출 완료**. 마감 23분 전.

| 항목 | 값 |
|---|---|
| 단계 배지 | `웹 링크 및 시연영상 제출 · 제출 완료 · 개발 산출물 · 8/3 10:00` |
| 대회 누적 제출 | 33건 → **34건** |
| 참가 팀수 | 159팀 |
| 계정 | 두바이쫀뜩쿠키 (apple021104) |
| 제출 시점 커밋 | `86f3ce9a242b258b8069eccf391d36fb98cc3c46` |
| 배포 자산 | `index-DcDDuhKL.js` / `index-CGyRo7KD.css` |

영수증 = `artifacts/gate/daker-submission-receipt.json`, 화면 = `artifacts/gate/daker-submitted-top.png`.

**08-03 10:00 이후 이 저장소에 커밋하지 않는다. 실격 사유다.**

## 남은 일정

| 단계 | 기간 | 할 일 |
|---|---|---|
| 1차 대중투표 | 08-03 12:00 ~ 08-10 10:00 | 보유 투표권 10표 전량 사용. 갤러리에서 경쟁작 정찰 |
| 2차 내부평가 | 08-10 ~ 08-18 23:59 | 참신성 30 / 감독 몰입 25 / 완성도 25 / 기획·구현 일관성 20 |

동점자 규칙은 투표권 소진 우선, 그다음 조기 업로드 우선이다. 투표권을 남기면 그것으로 진다.

## 아직 덮지 않은 것

- 실기(Galaxy, iPhone)와 데스크톱 Firefox, iOS Safari. 자동 검증은 Chromium 계열만 덮는다.
- 내레이션 음성은 `edge-tts` 기준선으로 나갔다. 로컬 후보(Qwen3-TTS Apache-2.0, Chatterbox MIT) 샘플과 권리 판정은 `packaging/_tts/REPORT.md`에 있다.

## 시연영상

파일은 `packaging/_footage/20260803-012148/REMATCH_시연영상.mp4` (48.2초, 1280x720, 5.1Mbps, 30.7MB)이고 설명 문안은 `packaging/youtube-description.txt`입니다.
편집 근거는 `packaging/VIDEO-PLAN.md`, 내레이션 음성 후보 비교는 `packaging/_tts/REPORT.md`에 있습니다.
요강이 요구하는 네 가지가 모두 들어 있습니다.

- 시작 화면 (다섯 미션 목록)
- 선수 배치와 전술 설정 (더그아웃, 포메이션 프리셋)
- 핵심 상호작용 (손흥민 교체와 개입 확정, 경기 재생과 피드)
- 결과 화면 (결과 리포트와 실제 역사 대조)

다시 만들려면 `python packaging/record_demo.py` 로 배포본을 녹화하고
`python packaging/produce_demo.py packaging/_footage/<run>` 으로 마감본을 냅니다.
내레이션이 자기 구간을 넘으면 스크립트가 막습니다. 창을 늘리지 말고 문장을 줄이십시오.

## 검증 상태

로컬과 배포본에서 실행한 **각 명령의 전체 표준출력**을 `artifacts/gate/` 아래에 보존했습니다. 요약이 아니라 전문이고, 각 명령의 종료 코드도 함께 적었습니다.

가장 최근 기록은 `artifacts/gate/deployed-gates-0803.txt`이며 기준 커밋과 실행 시각이 머리말에 있습니다. 다섯 관문 모두 종료 코드 0입니다. 이전 기록 `artifacts/gate/local-gates.txt`와 `deployed-gates.txt`의 기준 커밋은 `9ea2dbdd9f0c0b2157e240aabd9b91d49b1ceaa8`입니다. 배포본 기록에는 배포된 자산 해시와 그 커밋의 로컬 빌드 자산 해시를 함께 적어 두 쪽이 같은 산출물임을 대조할 수 있게 했습니다.

기준 커밋 이후에도 이 문서처럼 마크다운만 바꾸는 커밋이 있을 수 있습니다. 그런 커밋은 번들 산출물을 바꾸지 않으므로, 제품이 같은지는 커밋 해시가 아니라 **자산 해시**로 대조하십시오. 아래 명령의 결과가 `artifacts/gate/deployed-gates-0803.txt` 머리말의 배포 자산 및 로컬 `dist/index.html`과 같으면 같은 제품입니다. JS와 CSS를 함께 봐야 합니다.

```
curl -s https://rematch-wc2026.vercel.app | grep -oE "index-[A-Za-z0-9_-]+\.(js|css)"
```

| 관문 | 로컬 | 배포본 | 원시 기록 |
|---|---|---|---|
| `npx tsc --noEmit` | 통과 | 해당 없음 | `artifacts/gate/local-gates.txt` |
| `npx vitest run` | 21파일 143개 통과 | 해당 없음 | 같은 파일 |
| `npx vite build` | 성공 | 해당 없음 | 같은 파일 |
| `node scripts/smoke.mjs` | 통과 | 통과 | 로컬은 `local-gates.txt`, 배포본은 `deployed-gates.txt` |
| `node scripts/e2e.mjs` | 통과 | 통과 | 같음 |
| `node scripts/redteam.mjs` | 통과 | 통과 | 같음 |

자동 검증은 Playwright 캐시의 Chromium headless shell만 사용합니다. **Safari와 Firefox와 실제 기기는 덮지 않습니다.**

`artifacts/` 아래는 `.gitignore` 대상이라 저장소에 포함되지 않습니다. 심사자에게 증거를 보여야 하면 해당 파일을 따로 첨부하십시오.

## 자동 플레이테스트

페르소나 5종을 실제 브라우저에서 돌린 결과입니다. 판정은 라운드마다 흔들리므로 한 번의 결과를 제품 품질로 단정하지 않습니다.

| 페르소나 | 판정 | 내 결정이 통했나 | 투표하겠나 |
|---|---|---|---|
| 동료 참가자 심사자 | 다시 한다 | 예 | 예 |
| 축구 팬 | 다시 한다 | 예 | 예 |
| 매니지먼트 숙련자 | 다시 한다 | 아니오 | 아니오 |
| 캐주얼 이용자 | 한 번은 재밌었다 | 예 | 아니오 |
| 대중 투표자 | 한 번은 재밌었다 | 예 | 예 |

## 알려진 범위 밖 항목

제출 기획서 대비 최종 구현의 차이는 `README.md`의 「제출 기획서 대비 최종 구현 차이」에 전부 적었습니다. 심사자가 스스로 불일치를 발견하게 두지 않으려는 것입니다.
