// POST /api/nl-search → Filters JSON, via DeepSeek (json mode).
// Guards: 500-char body cap, origin allow-list, generic 502 on upstream errors.

interface Env {
  DEEPSEEK_API_KEY: string;
  ALLOWED_ORIGINS?: string;
}

const SYSTEM = `You translate a short free-form description of a Belgian house-for-sale search into a strict JSON filter object.

Output ONLY valid JSON matching this TypeScript type:
{
  priceMin?: number, priceMax?: number,
  surfaceMin?: number, surfaceMax?: number,
  bedroomsMin?: number, bedroomsMax?: number,
  epcMax?: "A"|"B"|"C"|"D"|"E"|"F"|"G",   // the worst acceptable EPC score
  hasGarden?: boolean, hasTerrace?: boolean, hasSwimmingPool?: boolean,
  subType?: string,
  postalCodePrefix?: string                 // 1-4 digit prefix; map city names to Belgian postcodes (Brussels=10, Ghent=9000, Antwerp=2000, Liège=4000, Bruges=8000, Leuven=3000, Namur=5000, Mons=7000, Charleroi=6000)
}

Omit fields that are not specified. Do not invent constraints. Prices are in euros; if the user says "400k" use 400000. "At least EPC C" means the worst allowed is C, so epcMax="C".`;

const MAX_TEXT_LEN = 500;

const DEFAULT_ALLOWED = [
  "https://belgian-house-fair-value.pages.dev",
];

function isOriginAllowed(req: Request, env: Env): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // same-origin / server-to-server
  const allow = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(",").map((s) => s.trim())
    : DEFAULT_ALLOWED;
  if (allow.includes(origin)) return true;
  try {
    const u = new URL(origin);
    if (u.hostname.endsWith(".belgian-house-fair-value.pages.dev")) return true;
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;
  } catch { /* deny */ }
  return false;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isOriginAllowed(request, env)) {
    return new Response("forbidden origin", { status: 403 });
  }
  let payload: { text?: unknown; lang?: unknown };
  try {
    payload = (await request.json()) as { text?: unknown; lang?: unknown };
  } catch {
    return new Response("invalid json body", { status: 400 });
  }
  const text = payload.text;
  if (typeof text !== "string" || text.length === 0) {
    return new Response("missing text", { status: 400 });
  }
  if (text.length > MAX_TEXT_LEN) {
    return new Response(`text too long (max ${MAX_TEXT_LEN} chars)`, { status: 413 });
  }
  if (!env.DEEPSEEK_API_KEY) {
    return new Response("llm provider not configured", { status: 500 });
  }
  const lang = payload.lang === "fr" || payload.lang === "nl" || payload.lang === "en"
    ? payload.lang : null;
  const langLine = lang === "fr"
    ? " The user is writing in French; parse French freely."
    : lang === "nl"
      ? " The user is writing in Dutch; parse Dutch freely."
      : lang === "en"
        ? " The user is writing in English."
        : " The user may write in English, French, or Dutch.";

  let resp: Response;
  try {
    resp = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: 0,
        response_format: { type: "json_object" },
        max_tokens: 200,
        messages: [
          { role: "system", content: SYSTEM + langLine },
          { role: "user", content: text },
        ],
      }),
    });
  } catch {
    return new Response("upstream unreachable", { status: 502 });
  }

  if (!resp.ok) {
    return new Response("upstream error", { status: 502 });
  }
  const body = (await resp.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = body.choices?.[0]?.message?.content ?? "{}";
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { parsed = {}; }

  return new Response(JSON.stringify(parsed), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
};
