import type { Filters } from "./filters";

// URL <-> AppState so every view is deep-linkable.
export type SidebarTab = "filters" | "deals";
export type UrlLang = "en" | "fr" | "nl";

export type AppState = {
  filters: Filters;
  tab: SidebarTab;
  selectedId: number | null;
  lang?: UrlLang | null;
};

const NUMERIC_FIELDS: (keyof Filters)[] = [
  "priceMin", "priceMax",
  "surfaceMin", "surfaceMax",
  "bedroomsMin", "bedroomsMax",
  "daysOnMarketMin", "daysOnMarketMax",
];

const BOOL_FIELDS: (keyof Filters)[] = ["hasGarden", "hasTerrace", "hasSwimmingPool"];
const STRING_FIELDS: (keyof Filters)[] = ["epcMax", "subType", "postalCodePrefix", "freeText"];

export function encodeState(state: AppState): string {
  const p = new URLSearchParams();
  for (const k of NUMERIC_FIELDS) {
    const v = state.filters[k];
    if (typeof v === "number") p.set(k, String(v));
  }
  for (const k of BOOL_FIELDS) {
    if (state.filters[k]) p.set(k, "1");
  }
  for (const k of STRING_FIELDS) {
    const v = state.filters[k];
    if (typeof v === "string" && v.length > 0) p.set(k, v);
  }
  if (state.tab !== "filters") p.set("tab", state.tab);
  if (state.selectedId != null) p.set("id", String(state.selectedId));
  if (state.lang) p.set("lang", state.lang);
  return p.toString();
}

export function decodeState(search: string): AppState {
  const p = new URLSearchParams(search);
  const filters: Filters = {};
  for (const k of NUMERIC_FIELDS) {
    const raw = p.get(k);
    if (raw != null && raw !== "") {
      const n = Number(raw);
      if (Number.isFinite(n)) (filters as Record<string, number>)[k] = n;
    }
  }
  for (const k of BOOL_FIELDS) {
    if (p.get(k) === "1") (filters as Record<string, boolean>)[k] = true;
  }
  for (const k of STRING_FIELDS) {
    const raw = p.get(k);
    if (raw != null && raw !== "") (filters as Record<string, string>)[k] = raw;
  }
  const tab = (p.get("tab") === "deals" ? "deals" : "filters") as SidebarTab;
  const idRaw = p.get("id");
  const selectedId = idRaw != null && /^\d+$/.test(idRaw) ? Number(idRaw) : null;
  const langRaw = p.get("lang");
  const lang: UrlLang | null = langRaw === "en" || langRaw === "fr" || langRaw === "nl" ? langRaw : null;
  return { filters, tab, selectedId, lang };
}

// replaceState (not push) so Back doesn't walk every filter keystroke.
export function replaceUrl(state: AppState) {
  const qs = encodeState(state);
  const url = qs ? `?${qs}` : window.location.pathname;
  window.history.replaceState({}, "", url);
}
