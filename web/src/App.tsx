import { useEffect, useRef, useState } from "react";
import "./App.css";
import { MapView, type Listing } from "./components/MapView";
import { Sidebar } from "./components/Sidebar";
import { DetailCard } from "./components/DetailCard";
import { WelcomeModal } from "./components/WelcomeModal";
import { query } from "./lib/duckdb";
import { filtersToSQL, type Filters } from "./lib/filters";
import { nlSearch } from "./lib/nlSearch";
import { decodeState, replaceUrl } from "./lib/urlState";
import { useLang } from "./i18n/context";

// DuckDB-WASM returns BigInt for INTEGER columns; coerce to number | null.
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeListing(r: Listing): Listing {
  return {
    ...r,
    id: Number(r.id),
    price: num(r.price),
    predicted_price: num(r.predicted_price),
    predicted_low: num(r.predicted_low),
    predicted_high: num(r.predicted_high),
    price_delta_pct: num(r.price_delta_pct),
    netHabitableSurface: num(r.netHabitableSurface),
    bedroomCount: num(r.bedroomCount),
    postalCode: num(r.postalCode),
    days_on_market: num(r.days_on_market),
    priceable: !!r.priceable,
  };
}

export default function App() {
  const initial = decodeState(window.location.search);
  const { lang, t } = useLang();
  const [filters, setFilters] = useState<Filters>(initial.filters);
  const [listings, setListings] = useState<Listing[]>([]);
  const [topDeals, setTopDeals] = useState<Listing[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Listing | null>(null);
  const [nlLoading, setNlLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"filters" | "deals">(initial.tab);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(true);
  const initialSelectedRef = useRef<number | null>(initial.selectedId);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const where = filtersToSQL(filters);
    (async () => {
      try {
        const [countRow] = await query<{ n: number | bigint }>(
          `SELECT COUNT(*) AS n FROM listings WHERE ${where}`,
        );
        const rows = await query<Listing>(
          `SELECT id, latitude, longitude, price, predicted_price, predicted_low, predicted_high,
                  price_delta_pct, subType, netHabitableSurface, bedroomCount, epcScore, postalCode,
                  shap_top, url, days_on_market, similar_ids, priceable
           FROM listings
           WHERE ${where} AND latitude IS NOT NULL AND longitude IS NOT NULL`,
        );
        const dealsRaw = await query<Listing>(
          `SELECT id, latitude, longitude, price, predicted_price, predicted_low, predicted_high,
                  price_delta_pct, subType, netHabitableSurface, bedroomCount, epcScore, postalCode,
                  shap_top, url, days_on_market, similar_ids, priceable
           FROM listings
           WHERE ${where}
             AND latitude IS NOT NULL AND longitude IS NOT NULL
             AND priceable = TRUE
             AND price_delta_pct IS NOT NULL
             AND price >= predicted_low * 0.9
           ORDER BY price_delta_pct ASC
           LIMIT 20`,
        );
        if (cancelled) return;
        setTotal(Number(countRow.n));
        setTopDeals(dealsRaw.map(normalizeListing));
        setListings(rows.map(normalizeListing));
        setError(null);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [filters]);

  useEffect(() => {
    replaceUrl({ filters, tab: sidebarTab, selectedId: selected?.id ?? null, lang });
  }, [filters, sidebarTab, selected?.id, lang]);

  // Drop the selection if filters excluded it.
  useEffect(() => {
    if (!selected) return;
    if (listings.length === 0) return;
    if (!listings.some((l) => l.id === selected.id)) setSelected(null);
  }, [listings, selected]);

  // Restore the deep-linked listing once data is loaded.
  useEffect(() => {
    const id = initialSelectedRef.current;
    if (id == null) return;
    initialSelectedRef.current = null;
    (async () => {
      try {
        const rows = await query<Listing>(
          `SELECT id, latitude, longitude, price, predicted_price, predicted_low, predicted_high,
                  price_delta_pct, subType, netHabitableSurface, bedroomCount, epcScore, postalCode,
                  shap_top, url, days_on_market, similar_ids, priceable
           FROM listings WHERE id = ${id} LIMIT 1`,
        );
        if (rows.length > 0) setSelected(normalizeListing(rows[0]));
      } catch { /* listing may be gone */ }
    })();
  }, []);

  const handleNL = async (text: string) => {
    setNlLoading(true);
    try {
      const f = await nlSearch(text, lang);
      setFilters(f);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setNlLoading(false);
    }
  };

  return (
    <div className="app" data-sidebar-open={sidebarOpen ? "1" : "0"}>
      {welcomeOpen && <WelcomeModal onClose={() => setWelcomeOpen(false)} />}
      <button
        type="button"
        className="mobile-toggle"
        aria-label={t.app.toggleFilters}
        onClick={() => setSidebarOpen((o) => !o)}
      >
        ☰
      </button>
      <div className="mobile-scrim" onClick={() => setSidebarOpen(false)} />
      <Sidebar
        filters={filters}
        onChange={setFilters}
        resultCount={total}
        onNLSearch={handleNL}
        nlLoading={nlLoading}
        tab={sidebarTab}
        onTabChange={setSidebarTab}
        topDeals={topDeals}
        onSelectListing={setSelected}
      />
      <main className="map-wrap">
        {loading && <div className="loading">{t.app.loading}</div>}
        {error && <div className="error">{error}</div>}
        <MapView listings={listings} onSelect={setSelected} selected={selected} />
        {selected && <DetailCard listing={selected} onClose={() => setSelected(null)} onSelect={setSelected} />}
      </main>
    </div>
  );
}
