import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import MapPicker from "./components/MapPicker";
import ResultsMap from "./components/ResultsMap";
import InfoSheet from "./components/InfoSheet";
import ReportModal from "./components/ReportModal";
import IconButton from "./components/IconButton";
import type {
  CandidateDatabase,
  InfoMode,
  PickedPlace,
} from "./lib/types";
import { loadCandidateDatabase } from "./lib/candidateData";
import type {
  CandidateAnalysis,
  WorkerMessage,
  WorkerRequest,
} from "./lib/analysisTypes";
import {
  accessLabel,
  buildAnalysisPool,
  candidatesWithinRadius,
  typeLabel,
  windDirectionLabel,
} from "./lib/geo";

type CompassStep = "select" | "loading" | "results";

function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dateRange() {
  const now = new Date();
  const min = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const max = new Date(min);
  max.setDate(max.getDate() + 6);

  const defaultDate = new Date(min);
  defaultDate.setDate(defaultDate.getDate() + 1);

  return {
    min: isoDate(min),
    max: isoDate(max),
    defaultDate: isoDate(defaultDate),
  };
}

function routePath() {
  return window.location.pathname.replace(/\/+$/, "") || "/";
}

function timeLabel(time: string) {
  return time.slice(11, 16);
}

export default function App() {
  const [path, setPath] = useState(routePath());

  useEffect(() => {
    const onPop = () => setPath(routePath());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = (next: string) => {
    window.history.pushState({}, "", next);
    setPath(next);
  };

  if (path === "/soaring-compass") {
    return <SoaringCompass onHome={() => navigate("/")} />;
  }

  return <Home onOpenCompass={() => navigate("/soaring-compass")} />;
}

function Home({ onOpenCompass }: { onOpenCompass: () => void }) {
  return (
    <main className="home-page">
      <header className="home-header">
        <div className="brand-mark">새</div>
        <div>
          <h1>새상청</h1>
          <p>탐조를 조금 더 잘 준비하기 위한 도구들</p>
        </div>
      </header>

      <section className="feature-list">
        <button className="feature-card" onClick={onOpenCompass}>
          <div className="feature-card-top">
            <span className="beta-pill">BETA</span>
            <span aria-hidden="true">↗</span>
          </div>
          <div>
            <h3>상승기류 나침반</h3>
            <p>
              날짜와 지역을 고르면, 주변에서 지형성 상승기류가
              만들어지기 좋은 탐조 후보지를 비교합니다.
            </p>
          </div>
        </button>

        <div className="future-card">
          <span>새 기능은 여기에 하나씩 추가됩니다.</span>
        </div>
      </section>

      <footer className="home-footer">
        <span>SAESANGCHEONG</span>
        <span>v0.2</span>
      </footer>
    </main>
  );
}

function SoaringCompass({ onHome }: { onHome: () => void }) {
  const range = useMemo(dateRange, []);
  const [step, setStep] = useState<CompassStep>("select");
  const [pickedPlace, setPickedPlace] = useState<PickedPlace | null>(null);
  const [date, setDate] = useState(range.defaultDate);
  const [database, setDatabase] = useState<CandidateDatabase | null>(null);
  const [results, setResults] = useState<CandidateAnalysis[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingCopy, setLoadingCopy] = useState("주변 탐조 후보지를 찾고 있어요");
  const [analysisCount, setAnalysisCount] = useState(0);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoMode, setInfoMode] = useState<InfoMode>("how");
  const [reportOpen, setReportOpen] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    loadCandidateDatabase()
      .then(setDatabase)
      .catch((error) => setAnalysisError(error instanceof Error ? error.message : String(error)));
  }, []);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const selectedCandidate = useMemo(
    () => results.find((item) => item.id === selectedId) ?? null,
    [results, selectedId],
  );

  const startAnalysis = () => {
    if (!pickedPlace || !database) return;

    const nearby = candidatesWithinRadius(database.candidates, pickedPlace, 30);
    const pool = buildAnalysisPool(nearby, 30);

    setAnalysisError(null);
    setResults([]);
    setSelectedId(null);
    setAnalysisCount(pool.length);

    if (pool.length === 0) {
      setStep("results");
      return;
    }

    workerRef.current?.terminate();
    const worker = new Worker(
      new URL("./workers/analysisWorker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (message.type === "progress") {
        setLoadingProgress(message.progress);
        setLoadingCopy(message.copy);
      } else if (message.type === "done") {
        const visible = message.results.slice(0, 12);
        setResults(visible);
        setSelectedId(visible[0]?.id ?? null);
        setLoadingProgress(1);
        setStep("results");
        worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
      } else if (message.type === "error") {
        setAnalysisError(message.message);
        setStep("select");
        worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
      }
    };

    worker.onerror = (event) => {
      setAnalysisError(event.message || "분석 중 알 수 없는 오류가 발생했습니다.");
      setStep("select");
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };

    const request: WorkerRequest = {
      type: "analyze",
      date,
      candidates: pool,
    };

    setLoadingProgress(0.01);
    setLoadingCopy("주변 탐조 후보지를 찾고 있어요");
    setStep("loading");
    worker.postMessage(request);
  };

  const cancelAnalysis = () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setStep("select");
  };

  return (
    <div className="compass-shell">
      {step === "select" && (
        <SelectScreen
          pickedPlace={pickedPlace}
          onPick={setPickedPlace}
          date={date}
          onDate={setDate}
          minDate={range.min}
          maxDate={range.max}
          ready={Boolean(pickedPlace && database)}
          candidateDbReady={Boolean(database)}
          onAnalyze={startAnalysis}
          onHome={onHome}
          error={analysisError}
          onInfo={() => {
            setInfoMode("how");
            setInfoOpen(true);
          }}
        />
      )}

      {step === "loading" && (
        <LoadingScreen
          copy={loadingCopy}
          progress={loadingProgress}
          candidateCount={analysisCount}
          onCancel={cancelAnalysis}
          onInfo={() => {
            setInfoMode("how");
            setInfoOpen(true);
          }}
        />
      )}

      {step === "results" && pickedPlace && (
        <ResultsScreen
          date={date}
          center={pickedPlace}
          results={results}
          analyzedCount={analysisCount}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onBack={() => setStep("select")}
          onInfo={() => {
            setInfoMode("how");
            setInfoOpen(true);
          }}
          onReport={() => setReportOpen(true)}
        />
      )}

      <InfoSheet
        open={infoOpen}
        mode={infoMode}
        onModeChange={setInfoMode}
        onClose={() => setInfoOpen(false)}
      />

      <ReportModal
        open={reportOpen}
        candidate={selectedCandidate}
        date={date}
        onClose={() => setReportOpen(false)}
      />
    </div>
  );
}

function SelectScreen({
  pickedPlace,
  onPick,
  date,
  onDate,
  minDate,
  maxDate,
  ready,
  candidateDbReady,
  onAnalyze,
  onHome,
  onInfo,
  error,
}: {
  pickedPlace: PickedPlace | null;
  onPick: (place: PickedPlace) => void;
  date: string;
  onDate: (value: string) => void;
  minDate: string;
  maxDate: string;
  ready: boolean;
  candidateDbReady: boolean;
  onAnalyze: () => void;
  onHome: () => void;
  onInfo: () => void;
  error: string | null;
}) {
  return (
    <section className="screen map-screen">
      <div className="map-layer">
        <MapPicker value={pickedPlace} onChange={onPick} />
      </div>

      <header className="floating-header">
        <IconButton aria-label="새상청 홈" onClick={onHome}>←</IconButton>
        <div className="header-title">
          <span>상승기류 나침반</span>
          <small>BETA</small>
        </div>
        <IconButton aria-label="도움말" onClick={onInfo}>?</IconButton>
      </header>

      <div className="map-instruction">
        <strong>탐조를 어디로 가실 건가요?</strong>
        <span>지도를 움직여 가운데 핀을 지역에 맞춰주세요.</span>
      </div>

      <div className="bottom-panel location-picker-panel">
        {error && <div className="error-banner">{error}</div>}

        <div className="picker-fields">
          <div className="picker-field">
            <span>가운데 핀</span>
            <strong>
              {pickedPlace
                ? `${pickedPlace.lat.toFixed(3)}, ${pickedPlace.lon.toFixed(3)}`
                : "지도를 움직여 선택"}
            </strong>
          </div>

          <label className="picker-field date-field">
            <span>날짜</span>
            <input
              type="date"
              value={date}
              min={minDate}
              max={maxDate}
              onChange={(event) => onDate(event.target.value)}
            />
          </label>
        </div>

        <div className="picker-action-row">
          <span>핀 기준 반경 30 km</span>
          <button
            className="primary-button picker-submit"
            disabled={!ready}
            onClick={onAnalyze}
          >
            {!candidateDbReady
              ? "데이터 준비 중..."
              : pickedPlace
                ? "이 지역에서 찾기"
                : "지역을 선택해주세요"}
          </button>
        </div>
      </div>
    </section>
  );
}

function LoadingScreen({
  copy,
  progress,
  candidateCount,
  onCancel,
  onInfo,
}: {
  copy: string;
  progress: number;
  candidateCount: number;
  onCancel: () => void;
  onInfo: () => void;
}) {
  return (
    <section className="screen loading-screen">
      <div className="loading-top">
        <button className="text-button" onClick={onCancel}>취소</button>
        <span>상승기류 나침반</span>
        <IconButton aria-label="도움말" onClick={onInfo}>?</IconButton>
      </div>

      <div className="loading-center">
        <div className="loading-orbit" aria-hidden="true">
          <div className="orbit-dot" />
        </div>
        <p className="eyebrow">ANALYZING {candidateCount} PLACES</p>
        <h1>맹금류가 상승기류를<br />타기 좋은 곳을 찾는 중...</h1>
        <p className="loading-copy">{copy}</p>
        <div className="progress-track" aria-label={`분석 진행 ${Math.round(progress * 100)}%`}>
          <span style={{ width: `${Math.max(2, progress * 100)}%` }} />
        </div>
      </div>

      <p className="loading-footnote">
        출현 확률이 아니라 지형과 바람으로 상승기류 조건을 비교합니다.
      </p>
    </section>
  );
}

function ResultsScreen({
  date,
  center,
  results,
  analyzedCount,
  selectedId,
  onSelect,
  onBack,
  onInfo,
  onReport,
}: {
  date: string;
  center: PickedPlace;
  results: CandidateAnalysis[];
  analyzedCount: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onBack: () => void;
  onInfo: () => void;
  onReport: () => void;
}) {
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (!selectedId) return;
    cardRefs.current.get(selectedId)?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [selectedId]);

  useEffect(() => {
    const root = carouselRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const best = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (best?.target instanceof HTMLElement) {
          const id = best.target.dataset.candidateId;
          if (id && best.intersectionRatio >= 0.62) onSelect(id);
        }
      },
      { root, threshold: [0.62, 0.8] },
    );
    cardRefs.current.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [results, onSelect]);

  const selected = results.find((candidate) => candidate.id === selectedId) ?? null;

  return (
    <section className="screen results-screen">
      <div className="results-map">
        <ResultsMap
          center={center}
          candidates={results}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      </div>

      <header className="floating-header">
        <IconButton aria-label="다시 선택" onClick={onBack}>←</IconButton>
        <div className="header-title">
          <span>{date}</span>
          <small>{analyzedCount}곳 분석 · {results.length}곳 표시</small>
        </div>
        <IconButton aria-label="도움말" onClick={onInfo}>?</IconButton>
      </header>

      {results.length === 0 ? (
        <div className="empty-results bottom-panel">
          <h2>30 km 안에서 분석할 후보지를 찾지 못했어요.</h2>
          <p>기준점을 조금 옮겨 다시 시도해 주세요.</p>
          <button className="secondary-button full" onClick={onBack}>다시 선택</button>
        </div>
      ) : (
        <div className="results-carousel-wrap">
          <div className="results-carousel" ref={carouselRef}>
            {results.map((candidate) => (
              <div
                key={candidate.id}
                data-candidate-id={candidate.id}
                ref={(node) => {
                  if (node) cardRefs.current.set(candidate.id, node);
                  else cardRefs.current.delete(candidate.id);
                }}
                className={`result-card ${candidate.id === selectedId ? "selected" : ""}`}
                onClick={() => onSelect(candidate.id)}
              >
                <div className="result-card-head">
                  <span className="candidate-index">{candidate.overallRank}</span>
                  <span>{typeLabel(candidate.candidate_type)}</span>
                  <span className="local-rank-label">주변 1.5 km 내 상위 {candidate.localTopPercent}%</span>
                </div>

                <h2>{candidate.name}</h2>

                <div className="candidate-meta">
                  <span>{accessLabel(candidate.access)}</span>
                  <span>·</span>
                  <span>{candidate.distanceKm.toFixed(1)} km</span>
                  {candidate.elevation_m != null && (
                    <>
                      <span>·</span>
                      <span>{Math.round(candidate.elevation_m)} m</span>
                    </>
                  )}
                </div>

                <div className="score-real">
                  <div>
                    <span>평균 상승기류</span>
                    <strong>{candidate.meanNearbyMaxUpliftMps.toFixed(2)} <small>m/s</small></strong>
                  </div>
                  <div>
                    <span>가장 좋은 시간</span>
                    <strong>{timeLabel(candidate.bestTime)}</strong>
                  </div>
                  <div>
                    <span>그때 바람</span>
                    <strong>{windDirectionLabel(candidate.bestWindDirectionDeg)} {candidate.bestWindSpeedMps.toFixed(1)}</strong>
                  </div>
                </div>

                <div className="heatmap-note">
                  <span>지도 색은 {timeLabel(candidate.bestTime)}의 주변 상승기류 분포</span>
                  <strong>핀 위치는 하루 평균 상위 {candidate.localTopPercent}%</strong>
                </div>

                {candidate.id === selectedId && (
                  <button
                    className="secondary-button full compact"
                    onClick={(event) => {
                      event.stopPropagation();
                      onReport();
                    }}
                  >
                    날짜별 상승기류 리포트
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="carousel-hint">
            <span>{selected?.name ?? ""}</span>
            <span>카드를 넘겨 비교해보세요 →</span>
          </div>
        </div>
      )}
    </section>
  );
}
