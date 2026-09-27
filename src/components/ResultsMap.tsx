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

  const image = ctx.createImageData(heatmap.width, heatmap.height);
  const span = Math.max(0.0001, heatmap.maxValue - heatmap.minValue);

  for (let i = 0; i < heatmap.values.length; i += 1) {
    const normalized = Math.max(
      0,
      Math.min(1, (heatmap.values[i] - heatmap.minValue) / span),
    );

    const r = Math.round(74 + normalized * 165);
    const g = Math.round(111 + normalized * 40);
    const b = Math.round(136 - normalized * 82);
    const alpha = Math.round((0.08 + normalized * 0.78) * 255);
    const p = i * 4;

    image.data[p] = r;
    image.data[p + 1] = g;
    image.data[p + 2] = b;
    image.data[p + 3] = alpha;
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
      "raster-opacity": 0.72,
      "raster-fade-duration": 0,
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

      map.easeTo({
        center: [candidate.lon, candidate.lat],
        zoom: Math.max(map.getZoom(), 12.2),
        duration: 380,
      });
    };

    if (map.isStyleLoaded()) {
      show();
    } else {
      map.once("load", show);
    }
  }, [selectedId, byId]);

  return <div ref={containerRef} className="map-canvas" />;
}
