import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { PickedPlace } from "../lib/types";

type Props = {
  value: PickedPlace | null;
  onChange: (place: PickedPlace) => void;
};

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

export default function MapPicker({ value, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [127.75, 36.3],
      zoom: 6.2,
      minZoom: 5.2,
      attributionControl: false,
    });

    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );

    map.on("click", (event: maplibregl.MapMouseEvent) => {
      onChangeRef.current({
        lat: event.lngLat.lat,
        lon: event.lngLat.lng,
      });
    });

    mapRef.current = map;

    return () => {
      markerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!value) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    if (!markerRef.current) {
      markerRef.current = new maplibregl.Marker()
        .setLngLat([value.lon, value.lat])
        .addTo(map);
    } else {
      markerRef.current.setLngLat([value.lon, value.lat]);
    }
  }, [value]);

  return <div ref={containerRef} className="map-canvas" />;
}
