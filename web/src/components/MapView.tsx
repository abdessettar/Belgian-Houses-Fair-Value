import { useEffect, useMemo, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export type Listing = {
  id: number;
  latitude: number;
  longitude: number;
  price: number | null;
  predicted_price: number | null;
  predicted_low: number | null;
  predicted_high: number | null;
  price_delta_pct: number | null;
  subType: string;
  netHabitableSurface: number | null;
  bedroomCount: number | null;
  epcScore: string;
  postalCode: number | null;
  shap_top: string;
  url: string | null;
  days_on_market: number | null;
  similar_ids: string;
  priceable: boolean;
};



type Props = {
  listings: Listing[];
  onSelect: (l: Listing) => void;
  selected: Listing | null;
};

// Five-stop diverging: green → teal → blue → orange → red. Teal/orange
// avoid the muddy purple of a direct blue→red lerp.
const NOT_PRICEABLE_COLOR = "rgba(25,25,25,0.55)";

const BASEMAP_STYLES = {
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  dark:  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
} as const;

function colorFor(pct: number | null, priceable: boolean): string {
  if (!priceable || pct == null) return NOT_PRICEABLE_COLOR;
  const t = Math.max(-1, Math.min(1, pct / 0.4));
  const lerp = (a: [number,number,number], b: [number,number,number], k: number):
    [number,number,number] => [
      Math.round(a[0] + (b[0]-a[0])*k),
      Math.round(a[1] + (b[1]-a[1])*k),
      Math.round(a[2] + (b[2]-a[2])*k),
    ];
  const GREEN:  [number,number,number] = [ 34, 180,  80];
  const TEAL:   [number,number,number] = [ 40, 180, 200];
  const BLUE:   [number,number,number] = [ 59, 130, 246];
  const ORANGE: [number,number,number] = [240, 150,  50];
  const RED:    [number,number,number] = [220,  70,  60];
  let rgb: [number,number,number];
  if (t <= -0.5) rgb = lerp(GREEN,  TEAL,   (t + 1.0) * 2);
  else if (t < 0) rgb = lerp(TEAL,  BLUE,   (t + 0.5) * 2);
  else if (t < 0.5) rgb = lerp(BLUE, ORANGE, t * 2);
  else rgb = lerp(ORANGE, RED,                (t - 0.5) * 2);
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.85)`;
}

export function MapView({ listings, onSelect, selected }: Props) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Refs so one-time map handlers see latest props.
  const listingsRef = useRef(listings);
  const onSelectRef = useRef(onSelect);
  const selectedRef = useRef(selected);
  const geojsonRef = useRef<GeoJSON.FeatureCollection>({ type: "FeatureCollection", features: [] });
  // Set by the init effect; called again after a basemap swap.
  const addListingsLayerRef = useRef<() => void>(() => {});
  useEffect(() => { listingsRef.current = listings; }, [listings]);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  const { selectedId, compIds } = useMemo(() => {
    if (!selected) return { selectedId: null as number | null, compIds: new Set<number>() };
    let ids: number[] = [];
    try { ids = JSON.parse(selected.similar_ids || "[]") as number[]; } catch { /* */ }
    return { selectedId: selected.id, compIds: new Set(ids) };
  }, [selected]);

  const geojson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: listings
      .filter((l) => l.latitude && l.longitude)
      .map((l) => {
        const highlight = selectedId === l.id ? 2 : compIds.has(l.id) ? 1 : 0;
        // Stack: highlighted > priceable > non-priceable.
        const layer = highlight > 0 ? 10 + highlight : (l.priceable ? 2 : 1);
        return {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [l.longitude, l.latitude] },
          properties: {
            id: l.id,
            color: colorFor(l.price_delta_pct, l.priceable),
            delta: l.price_delta_pct,
            highlight,
            priceable: l.priceable ? 1 : 0,
            layer,
            anySelected: selectedId != null ? 1 : 0,
          },
        };
      }),
  }), [listings, selectedId, compIds]);

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    const initialTheme = document.documentElement.getAttribute("data-theme") === "dark"
      ? "dark" : "light";
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLES[initialTheme],
      center: [4.6, 50.6],
      zoom: 7.2,
    });
    mapRef.current = map;
    if (import.meta.env.DEV) (window as unknown as { _map: maplibregl.Map })._map = map;
    const addListingsLayer = () => {
      if (map.getSource("listings")) return;
      map.addSource("listings", { type: "geojson", data: geojsonRef.current });
      map.addLayer({
        id: "listings-layer",
        type: "circle",
        source: "listings",
        layout: {
          "circle-sort-key": ["get", "layer"],
        },
        paint: {
          // `zoom` must be the top-level input of interpolate/step, so the
          // highlight case sits inside each zoom stop.
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            6,  ["case",
                  ["==", ["get", "highlight"], 2], 8,
                  ["==", ["get", "highlight"], 1], 5,
                  ["==", ["get", "priceable"], 0], 1.3,
                  2],
            12, ["case",
                  ["==", ["get", "highlight"], 2], 14,
                  ["==", ["get", "highlight"], 1], 10,
                  ["==", ["get", "priceable"], 0], 4,
                  6],
          ],
          "circle-color": ["get", "color"],
          "circle-opacity": [
            "case",
            ["all", ["==", ["get", "anySelected"], 1], ["==", ["get", "highlight"], 0]], 0.2,
            0.9,
          ],
          "circle-stroke-width": [
            "case",
            ["==", ["get", "highlight"], 2], 3,
            ["==", ["get", "highlight"], 1], 2,
            0.3,
          ],
          "circle-stroke-color": [
            "case",
            ["==", ["get", "highlight"], 2], "#4f46e5",
            ["==", ["get", "highlight"], 1], "#f59e0b",
            "#222",
          ],
        },
      });
    };
    // Layer-filtered listeners survive setStyle(), so register them once.
    map.on("click", "listings-layer", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const id = Number((f.properties as { id: number }).id);
      const l = listingsRef.current.find((x) => x.id === id);
      if (l) onSelectRef.current(l);
    });
    map.on("mouseenter", "listings-layer", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "listings-layer", () => { map.getCanvas().style.cursor = ""; });
    const setupLayers = addListingsLayer;
    addListingsLayerRef.current = addListingsLayer;
    // "load" can hang behind tile fetches; poll isStyleLoaded + idle instead.
    let initDone = false;
    const tryInit = () => {
      if (initDone) return;
      if (map.isStyleLoaded()) { setupLayers(); initDone = true; }
    };
    tryInit();
    map.on("styledata", tryInit);
    map.on("idle", tryInit);
    const pollId = setInterval(() => {
      tryInit();
      if (initDone) clearInterval(pollId);
    }, 100);
    // Resize once the container settles into its grid cell.
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);
    return () => { clearInterval(pollId); ro.disconnect(); map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On theme change: swap the basemap and re-add the listings layer.
  // setStyle() wipes user-added sources/layers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = (theme: "light" | "dark") => {
      map.setStyle(BASEMAP_STYLES[theme]);
      // styledata can fire before the style is fully parsed; guard + poll.
      let done = false;
      const tryAdd = () => {
        if (done) return;
        if (!map.isStyleLoaded()) return;
        if (map.getSource("listings")) { done = true; return; }
        addListingsLayerRef.current();
        const src = map.getSource("listings") as maplibregl.GeoJSONSource | undefined;
        if (src) src.setData(geojsonRef.current);
        done = true;
        map.off("styledata", tryAdd);
        map.off("idle", tryAdd);
        clearInterval(pollId);
      };
      map.on("styledata", tryAdd);
      map.on("idle", tryAdd);
      const pollId = setInterval(tryAdd, 100);
    };
    const obs = new MutationObserver(() => {
      const theme = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
      apply(theme);
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    geojsonRef.current = geojson;
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource("listings") as maplibregl.GeoJSONSource | undefined;
      if (src) src.setData(geojson);
    };
    if (map.getSource("listings")) apply();
    else map.once("styledata", apply);
  }, [geojson]);

  // Auto-fit on filter change, except the first load and when a selection
  // is still in the new results (the selection-fit effect handles that).
  const filterFitInitDoneRef = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (listings.length === 0) return;
    if (!filterFitInitDoneRef.current) {
      filterFitInitDoneRef.current = true;
      return;
    }
    // Read selection through the ref to keep the effect deps to [listings].
    const sel = selectedRef.current;
    if (sel && listings.some((l) => l.id === sel.id)) return;
    const pts: [number, number][] = listings
      .filter((l) => Number.isFinite(l.latitude) && Number.isFinite(l.longitude))
      .map((l) => [l.longitude, l.latitude]);
    if (pts.length === 0) return;
    // Don't override a manual zoom if any result is still in view.
    const view = map.getBounds();
    if (pts.some(([lng, lat]) => view.contains([lng, lat]))) return;
    const bounds = new maplibregl.LngLatBounds(pts[0], pts[0]);
    for (const p of pts.slice(1)) bounds.extend(p);
    map.fitBounds(bounds, {
      padding: { top: 60, bottom: 60, left: 60, right: 60 },
      maxZoom: 12,
      duration: 700,
    });
  }, [listings]);

  // Frame the selected listing together with its comps.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selected) return;
    const compIdList = (() => {
      try { return JSON.parse(selected.similar_ids || "[]") as number[]; }
      catch { return []; }
    })();
    const compCoords = listingsRef.current
      .filter((l) => compIdList.includes(l.id))
      .map((l) => [l.longitude, l.latitude] as [number, number]);
    if (compCoords.length === 0) {
      map.easeTo({
        center: [selected.longitude, selected.latitude],
        zoom: Math.max(map.getZoom(), 10.5),
        duration: 700,
      });
      return;
    }
    const pts: [number, number][] = [[selected.longitude, selected.latitude], ...compCoords];
    const bounds = new maplibregl.LngLatBounds(pts[0], pts[0]);
    for (const p of pts.slice(1)) bounds.extend(p);
    map.fitBounds(bounds, {
      padding: { top: 80, bottom: 80, left: 80, right: 380 },
      maxZoom: 12,
      duration: 700,
    });
  }, [selected?.id]);

  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />;
}
