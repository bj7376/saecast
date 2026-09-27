import type { NearbyCandidate } from "./types";

export type HourlyUplift = {
  time: string;
  windSpeedMps: number;
  windDirectionDeg: number;
  pointUpliftMps: number;
  nearbyMaxUpliftMps: number;
  nearbyMeanUpliftMps: number;
  percentile: number;
};

export type CandidateAnalysis = NearbyCandidate & {
  hourly: HourlyUplift[];
  meanPercentile: number;
  topPercent: number;
  meanNearbyMaxUpliftMps: number;
  peakNearbyMaxUpliftMps: number;
  hoursGe075: number;
  bestTime: string;
  bestWindSpeedMps: number;
  bestWindDirectionDeg: number;
  bestUpliftMps: number;
  overallRank: number;
  accessRank: number;
  comparisonCount: number;
};

export type WorkerRequest = {
  type: "analyze";
  date: string;
  candidates: NearbyCandidate[];
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
