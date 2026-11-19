# 완도뱃길 – 완도 섬 배·물때·날씨 (Netlify)

노화뱃길(nohwa-ferry)을 바탕으로 완도군 모든 여객선 노선을 지역(섬)별로 보여 주는 앱입니다.

## 폴더 구성
- `public/index.html` — 앱 화면 (지역 고르기 → 노선·내일 운항예보·특보·날씨·물때)
- `public/regions.js` — **지역 설정 파일**: 지역별 노선, 날씨 격자(nx·ny), 물때 좌표, 특보 구역, 연락처
- `netlify/functions/api.mjs` — 공공데이터 중계 함수
- `tools/` — 아이콘 만들기, 서버 함수 점검(`node tools/test-api.mjs`), 노화뱃길 수정안(`nohwa-ferry-hub.patch`)

## 서버 경로
| 경로 | 내용 | 캐시 |
|---|---|---|
| `/api/komsa` | KOMSA 오늘 운항(완도군 관련 항로만) — **허브** | 낮 15분 · 밤(21:30~05:00) 1시간 |
| `/api/tomorrow` | KOMSA 내일 운항예보(완도군 관련 행) | 30분 |
| `/api/weather/지역` | 기상청 단기예보 | 1시간 |
| `/api/tide/지역` | TideBED 14일(안 되면 완도 조석예보) | 6시간 |
| `/api/warn` | 기상특보 통보문(광주청 156 + 제주청 184) | 10분 |

지역: `wando` `nohwa` `soan` `cheongsan` `geumil` `saengil` `geumdang` `deogu`

## KOMSA 하루 100회 나눠 쓰기
- KOMSA는 이 앱의 `/api/komsa` 한 곳만 부릅니다 → 하루 최대 약 74회.
- 노화뱃길은 `tools/nohwa-ferry-hub.patch`를 적용하면 KOMSA 대신 이 허브 자료를 받습니다(허브 접속이 아예 안 될 때만 직접 호출).
- 두 앱을 배포하는 사이 잠깐은 둘 다 KOMSA를 부르므로, **완도뱃길 배포 직후 노화뱃길도 이어서 배포**합니다.
- 사이트 이름이 `wando-ferry`가 아니면 노화뱃길 Netlify 환경변수 `KOMSA_HUB_URL`에 `https://새이름.netlify.app/api/komsa`를 넣습니다.
- 반대로 이 앱이 다른 허브를 쓰게 하려면 이 앱의 `KOMSA_HUB_URL`에 그 주소를 넣습니다.

## 배포 (GitHub → Netlify 연결)
1. GitHub 새 저장소 `wando-ferry`에 이 폴더를 올립니다.
2. Netlify에서 저장소 연결(사이트 이름 `wando-ferry`), Environment variables에 `DATA_GO_KR_KEY`(노화뱃길과 같은 일반 인증키, Decoding) 입력.
3. 확인: `/api/komsa`의 `names`(출항지|항로명 목록)와 `allRoutes`(전국 항로명)를 보고 `regions.js`의 노선 이름을 맞춥니다.

## 첫 배포 뒤 맞출 것
- 공단 항로명: 청산·여서·모도·덕우·제주·일정·서성·가학·동송 노선의 `re`
- 지역 `home`(출항지 이름): '나가기/들어오기' 구분 기준
- 좌표·격자는 항구 부근 대략값, 선사·매표소 전화번호는 노화·소안만 들어 있음
