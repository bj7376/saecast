import type { InfoMode } from "../lib/types";

type Props = {
  open: boolean;
  mode: InfoMode;
  onModeChange: (mode: InfoMode) => void;
  onClose: () => void;
};

export default function InfoSheet({
  open,
  mode,
  onModeChange,
  onClose,
}: Props) {
  if (!open) return null;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section
        className="info-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="상승기류 나침반 설명"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />

        <div className="segmented">
          <button className={mode === "how" ? "active" : ""} onClick={() => onModeChange("how")}>
            어떻게?
          </button>
          <button className={mode === "info" ? "active" : ""} onClick={() => onModeChange("info")}>
            정보
          </button>
        </div>

        {mode === "how" ? (
          <div className="sheet-copy">
            <h2>상승기류는 어디에서 생길까요?</h2>
            <p>
              맹금류는 바람이 산이나 능선을 만나 위로 밀려 올라가는 곳에서
              적은 힘으로 고도를 높일 수 있습니다.
            </p>
            <p>
              상승기류 나침반은 선택한 날짜의 바람과 지형을 바탕으로,
              주변 탐조 후보지의 상승기류 조건을 비교합니다.
            </p>
            <div className="how-steps">
              <div><span>1</span><p>선택한 지점에서 30 km 안에 있는 산과 전망 지점을 찾습니다.</p></div>
              <div><span>2</span><p>각 후보지 주변의 비탈이 어느 방향을 향하고 얼마나 가파른지 계산합니다.</p></div>
              <div><span>3</span><p>그날 예보된 바람이 산비탈을 만나 얼마나 위로 밀려 올라갈지 계산합니다.</p></div>
              <div><span>4</span><p>후보지를 비교하고, 각 지점이 주변 1.5 km 안에서 얼마나 유리한 위치인지도 보여줍니다.</p></div>
            </div>
            <p className="notice">
              “주변 1.5 km 기준 상위 10%”는 전체 후보지 순위나 맹금류 출현 확률이 아닙니다.
              그 지점의 상승기류가 바로 주변 지형보다 강한 편이라는 뜻입니다.
            </p>
          </div>
        ) : (
          <div className="sheet-copy">
            <h2>무엇을 사용하나요?</h2>
            <p>
              선택한 날짜의 풍향·풍속 예보와 고도 자료를 사용합니다.
              지형의 경사와 방향을 구한 뒤, 바람이 어느 비탈을 타고 오르기 좋은지 계산합니다.
            </p>

            <dl className="source-list">
              <div><dt>계산 방법</dt><dd>SSRS의 지형성 상승기류 계산 방식을 바탕으로 한 비교 모델</dd></div>
              <div><dt>날씨</dt><dd>Open-Meteo의 100 m 풍향·풍속 예보</dd></div>
              <div><dt>지형</dt><dd>AWS Open Data의 Terrarium 고도 타일</dd></div>
              <div><dt>장소</dt><dd>OpenStreetMap + 한국등산트레킹지원센터 100대명산+</dd></div>
              <div><dt>접근성 참고</dt><dd>전국주차장정보표준데이터</dd></div>
              <div><dt>지도</dt><dd>MapLibre GL JS + OpenStreetMap 표준 지도</dd></div>
            </dl>

            <details>
              <summary>출처 및 계산 세부사항</summary>
              <div className="license-copy">
                <p>기본식: 바람 세기 × sin(비탈 경사) × 바람이 비탈로 불어드는 정도</p>
                <p>후보지는 주변 약 1.5 km를 함께 보고, 약 0.8 km 범위로 값을 부드럽게 평균내 비교합니다.</p>
                <p>히트맵은 선택한 지역의 반경 30 km를 보여줍니다. 각 후보지에서 조건이 가장 좋았던 시간의 바람을 이 범위의 지형에 적용한 결과이며, 실제 국지풍을 그대로 재현한 지도는 아닙니다.</p>
                <p>계산 속도를 위해 상승기류 격자를 약 4픽셀 단위로 묶은 뒤 부드럽게 평균냅니다.</p>
                <p>OpenStreetMap: © OpenStreetMap contributors, ODbL 1.0</p>
                <p>SSRS: NatLabRockies / NREL, BSD 3-Clause</p>
              </div>
            </details>
          </div>
        )}

        <button className="secondary-button full" onClick={onClose}>닫기</button>
      </section>
    </div>
  );
}
