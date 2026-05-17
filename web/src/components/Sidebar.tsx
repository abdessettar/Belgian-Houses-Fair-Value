import { useState } from "react";
import type { Filters } from "../lib/filters";
import type { Listing } from "./MapView";
import { AboutModel } from "./AboutModel";
import { ThemeToggle } from "./ThemeToggle";
import { LanguageToggle } from "./LanguageToggle";
import { useLang } from "../i18n/context";

type Tab = "filters" | "deals";

type Props = {
  filters: Filters;
  onChange: (f: Filters) => void;
  resultCount: number;
  onNLSearch: (text: string) => Promise<void>;
  nlLoading: boolean;
  tab: Tab;
  onTabChange: (t: Tab) => void;
  topDeals: Listing[];
  onSelectListing: (l: Listing) => void;
};

const EPC_CHOICES = ["A", "B", "C", "D", "E", "F", "G"];

export function Sidebar({
  filters, onChange, resultCount, onNLSearch, nlLoading,
  tab, onTabChange, topDeals, onSelectListing,
}: Props) {
  const { t } = useLang();
  const [nl, setNl] = useState("");
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    onChange({ ...filters, [k]: v });

  return (
    <aside className="sidebar">
      <div className="sidebar-toolbar">
        <ThemeToggle />
        <LanguageToggle />
      </div>
      <h1>{t.sidebar.title}</h1>
      <p className="subtle">{t.sidebar.subtitle}</p>
      <AboutModel />

      <div className="tabs" role="tablist">
        <button type="button" role="tab"
          className={"tab " + (tab === "filters" ? "active" : "")}
          onClick={() => onTabChange("filters")}>
          {t.sidebar.tabs.filters}
        </button>
        <button type="button" role="tab"
          className={"tab " + (tab === "deals" ? "active" : "")}
          onClick={() => onTabChange("deals")}>
          {t.sidebar.tabs.deals}
        </button>
      </div>

      {tab === "deals" ? (
        <DealsPanel deals={topDeals} onSelect={onSelectListing} totalFiltered={resultCount} />
      ) : <>
      <form
        className="nl-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (nl.trim()) void onNLSearch(nl.trim());
        }}
      >
        <label>{t.sidebar.nl.label}</label>
        <textarea
          rows={2}
          placeholder={t.sidebar.nl.placeholder}
          value={nl}
          onChange={(e) => setNl(e.target.value)}
        />
        <button type="submit" disabled={nlLoading}>
          {nlLoading ? t.sidebar.nl.submitting : t.sidebar.nl.submit}
        </button>
      </form>

      <div className="filters">
        <Range label={t.sidebar.filters.price} step={10000}
          minLabel={t.sidebar.filters.min} maxLabel={t.sidebar.filters.max}
          min={filters.priceMin} max={filters.priceMax}
          onMin={(v) => set("priceMin", v)} onMax={(v) => set("priceMax", v)} />
        <Range label={t.sidebar.filters.surface} step={10}
          minLabel={t.sidebar.filters.min} maxLabel={t.sidebar.filters.max}
          min={filters.surfaceMin} max={filters.surfaceMax}
          onMin={(v) => set("surfaceMin", v)} onMax={(v) => set("surfaceMax", v)} />
        <Range label={t.sidebar.filters.bedrooms} step={1}
          minLabel={t.sidebar.filters.min} maxLabel={t.sidebar.filters.max}
          min={filters.bedroomsMin} max={filters.bedroomsMax}
          onMin={(v) => set("bedroomsMin", v)} onMax={(v) => set("bedroomsMax", v)} />
        <div className="range">
          <label>{t.sidebar.filters.daysOnMarket}</label>
          <div className="range-row">
            <input type="number" step={1} placeholder={t.sidebar.filters.min}
              value={filters.daysOnMarketMin ?? ""}
              onChange={(e) => set("daysOnMarketMin", e.target.value ? Number(e.target.value) : undefined)} />
            <input type="number" step={1} placeholder={t.sidebar.filters.max}
              value={filters.daysOnMarketMax ?? ""}
              onChange={(e) => set("daysOnMarketMax", e.target.value ? Number(e.target.value) : undefined)} />
          </div>
          <div className="chips-row">
            <button type="button"
              className={"chip-btn" + (filters.daysOnMarketMin === 60 ? " active" : "")}
              onClick={() => set("daysOnMarketMin",
                filters.daysOnMarketMin === 60 ? undefined : 60)}>
              {t.sidebar.filters.stale}
            </button>
          </div>
        </div>

        <label>{t.sidebar.filters.postalCode}</label>
        <input
          type="text"
          inputMode="numeric"
          value={filters.postalCodePrefix ?? ""}
          placeholder={t.sidebar.filters.postalCodePlaceholder}
          onChange={(e) => set("postalCodePrefix", e.target.value || undefined)}
        />

        <label>{t.sidebar.filters.epcAtLeast}</label>
        <select
          value={filters.epcMax ?? ""}
          onChange={(e) => set("epcMax", e.target.value || undefined)}
        >
          <option value="">{t.sidebar.filters.any}</option>
          {EPC_CHOICES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <div className="checks">
          <label><input type="checkbox" checked={!!filters.hasGarden}
            onChange={(e) => set("hasGarden", e.target.checked || undefined)} /> {t.sidebar.filters.garden}</label>
          <label><input type="checkbox" checked={!!filters.hasTerrace}
            onChange={(e) => set("hasTerrace", e.target.checked || undefined)} /> {t.sidebar.filters.terrace}</label>
          <label><input type="checkbox" checked={!!filters.hasSwimmingPool}
            onChange={(e) => set("hasSwimmingPool", e.target.checked || undefined)} /> {t.sidebar.filters.pool}</label>
        </div>

        <button type="button" className="reset" onClick={() => onChange({})}>
          {t.sidebar.filters.reset}
        </button>
      </div>

      <div className="count">{t.sidebar.count(resultCount)}</div>
      <div className="legend">
        <div className="legend-title">{t.sidebar.legend.title}</div>
        <ul>
          <li><span className="chip green" /> {t.sidebar.legend.stronglyUnder} <em>(&lt; −40%)</em></li>
          <li><span className="chip teal"  /> {t.sidebar.legend.under} <em>(−40% to −20%)</em></li>
          <li><span className="chip blue"  /> {t.sidebar.legend.fair} <em>(±20%)</em></li>
          <li><span className="chip orange"/> {t.sidebar.legend.over} <em>(+20% to +40%)</em></li>
          <li><span className="chip red"   /> {t.sidebar.legend.stronglyOver} <em>(&gt; +40%)</em></li>
          <li><span className="chip black" /> {t.sidebar.legend.notPriceable} <em>({t.sidebar.legend.notPriceableNote})</em></li>
        </ul>
      </div>
      </>}
    </aside>
  );
}

function DealsPanel({ deals, onSelect, totalFiltered }: {
  deals: Listing[]; onSelect: (l: Listing) => void; totalFiltered: number;
}) {
  const { t } = useLang();
  if (deals.length === 0) {
    return <div className="deals-empty">{t.sidebar.deals.empty}</div>;
  }
  return (
    <div className="deals">
      <p className="subtle">{t.sidebar.deals.header(deals.length, totalFiltered)}</p>
      <ol className="deals-list">
        {deals.map((d, i) => {
          // priceable=TRUE in the SQL guarantees these are non-null; ?? for TS.
          const price = d.price ?? 0;
          const pred = d.predicted_price ?? 0;
          const pct = (d.price_delta_pct ?? 0) * 100;
          const delta = price - pred;
          return (
            <li key={d.id}>
              <button type="button" className="deal" onClick={() => onSelect(d)}>
                <div className="deal-rank">#{i + 1}</div>
                <div className="deal-body">
                  <div className="deal-top">
                    <span className="deal-price">€{price.toLocaleString()}</span>
                    <span className="deal-delta">{pct.toFixed(1)}%</span>
                  </div>
                  <div className="deal-facts">
                    {d.netHabitableSurface} m² · {d.bedroomCount} {t.detail.facts.bed} · EPC {d.epcScore} · {d.postalCode}
                  </div>
                  <div className="deal-savings">
                    {t.sidebar.deals.fair} €{pred.toLocaleString()} &nbsp;·&nbsp;
                    <strong>{t.sidebar.deals.save} €{Math.abs(delta).toLocaleString()}</strong>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Range({ label, step, min, max, onMin, onMax, minLabel, maxLabel }: {
  label: string; step: number;
  min: number | undefined; max: number | undefined;
  onMin: (v: number | undefined) => void; onMax: (v: number | undefined) => void;
  minLabel: string; maxLabel: string;
}) {
  return (
    <div className="range">
      <label>{label}</label>
      <div className="range-row">
        <input type="number" step={step} placeholder={minLabel}
          value={min ?? ""} onChange={(e) => onMin(e.target.value ? Number(e.target.value) : undefined)} />
        <input type="number" step={step} placeholder={maxLabel}
          value={max ?? ""} onChange={(e) => onMax(e.target.value ? Number(e.target.value) : undefined)} />
      </div>
    </div>
  );
}
