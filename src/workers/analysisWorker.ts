/// <reference lib="webworker" />

import type { CandidateAnalysis, WorkerRequest } from "../lib/analysisTypes";
import type { NearbyCandidate } from "../lib/types";

const TERRAIN_ZOOM = 12;
const TERRAIN_WINDOW_RADIUS_KM = 3.0;
const NEARBY_RADIUS_KM = 1.5;
const SMOOTH_SIGMA_KM = 0.8;
const DOWNSAMPLE = 4;
const START_HOUR = 8;
const END_HOUR = 15;
const THRESHOLD = 0.75;
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";
const TERRAIN_BASE = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";

const tileCache = new Map<string, Float32Array>();

type WeatherHour = { time: string; speed: number; direction: number };
type CandidateWeather = Map<string, WeatherHour[]>;
type TerrainFields = {
  a: Float32Array;
  b: Float32Array;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  mpp: number;
};

function progress(value: number, copy: string) {
  self.postMessage({ type: "progress", progress: Math.max(0, Math.min(1, value)), copy });
}

function latLonToGlobalPixel(lat: number, lon: number, z: number): [number, number] {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n * 256;
  const boundedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const latRad = (boundedLat * Math.PI) / 180;
  const y = ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n * 256;
  return [x, y];
}

function metersPerPixel(lat: number, z: number): number {
  return (156543.03392804097 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
}

async function decodeTerrarium(url: string): Promise<Float32Array> {
  const cached = tileCache.get(url);
  if (cached) return cached;

  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error(`지형 타일을 받지 못했습니다 (${response.status})`);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(256, 256);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("지형 이미지를 읽을 수 없습니다.");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const rgba = ctx.getImageData(0, 0, 256, 256).data;
  const out = new Float32Array(256 * 256);
  for (let i = 0, p = 0; p < out.length; i += 4, p += 1) {
    const elev = rgba[i] * 256 + rgba[i + 1] + rgba[i + 2] / 256 - 32768;
    out[p] = Math.max(0, elev);
  }
  tileCache.set(url, out);
  return out;
}

async function terrainFields(candidate: NearbyCandidate): Promise<TerrainFields> {
  const z = TERRAIN_ZOOM;
  const mpp = metersPerPixel(candidate.lat, z);
  const [cxGlobal, cyGlobal] = latLonToGlobalPixel(candidate.lat, candidate.lon, z);
  const radiusPx = Math.ceil((TERRAIN_WINDOW_RADIUS_KM * 1000) / mpp);

  const gx0 = Math.floor(cxGlobal - radiusPx);
  const gx1 = Math.ceil(cxGlobal + radiusPx);
  const gy0 = Math.floor(cyGlobal - radiusPx);
  const gy1 = Math.ceil(cyGlobal + radiusPx);
  const tx0 = Math.floor(gx0 / 256);
  const tx1 = Math.floor(gx1 / 256);
  const ty0 = Math.floor(gy0 / 256);
  const ty1 = Math.floor(gy1 / 256);
  const tileCols = tx1 - tx0 + 1;
  const tileRows = ty1 - ty0 + 1;
  const mosaicW = tileCols * 256;
  const mosaicH = tileRows * 256;
  const mosaic = new Float32Array(mosaicW * mosaicH);
  const n = 2 ** z;

  for (let ty = ty0; ty <= ty1; ty += 1) {
    for (let tx = tx0; tx <= tx1; tx += 1) {
      const wrappedX = ((tx % n) + n) % n;
      const url = `${TERRAIN_BASE}/${z}/${wrappedX}/${ty}.png`;
      const tile = await decodeTerrarium(url);
      const col = tx - tx0;
      const row = ty - ty0;
      for (let y = 0; y < 256; y += 1) {
        const src = y * 256;
        const dst = (row * 256 + y) * mosaicW + col * 256;
        mosaic.set(tile.subarray(src, src + 256), dst);
      }
    }
  }

  const localCx = cxGlobal - tx0 * 256;
  const localCy = cyGlobal - ty0 * 256;
  const x0 = Math.max(1, Math.floor(localCx - radiusPx));
  const x1 = Math.min(mosaicW - 2, Math.ceil(localCx + radiusPx));
  const y0 = Math.max(1, Math.floor(localCy - radiusPx));
  const y1 = Math.min(mosaicH - 2, Math.ceil(localCy + radiusPx));
  const width = x1 - x0 + 1;
  const height = y1 - y0 + 1;
  const a = new Float32Array(width * height);
  const b = new Float32Array(width * height);

  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const c = y * mosaicW + x;
      const dzEast = (mosaic[c + 1] - mosaic[c - 1]) / (2 * mpp);
      const dzSouth = (mosaic[c + mosaicW] - mosaic[c - mosaicW]) / (2 * mpp);
      const dzNorth = -dzSouth;
      const slope = Math.atan(Math.hypot(dzEast, dzNorth));
      const sinSlope = Math.sin(slope);
      const downslopeEast = -dzEast;
      const downslopeNorth = -dzNorth;
      const aspect = Math.atan2(downslopeEast, downslopeNorth);
      const out = (y - y0) * width + (x - x0);
      a[out] = sinSlope * Math.cos(aspect);
      b[out] = sinSlope * Math.sin(aspect);
    }
  }

  return {
    a,
    b,
    width,
    height,
    centerX: localCx - x0,
    centerY: localCy - y0,
    mpp,
  };
}

function gaussianKernel(sigma: number): Float32Array {
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float32Array(radius * 2 + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i += 1) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + radius] = v;
    sum += v;
  }
  for (let i = 0; i < kernel.length; i += 1) kernel[i] /= sum;
  return kernel;
}

function downsampleAverage(src: Float32Array, width: number, height: number, factor: number) {
  const outW = Math.ceil(width / factor);
  const outH = Math.ceil(height / factor);
  const out = new Float32Array(outW * outH);
  const counts = new Uint16Array(out.length);
  for (let y = 0; y < height; y += 1) {
    const oy = Math.floor(y / factor);
    for (let x = 0; x < width; x += 1) {
      const ox = Math.floor(x / factor);
      const idx = oy * outW + ox;
      out[idx] += src[y * width + x];
      counts[idx] += 1;
    }
  }
  for (let i = 0; i < out.length; i += 1) {
    if (counts[i] > 0) out[i] /= counts[i];
  }
  return { data: out, width: outW, height: outH };
}

function gaussianBlur(src: Float32Array, width: number, height: number, sigma: number): Float32Array {
  if (sigma <= 0.5) return src.slice();
  const kernel = gaussianKernel(sigma);
  const radius = (kernel.length - 1) >> 1;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let weight = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const xx = x + k;
        if (xx < 0 || xx >= width) continue;
        const w = kernel[k + radius];
        sum += src[y * width + xx] * w;
        weight += w;
      }
      tmp[y * width + x] = weight ? sum / weight : 0;
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let weight = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const yy = y + k;
        if (yy < 0 || yy >= height) continue;
        const w = kernel[k + radius];
        sum += tmp[yy * width + x] * w;
        weight += w;
      }
      out[y * width + x] = weight ? sum / weight : 0;
    }
  }
  return out;
}

function hourUplift(fields: TerrainFields, speed: number, windDirDeg: number) {
  const theta = (windDirDeg * Math.PI) / 180;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const raw = new Float32Array(fields.a.length);
  for (let i = 0; i < raw.length; i += 1) {
    raw[i] = speed * Math.max(0, fields.a[i] * c + fields.b[i] * s);
  }

  const ds = downsampleAverage(raw, fields.width, fields.height, DOWNSAMPLE);
  const dsMpp = fields.mpp * DOWNSAMPLE;
  const sigma = (SMOOTH_SIGMA_KM * 1000) / dsMpp;
  const smooth = gaussianBlur(ds.data, ds.width, ds.height, sigma);
  const cx = fields.centerX / DOWNSAMPLE;
  const cy = fields.centerY / DOWNSAMPLE;
  const ix = Math.max(0, Math.min(ds.width - 1, Math.round(cx)));
  const iy = Math.max(0, Math.min(ds.height - 1, Math.round(cy)));
  const point = smooth[iy * ds.width + ix];
  const radiusPx = (NEARBY_RADIUS_KM * 1000) / dsMpp;
  const r2 = radiusPx * radiusPx;
  const x0 = Math.max(0, Math.floor(cx - radiusPx));
  const x1 = Math.min(ds.width - 1, Math.ceil(cx + radiusPx));
  const y0 = Math.max(0, Math.floor(cy - radiusPx));
  const y1 = Math.min(ds.height - 1, Math.ceil(cy + radiusPx));
  let max = -Infinity;
  let sum = 0;
  let count = 0;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r2) continue;
      const v = smooth[y * ds.width + x];
      if (v > max) max = v;
      sum += v;
      count += 1;
    }
  }
  return {
    pointUpliftMps: point,
    nearbyMaxUpliftMps: Number.isFinite(max) ? max : point,
    nearbyMeanUpliftMps: count ? sum / count : point,
  };
}

async function fetchWeather(candidates: NearbyCandidate[], date: string): Promise<CandidateWeather> {
  const params = new URLSearchParams({
    latitude: candidates.map((c) => c.lat.toFixed(6)).join(","),
    longitude: candidates.map((c) => c.lon.toFixed(6)).join(","),
    hourly: "wind_speed_100m,wind_direction_100m",
    wind_speed_unit: "ms",
    timezone: "Asia/Seoul",
    start_date: date,
    end_date: date,
  });
  const response = await fetch(`${WEATHER_URL}?${params.toString()}`);
  if (!response.ok) throw new Error(`날씨 예보를 받지 못했습니다 (${response.status})`);
  const payload = await response.json();
  const list = Array.isArray(payload) ? payload : [payload];
  if (list.length !== candidates.length) throw new Error("날씨 응답의 후보지 수가 맞지 않습니다.");
  const result: CandidateWeather = new Map();

  candidates.forEach((candidate, index) => {
    const hourly = list[index]?.hourly;
    if (!hourly) throw new Error(`${candidate.name}의 시간별 예보가 없습니다.`);
    const rows: WeatherHour[] = [];
    const times: string[] = hourly.time ?? [];
    const speeds: number[] = hourly.wind_speed_100m ?? [];
    const dirs: number[] = hourly.wind_direction_100m ?? [];
    for (let i = 0; i < times.length; i += 1) {
      const hour = Number(times[i].slice(11, 13));
      if (hour < START_HOUR || hour > END_HOUR) continue;
      const speed = Number(speeds[i]);
      const direction = Number(dirs[i]);
      if (!Number.isFinite(speed) || !Number.isFinite(direction)) continue;
      rows.push({ time: times[i], speed, direction: ((direction % 360) + 360) % 360 });
    }
    result.set(candidate.id, rows);
  });
  return result;
}

function percentileRanks(values: number[]): number[] {
  if (values.length === 0) return [];
  if (values.length === 1) return [100];
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const out = new Array<number>(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i + 1;
    while (j < order.length && order[j].value === order[i].value) j += 1;
    const avgRank = (i + (j - 1)) / 2;
    const percentile = (avgRank / (values.length - 1)) * 100;
    for (let k = i; k < j; k += 1) out[order[k].index] = percentile;
    i = j;
  }
  return out;
}

async function analyze(candidates: NearbyCandidate[], date: string): Promise<CandidateAnalysis[]> {
  progress(0.03, "해당 날짜의 바람을 확인하고 있어요");
  const weather = await fetchWeather(candidates, date);
  progress(0.12, "산의 방향과 경사를 살펴보고 있어요");

  type PartialHourly = {
    time: string;
    windSpeedMps: number;
    windDirectionDeg: number;
    pointUpliftMps: number;
    nearbyMaxUpliftMps: number;
    nearbyMeanUpliftMps: number;
    percentile: number;
  };
  const partial = new Map<string, PartialHourly[]>();

  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    progress(0.12 + (i / Math.max(1, candidates.length)) * 0.76, `${candidate.name} 주변 지형을 계산하고 있어요`);
    const fields = await terrainFields(candidate);
    const rows = weather.get(candidate.id) ?? [];
    const hourly = rows.map((row) => ({
      time: row.time,
      windSpeedMps: row.speed,
      windDirectionDeg: row.direction,
      ...hourUplift(fields, row.speed, row.direction),
      percentile: 0,
    }));
    partial.set(candidate.id, hourly);
  }

  progress(0.91, "후보지들의 상승기류 조건을 비교하고 있어요");
  const times = Array.from(new Set(Array.from(partial.values()).flatMap((rows) => rows.map((r) => r.time)))).sort();
  for (const time of times) {
    const rows: { candidateId: string; row: PartialHourly }[] = [];
    for (const candidate of candidates) {
      const row = (partial.get(candidate.id) ?? []).find((r) => r.time === time);
      if (row) rows.push({ candidateId: candidate.id, row });
    }
    const p = percentileRanks(rows.map((x) => x.row.nearbyMaxUpliftMps));
    rows.forEach((x, index) => { x.row.percentile = p[index]; });
  }

  const results: CandidateAnalysis[] = candidates.map((candidate) => {
    const hourly = partial.get(candidate.id) ?? [];
    if (!hourly.length) throw new Error(`${candidate.name}의 분석 시간이 없습니다.`);
    const meanPercentile = hourly.reduce((s, x) => s + x.percentile, 0) / hourly.length;
    const meanNearbyMax = hourly.reduce((s, x) => s + x.nearbyMaxUpliftMps, 0) / hourly.length;
    const best = hourly.reduce((a, b) => b.nearbyMaxUpliftMps > a.nearbyMaxUpliftMps ? b : a);
    return {
      ...candidate,
      hourly,
      meanPercentile,
      topPercent: Math.max(1, Math.round(100 - meanPercentile)),
      meanNearbyMaxUpliftMps: meanNearbyMax,
      peakNearbyMaxUpliftMps: Math.max(...hourly.map((x) => x.nearbyMaxUpliftMps)),
      hoursGe075: hourly.filter((x) => x.nearbyMaxUpliftMps >= THRESHOLD).length,
      bestTime: best.time,
      bestWindSpeedMps: best.windSpeedMps,
      bestWindDirectionDeg: best.windDirectionDeg,
      bestUpliftMps: best.nearbyMaxUpliftMps,
      overallRank: 0,
      accessRank: 0,
      comparisonCount: candidates.length,
    };
  });

  results.sort((a, b) => {
    if (a.meanPercentile !== b.meanPercentile) return b.meanPercentile - a.meanPercentile;
    if (a.meanNearbyMaxUpliftMps !== b.meanNearbyMaxUpliftMps) return b.meanNearbyMaxUpliftMps - a.meanNearbyMaxUpliftMps;
    return a.distanceKm - b.distanceKm;
  });
  results.forEach((r, i) => { r.overallRank = i + 1; });
  for (const access of ["drive", "hike"] as const) {
    results.filter((r) => r.access === access).forEach((r, i) => { r.accessRank = i + 1; });
  }
  progress(1, "결과를 정리하고 있어요");
  return results;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type !== "analyze") return;
  try {
    const results = await analyze(event.data.candidates, event.data.date);
    self.postMessage({ type: "done", results });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
