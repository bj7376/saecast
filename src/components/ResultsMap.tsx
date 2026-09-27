import { useEffect, useMemo, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { CandidateAnalysis } from "../lib/analysisTypes";
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
      "bottom-right",
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
      el.setAttribute("aria-label", `${candidate.overallRank}위 ${candidate.name}`);
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
    if (candidate) {
      map.easeTo({
        center: [candidate.lon, candidate.lat],
        duration: 350,
      });
    }
  }, [selectedId, byId]);

  return <div ref={containerRef} className="map-canvas" />;
}
