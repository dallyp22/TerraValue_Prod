import { useEffect, useRef, useState } from "react";
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

// Choropleth fill: median $/acre → green ramp. No-data counties render gray.
const FILL_COLOR: any = [
  "case",
  ["<", ["get", "value"], 0], "#eceae3",
  ["interpolate", ["linear"], ["get", "value"],
    6000, "#eef3e2", 10000, "#c2db9f", 14000, "#86b75f", 18000, "#43933c", 24000, "#1f5e22"],
];

type FC = { type: "FeatureCollection"; features: any[] };

export default function MarketCountyMap({ counties, selectedCounty, onSelectCounty }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loadedRef = useRef(false);
  const [geo, setGeo] = useState<FC | null>(null);

  const onSelectRef = useRef(onSelectCounty);
  onSelectRef.current = onSelectCounty;
  const selectedRef = useRef<string | null | undefined>(selectedCounty);
  selectedRef.current = selectedCounty;

  // Load county polygons once.
  useEffect(() => {
    fetch("/iowa-counties.geojson")
      .then((r) => r.json())
      .then(setGeo)
      .catch((e) => console.error("Failed to load county polygons:", e));
  }, []);

  // Merge county stats into the polygons (value = median $/acre, -1 if no data).
  const buildData = (): FC => {
    if (!geo) return { type: "FeatureCollection", features: [] };
    const byName = new Map(counties.map((c) => [c.county.toLowerCase(), c]));
    return {
      type: "FeatureCollection",
      features: geo.features.map((f) => {
        const stat = byName.get(String(f.properties?.name || "").toLowerCase());
        return {
          ...f,
          properties: {
            name: f.properties?.name,
            value: stat?.medianPerAcre ?? -1,
            sales: stat?.sales ?? 0,
          },
        };
      }),
    };
  };

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
      map.addSource("counties", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "county-fill",
        type: "fill",
        source: "counties",
        paint: { "fill-color": FILL_COLOR, "fill-opacity": 0.85 },
      });
      map.addLayer({
        id: "county-line",
        type: "line",
        source: "counties",
        paint: { "line-color": "#ffffff", "line-width": 0.6 },
      });
      map.addLayer({
        id: "county-selected",
        type: "line",
        source: "counties",
        filter: ["==", ["get", "name"], selectedRef.current ?? "__none__"],
        paint: { "line-color": "#b45309", "line-width": 2.5 },
      });

      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
      map.on("mousemove", "county-fill", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const p = e.features?.[0]?.properties as any;
        if (!p) return;
        const val = Number(p.value);
        popup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font:12px/1.4 system-ui;"><strong>${p.name} County</strong><br/>` +
            (val >= 0 ? `Median $${val.toLocaleString()}/acre<br/>${p.sales} sales` : "No sales in range") +
            `</div>`,
          )
          .addTo(map);
      });
      map.on("mouseleave", "county-fill", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });
      map.on("click", "county-fill", (e) => {
        const name = (e.features?.[0]?.properties as any)?.name as string | undefined;
        if (name) onSelectRef.current(name === selectedRef.current ? null : name);
      });

      loadedRef.current = true;
      (map.getSource("counties") as maplibregl.GeoJSONSource)?.setData(buildData() as any);
    });

    return () => { map.remove(); mapRef.current = null; loadedRef.current = false; };
  }, []);

  // Re-merge data when stats or polygons change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    (map.getSource("counties") as maplibregl.GeoJSONSource)?.setData(buildData() as any);
  }, [counties, geo]);

  // Selection outline.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current || !map.getLayer("county-selected")) return;
    map.setFilter("county-selected", ["==", ["get", "name"], selectedCounty ?? "__none__"]);
  }, [selectedCounty]);

  return <div ref={containerRef} className="h-[360px] w-full rounded-lg overflow-hidden" />;
}
