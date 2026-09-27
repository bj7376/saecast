import type { Candidate, NearbyCandidate, PickedPlace } from "./types";

export function haversineKm(a: PickedPlace, b: PickedPlace): number {
  const r = 6371.0088;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const p1 = toRad(a.lat);
  const p2 = toRad(b.lat);
  const dp = toRad(b.lat - a.lat);
  const dl = toRad(b.lon - a.lon);
  const x =
    Math.sin(dp / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(x)));
}

export function candidatesWithinRadius(
  candidates: Candidate[],
  center: PickedPlace,
  radiusKm = 60,
): NearbyCandidate[] {
  return candidates
    .map((candidate) => ({
      ...candidate,
      distanceKm: haversineKm(center, { lat: candidate.lat, lon: candidate.lon }),
    }))
    .filter((candidate) => candidate.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

// 모바일에서 DEM 계산량이 과도해지지 않도록 실제 분석 후보를 최대 30곳으로 제한한다.
// 공식 도보 후보는 우선 포함하고, 차량 후보는 이미 v3에서 계산한 지역 지형 percentile을
// 중심으로 고른다. rest_area는 보조 후보라 최대 4곳만 포함한다.
export function buildAnalysisPool(
  nearby: NearbyCandidate[],
  maxCandidates = 30,
): NearbyCandidate[] {
  const hikes = nearby
    .filter((c) => c.access === "hike")
    .sort((a, b) => b.elevation_m! - a.elevation_m!);

  const drives = nearby.filter((c) => c.access === "drive");
  const nonRest = drives
    .filter((c) => c.candidate_type !== "rest_area")
    .sort((a, b) => {
      const pa = a.terrain_percentile_3km ?? -1;
      const pb = b.terrain_percentile_3km ?? -1;
      if (pa !== pb) return pb - pa;
      const da = a.terrain_relief_3km_m ?? -1;
      const db = b.terrain_relief_3km_m ?? -1;
      if (da !== db) return db - da;
      return a.distanceKm - b.distanceKm;
    });

  const rest = drives
    .filter((c) => c.candidate_type === "rest_area")
    .sort((a, b) => {
      const pa = a.terrain_percentile_3km ?? -1;
      const pb = b.terrain_percentile_3km ?? -1;
      if (pa !== pb) return pb - pa;
      return a.distanceKm - b.distanceKm;
    })
    .slice(0, 4);

  const selected: NearbyCandidate[] = [];
  const seen = new Set<string>();
  const add = (c: NearbyCandidate) => {
    if (selected.length >= maxCandidates || seen.has(c.id)) return;
    seen.add(c.id);
    selected.push(c);
  };

  hikes.forEach(add);
  nonRest.forEach(add);
  rest.forEach(add);
  return selected;
}

export function accessLabel(access: string): string {
  return access === "drive" ? "차량 접근 후보" : "도보 접근";
}

export function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    mountain_pass: "고개",
    observation_tower: "전망탑",
    viewpoint: "전망 지점",
    summit: "산 정상",
    road_peak: "도로 인접 산지",
    rest_area: "도로 쉼터",
  };
  return labels[type] ?? type;
}

export function windDirectionLabel(deg: number): string {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}
