import { useEffect, useState } from "react";
import type { Listing } from "./MapView";
import { query } from "../lib/duckdb";
import { useLang } from "../i18n/context";
import type { Locale } from "../i18n/types";

// shap_eur is optional: older parquet files only carry log-space `shap`.
type Driver = {
  feature: string;
  shap: number;
  shap_eur?: number;
  value: number | string | null;
};

// Stable across locales so the `[data-v="..."]` CSS still matches.
type VerdictKey = "under" | "over" | "fair" | "none";

export function DetailCard({ listing, onClose, onSelect }: {
  listing: Listing;
  onClose: () => void;
  onSelect: (l: Listing) => void;
}) {
  const { t } = useLang();
  if (!listing.priceable) return <NonPriceableDetail listing={listing} onClose={onClose} />;

  let drivers: Driver[] = [];
  try { drivers = JSON.parse(listing.shap_top) as Driver[]; } catch { /* */ }
  const price = listing.price!;
  const pred = listing.predicted_price!;
  const lo = listing.predicted_low!;
  const hi = listing.predicted_high!;
  const pct = (listing.price_delta_pct ?? 0) * 100;
  const delta = price - pred;
  const verdictKey: VerdictKey = price < lo ? "under" : price > hi ? "over" : "fair";
  const verdictLabel = t.detail.verdicts[verdictKey];
  const bandWidthPct = Math.round(((hi - lo) / pred) * 50);

  return (
    <div className="detail">
      <button className="close" onClick={onClose}>×</button>
      <div className="verdict" data-v={verdictKey}>{verdictLabel}</div>
      <div className="prices">
        <div><div className="k">{t.detail.listed}</div><div className="v">€{price.toLocaleString()}</div></div>
        <div><div className="k">{t.detail.fairValue}</div><div className="v">€{pred.toLocaleString()}</div></div>
        <div><div className="k">{t.detail.delta}</div>
          <div className={"v " + (delta < 0 ? "neg" : "pos")}>
            {delta < 0 ? "−" : "+"}€{Math.abs(delta).toLocaleString()} ({pct.toFixed(1)}%)
          </div>
        </div>
      </div>

      <FairBand lo={lo} hi={hi} mid={pred} price={price} bandWidthPct={bandWidthPct} />

      <div className="facts">
        <span>{listing.subType.replace(/_/g, " ").toLowerCase()}</span>
        <span>· {listing.netHabitableSurface} m²</span>
        <span>· {listing.bedroomCount} {t.detail.facts.bed}</span>
        <span>· EPC {listing.epcScore}</span>
        <span>· {listing.postalCode}</span>
      </div>

      {listing.days_on_market != null && (
        <div className={"dom " + (listing.days_on_market > 60 ? "dom-stale" : "")}>
          {dayOnMarket(listing.days_on_market, t)}
          {listing.days_on_market > 60 && t.detail.domStaleSuffix}
        </div>
      )}

      {listing.url && (
        <a className="listing-link" href={listing.url} target="_blank" rel="noreferrer noopener">
          {t.detail.viewOnSource}
        </a>
      )}

      <PriceDrivers drivers={drivers} />


      <SimilarListings listing={listing} onSelect={onSelect} />
    </div>
  );
}

function dayOnMarket(days: number, t: Locale): string {
  if (days === 0) return t.detail.domToday;
  if (days === 1) return t.detail.domOne;
  return t.detail.domMany(days);
}

function PriceDrivers({ drivers }: { drivers: Driver[] }) {
  const { t } = useLang();
  const [expanded, setExpanded] = useState(false);
  if (drivers.length === 0) return null;

  const ranked = [...drivers].sort((a, b) =>
    Math.abs(b.shap_eur ?? b.shap) - Math.abs(a.shap_eur ?? a.shap)
  );
  const visible = expanded ? ranked : ranked.slice(0, 3);
  const maxAbs = Math.max(1, ...ranked.map((d) => Math.abs(d.shap_eur ?? 0)));

  return (
    <>
      <h3>{t.detail.drivers.title}</h3>
      <p className="drivers-narrative">{narrative(ranked, t)}</p>
      <ul className="drivers">
        {visible.map((d, i) => {
          const up = (d.shap_eur ?? d.shap) > 0;
          const eur = d.shap_eur;
          const widthPct = eur != null ? (Math.abs(eur) / maxAbs) * 100 : 0;
          return (
            <li key={i} className="driver-row">
              <div className="driver-head">
                <span className={"arrow " + (up ? "up" : "down")}>{up ? "↑" : "↓"}</span>
                <span className="label">{t.features[d.feature] ?? d.feature}</span>
                <span className="value">{formatValue(d.feature, d.value, t)}</span>
                {eur != null && (
                  <span className={"driver-eur " + (up ? "pos" : "neg")}>
                    {up ? "+" : "−"}€{Math.abs(eur).toLocaleString()}
                  </span>
                )}
              </div>
              {eur != null && (
                <div className="driver-bar">
                  <div className="driver-bar-axis" />
                  <div
                    className={"driver-bar-fill " + (up ? "pos" : "neg")}
                    style={{
                      width: `${widthPct / 2}%`,
                      [up ? "left" : "right"]: "50%",
                    }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {ranked.length > 3 && (
        <button
          type="button"
          className="drivers-toggle"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? t.detail.drivers.showFewer : t.detail.drivers.showMore(ranked.length - 3)}
        </button>
      )}
      <p className="note">{t.detail.drivers.note}</p>
    </>
  );
}

// Picks the strongest +/- drivers and hands phrasing off to per-locale templates.
function narrative(ranked: Driver[], t: Locale): string {
  const pos = ranked.filter((d) => (d.shap_eur ?? d.shap) > 0).slice(0, 2);
  const neg = ranked.filter((d) => (d.shap_eur ?? d.shap) < 0).slice(0, 2);
  const phrase = (d: Driver) => {
    const label = (t.features[d.feature] ?? d.feature).toLowerCase();
    const v = formatValue(d.feature, d.value, t);
    return v && v !== "—" ? `${label} (${v})` : label;
  };
  const args = { pos: pos.map(phrase), neg: neg.map(phrase) };
  if (pos.length > 0 && neg.length > 0) return t.detail.drivers.narrativeBoth(args);
  if (pos.length > 0) return t.detail.drivers.narrativePos(args);
  if (neg.length > 0) return t.detail.drivers.narrativeNeg(args);
  return t.detail.drivers.narrativeFlat;
}

function SimilarListings({ listing, onSelect }: { listing: Listing; onSelect: (l: Listing) => void }) {
  const { t } = useLang();
  const [comps, setComps] = useState<Listing[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    let ids: number[] = [];
    try { ids = JSON.parse(listing.similar_ids || "[]") as number[]; } catch { /* */ }
    if (ids.length === 0) { setComps([]); return; }
    const inList = ids.map((id) => String(id)).join(",");
    (async () => {
      const rows = await query<Listing>(
        `SELECT id, latitude, longitude, price, predicted_price, predicted_low, predicted_high,
                price_delta_pct, subType, netHabitableSurface, bedroomCount, epcScore, postalCode,
                shap_top, url, days_on_market, similar_ids, priceable
         FROM listings WHERE id IN (${inList})`,
      );
      if (cancelled) return;
      // Preserve the precomputed similarity ranking.
      const byId = new Map(rows.map((r) => [Number(r.id), r]));
      const ordered = ids.map((id) => byId.get(id)).filter(Boolean).map((r) => ({
        ...r!,
        id: Number(r!.id),
        price: Number(r!.price),
        predicted_price: Number(r!.predicted_price),
        predicted_low: Number(r!.predicted_low),
        predicted_high: Number(r!.predicted_high),
        price_delta_pct: Number(r!.price_delta_pct),
        netHabitableSurface: Number(r!.netHabitableSurface),
        bedroomCount: Number(r!.bedroomCount),
        postalCode: Number(r!.postalCode),
        days_on_market: r!.days_on_market == null ? null : Number(r!.days_on_market),
        priceable: !!r!.priceable,
      }));
      setComps(ordered);
    })();
    return () => { cancelled = true; };
  }, [listing.id, listing.similar_ids]);

  if (comps === null) return <div className="comps-loading">{t.detail.comps.loading}</div>;
  if (comps.length === 0) return null;

  return (
    <div className="comps">
      <h3>{t.detail.comps.title}</h3>
      <ul className="comps-list">
        {comps.map((c) => {
          const km = haversineKm(listing.latitude, listing.longitude, c.latitude, c.longitude);
          // Comps are priceable; ?? only for TS.
          const cPct = (c.price_delta_pct ?? 0) * 100;
          const cPrice = c.price ?? 0;
          const cLow = c.predicted_low ?? 0;
          const cHigh = c.predicted_high ?? 0;
          const cVerdict = cPrice < cLow ? "under" : cPrice > cHigh ? "over" : "fair";
          return (
            <li key={c.id}>
              <button type="button" className="comp" onClick={() => onSelect(c)}>
                <div className="comp-top">
                  <span className="comp-price">€{cPrice.toLocaleString()}</span>
                  <span className={"comp-delta " + cVerdict}>
                    {cPct >= 0 ? "+" : ""}{cPct.toFixed(1)}%
                  </span>
                </div>
                <div className="comp-facts">
                  {c.netHabitableSurface} m² · {c.bedroomCount} {t.detail.facts.bed} · EPC {c.epcScore} · {c.postalCode} · {km.toFixed(0)} km
                </div>
              </button>
              {c.url && (
                <a className="comp-link" href={c.url} target="_blank" rel="noreferrer noopener">↗</a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function FairBand({ lo, hi, mid, price, bandWidthPct }:
  { lo: number; hi: number; mid: number; price: number; bandWidthPct: number }) {
  const { t } = useLang();
  // Axis extends 25% beyond the band so a price outside still renders inside the bar.
  const span = hi - lo;
  const axisLo = lo - span * 0.25;
  const axisHi = hi + span * 0.25;
  const clamp = (v: number) => Math.max(0, Math.min(1, (v - axisLo) / (axisHi - axisLo)));
  const loPct = clamp(lo) * 100;
  const hiPct = clamp(hi) * 100;
  const midPct = clamp(mid) * 100;
  const listedPct = clamp(price) * 100;
  const inside = price >= lo && price <= hi;
  return (
    <div className="band">
      <div className="band-head">
        <span>{t.detail.band.title}</span>
        <span className="band-range">€{lo.toLocaleString()} – €{hi.toLocaleString()}</span>
      </div>
      <div className="band-bar">
        <div className="band-fill" style={{ left: `${loPct}%`, width: `${hiPct - loPct}%` }} />
        <div className="band-mid" style={{ left: `${midPct}%` }} title={t.detail.fairValue} />
        <div className={"band-listed " + (inside ? "" : "outside")}
             style={{ left: `${listedPct}%` }}
             title={`${t.detail.listed}: €${price.toLocaleString()}`} />
      </div>
      <div className="band-note">{t.detail.band.note(bandWidthPct)}</div>
    </div>
  );
}

function NonPriceableDetail({ listing, onClose }: { listing: Listing; onClose: () => void }) {
  const { t } = useLang();
  const np = t.detail.nonPriceable;
  const priceLabel = listing.price != null ? `€${listing.price.toLocaleString()}` : np.priceOnRequest;
  return (
    <div className="detail">
      <button className="close" onClick={onClose}>×</button>
      <div className="verdict" data-v="none">{np.verdict}</div>
      <p className="note" style={{ marginTop: 0 }}>{np.explanation}</p>
      <div className="prices" style={{ gridTemplateColumns: "1fr" }}>
        <div><div className="k">{np.listedPrice}</div><div className="v">{priceLabel}</div></div>
      </div>
      <div className="facts">
        <span>{listing.subType.replace(/_/g, " ").toLowerCase()}</span>
        {listing.netHabitableSurface != null && <span>· {listing.netHabitableSurface} m²</span>}
        {listing.bedroomCount != null && <span>· {listing.bedroomCount} {t.detail.facts.bed}</span>}
        {listing.postalCode != null && <span>· {listing.postalCode}</span>}
      </div>
      {listing.days_on_market != null && (
        <div className={"dom " + (listing.days_on_market > 60 ? "dom-stale" : "")}>
          {dayOnMarket(listing.days_on_market, t)}
        </div>
      )}
      {listing.url && (
        <a className="listing-link" href={listing.url} target="_blank" rel="noreferrer noopener">
          {t.detail.viewOnSource}
        </a>
      )}
    </div>
  );
}

function formatValue(feat: string, v: number | string | null, t: Locale): string {
  if (v == null) return "—";
  if (feat.startsWith("has") || feat.startsWith("is")) return v ? t.detail.formatYes : t.detail.formatNo;
  if (typeof v === "number" && !Number.isInteger(v)) return v.toFixed(3);
  return String(v);
}
