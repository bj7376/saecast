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
            <h2>어디에서 날기 편할까요?</h2>
            <p>
              맹금류는 바람이 산이나 능선을 만나 위로 밀려 올라가는 곳에서
              적은 힘으로 고도를 높일 수 있습니다.
            </p>
            <p>
              상승기류 나침반은 선택한 날짜의 바람과 주변 산의 모양을 함께
              살펴보고, 이런 상승기류가 만들어지기 좋은 장소를 서로 비교합니다.
            </p>
            <div className="how-steps">
              <div><span>1</span><p>선택한 지역 주변에서 실제로 갈 수 있는 산과 전망 지점을 찾습니다.</p></div>
              <div><span>2</span><p>각 장소 주변의 산비탈이 어느 방향을 향하고 얼마나 가파른지 살펴봅니다.</p></div>
              <div><span>3</span><p>그날 예보된 바람이 산비탈을 만나 얼마나 위로 밀려 올라갈지 계산합니다.</p></div>
              <div><span>4</span><p>같은 지역의 후보지들을 비교해 상승기류 조건이 좋은 곳부터 보여줍니다.</p></div>
            </div>
            <p className="notice">
              “상위 10%”는 맹금류를 만날 확률이 아닙니다. 이번에 분석한 주변
              후보지들과 비교했을 때 상승기류 조건이 좋은 편이라는 뜻입니다.
            </p>
          </div>
        ) : (
          <div className="sheet-copy">
            <h2>무엇을 사용하나요?</h2>
            <p>
              선택한 날짜의 풍향·풍속과 공개 고도자료를 사용합니다. 지형에서
              산비탈의 경사와 방향을 구한 뒤, 바람이 그 비탈을 타고 올라가기
              좋은 정도를 계산합니다.
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
                <p>기본식: 바람 세기 × sin(사면 경사) × 바람과 사면 방향의 정렬 정도</p>
                <p>후보지 주변 약 1.5 km를 함께 보고, 약 0.8 km 규모로 지형성 상승기류를 부드럽게 묶어 비교합니다.</p>
                <p>브라우저에서 빠르게 계산하기 위해 상승기류 격자를 약 4픽셀 단위로 묶은 뒤 smoothing합니다.</p>
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
