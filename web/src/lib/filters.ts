export type Filters = {
  priceMin?: number;
  priceMax?: number;
  surfaceMin?: number;
  surfaceMax?: number;
  bedroomsMin?: number;
  bedroomsMax?: number;
  epcMax?: string; // "A" best, "G" worst
  hasGarden?: boolean;
  hasTerrace?: boolean;
  hasSwimmingPool?: boolean;
  subType?: string;
  postalCodePrefix?: string;
  freeText?: string;
  daysOnMarketMin?: number;
  daysOnMarketMax?: number;
};

const EPC_ORDER = ["A++", "A+", "A", "B", "C", "D", "E", "F", "G"];

export function filtersToSQL(f: Filters): string {
  const clauses: string[] = ["1=1"];
  if (f.priceMin != null) clauses.push(`price >= ${f.priceMin}`);
  if (f.priceMax != null) clauses.push(`price <= ${f.priceMax}`);
  if (f.surfaceMin != null) clauses.push(`netHabitableSurface >= ${f.surfaceMin}`);
  if (f.surfaceMax != null) clauses.push(`netHabitableSurface <= ${f.surfaceMax}`);
  if (f.bedroomsMin != null) clauses.push(`bedroomCount >= ${f.bedroomsMin}`);
  if (f.bedroomsMax != null) clauses.push(`bedroomCount <= ${f.bedroomsMax}`);
  if (f.hasGarden) clauses.push(`hasGarden = 1`);
  if (f.hasTerrace) clauses.push(`hasTerrace = 1`);
  if (f.hasSwimmingPool) clauses.push(`hasSwimmingPool = 1`);
  if (f.subType) clauses.push(`subType = '${f.subType.replace(/'/g, "''")}'`);
  if (f.daysOnMarketMin != null) clauses.push(`days_on_market >= ${f.daysOnMarketMin}`);
  if (f.daysOnMarketMax != null) clauses.push(`days_on_market <= ${f.daysOnMarketMax}`);
  if (f.postalCodePrefix) {
    const safe = f.postalCodePrefix.replace(/[^0-9]/g, "");
    if (safe) clauses.push(`CAST(postalCode AS VARCHAR) LIKE '${safe}%'`);
  }
  if (f.epcMax) {
    const idx = EPC_ORDER.indexOf(f.epcMax);
    if (idx >= 0) {
      const allowed = EPC_ORDER.slice(0, idx + 1).map((s) => `'${s}'`).join(",");
      clauses.push(`epcScore IN (${allowed})`);
    }
  }
  return clauses.join(" AND ");
}
