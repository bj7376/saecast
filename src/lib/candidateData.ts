import type { CandidateDatabase } from "./types";

type CompactCandidateRow = [
  name: string,
  lat: number,
  lon: number,
  elevationM: number,
  accessCode: 0 | 1,
  typeCode: number,
  terrainPercentile3km: number | null,
  terrainRelief3kmM: number | null,
];

type CompactCandidateIndex = {
  v: number;
  t: string[];
  files: string[];
};

export async function loadCandidateDatabase(): Promise<CandidateDatabase> {
  const indexResponse = await fetch("/data/candidates-index.json");
  if (!indexResponse.ok) throw new Error("후보지 데이터를 불러오지 못했습니다.");
  const index = (await indexResponse.json()) as CompactCandidateIndex;
  const shardResponses = await Promise.all(
    index.files.map(async (file) => {
      const response = await fetch(`/data/${file}`);
      if (!response.ok) throw new Error("후보지 데이터를 불러오지 못했습니다.");
      return (await response.json()) as CompactCandidateRow[];
    }),
  );
  const rows = shardResponses.flat().filter((row) => index.t[row[5]] !== "rest_area");
  return {
    schemaVersion: index.v,
    count: rows.length,
    candidates: rows.map((row, candidateIndex) => ({
      id: `candidate_${candidateIndex}`,
      name: row[0],
      lat: row[1],
      lon: row[2],
      elevation_m: row[3],
      access: row[4] === 0 ? "hike" : "drive",
      candidate_type: index.t[row[5]] ?? "viewpoint",
      terrain_percentile_3km: row[6],
      terrain_relief_3km_m: row[7],
    })),
  };
}
