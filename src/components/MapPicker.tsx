import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { PickedPlace } from "../lib/types";

type Props = {
  value: PickedPlace | null;
  onChange: (place: PickedPlace) => void;
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

export default function MapPicker({ value, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: value ? [value.lon, value.lat] : [127.75, 36.3],
      zoom: value ? 10 : 7.15,
      minZoom: 5.2,
      maxZoom: 18,
      attributionControl: false,
    });

    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );

    const selectCenter = () => {
      const center = map.getCenter();
      onChangeRef.current({ lat: center.lat, lon: center.lng });
    };

    map.on("dragend", selectCenter);
    map.on("zoomend", selectCenter);
    map.on("click", (event: maplibregl.MapMouseEvent) => {
      map.easeTo({
        center: event.lngLat,
        duration: 220,
      });
    });
    map.on("moveend", () => {
      if (map.isMoving()) return;
      const center = map.getCenter();
      if (value || map.getZoom() !== 7.15) {
        onChangeRef.current({ lat: center.lat, lon: center.lng });
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <>
      <div ref={containerRef} className="map-canvas" />
      <div className={`map-center-pin ${value ? "active" : ""}`} aria-hidden="true">
        <span />
      </div>
    </>
  );
}
