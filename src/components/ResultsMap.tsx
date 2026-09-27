import { useEffect, useMemo, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { CandidateAnalysis, HeatmapGrid } from "../lib/analysisTypes";
import type { PickedPlace } from "../lib/types";

type Props = {
  center: PickedPlace;
  candidates: CandidateAnalysis[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [
    {
      id: "osm",
      type: "raster",
      source: "osm",
    },
  ],
};

const HEATMAP_SOURCE = "uplift-heatmap-source";
const HEATMAP_LAYER = "uplift-heatmap-layer";

function heatmapDataUrl(heatmap: HeatmapGrid): string {
  const canvas = document.createElement("canvas");
  canvas.width = heatmap.width;
  canvas.height = heatmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const sorted = [...heatmap.values].sort((a, b) => a - b);
  const q = (p: number) =>
    sorted[Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * p)))];
  const low = q(0.05);
  const high = Math.max(low + 0.0001, q(0.95));

  const image = ctx.createImageData(heatmap.width, heatmap.height);
  const cx = (heatmap.width - 1) / 2;
  const cy = (heatmap.height - 1) / 2;
  const radius = Math.min(cx, cy);

  for (let i = 0; i < heatmap.values.length; i += 1) {
    const x = i % heatmap.width;
    const y = Math.floor(i / heatmap.width);
    const p = i * 4;
    const distance = Math.hypot(x - cx, y - cy);

    if (distance > radius) {
      image.data[p + 3] = 0;
      continue;
    }

    const normalized = Math.max(
      0,
      Math.min(1, (heatmap.values[i] - low) / (high - low)),
    );

    const stop1 = Math.min(1, normalized / 0.5);
    const stop2 = Math.max(0, (normalized - 0.5) / 0.5);

    const r = normalized < 0.5
      ? Math.round(57 + (229 - 57) * stop1)
      : Math.round(229 + (215 - 229) * stop2);
    const g = normalized < 0.5
      ? Math.round(106 + (197 - 106) * stop1)
      : Math.round(197 + (72 - 197) * stop2);
    const b = normalized < 0.5
      ? Math.round(177 + (92 - 177) * stop1)
      : Math.round(92 + (55 - 92) * stop2);

    image.data[p] = r;
    image.data[p + 1] = g;
    image.data[p + 2] = b;
    image.data[p + 3] = Math.round((0.1 + normalized * 0.72) * 255);
  }

  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

function removeHeatmap(map: maplibregl.Map) {
  if (map.getLayer(HEATMAP_LAYER)) {
    map.removeLayer(HEATMAP_LAYER);
  }
  if (map.getSource(HEATMAP_SOURCE)) {
    map.removeSource(HEATMAP_SOURCE);
  }
}

function addHeatmap(map: maplibregl.Map, heatmap: HeatmapGrid) {
  removeHeatmap(map);
  const url = heatmapDataUrl(heatmap);
  if (!url) return;

  map.addSource(HEATMAP_SOURCE, {
    type: "image",
    url,
    coordinates: [
      [heatmap.west, heatmap.north],
      [heatmap.east, heatmap.north],
      [heatmap.east, heatmap.south],
      [heatmap.west, heatmap.south],
    ],
  });

  map.addLayer({
    id: HEATMAP_LAYER,
    type: "raster",
    source: HEATMAP_SOURCE,
    paint: {
      "raster-opacity": 0.82,
      "raster-fade-duration": 0,
      "raster-resampling": "linear",
    },
  });
}

export default function ResultsMap({
  center,
  candidates,
  selectedId,
  onSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRefs = useRef<Map<string, maplibregl.Marker>>(new Map());
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const byId = useMemo(
    () => new Map(candidates.map((candidate) => [candidate.id, candidate])),
    [candidates],
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [center.lon, center.lat],
      zoom: 8,
      attributionControl: false,
    });

    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-left",
    );

    const bounds = new maplibregl.LngLatBounds(
      [center.lon, center.lat],
      [center.lon, center.lat],
    );

    candidates.forEach((candidate) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "result-marker";

      if (candidate.overallRank <= 3) el.classList.add("top-rank");
      else if (candidate.overallRank <= 7) el.classList.add("mid-rank");

      const label = document.createElement("span");
      label.textContent = String(candidate.overallRank);
      el.appendChild(label);
      el.setAttribute(
        "aria-label",
        `${candidate.overallRank}번 후보 ${candidate.name}`,
      );

      el.addEventListener("click", (event) => {
        event.stopPropagation();
        onSelectRef.current(candidate.id);
      });

      const marker = new maplibregl.Marker({
        element: el,
        anchor: "center",
      })
        .setLngLat([candidate.lon, candidate.lat])
        .addTo(map);

      markerRefs.current.set(candidate.id, marker);
      bounds.extend([candidate.lon, candidate.lat]);
    });

    if (candidates.length > 0) {
      map.fitBounds(bounds, {
        padding: { top: 70, right: 35, bottom: 230, left: 35 },
        maxZoom: 10.5,
        duration: 0,
      });
    }

    mapRef.current = map;

    return () => {
      markerRefs.current.forEach((marker) => marker.remove());
      markerRefs.current.clear();
      removeHeatmap(map);
      map.remove();
      mapRef.current = null;
    };
  }, [candidates, center.lat, center.lon]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;

    markerRefs.current.forEach((marker, id) => {
      marker.getElement().classList.toggle("selected", id === selectedId);
    });

    const candidate = byId.get(selectedId);
    if (!candidate) return;

    const show = () => {
      if (candidate.bestHeatmap) {
        addHeatmap(map, candidate.bestHeatmap);
      } else {
        removeHeatmap(map);
      }

      if (candidate.bestHeatmap) {
        map.fitBounds(
          [
            [candidate.bestHeatmap.west, candidate.bestHeatmap.south],
            [candidate.bestHeatmap.east, candidate.bestHeatmap.north],
          ],
          {
            padding: { top: 72, right: 24, bottom: 230, left: 24 },
            maxZoom: 11,
            duration: 380,
          },
        );
      } else {
        map.easeTo({
          center: [candidate.lon, candidate.lat],
          duration: 380,
        });
      }
    };

    if (map.isStyleLoaded()) {
      show();
    } else {
      map.once("load", show);
    }
  }, [selectedId, byId]);

  return <div ref={containerRef} className="map-canvas" />;
}
