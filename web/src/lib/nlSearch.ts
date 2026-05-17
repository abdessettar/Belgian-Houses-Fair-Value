import type { Filters } from "./filters";
import type { Lang } from "../i18n/types";

export async function nlSearch(text: string, lang: Lang = "en"): Promise<Filters> {
  const res = await fetch("/api/nl-search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, lang }),
  });
  if (!res.ok) throw new Error(`nl-search failed: ${res.status}`);
  return (await res.json()) as Filters;
}
