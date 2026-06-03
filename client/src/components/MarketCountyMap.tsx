import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export interface CountyStat {
  county: string;
  sales: number;
  medianPerAcre: number | null;
  avgPerCsr2: number | null;
  lat: number;
  lng: number;
}

interface Props {
  counties: CountyStat[];
  selectedCounty?: string | null;
  onSelectCounty: (county: string | null) => void;
}

// Bubbles: size encodes sale volume, color encodes median $/acre.
const COLOR_RAMP: [number, string][] = [
  [6000, "#e8efd9"],
  [10000, "#bcd79a"],
  [14000, "#7fb15a"],
  [18000, "#3f8f3a"],
  [24000, "#1f5e22"],
];

function toGeoJSON(counties: CountyStat[]) {
  return {
    type: "FeatureCollection" as const,
    features: counties
      .filter((c) => c.medianPerAcre != null)
      .map((c) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [c.lng, c.lat] },
        properties: { county: c.county, sales: c.sales, value: c.medianPerAcre },
      })),
  };
}

export default function MarketCountyMap({ counties, selectedCounty, onSelectCounty }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loadedRef = useRef(false);
  const onSelectRef = useRef(onSelectCounty);
  onSelectRef.current = onSelectCounty;

  // Init map once.
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          carto: {
            type: "raster",
            tiles: [
              "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
              "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
              "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
            ],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors © CARTO",
          },
        },
        layers: [{ id: "carto", type: "raster", source: "carto" }],
      },
      center: [-93.5, 42.05],
      zoom: 5.7,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.on("load", () => {
      map.addSource("counties", { type: "geojson", data: toGeoJSON([]) });
      map.addLayer({
        id: "county-bubbles",
        type: "circle",
        source: "counties",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "sales"], 1, 5, 40, 16, 100, 24],
          "circle-color": [
            "interpolate", ["linear"], ["get", "value"],
            ...COLOR_RAMP.flatMap(([v, c]) => [v, c]),
          ],
          "circle-opacity": 0.82,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#ffffff",
        },
      });
      // Selection highlight layer (drawn on top).
      map.addLayer({
        id: "county-selected",
        type: "circle",
        source: "counties",
        filter: ["==", ["get", "county"], selectedCounty ?? "__none__"],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "sales"], 1, 7, 40, 18, 100, 26],
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-width": 3,
          "circle-stroke-color": "#b45309",
        },
      });

      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
      map.on("mousemove", "county-bubbles", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as any;
        popup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font:12px/1.4 system-ui;"><strong>${p.county} County</strong><br/>` +
            `Median $${Number(p.value).toLocaleString()}/acre<br/>${p.sales} sales</div>`,
          )
          .addTo(map);
      });
      map.on("mouseleave", "county-bubbles", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });
      map.on("click", "county-bubbles", (e) => {
        const c = (e.features?.[0]?.properties as any)?.county as string | undefined;
        if (c) onSelectRef.current(c);
      });

      loadedRef.current = true;
      (map.getSource("counties") as maplibregl.GeoJSONSource)?.setData(toGeoJSON(latestCounties.current) as any);
    });

    return () => { map.remove(); mapRef.current = null; loadedRef.current = false; };
  }, []);

  // Keep newest counties available to the load handler (avoids stale closure).
  const latestCounties = useRef(counties);
  latestCounties.current = counties;

  // Update data when counties change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    (map.getSource("counties") as maplibregl.GeoJSONSource)?.setData(toGeoJSON(counties) as any);
  }, [counties]);

  // Update selection highlight.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current || !map.getLayer("county-selected")) return;
    map.setFilter("county-selected", ["==", ["get", "county"], selectedCounty ?? "__none__"]);
  }, [selectedCounty]);

  return <div ref={containerRef} className="h-[360px] w-full rounded-lg overflow-hidden" />;
}
