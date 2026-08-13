// ============================================================================
// Twelve Data proxy for THESIS
//
// WHY: the browser must never hold your Twelve Data key, and direct browser
// calls are unreliable (CORS). This function holds the key server-side as a
// secret and forwards requests. It also caches responses briefly so repeated
// refreshes don't burn your daily API credits.
//
// ---- Vercel ----
//   1. Put this file at:  api/td.js   (in the same project as the THESIS app)
//   2. Set an env var:    TWELVEDATA_API_KEY = <your key>
//   3. Deploy. The app calls /api/td automatically (same origin, no CORS).
//
// ---- Netlify ----
//   Put it at netlify/functions/td.js and use the Netlify handler at the
//   bottom of this file instead of the default export (both are provided).
// ============================================================================

const ALLOWED = new Set(["quote", "price", "time_series"]);
// Cache TTL per endpoint (ms). Daily time_series changes slowly -> cache longer.
const TTL = { quote: 12000, price: 12000, time_series: 300000 };
const cache = new Map(); // survives while the serverless instance stays warm

function buildUrl(path, params, key) {
  const qs = new URLSearchParams({ ...params, apikey: key }).toString();
  return `https://api.twelvedata.com/${path}?${qs}`;
}

async function fetchTD(path, params) {
  const key = process.env.TWELVEDATA_API_KEY;
  if (!key) return { code: 500, body: { error: "TWELVEDATA_API_KEY is not set on the server" } };
  if (!ALLOWED.has(path)) return { code: 400, body: { error: "path not allowed" } };

  const ck = `${path}?${new URLSearchParams(params).toString()}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.t < (TTL[path] || 15000)) {
    return { code: 200, body: hit.data, cached: true };
  }
  try {
    const r = await fetch(buildUrl(path, params, key));
    const data = await r.json();
    cache.set(ck, { t: Date.now(), data });
    return { code: 200, body: data, cached: false };
  } catch (e) {
    return { code: 502, body: { error: String(e) } };
  }
}

// -------------------------------- Vercel ----------------------------------
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  const { path = "quote", ...params } = req.query;
  const out = await fetchTD(path, params);
  res.setHeader("x-cache", out.cached ? "HIT" : "MISS");
  return res.status(out.code).json(out.body);
}

// -------------------------------- Netlify ---------------------------------
// Rename to `handler` (and remove the Vercel default export) if deploying on
// Netlify Functions:
export async function netlifyHandler(event) {
  const p = event.queryStringParameters || {};
  const { path = "quote", ...params } = p;
  const out = await fetchTD(path, params);
  return {
    statusCode: out.code,
    headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json", "x-cache": out.cached ? "HIT" : "MISS" },
    body: JSON.stringify(out.body),
  };
}
