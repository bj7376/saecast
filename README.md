# 새상청 Web v0.2

모바일 우선 `상승기류 나침반 Beta` 프로토타입입니다.

## v0.2에서 실제로 연결된 것

- 새상청 홈 → 상승기류 나침반
- 지도에서 기준 지역 선택
- 오늘부터 7일 이내 날짜 선택
- `candidates-index.json` + 분할된 웹용 경량 후보지 데이터에서 반경 60 km 후보 검색
- 모바일 계산량을 고려해 최대 30곳 분석
  - 100대명산+ 도보 후보 우선 포함
  - 차량 후보는 v3의 주변 지형 percentile을 이용해 분석 pool 구성
  - 도로 쉼터는 보조 후보로 최대 4곳
- Open-Meteo Forecast API
  - 100 m 풍속 / 풍향
  - 선택 날짜 08:00–15:00 KST
- AWS Open Data Terrarium DEM
  - zoom 12
  - 후보 주변 반경 3 km
  - 해수면 아래 고도는 0 m로 clamp
- SSRS 계열 지형성 상승기류 계산
  - `wind_speed × sin(slope) × max(0, cos(aspect - wind_direction))`
  - 약 0.8 km smoothing
  - 후보 주변 1.5 km 최대 상승기류 사용
- 시간별 후보 percentile → 하루 평균 percentile로 상대 순위
- 결과 지도 핀 ↔ 모바일 카드 스와이프 동기화
- 실제 시간별 상승기류 리포트
- JPG 저장
- `어떻게?` / `정보` / 출처 및 라이선스
- Cloudflare Workers Static Assets 설정

## 브라우저 계산 최적화

Python 검증 코드의 구조를 유지하되, 모바일 브라우저에서 계산이 지나치게 느려지지 않도록
원래 DEM 해상도에서 slope/aspect와 raw uplift를 계산한 뒤 uplift grid를 4×4 pixel block으로
평균하여 Gaussian smoothing을 수행합니다. 따라서 Python/SciPy 결과와 수치가 완전히 동일한
구현은 아니며, 서비스용 근사 구현입니다.

## 실행

```bash
npm install
npm run dev
```

- 홈: http://localhost:5173/
- 상승기류 나침반: http://localhost:5173/soaring-compass

## 빌드

```bash
npm run build
```

## Cloudflare 배포

```bash
npx wrangler login
npm run deploy
```

현재 `wrangler.jsonc`는 Worker 로직 없이 `dist/` 정적 assets만 배포합니다.
날씨와 지형 데이터는 사용자의 브라우저가 직접 가져와 계산합니다.

## 데이터 파일

`public/data/candidates-index.json` 및 `candidates-*.json`

## 주의

이 기능은 맹금류의 출현 확률을 예측하지 않습니다. 선택한 날짜의 예보 바람과 지형을 이용해
후보지 사이의 지형성 상승기류 조건을 비교하는 참고 도구입니다.
