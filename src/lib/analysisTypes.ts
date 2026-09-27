import type { NearbyCandidate } from "./types";

export type HeatmapGrid = {
  width: number;
  height: number;
  values: number[];
  minValue: number;
  maxValue: number;
  north: number;
  south: number;
  east: number;
  west: number;
  radiusKm: number;
};

export type HourlyUplift = {
  time: string;
  windSpeedMps: number;
  windDirectionDeg: number;
  pointUpliftMps: number;
  nearbyMaxUpliftMps: number;
  nearbyMeanUpliftMps: number;
  localPercentile: number;
};

export type CandidateAnalysis = NearbyCandidate & {
  hourly: HourlyUplift[];
  meanLocalPercentile: number;
  localTopPercent: number;
  meanNearbyMaxUpliftMps: number;
  peakNearbyMaxUpliftMps: number;
  hoursGe075: number;
  bestTime: string;
  bestWindSpeedMps: number;
  bestWindDirectionDeg: number;
  bestUpliftMps: number;
  bestLocalPercentile: number;
  bestHeatmap?: HeatmapGrid;
  islandness: number;
  islandBonusPercent: number;
  rankScore: number;
  overallRank: number;
  accessRank: number;
};

export type WorkerRequest = {
  type: "analyze";
  date: string;
  candidates: NearbyCandidate[];
  center: { lat: number; lon: number };
};

export type WorkerProgress = {
  type: "progress";
  progress: number;
  copy: string;
};

export type WorkerDone = {
  type: "done";
  results: CandidateAnalysis[];
};

export type WorkerError = {
  type: "error";
  message: string;
};

export type WorkerMessage = WorkerProgress | WorkerDone | WorkerError;
