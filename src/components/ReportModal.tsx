import { useMemo, useRef, useState } from "react";
import { toJpeg } from "html-to-image";
import type {
  CandidateAnalysis,
  HeatmapGrid,
} from "../lib/analysisTypes";
import { accessLabel, typeLabel, windDirectionLabel } from "../lib/geo";

type Props = {
  open: boolean;
  candidate: CandidateAnalysis | null;
  date: string;
  onClose: () => void;
};

function formatDate(date: string) {
  const [y, m, d] = date.split("-");
  return `${y}.${m}.${d}`;
}

function hourLabel(time: string) {
  return time.slice(11, 16);
}

function heatColor(value: number, low: number, high: number) {
  const n = Math.max(0, Math.min(1, (value - low) / Math.max(0.0001, high - low)));
  const stop1 = Math.min(1, n / 0.5);
  const stop2 = Math.max(0, (n - 0.5) / 0.5);
  const r = n < 0.5
    ? Math.round(57 + (229 - 57) * stop1)
    : Math.round(229 + (215 - 229) * stop2);
  const g = n < 0.5
    ? Math.round(106 + (197 - 106) * stop1)
    : Math.round(197 + (72 - 197) * stop2);
  const b = n < 0.5
    ? Math.round(177 + (92 - 177) * stop1)
    : Math.round(92 + (55 - 92) * stop2);
  const alpha = 0.12 + n * 0.82;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function HeatmapMini({
  heatmap,
  candidateName,
}: {
  heatmap: HeatmapGrid;
  candidateName: string;
}) {
  const cellW = 100 / heatmap.width;
  const cellH = 100 / heatmap.height;
  const sorted = [...heatmap.values].sort((a, b) => a - b);
  const q = (p: number) =>
    sorted[Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * p)))];
  const low = q(0.05);
  const high = Math.max(low + 0.0001, q(0.95));

  return (
    <svg
      className="report-heatmap"
      viewBox="0 0 100 100"
      role="img"
      aria-label={`${candidateName} 선택 지역 반경 30 km 상승기류 분포`}
    >
      <defs>
        <clipPath id="regional-heatmap-circle">
          <circle cx="50" cy="50" r="50" />
        </clipPath>
      </defs>
      <g clipPath="url(#regional-heatmap-circle)">
        {heatmap.values.map((value, index) => {
          const x = (index % heatmap.width) * cellW;
          const y = Math.floor(index / heatmap.width) * cellH;
          return (
            <rect
              key={index}
              x={x}
              y={y}
              width={cellW + 0.25}
              height={cellH + 0.25}
              fill={heatColor(value, low, high)}
            />
          );
        })}
      </g>
      <circle cx="50" cy="50" r="49.4" className="heatmap-boundary-ring" />
      <circle cx="50" cy="50" r="3.1" className="heatmap-center-ring" />
      <circle cx="50" cy="50" r="1.25" className="heatmap-center-dot" />
    </svg>
  );
}

function UpliftChart({ candidate }: { candidate: CandidateAnalysis }) {
  const { path, thresholdY, width, height, points } = useMemo(() => {
    const rows = candidate.hourly;
    const width = 430;
    const height = 118;
    const padX = 8;
    const padTop = 10;
    const padBottom = 24;
    const maxValue = Math.max(1, ...rows.map((r) => r.nearbyMaxUpliftMps));
    const usableH = height - padTop - padBottom;
    const x = (i: number) =>
      rows.length <= 1
        ? width / 2
        : padX + (i / (rows.length - 1)) * (width - padX * 2);
    const y = (v: number) => padTop + (1 - v / maxValue) * usableH;
    const pts = rows.map((row, i) => ({
      x: x(i),
      y: y(row.nearbyMaxUpliftMps),
      label: hourLabel(row.time),
    }));

    return {
      width,
      height,
      path: pts
        .map(
          (p, i) =>
            `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`,
        )
        .join(" "),
      thresholdY: y(0.75),
      points: pts,
    };
  }, [candidate]);

  return (
    <svg
      className="uplift-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="시간별 상승기류 그래프"
    >
      {thresholdY > 0 && thresholdY < height - 20 && (
        <>
          <line
            className="chart-threshold"
            x1="0"
            x2={width}
            y1={thresholdY}
            y2={thresholdY}
          />
          <text
            className="chart-threshold-label"
            x={width - 4}
            y={thresholdY - 4}
          >
            0.75 m/s
          </text>
        </>
      )}
      <path
        className="chart-area"
        d={`${path} L${points.at(-1)?.x ?? width},${height - 24} L${points[0]?.x ?? 0},${height - 24} Z`}
      />
      <path className="chart-line" d={path} />
      {points.map((point, i) => (
        <g key={i}>
          <circle className="chart-dot" cx={point.x} cy={point.y} r="2.5" />
          <text
            className="chart-hour"
            x={point.x}
            y={height - 6}
            textAnchor="middle"
          >
            {point.label.slice(0, 2)}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default function ReportModal({
  open,
  candidate,
  date,
  onClose,
}: Props) {
  const reportRef = useRef<HTMLDivElement | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open || !candidate) return null;

  const saveJpeg = async () => {
    if (!reportRef.current) return;
    setSaving(true);

    try {
      const dataUrl = await toJpeg(reportRef.current, {
        quality: 0.96,
        pixelRatio: 2,
        backgroundColor: "#f7f7f4",
      });
      const link = document.createElement("a");
      link.download = `새상청_${candidate.name}_${date}.jpg`;
      link.href = dataUrl;
      link.click();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="report-modal">
      <header className="report-modal-header">
        <button className="text-button" onClick={onClose}>닫기</button>
        <strong>상승기류 리포트</strong>
        <span className="header-spacer" />
      </header>

      <div className="report-scroll">
        <div className="report-card" ref={reportRef}>
          <div className="report-brand">
            <strong>새상청</strong>
            <span>상승기류 나침반 Beta</span>
          </div>

          <div className="report-title">
            <p>{formatDate(date)}</p>
            <h1>{candidate.name}</h1>
            <span>
              {accessLabel(candidate.access)} · {typeLabel(candidate.candidate_type)} · 선택 지점에서 {candidate.distanceKm.toFixed(1)} km
              {candidate.islandBonusPercent > 0 ? ` · 독립산지 +${candidate.islandBonusPercent}%` : ""}
            </span>
          </div>

          <div className="report-score local">
            <span>주변 지형 대비</span>
            <strong>하루 평균 상위 {candidate.localTopPercent}%</strong>
            <p>
              전체 후보지 순위가 아닙니다. 이 지점의 상승기류가
              바로 주변 지형보다 얼마나 강한 편인지 나타냅니다.
            </p>
          </div>

          <div className="report-grid four">
            <div>
              <span>좋은 시간</span>
              <strong>{hourLabel(candidate.bestTime)}</strong>
            </div>
            <div>
              <span>상승기류</span>
              <strong>{candidate.bestUpliftMps.toFixed(2)} m/s</strong>
            </div>
            <div>
              <span>바람</span>
              <strong>
                {windDirectionLabel(candidate.bestWindDirectionDeg)}{" "}
                {candidate.bestWindSpeedMps.toFixed(1)}
              </strong>
            </div>
            <div>
              <span>0.75 m/s 이상</span>
              <strong>{candidate.hoursGe075}시간</strong>
            </div>
          </div>

          {candidate.bestHeatmap && (
            <div className="report-heatmap-block">
              <div className="report-section-title">
                <span>{hourLabel(candidate.bestTime)} 지역 조건</span>
                <small>반경 30 km</small>
              </div>
              <div className="report-heatmap-wrap">
                <HeatmapMini
                  heatmap={candidate.bestHeatmap}
                  candidateName={candidate.name}
                />
                <div className="heatmap-scale">
                  <span>약함</span>
                  <span>붉을수록 유리</span>
                  <span>강함</span>
                </div>
              </div>
            </div>
          )}

          <div className="report-chart-block">
            <div className="report-section-title">
              <span>시간별 상승기류</span>
              <small>08–15시 · 후보 주변 1.5 km 최대값</small>
            </div>
            <UpliftChart candidate={candidate} />
          </div>

          <p className="report-footnote">
            선택한 날짜의 100 m 풍향·풍속과 지형의 경사·방향으로 계산한 참고값입니다.
            실제 국지풍이나 맹금류의 이동 경로와는 다를 수 있습니다.
          </p>
        </div>
      </div>

      <div className="report-actions">
        <button
          className="primary-button full"
          onClick={saveJpeg}
          disabled={saving}
        >
          {saving ? "JPG 만드는 중..." : "JPG로 저장"}
        </button>
      </div>
    </div>
  );
}
