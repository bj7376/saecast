export type AccessType = "hike" | "drive";

export type Candidate = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  elevation_m: number | null;
  access: AccessType;
  candidate_type: string;
  region?: string | null;
  address?: string | null;
  road_distance_m?: number | null;
  parking_nearby?: boolean | null;
  parking_distance_m?: number | null;
  terrain_relief_3km_m?: number | null;
  terrain_percentile_3km?: number | null;
  access_confidence?: string | null;
};

export type CandidateDatabase = {
  schemaVersion: number;
  count: number;
  candidates: Candidate[];
};

export type NearbyCandidate = Candidate & {
  distanceKm: number;
};

export type PickedPlace = {
  lat: number;
  lon: number;
};

export type InfoMode = "how" | "info";
