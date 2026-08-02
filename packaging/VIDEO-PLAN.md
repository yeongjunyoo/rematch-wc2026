# REMATCH 시연영상 편집 설계

## 기준과 결정

- **첫 프레임은 실제 플레이 화면이다.** `HOOK` 카드 두 장을 삭제하고, `raw.mp4`의 로드 완료 뒤 홈 화면(원본 3.50초)을 첫 샷으로 쓴다. 짧은 상단 문구도 게임 화면 위에만 얹는다. 이는 NAN 18의 ①-1 Derek Lieu 원칙 ‘첫 컷은 반드시 실제 게임 화면’과 ‘느린 도입부 금지’를 적용한 것이다.
- **제목은 끝에만 둔다.** `REMATCH`와 URL은 41.95–47.15초 엔드 카드에 배치한다. 첫 41.95초에는 독립 타이틀 카드가 없다. (NAN 18 ①-1: 로고·크레딧은 엔딩 슬레이트로.)
- **리듬은 짧은 훅 → 긴 선택/결과로 변주한다.** 2.3–3.7초의 빠른 개요 뒤, 교체 확정 5.8초와 결과 리포트 7.1초를 확보했다. 같은 화면 종류를 반복하지 않고 홈/미션/더그아웃/경기 피드/리포트/명예의 전당을 한 번씩 보인다. (NAN 18 ①-1: 느린 도입부·반복 금지; ①-2: thumbstopper→intro→escalation→climax.)
- **자막은 상시 밴드가 아니다.** 11개 샷 중 6개에만 상단 76px 캡션을 넣고, UI와 내레이션만으로 읽히는 샷에는 넣지 않는다. 이는 한 샷에서 UI·자막을 동시에 과도하게 읽히지 않게 하는 NAN 18 ①-1 정보 과부하 금지 원칙이다. `produce_demo.py`의 `validate_captions()`가 자막마다 최소 1.5초와 17 CPS 이하를 검사하고, 위반하면 인코딩 전에 `SystemExit`한다. 실제 CPS 범위는 1.41–3.93이다. (NAN 18 ①-6 자막 최소 노출·17 CPS.)
- **720p를 유지한다.** 원본은 1280×720이므로 1920×1080으로 1.5배 업스케일하지 않았다. UI 글자와 선의 보간 열화를 피하고 원본 픽셀을 보존하는 편이 심사 영상에서는 낫다. 대신 YouTube 720p 권장 비트레이트인 5 Mbps CBR를 적용했다. (NAN 18 ④: 비정수 배율 흐림 회피 및 YouTube 인코딩; FFmpeg scaler: https://ffmpeg.org/ffmpeg-scaler.html)

## 개정 타임라인

| 합성 시간 | 길이 | raw 구간 | 화면/행동 | 캡션 | 적용 원칙 |
|---|---:|---:|---|---|---|
| 0.00–3.40 | 3.4s | 3.50–6.90 | 로드 완료된 실제 REMATCH 홈, 63분 미션 | 63분, 선택은 지금부터 | 첫 컷 게임플레이, 빠른 개요 |
| 3.40–6.00 | 2.6s | 5.50–8.10 | 미션 목록으로 스크롤 | 없음 | 빠른 intro, 정보 절제 |
| 6.00–8.60 | 2.6s | 10.45–13.05 | 매치 브리핑 | 실제 결과에서 멈춘다 | 게임 고유 전제 |
| 8.60–10.90 | 2.3s | 13.90–16.20 | 더그아웃 진입 | 없음 | 짧은 컷 변주 |
| 10.90–14.60 | 3.7s | 16.10–19.80 | 손흥민 선택·교체 대상 지정 | 손흥민 투입. 전술도 바꾼다 | 핵심 verb 우선 |
| 14.60–17.30 | 2.7s | 19.90–22.60 | 4-3-3 선택·개입 확정 직전 | 없음 | UI를 읽을 여백 |
| 17.30–23.10 | 5.8s | 22.40–28.20 | 개입 확정 후 경기 재개 | 한 번의 교체가 이후 기록을 바꾼다 | 핵심 상호작용 홀드 |
| 23.10–27.90 | 4.8s | 28.60–33.40 | 2배속 경기 피드와 새 이벤트 | 없음 | 결과로 에스컬레이션 |
| 27.90–35.00 | 7.1s | 36.70–43.80 | 결과 리포트 상단·등급 | 결과는 리포트로 남는다 | 페이오프를 읽을 체류 |
| 35.00–39.30 | 4.3s | 43.80–48.10 | 리포트 상세·실제 역사 비교 | 없음 | 정보 과부하 방지 |
| 39.30–41.95 | 2.65s | 47.55–50.20 | 명예의 전당 | 다섯 경기, 다시 지휘한다 | 반복 없는 범위 제시 |
| 41.95–47.15 | 5.2s | 생성 | REMATCH, 한 줄 가치, URL CTA | 없음 | 엔딩 슬레이트 CTA |

문구는 ‘손흥민’, ‘63분’, ‘교체’, ‘실제 역사’처럼 이 게임의 결정적 상황에 묶어 제네릭 기능 나열을 피했다. (NAN 18 ①-1 제네릭 타이틀 카드 금지.)

## 녹화 보강

`record_demo.py`는 2026-08-03에 배포본을 새 UI 기준으로 녹화했다(최대 3회 제한 내). 초기 피드 행 수가 이미 존재해 즉시 종료되던 조건을 기준 행 수 이후 새 이벤트 2개로 바꾸고, 최대 24초 동안 경기 피드를 남긴다. 결과 리포트 상단·등급·명예의 전당의 체류도 각각 늘렸다.

현재 편집 원본: `packaging/_footage/20260803-012148/raw.mp4` (marks `END` 50.22초). 표식에는 `match:events(5->10)`, `report:top` 35.85초, `report:grade` 42.84초, `hall-of-fame` 47.40초가 있다. 마지막 비트는 raw 종료 전에서 끝나도록 47.55–50.20초로 잡았다.

## 최종 산출 검증 (실측)

최종 파일 = `packaging/_footage/20260803-012148/REMATCH_시연영상.mp4`. 업로드본 = https://youtu.be/03DRd5TeQWE (미등록 공개).

| 항목 | 실측값 |
|---|---|
| 길이 | 48.167s |
| 해상도 / 프레임레이트 | 1280x720 / 30fps |
| 비디오 | H.264 High, yuv420p, 4,979,784 bps |
| 오디오 | AAC-LC, 48kHz, 스테레오 |
| 컨테이너 총 비트레이트 | 5,102,573 bps |
| 첫 프레임(0.5s) | `first-frame-0.5s.png` — 실제 REMATCH 홈 화면. 텍스트 카드가 아니다 |

재현 명령:

```bash
ffprobe -v error -show_entries format=duration,bit_rate:stream=codec_name,profile,width,height,avg_frame_rate,bit_rate,sample_rate,channels -of json \
  packaging/_footage/20260803-012148/REMATCH_시연영상.mp4
ffmpeg -ss 0.5 -i packaging/_footage/20260803-012148/REMATCH_시연영상.mp4 \
  -frames:v 1 packaging/_footage/20260803-012148/first-frame-0.5s.png
```

## 자막을 화면 밖으로 뺀 이유 (08-03 개정)

처음에는 자막을 화면 위에 얹었다. 상단에 두자 제품이 그 자리에 쓰는 경기명과 시도 번호를 덮었고,
하단으로 내리자 홈 화면의 헤딩("63분, 벤치가 열린다")과 피치 아래쪽을 덮었다.
**화면 위에 얹는 한 덮는 대상만 바뀔 뿐이다.**

그래서 플레이 화면을 1280x644로 줄여 위에 놓고 남은 76px 띠를 자막 전용으로 쓴다.
캡션이 없는 컷도 같은 비율로 줄여야 컷 사이에 화면 크기가 튀지 않으므로 전 컷에 동일 적용한다.
NAN 18 ①-4의 "정보 과부하 금지"와 같은 목적이되, 겹침 자체를 구조로 없앤 것이다.

## 내레이션 백엔드

`REMATCH_TTS` 환경변수로 고른다. 기본은 `local`(`packaging/_tts/synth.py`, Qwen3-TTS 0.6B CustomVoice, Apache-2.0),
`REMATCH_TTS=edge`는 기준선 `edge-tts ko-KR-InJoonNeural`이다. 후보 비교와 권리 판정은 `packaging/_tts/REPORT.md`.
현재 업로드본은 `edge` 로 만들었고, 최종 음성 선택은 사람이 듣고 정하는 게이트로 남아 있다.

로컬 TTS는 같은 문장도 실행마다 길이가 다르다. 그래서 `NARRATION`의 시각은 "이 컷 즈음에 나왔으면 하는
희망값"으로만 쓰이고, 실제 배치는 실측 길이로 순차 계산해 겹침을 만들지 않는다.
밀린 결과가 영상 끝을 넘으면 그때는 문장이 길다는 뜻이라 스크립트가 멈춘다.

## 출처

- NAN 18 플레이 영상 도시에: `C:/Users/basqu/My-Personal-Assistant/01 Projects/공모전 파이프라인/NAN 2026/18 플레이 영상 도시에.md` (①-1, ①-2, ①-6, ④)
- Derek Lieu, *10 Common Indie Game Trailer Mistakes*: https://www.derek-lieu.com/blog/2020/9/14/10-common-indie-game-trailer-mistakes-and-how-to-fix-them
- Derek Lieu, *How to Optimize a Game Trailer for Social Media*: https://www.derek-lieu.com/blog/2023/2/12/how-to-optimize-a-game-trailer-for-social-media
- YouTube upload encoding recommendations: https://support.google.com/youtube/answer/1722171
