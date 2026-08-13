const ALLOWED = new Set(["quote", "price", "time_series"]);
const TTL = { quote: 12000, price: 12000, time_series: 300000 };
const cache = new Map();

const MAX_PER_MIN = 7;
const MIN_GAP_MS = 60000 / MAX_PER_MIN;
let lastCallAt = 0;
let chain = Promise.resolve();

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

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

  const run = chain.then(async () => {
    const wait = Math.max(0, lastCallAt + MIN_GAP_MS - Date.now());
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
    const r = await fetch(buildUrl(path, params, key));
    const data = await r.json();
    cache.set(ck, { t: Date.now(), data });
    return data;
  });
  chain = run.catch(() => {});

  try {
    const data = await run;
    return { code: 200, body: data, cached: false };
  } catch (e) {
    return { code: 502, body: { error: String(e) } };
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  const { path = "quote", ...params } = req.query;
  const out = await fetchTD(path, params);
  res.setHeader("x-cache", out.cached ? "HIT" : "MISS");
  return res.status(out.code).json(out.body);
}
