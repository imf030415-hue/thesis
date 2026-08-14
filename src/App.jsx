import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  LineChart, MessageSquare, Brain, RefreshCw, Plus, ChevronRight, ChevronDown,
  AlertTriangle, ShieldCheck, Target, Layers, Activity, Send, Settings2,
  BookOpen, GitBranch, Beaker, Swords, Sparkles, X, Check, TrendingUp, Loader2, Star, Search
} from "lucide-react";

/* ============================================================================
   THESIS — Build your strategy. Test your thinking.
   Single-file React app. Dark premium fintech.

   Data honesty rules baked in:
   - The AI runs on a real model via the built-in Anthropic endpoint.
   - Market data comes ONLY from Twelve Data via the user's own key.
   - Nothing is ever fabricated. Missing data => "אין נתון זמין כרגע".
   ========================================================================== */

const AI_MODEL = "claude-sonnet-5"; // real Anthropic API model; change if docs.claude.com lists a newer one
// Where your Twelve Data proxy lives. "" = same origin (recommended: an /api/td
// serverless function co-located with this app). Set a full URL only if the
// proxy runs on a different domain.
const PROXY_BASE = "";

const C = {
  bg:      "#07080B",
  bg2:     "#0A0C11",
  card:    "#101319",
  card2:   "#12151C",
  line:    "#1D222C",
  lineSoft:"#161A22",
  text:    "#EEF1F6",
  mut:     "#8A93A3",
  mut2:    "#5C6472",
  blue:    "#3D7BFF",
  blueHi:  "#6AA0FF",
  purple:  "#8B5CF6",
  teal:    "#2DD4BF",
  green:   "#3FCF8E",
  red:     "#F0716F",
  amber:   "#E8B84B",
};
const MONO = "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace";

/* ------------------------------- storage ---------------------------------- */
// window.storage (persists across sessions) with in-memory fallback so the app
// never crashes if it is unavailable in a given render context.
const _mem = {};
const store = {
  async get(k) {
    try {
      const r = localStorage.getItem(k);
      if (r != null) return JSON.parse(r);
    } catch (e) { /* fall through */ }
    return k in _mem ? _mem[k] : null;
  },
  async set(k, v) {
    _mem[k] = v;
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* keep in mem */ }
  },
};
const K = {
  key: "thesis:tdkey",
  proxy: "thesis:proxy",
  profile: "thesis:profile",
  strategy: "thesis:strategy",
  versions: "thesis:versions",
  journal: "thesis:journal",
  chat: "thesis:chat",
  paper: "thesis:paper",
  seen: "thesis:seen",
  watch: "thesis:watch",
};

/* --------------------------- Anthropic (the AI) --------------------------- */
async function callClaude(system, messages) {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: AI_MODEL, max_tokens: 1500, system, messages }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "AI error");
  return (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
function parseJSON(text) {
  const clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
  if (s === -1 || e === -1) throw new Error("no json");
  return JSON.parse(clean.slice(s, e + 1));
}

const ANALYST_PERSONA =
  "אתה Theo, אנליסט השקעות AI מתקדם בתוך אפליקציית THESIS. " +
  "אתה אנליטי, ספקן, אובייקטיבי, מדויק, ישיר ומבוסס נתונים. " +
  "אתה לא מסכים אוטומטית עם המשתמש; אם רעיון חלש אתה אומר זאת בפירוש ומסביר למה. " +
  "אם חסרים נתונים אמינים אתה אומר 'אין מספיק נתונים אמינים כדי להגיע למסקנה' במקום להמציא. " +
  "לעולם אל תבטיח תשואה, אל תציג תחזית כעובדה, ואל תסתיר סיכונים. " +
  "כשזה מהותי, הפרד בבירור בין: עובדות (מהנתונים) / ניתוח (מסקנותיך) / הנחות / תרחישים. " +
  "אין לך גישה חיה למחירים כרגע אלא אם המשתמש חיבר ספק נתונים; אם אין — אמור זאת. " +
  "ענה בעברית, בגובה העיניים אך מקצועי.";

/* ------------------------- Twelve Data provider --------------------------- */
// Modular provider layer (rule #5). Swap this class to add another source.
class TwelveData {
  // Talks to YOUR server-side proxy, never to Twelve Data directly — the API
  // key lives on the server as a secret (rule #31). base "" => same-origin /api/td.
  constructor(base = PROXY_BASE) { this.base = base || ""; }
  async _get(path, params) {
    const qs = new URLSearchParams({ path, ...params }).toString();
    const r = await fetch(`${this.base}/api/td?${qs}`);
    let d;
    try { d = await r.json(); } catch (e) { throw new Error("אין מענה תקין מ‑/api/td (" + r.status + ")"); }
    if (d && (d.status === "error" || d.code >= 400 || d.error))
      throw new Error(d.message || d.error || "שגיאת ספק נתונים");
    return d;
  }
  quote(symbol) { return this._get("quote", { symbol }); }
  timeSeries(symbol, interval, outputsize = 300) {
    return this._get("time_series", { symbol, interval, outputsize });
  }
}

const INSTRUMENTS = [
  { g: "מדדים", name: "S&P 500", sym: "SPY", note: "ETF proxy" },
  { g: "מדדים", name: "NASDAQ 100", sym: "QQQ", note: "ETF proxy" },
  { g: "מדדים", name: "Dow Jones", sym: "DIA", note: "ETF proxy" },
  { g: "מדדים", name: "Russell 2000", sym: "IWM", note: "ETF proxy" },
  { g: "ריבית ואג\"ח", name: "אג\"ח ממשל 20Y+", sym: "TLT", note: "ETF proxy" },
  { g: "ריבית ואג\"ח", name: "אג\"ח מצרפי", sym: "AGG", note: "ETF proxy" },
  { g: "סחורות", name: "זהב", sym: "GLD", note: "ETF proxy" },
  { g: "סחורות", name: "נפט", sym: "USO", note: "ETF proxy" },
  { g: "מט\"ח", name: "EUR/USD", sym: "EUR/USD" },
  { g: "מט\"ח", name: "USD/JPY", sym: "USD/JPY" },
  { g: "קריפטו", name: "Bitcoin", sym: "BTC/USD" },
  { g: "קריפטו", name: "Ethereum", sym: "ETH/USD" },
  { g: "סקטורים", name: "טכנולוגיה", sym: "XLK" },
  { g: "סקטורים", name: "פיננסים", sym: "XLF" },
  { g: "סקטורים", name: "אנרגיה", sym: "XLE" },
  { g: "סקטורים", name: "בריאות", sym: "XLV" },
  { g: "מניות", name: "Apple", sym: "AAPL" },
  { g: "מניות", name: "Microsoft", sym: "MSFT" },
  { g: "מניות", name: "Nvidia", sym: "NVDA" },
  { g: "מניות", name: "Tesla", sym: "TSLA" },
  { g: "מניות", name: "Amazon", sym: "AMZN" },
  { g: "מניות", name: "Alphabet", sym: "GOOGL" },
  { g: "מניות", name: "Meta", sym: "META" },
  { g: "מניות", name: "Netflix", sym: "NFLX" },
];
const TIMEFRAMES = [
  { label: "1ד", iv: "1min", n: 60 }, { label: "5ד", iv: "5min", n: 78 },
  { label: "15ד", iv: "15min", n: 100 }, { label: "1ש", iv: "1h", n: 120 },
  { label: "יום", iv: "1day", n: 260 }, { label: "שבוע", iv: "1week", n: 260 },
  { label: "חודש", iv: "1month", n: 240 }, { label: "שנה", iv: "1day", n: 260 },
  { label: "5ש", iv: "1week", n: 260 }, { label: "MAX", iv: "1month", n: 600 },
];

/* ------------------------------- backtest --------------------------------- */
// Real math on real OHLC. No look-ahead: position at bar i uses signal from i-1.
function sma(arr, p, i) {
  if (i < p - 1) return null;
  let s = 0; for (let j = i - p + 1; j <= i; j++) s += arr[j];
  return s / p;
}
function runBacktest(closes, rule) {
  if (!closes || closes.length < 60) return null;
  const n = closes.length;
  const pos = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    let want = 0;
    if (rule.type === "buy_hold") want = 1;
    else if (rule.type === "price_above_sma") {
      const m = sma(closes, rule.period, i - 1);
      want = m != null && closes[i - 1] > m ? 1 : 0;
    } else if (rule.type === "sma_cross") {
      const f = sma(closes, rule.fast, i - 1), s = sma(closes, rule.slow, i - 1);
      want = f != null && s != null && f > s ? 1 : 0;
    }
    pos[i] = want;
  }
  const rets = [], eq = [1]; let trades = 0, wins = 0, losses = 0;
  for (let i = 1; i < n; i++) {
    const r = (closes[i] / closes[i - 1] - 1) * pos[i];
    rets.push(r);
    eq.push(eq[eq.length - 1] * (1 + r));
    if (pos[i] !== pos[i - 1]) trades++;
    if (r > 0) wins++; else if (r < 0) losses++;
  }
  const total = eq[eq.length - 1] - 1;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const varr = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
  const sd = Math.sqrt(varr);
  const ann = rule.periodsPerYear || 252;
  const vol = sd * Math.sqrt(ann);
  const sharpe = sd > 0 ? (mean * ann) / vol : 0;
  let peak = eq[0], mdd = 0;
  for (const v of eq) { if (v > peak) peak = v; mdd = Math.min(mdd, v / peak - 1); }
  return {
    total, vol, sharpe, mdd, trades,
    winRate: wins + losses > 0 ? wins / (wins + losses) : 0,
    bars: rets.length, eq,
  };
}

/* =============================== UI atoms ================================== */
const Card = ({ children, style, ...p }) => (
  <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, ...style }} {...p}>{children}</div>
);
const Pill = ({ children, color = C.mut, bg }) => (
  <span style={{ fontSize: 11, color, background: bg || "transparent", border: `1px solid ${bg ? "transparent" : C.line}`,
    padding: "2px 8px", borderRadius: 999, fontFamily: MONO, whiteSpace: "nowrap" }}>{children}</span>
);
const Btn = ({ children, onClick, kind = "ghost", disabled, style }) => {
  const base = { border: "none", cursor: disabled ? "default" : "pointer", borderRadius: 10,
    padding: "10px 14px", fontSize: 14, fontWeight: 600, transition: "all .15s", opacity: disabled ? 0.5 : 1,
    display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center" };
  const kinds = {
    primary: { background: C.blue, color: "#fff" },
    solid:   { background: C.card2, color: C.text, border: `1px solid ${C.line}` },
    ghost:   { background: "transparent", color: C.mut, border: `1px solid ${C.line}` },
    danger:  { background: "transparent", color: C.red, border: `1px solid ${C.red}44` },
  };
  return <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{ ...base, ...kinds[kind], ...style }}>{children}</button>;
};
const Label = ({ children }) => (
  <div style={{ fontSize: 11, letterSpacing: 1.5, color: C.mut2, fontFamily: MONO, textTransform: "uppercase", marginBottom: 8 }}>{children}</div>
);
// Signature motif: labeled fact/analysis/assumption/scenario blocks.
const Facet = ({ tone, label, children }) => {
  const map = { fact: C.teal, analysis: C.blue, assume: C.amber, scenario: C.purple };
  const c = map[tone] || C.mut;
  return (
    <div style={{ borderInlineStart: `2px solid ${c}`, paddingInlineStart: 12, marginBottom: 10 }}>
      <div style={{ fontSize: 10, letterSpacing: 1.4, color: c, fontFamily: MONO, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{children}</div>
    </div>
  );
};

/* =============================== SPLASH ==================================== */
function Splash({ onStart }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: C.bg, display: "flex",
      flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 28, textAlign: "center" }}>
      <div style={{ position: "absolute", top: "18%", width: 320, height: 320, borderRadius: "50%",
        background: `radial-gradient(circle, ${C.blue}22, transparent 70%)`, filter: "blur(20px)" }} />
      <div style={{ zIndex: 1 }}>
        <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: 8, color: C.blueHi, marginBottom: 18 }}>THESIS</div>
        <h1 style={{ fontSize: 34, fontWeight: 800, color: C.text, margin: 0, lineHeight: 1.2 }}>
          בנה שיטה.<br />בדוק אותה.<br />שפר אותה.
        </h1>
        <p style={{ color: C.mut, fontSize: 15, maxWidth: 340, margin: "22px auto 0", lineHeight: 1.7 }}>
          במקום לחפש את ההשקעה הבאה, בנה תהליך שיודע איך לחפש אותה.
        </p>
        <div style={{ marginTop: 34 }}>
          <Btn kind="primary" onClick={onStart} style={{ padding: "14px 22px", fontSize: 15 }}>
            התחל לבנות את השיטה שלי <ChevronRight size={18} />
          </Btn>
        </div>
        <div style={{ marginTop: 20, fontSize: 12, color: C.mut2, fontFamily: MONO }}>
          משתמש + AI → שיטה → בדיקה → שיפור
        </div>
      </div>
    </div>
  );
}

/* =============================== MARKET =================================== */
/* --- candlestick detail: real OHLC candles, switchable timeframe, tap a candle --- */
function CandleDetail({ ins, provider, onClose }) {
  const [tfIdx, setTfIdx] = useState(4); // default: יום
  const [candles, setCandles] = useState(null);
  const [status, setStatus] = useState("loading");
  const [err, setErr] = useState("");
  const [sel, setSel] = useState(null);

  const load = useCallback(async () => {
    setStatus("loading"); setErr(""); setSel(null);
    const t = TIMEFRAMES[tfIdx];
    try {
      const d = await provider.timeSeries(ins.sym, t.iv, t.n);
      const vals = (d.values || []).map((v) => ({
        t: v.datetime, o: +v.open, h: +v.high, l: +v.low, c: +v.close,
      })).filter((v) => isFinite(v.o) && isFinite(v.c) && isFinite(v.h) && isFinite(v.l)).reverse();
      if (!vals.length) { setStatus("nodata"); return; }
      setCandles(vals); setStatus("ok");
    } catch (e) { setErr(e.message); setStatus("error"); }
  }, [ins.sym, tfIdx, provider]);

  useEffect(() => { load(); }, [load]);

  const W = 360, H = 230, padT = 10, padB = 16, padR = 46;
  let svg = null, head = null;
  if (status === "ok" && candles) {
    const n = candles.length;
    const hi = Math.max(...candles.map((c) => c.h));
    const lo = Math.min(...candles.map((c) => c.l));
    const span = (hi - lo) || 1;
    const plotW = W - padR, plotH = H - padT - padB;
    const y = (p) => padT + ((hi - p) / span) * plotH;
    const x = (i) => (n <= 1 ? 0 : (i / (n - 1)) * plotW);
    const base = candles[0].o;
    const shown = sel != null ? candles[sel] : candles[n - 1];
    const chgFromStart = ((shown.c / base) - 1) * 100;   // change up to the point you're touching
    const up = chgFromStart >= 0;
    const lineCol = up ? C.green : C.red;

    // smooth path (Catmull-Rom -> cubic bezier)
    const pts = candles.map((c, i) => [x(i), y(c.c)]);
    let dLine = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      dLine += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
    }
    const dArea = `${dLine} L ${pts[n - 1][0]} ${padT + plotH} L ${pts[0][0]} ${padT + plotH} Z`;

    head = (
      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontSize: 24, fontFamily: MONO, color: C.text }}>
            {shown.c.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
          <span style={{ fontSize: 14, fontFamily: MONO, color: up ? C.green : C.red }}>
            {up ? "+" : ""}{chgFromStart.toFixed(2)}%
          </span>
        </div>
        <div style={{ fontSize: 11, color: C.mut2, fontFamily: MONO, marginTop: 4 }}>
          {sel != null ? shown.t : "מתחילת התקופה עד עכשיו · נגע בגרף לכל נקודה"}
        </div>
      </div>
    );

    const selX = sel != null ? x(sel) : null;
    const selY = sel != null ? y(shown.c) : null;

    svg = (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", touchAction: "none" }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const rx = ((e.clientX - rect.left) / rect.width) * W;
          setSel(Math.max(0, Math.min(n - 1, Math.round((rx / plotW) * (n - 1)))));
        }}
        onTouchMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const rx = ((e.touches[0].clientX - rect.left) / rect.width) * W;
          setSel(Math.max(0, Math.min(n - 1, Math.round((rx / plotW) * (n - 1)))));
        }}
        onMouseLeave={() => setSel(null)}>
        <defs>
          <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineCol} stopOpacity="0.22" />
            <stop offset="100%" stopColor={lineCol} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((f, i) => {
          const p = hi - f * span, yy = padT + f * plotH;
          return (
            <g key={i}>
              <line x1={0} y1={yy} x2={plotW} y2={yy} stroke={C.lineSoft} strokeWidth="0.5" />
              <text x={plotW + 4} y={yy + 3} fill={C.mut2} fontSize="8" fontFamily={MONO}>
                {p.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </text>
            </g>
          );
        })}
        <path d={dArea} fill="url(#grad)" />
        <path key={tfIdx} d={dLine} pathLength="1" fill="none" stroke={lineCol} strokeWidth="1.6"
          strokeLinejoin="round" strokeLinecap="round"
          style={{ strokeDasharray: 1, animation: "drawLine .9s ease forwards" }} />
        {sel != null && (
          <g>
            <line x1={selX} y1={padT} x2={selX} y2={padT + plotH} stroke={C.blueHi} strokeWidth="0.7" strokeDasharray="3 3" />
            <circle cx={selX} cy={selY} r="4" fill={C.bg} stroke={C.blueHi} strokeWidth="1.6" />
          </g>
        )}
      </svg>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: C.bg, zIndex: 60, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.lineSoft}`, display: "flex",
        alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{ins.name}</div>
          <div style={{ fontSize: 11, color: C.mut2, fontFamily: MONO }}>{ins.sym} · Twelve Data</div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: `1px solid ${C.line}`, borderRadius: 8,
          color: C.mut, cursor: "pointer", padding: 6 }}><X size={18} /></button>
      </div>

      <div style={{ padding: "16px", flex: 1, overflowY: "auto" }}>
        <div style={{ minHeight: 60 }}>{head}</div>

        <div style={{ marginTop: 14, background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: "12px 8px" }}>
          {status === "loading" && <div style={{ color: C.mut2, fontSize: 13, fontFamily: MONO, textAlign: "center", padding: 40 }}>טוען גרף…</div>}
          {status === "ok" && svg}
          {status === "nodata" && <div style={{ color: C.mut2, fontSize: 13, textAlign: "center", padding: 40 }}>אין נתון זמין כרגע לטווח הזה.</div>}
          {status === "error" && <div style={{ color: C.amber, fontSize: 12.5, textAlign: "center", padding: 30, lineHeight: 1.6 }}>שגיאה: {err}</div>}
        </div>

        <div style={{ display: "flex", gap: 6, overflowX: "auto", marginTop: 14 }}>
          {TIMEFRAMES.map((t, i) => (
            <button key={t.label} onClick={() => setTfIdx(i)} style={{
              flex: "0 0 auto", padding: "8px 14px", borderRadius: 8, fontFamily: MONO, fontSize: 13, cursor: "pointer",
              background: tfIdx === i ? C.blue : "transparent", color: tfIdx === i ? "#fff" : C.mut,
              border: `1px solid ${tfIdx === i ? C.blue : C.line}` }}>{t.label}</button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: C.mut2, marginTop: 12, lineHeight: 1.6, fontFamily: MONO }}>
          העבר את האצבע על הגרף כדי לראות מחיר, תאריך ואת השינוי מתחילת התקופה. נתונים אמיתיים מ‑Twelve Data.
        </div>
      </div>
    </div>
  );
}

function Market({ provider, proxyBase, onSetProxy }) {
  const [tf, setTf] = useState(4); // default: יום
  const [rows, setRows] = useState({});
  const [status, setStatus] = useState("idle");
  const [err, setErr] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [draftKey, setDraftKey] = useState(proxyBase || "");
  const [ts, setTs] = useState(null);
  const [detail, setDetail] = useState(null);
  const [flash, setFlash] = useState({});
  const prevRef = useRef({});
  const [watch, setWatch] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => { store.get(K.watch).then((w) => { if (w) setWatch(w); }); }, []);
  const toggleWatch = (sym, e) => {
    e.stopPropagation();
    setWatch((w) => { const nw = w.includes(sym) ? w.filter((s) => s !== sym) : [...w, sym]; store.set(K.watch, nw); return nw; });
  };
  const openSearch = () => {
    const q = search.trim().toUpperCase();
    if (!q) return;
    setDetail({ name: q, sym: q });
    setSearch("");
  };

  const load = useCallback(async () => {
    if (!provider) { setStatus("nokey"); return; }
    setStatus("loading"); setErr("");
    const next = {};
    let anyOk = false, lastErr = "";
    for (const ins of INSTRUMENTS) {
      try {
        const q = await provider.quote(ins.sym);
        const price = parseFloat(q.close ?? q.price);
        const chg = parseFloat(q.percent_change);
        if (!isFinite(price)) { next[ins.sym] = { na: true }; continue; }
        next[ins.sym] = { price, chg: isFinite(chg) ? chg : null, delayed: q.is_market_open === false };
        const prev = prevRef.current[ins.sym];
        if (prev != null && price !== prev) {
          setFlash((f) => ({ ...f, [ins.sym]: price > prev ? "flashUp" : "flashDn" }));
          setTimeout(() => setFlash((f) => ({ ...f, [ins.sym]: "" })), 850);
        }
        prevRef.current[ins.sym] = price;
        anyOk = true;
      } catch (e) { next[ins.sym] = { na: true }; lastErr = e.message; }
      setRows({ ...next });
    }
    setTs(new Date());
    if (!anyOk) { setStatus("blocked"); setErr(lastErr || "לא ניתן להגיע לספק הנתונים מתוך סביבה זו."); }
    else setStatus("ok");
  }, [provider]);

  useEffect(() => { if (provider) load(); }, [provider, load]);

  const groups = [...new Set(INSTRUMENTS.map((i) => i.g))];

  return (
    <div style={{ padding: "18px 16px 96px" }}>
      <Header title="השוק" sub="תמונת מצב לשווקים — הבסיס לניתוח של Theo" icon={<LineChart size={18} color={C.blue} />}>
        <Btn kind="ghost" onClick={() => setShowKey(true)} style={{ padding: "8px 10px" }}><Settings2 size={16} /></Btn>
        <Btn kind="ghost" onClick={load} disabled={!provider || status === "loading"} style={{ padding: "8px 10px" }}>
          {status === "loading" ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
        </Btn>
      </Header>

      {/* timeframe rail */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, marginBottom: 14 }}>
        {TIMEFRAMES.map((t, i) => (
          <button key={t.label} onClick={() => setTf(i)} style={{
            flex: "0 0 auto", padding: "6px 12px", borderRadius: 8, fontFamily: MONO, fontSize: 12, cursor: "pointer",
            background: tf === i ? C.blue : "transparent", color: tf === i ? "#fff" : C.mut,
            border: `1px solid ${tf === i ? C.blue : C.line}` }}>{t.label}</button>
        ))}
      </div>

      {/* search any symbol */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, background: C.card,
          border: `1px solid ${C.line}`, borderRadius: 10, padding: "0 12px" }}>
          <Search size={16} color={C.mut2} />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && openSearch()}
            placeholder="חפש נכס (למשל AAPL, TSLA, BTC/USD)…"
            style={{ flex: 1, padding: "11px 0", background: "transparent", border: "none", color: C.text, fontSize: 14, direction: "ltr", textAlign: "left" }} />
        </div>
        <Btn kind="primary" onClick={openSearch} disabled={!search.trim() || !provider} style={{ padding: "0 16px" }}>הצג</Btn>
      </div>

      {/* watchlist */}
      {watch.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <Label>⭐ מועדפים</Label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {INSTRUMENTS.filter((i) => watch.includes(i.sym)).map((ins, idx) => {
              const r = rows[ins.sym];
              const up = r && r.chg != null && r.chg >= 0;
              return (
                <Card key={"w" + ins.sym} onClick={() => provider && setDetail(ins)}
                  className={`rise ${flash[ins.sym] || ""}`}
                  style={{ padding: 12, cursor: provider ? "pointer" : "default", animationDelay: `${idx * 50}ms`, borderColor: `${C.amber}44` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{ins.name}</div>
                    <Star size={14} color={C.amber} fill={C.amber} style={{ cursor: "pointer" }} onClick={(e) => toggleWatch(ins.sym, e)} />
                  </div>
                  <div style={{ marginTop: 8, fontFamily: MONO }}>
                    {!r ? <span style={{ color: C.mut2, fontSize: 12 }}>…</span>
                      : r.na ? <span style={{ color: C.mut2, fontSize: 12 }}>אין נתון זמין</span>
                      : (
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                          <span style={{ fontSize: 18, color: C.text }}>{r.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                          {r.chg != null && <span style={{ fontSize: 13, color: up ? C.green : C.red }}>{up ? "+" : ""}{r.chg.toFixed(2)}%</span>}
                        </div>
                      )}
                  </div>
                  <div style={{ fontSize: 10, color: C.mut2, fontFamily: MONO, marginTop: 4 }}>{ins.sym}</div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* connection status banner */}
      {status === "nokey" && (
        <Card style={{ padding: 16, marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <AlertTriangle size={18} color={C.amber} />
            <div>
              <div style={{ color: C.text, fontWeight: 600, marginBottom: 4 }}>אין חיבור לספק נתונים</div>
              <div style={{ color: C.mut, fontSize: 13, lineHeight: 1.6 }}>
                חבר מפתח Twelve Data כדי למשוך מחירים אמיתיים. עד אז לא יוצגו נתונים — THESIS לא ממציאה מחירים.
              </div>
              <Btn kind="primary" onClick={() => setShowKey(true)} style={{ marginTop: 12 }}>חבר ספק נתונים</Btn>
            </div>
          </div>
        </Card>
      )}
      {status === "blocked" && (
        <Card style={{ padding: 16, marginBottom: 14, borderColor: `${C.amber}44` }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <AlertTriangle size={18} color={C.amber} />
            <div>
              <div style={{ color: C.text, fontWeight: 600, marginBottom: 4 }}>הנתונים נחסמו על ידי הסביבה</div>
              <div style={{ color: C.mut, fontSize: 13, lineHeight: 1.6 }}>
                אין מענה מ‑/api/td. בתצוגה כאן זה צפוי — אין כאן שרת‑ביניים. הרץ את האפליקציה באירוח שלך
                לצד פונקציית ה‑proxy (api/td) עם מפתח Twelve Data כ‑secret, והנתונים האמיתיים יימשכו.
                אין נתון זמין כרגע.
              </div>
              <div style={{ color: C.mut2, fontSize: 11, marginTop: 8, fontFamily: MONO, direction: "ltr", textAlign: "left" }}>{err}</div>
            </div>
          </div>
        </Card>
      )}
      {ts && status === "ok" && (
        <div style={{ fontSize: 11, color: C.mut2, fontFamily: MONO, marginBottom: 10 }}>
          עודכן בשעה {ts.toLocaleTimeString("he-IL")} · מקור: Twelve Data
        </div>
      )}

      {groups.map((g) => (
        <div key={g} style={{ marginBottom: 18 }}>
          <Label>{g}</Label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {INSTRUMENTS.filter((i) => i.g === g).map((ins, idx) => {
              const r = rows[ins.sym];
              const up = r && r.chg != null && r.chg >= 0;
              return (
                <Card key={ins.sym} onClick={() => provider && setDetail(ins)}
                  className={`rise ${flash[ins.sym] || ""}`}
                  style={{ padding: 12, cursor: provider ? "pointer" : "default", animationDelay: `${idx * 60}ms` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{ins.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {ins.note && <Pill>{ins.note}</Pill>}
                      <Star size={14} color={watch.includes(ins.sym) ? C.amber : C.mut2}
                        fill={watch.includes(ins.sym) ? C.amber : "none"} style={{ cursor: "pointer" }}
                        onClick={(e) => toggleWatch(ins.sym, e)} />
                    </div>
                  </div>
                  <div style={{ marginTop: 8, fontFamily: MONO }}>
                    {!provider ? <span style={{ color: C.mut2, fontSize: 12 }}>—</span>
                      : !r ? <span style={{ color: C.mut2, fontSize: 12 }}>…</span>
                      : r.na ? <span style={{ color: C.mut2, fontSize: 12 }}>אין נתון זמין</span>
                      : (
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                          <span style={{ fontSize: 18, color: C.text }}>{r.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                          {r.chg != null && <span style={{ fontSize: 13, color: up ? C.green : C.red }}>{up ? "+" : ""}{r.chg.toFixed(2)}%</span>}
                        </div>
                      )}
                  </div>
                  <div style={{ fontSize: 10, color: C.mut2, fontFamily: MONO, marginTop: 4 }}>{ins.sym}</div>
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      {showKey && (
        <Modal onClose={() => setShowKey(false)} title="הגדרת חיבור נתונים">
          <p style={{ color: C.mut, fontSize: 13, lineHeight: 1.7 }}>
            THESIS מושכת נתונים דרך שרת‑ביניים שלך שמחזיק את מפתח Twelve Data כ‑secret —
            המפתח לעולם לא נחשף בפרונטאנד. אם ה‑proxy יושב באותו דומיין של האפליקציה, השאר ריק
            וזה יעבוד אוטומטית דרך /api/td. אם הוא בדומיין אחר, הדבק כאן את כתובת הבסיס שלו.
          </p>
          <input value={draftKey} onChange={(e) => setDraftKey(e.target.value)} placeholder="https://your-proxy.example.com  (או השאר ריק)"
            style={{ width: "100%", marginTop: 12, padding: "12px", borderRadius: 10, background: C.bg2,
              border: `1px solid ${C.line}`, color: C.text, fontFamily: MONO, direction: "ltr" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <Btn kind="primary" onClick={() => { onSetProxy(draftKey.trim()); setShowKey(false); }}>
              <Check size={16} /> שמור
            </Btn>
            <Btn kind="ghost" onClick={() => setShowKey(false)}>ביטול</Btn>
          </div>
          <div style={{ marginTop: 12, fontSize: 11.5, color: C.mut2, fontFamily: MONO, direction: "ltr", textAlign: "left" }}>
            endpoint: {(proxyBase || "") + "/api/td"}
          </div>
        </Modal>
      )}

      {detail && <CandleDetail ins={detail} provider={provider} onClose={() => setDetail(null)} />}
    </div>
  );
}

/* ================================ CHAT =================================== */
function Chat({ profile, strategy, onSendToStrategy }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { store.get(K.chat).then((m) => { if (m) setMsgs(m); }); }, []);
  useEffect(() => { store.set(K.chat, msgs); endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const ctx = () => {
    let s = "";
    if (profile) s += `\n[פרופיל המשתמש]: ${JSON.stringify(profile)}`;
    if (strategy) s += `\n[השיטה הנוכחית]: ${JSON.stringify({ goal: strategy.goal, universe: strategy.universe, entry: strategy.entry, exit: strategy.exit, risk: strategy.risk })}`;
    return s;
  };

  const send = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput(""); setBusy(true);
    const nm = [...msgs, { role: "user", content: q }];
    setMsgs(nm);
    try {
      const hist = nm.slice(-10).map((m) => ({ role: m.role, content: m.content }));
      const reply = await callClaude(ANALYST_PERSONA + ctx(), hist);
      const linkable = /שיט|אסטרטגי|ריבית|סיכון|כניס|יציא|פיזור|תיק/.test(q);
      setMsgs([...nm, { role: "assistant", content: reply, linkable }]);
    } catch (e) {
      setMsgs([...nm, { role: "assistant", content: "לא הצלחתי להשלים את הניתוח: " + e.message + "\n(ודא שהחיבור למודל פעיל.)" }]);
    }
    setBusy(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "14px 16px 0" }}>
        <Header title="Chat" sub="Theo — אנליסט השקעות AI. אנליטי, ספקן, מבוסס נתונים." icon={<MessageSquare size={18} color={C.blue} />} />
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 16px 12px" }}>
        {msgs.length === 0 && (
          <Card style={{ padding: 16, marginTop: 8 }}>
            <div style={{ color: C.text, fontWeight: 600, marginBottom: 8 }}>Theo כאן.</div>
            <div style={{ color: C.mut, fontSize: 13, lineHeight: 1.7 }}>
              דבר איתי על שוק, נכס או רעיון. אני לא אסכים איתך אוטומטית — אם רעיון חלש, אגיד לך למה.
              אם חסרים נתונים, אומר זאת במקום לנחש.
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              {["מה מצב השוק הרחב?", "ריבית גבוהה ומניות צמיחה", "איך לחשוב על ניהול סיכון?"].map((s) => (
                <button key={s} onClick={() => setInput(s)} style={{ fontSize: 12, color: C.blueHi, background: `${C.blue}18`,
                  border: `1px solid ${C.blue}33`, borderRadius: 999, padding: "6px 12px", cursor: "pointer" }}>{s}</button>
              ))}
            </div>
          </Card>
        )}
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-start" : "flex-end", margin: "10px 0" }}>
            <div style={{ maxWidth: "88%", padding: "11px 13px", borderRadius: 13, fontSize: 14, lineHeight: 1.65, whiteSpace: "pre-wrap",
              background: m.role === "user" ? C.blue : C.card, color: m.role === "user" ? "#fff" : C.text,
              border: m.role === "user" ? "none" : `1px solid ${C.line}` }}>
              {m.content}
              {m.linkable && (
                <button onClick={() => onSendToStrategy(m.content)} style={{ display: "block", marginTop: 10, fontSize: 12,
                  color: C.blueHi, background: "transparent", border: `1px solid ${C.blue}44`, borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}>
                  <Sparkles size={12} style={{ verticalAlign: -2 }} /> העבר לפיתוח השיטה
                </button>
              )}
            </div>
          </div>
        ))}
        {busy && <div style={{ color: C.mut2, fontSize: 13, fontFamily: MONO, padding: 8 }}>Theo מנתח…</div>}
        <div ref={endRef} />
      </div>
      <div style={{ padding: "8px 12px 12px", borderTop: `1px solid ${C.lineSoft}`, display: "flex", gap: 8, background: C.bg }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="שאל את Theo…" style={{ flex: 1, padding: "12px 14px", borderRadius: 12, background: C.card,
            border: `1px solid ${C.line}`, color: C.text, fontSize: 14 }} />
        <Btn kind="primary" onClick={send} disabled={busy || !input.trim()} style={{ padding: "0 14px" }}><Send size={16} /></Btn>
      </div>
    </div>
  );
}

/* ============================ STRATEGY ROOM ============================== */
function Strategy({ profile, setProfile, strategy, setStrategy, versions, setVersions,
  journal, setJournal, provider, seed, clearSeed }) {
  const [tab, setTab] = useState("build"); // build | profile | test | journal | versions
  return (
    <div style={{ padding: "14px 16px 96px" }}>
      <Header title="פיתוח השיטה" sub="הלב של THESIS — אתה בונה את השיטה יחד עם Theo." icon={<Brain size={18} color={C.blue} />} />
      <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "4px 0 12px" }}>
        {[["build", "השיטה", Layers], ["profile", "פרופיל", Target], ["test", "בדיקות", Beaker],
          ["journal", "יומן", BookOpen], ["versions", "גרסאות", GitBranch]].map(([id, lbl, Icon]) => (
          <button key={id} onClick={() => setTab(id)} style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 6,
            padding: "8px 12px", borderRadius: 9, fontSize: 13, cursor: "pointer",
            background: tab === id ? C.card2 : "transparent", color: tab === id ? C.text : C.mut,
            border: `1px solid ${tab === id ? C.line : "transparent"}` }}>
            <Icon size={14} /> {lbl}
          </button>
        ))}
      </div>

      {tab === "profile" && <ProfilePane profile={profile} setProfile={setProfile} />}
      {tab === "build" && (
        <BuildPane profile={profile} strategy={strategy} setStrategy={setStrategy}
          versions={versions} setVersions={setVersions} seed={seed} clearSeed={clearSeed} />
      )}
      {tab === "test" && <TestPane strategy={strategy} provider={provider} journal={journal} setJournal={setJournal} />}
      {tab === "journal" && <JournalPane journal={journal} setJournal={setJournal} strategy={strategy} />}
      {tab === "versions" && <VersionsPane versions={versions} />}
    </div>
  );
}

/* --- profile: AI-driven interview --- */
function ProfilePane({ profile, setProfile }) {
  const [conv, setConv] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const fields = [
    ["goals", "מטרות"], ["horizon", "אופק זמן"], ["risk", "סבילות לסיכון"], ["liquidity", "צרכי נזילות"],
    ["capital", "הון מתוכנן"], ["markets", "שווקים מועדפים"], ["assets", "סוגי נכסים"],
    ["knowledge", "רמת ידע"], ["decisionStyle", "סגנון קבלת החלטות"], ["fears", "חששות"],
  ];
  const interviewSys = ANALYST_PERSONA +
    " אתה מראיין את המשתמש כדי לבנות פרופיל השקעה. שאל שאלה אחת בכל פעם, בטבעיות, והעמק בהדרגה. " +
    "אל תשאל את כל השאלות בבת אחת. אחרי כמה תשובות, הצע לעבור לבניית השיטה.";

  const step = async (msg) => {
    setBusy(true);
    const nc = [...conv, { role: "user", content: msg }];
    setConv(nc); setInput("");
    try {
      const reply = await callClaude(interviewSys, nc.slice(-8));
      setConv([...nc, { role: "assistant", content: reply }]);
    } catch (e) { setConv([...nc, { role: "assistant", content: "שגיאה: " + e.message }]); }
    setBusy(false);
  };
  const start = () => step("בוא נתחיל לבנות את הפרופיל שלי.");
  const extract = async () => {
    setBusy(true);
    try {
      const sys = "חלץ פרופיל השקעה מהשיחה. החזר JSON בלבד עם המפתחות: " +
        fields.map((f) => f[0]).join(", ") + ". כל ערך מחרוזת קצרה בעברית. אם חסר מידע, כתוב 'לא צוין'.";
      const text = await callClaude(sys, [{ role: "user", content: JSON.stringify(conv) }]);
      setProfile(parseJSON(text));
    } catch (e) { alert("לא ניתן לחלץ פרופיל עדיין: " + e.message); }
    setBusy(false);
  };

  return (
    <div>
      {profile && (
        <Card style={{ padding: 14, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontWeight: 700, color: C.text }}>Investor Profile</div>
            <Pill color={C.teal} bg={`${C.teal}18`}>דינמי</Pill>
          </div>
          {fields.map(([k, lbl]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: `1px solid ${C.lineSoft}` }}>
              <span style={{ color: C.mut, fontSize: 13 }}>{lbl}</span>
              <input value={profile[k] || ""} onChange={(e) => setProfile({ ...profile, [k]: e.target.value })}
                style={{ textAlign: "left", background: "transparent", border: "none", color: C.text, fontSize: 13, flex: 1, minWidth: 0 }} />
            </div>
          ))}
        </Card>
      )}

      <Card style={{ padding: 14 }}>
        <div style={{ fontWeight: 600, color: C.text, marginBottom: 4 }}>שלב ההיכרות</div>
        <div style={{ color: C.mut, fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>
          Theo ישאל אותך שאלות בהדרגה כדי להבין מי אתה כמשקיע. בסוף נחלץ מזה פרופיל שאפשר לערוך.
        </div>
        <div style={{ maxHeight: 260, overflowY: "auto", marginBottom: 10 }}>
          {conv.map((m, i) => (
            <div key={i} style={{ margin: "8px 0", fontSize: 13.5, lineHeight: 1.6,
              color: m.role === "user" ? C.blueHi : C.text }}>
              <b style={{ color: C.mut2, fontSize: 11, fontFamily: MONO }}>{m.role === "user" ? "אתה" : "Theo"} · </b>{m.content}
            </div>
          ))}
        </div>
        {conv.length === 0 ? (
          <Btn kind="primary" onClick={start} disabled={busy}>התחל ריאיון</Btn>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && input.trim() && step(input)}
                placeholder="תשובתך…" style={{ flex: 1, padding: "10px 12px", borderRadius: 10, background: C.bg2, border: `1px solid ${C.line}`, color: C.text, fontSize: 14 }} />
              <Btn kind="primary" onClick={() => input.trim() && step(input)} disabled={busy}><Send size={15} /></Btn>
            </div>
            <Btn kind="solid" onClick={extract} disabled={busy} style={{ marginTop: 10, width: "100%" }}>
              {busy ? <Loader2 size={15} className="spin" /> : <Check size={15} />} בנה / עדכן פרופיל מהשיחה
            </Btn>
          </>
        )}
      </Card>
    </div>
  );
}

/* --- build: strategy object + visual flow + AI actions --- */
const FLOW = ["מטרת השיטה", "סינון השוק", "בחירת נכסים", "בדיקת תנאים", "בדיקת סיכון", "הקצאת הון", "מעקב", "Rebalancing"];
const SECTIONS = [
  ["goal", "מטרה", "מה השיטה מנסה להשיג"],
  ["universe", "Universe", "אילו נכסים מותר לבחון"],
  ["entry", "תנאי כניסה", "מתי נכס עומד בקריטריונים"],
  ["exit", "תנאי יציאה", "מתי לשקול יציאה"],
  ["sizing", "Position Sizing", "כמה הון להקצות"],
  ["diversification", "Diversification", "איך מפזרים"],
  ["risk", "Risk Management", "איך מנהלים סיכון"],
  ["rebalancing", "Rebalancing", "מתי ואיך מאזנים"],
  ["review", "Review", "מתי בודקים מחדש"],
  ["failure", "Failure Conditions", "מתי השיטה נחשבת שבורה"],
];
function BuildPane({ profile, strategy, setStrategy, versions, setVersions, seed, clearSeed }) {
  const [busy, setBusy] = useState("");
  const [analysis, setAnalysis] = useState(null); // {kind, text}
  const [note, setNote] = useState(seed || "");
  useEffect(() => { if (seed) setNote(seed); }, [seed]);

  const snapshot = (s, why) => {
    const v = versions[0]?.v || "1.0";
    const parts = v.split("."); parts[1] = String(+parts[1] + 1);
    const nv = { v: parts.join("."), ts: Date.now(), why, snap: s };
    setVersions([nv, ...versions]);
  };

  const build = async () => {
    setBusy("build");
    try {
      const sys = "בנה שיטת השקעה מפורטת ומותאמת לפרופיל, כ‑JSON בלבד עם המפתחות: " +
        SECTIONS.map((s) => s[0]).join(", ") +
        ", ובנוסף backtestRule שהוא אובייקט עם type אחד מ: 'buy_hold' | 'price_above_sma' (עם period) | 'sma_cross' (עם fast,slow), ו‑symbol (סימבול ETF כמו SPY). " +
        "כל שדות הטקסט בעברית, קונקרטיים ובני‑בדיקה. אל תבטיח תשואות.";
      const usr = `פרופיל: ${JSON.stringify(profile || {})}\nרעיון/כיוון מהמשתמש: ${note || "כללי"}`;
      const text = await callClaude(sys, [{ role: "user", content: usr }]);
      const s = parseJSON(text);
      setStrategy(s); snapshot(s, note || "בנייה ראשונית"); clearSeed?.();
    } catch (e) { alert("בנייה נכשלה: " + e.message); }
    setBusy("");
  };
  const challenge = async () => {
    if (!strategy) return; setBusy("challenge"); setAnalysis(null);
    try {
      const sys = ANALYST_PERSONA + " אתגר את השיטה. חפש חולשות, הנחות לא מבוססות, ריכוזיות, Overfitting, " +
        "פרמטרים רגישים, ומצבי שוק שבהם היא תיכשל. פתח במשפט: 'נקודת החולשה המרכזית של השיטה היא…'. היה קונקרטי.";
      const text = await callClaude(sys, [{ role: "user", content: JSON.stringify(strategy) }]);
      setAnalysis({ kind: "אתגור השיטה", text });
    } catch (e) { setAnalysis({ kind: "שגיאה", text: e.message }); }
    setBusy("");
  };
  const review = async () => {
    if (!strategy) return; setBusy("review"); setAnalysis(null);
    try {
      const sys = ANALYST_PERSONA + " בצע Strategy Review מקיף: חוזקות, חולשות, סיכונים, הנחות, נקודות כשל, " +
        "רגישות לפרמטרים, Robustness, מצבי שוק בעייתיים, ומה כדאי לבדוק. הפרד לכותרות קצרות.";
      const text = await callClaude(sys, [{ role: "user", content: JSON.stringify(strategy) }]);
      setAnalysis({ kind: "Strategy Review", text });
    } catch (e) { setAnalysis({ kind: "שגיאה", text: e.message }); }
    setBusy("");
  };

  if (!strategy) {
    return (
      <Card style={{ padding: 16 }}>
        <div style={{ fontWeight: 700, color: C.text, marginBottom: 6 }}>עדיין אין שיטה</div>
        <div style={{ color: C.mut, fontSize: 13, lineHeight: 1.7, marginBottom: 12 }}>
          אתה לא מקבל שיטה מוכנה — אתה בונה אותה עם Theo. תאר בכמה מילים לאן אתה מכוון, ו‑Theo יציע טיוטת שיטה
          מותאמת לפרופיל שלך. תוכל לערוך כל חלק, לאתגר אותה ולבדוק אותה.
        </div>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
          placeholder="למשל: מגמה ארוכת טווח על מדדים רחבים, עם ניהול סיכון הדוק…"
          style={{ width: "100%", padding: 12, borderRadius: 10, background: C.bg2, border: `1px solid ${C.line}`, color: C.text, fontSize: 14, resize: "vertical" }} />
        <Btn kind="primary" onClick={build} disabled={busy === "build"} style={{ marginTop: 12, width: "100%" }}>
          {busy === "build" ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />} בנה טיוטת שיטה עם Theo
        </Btn>
        {!profile && <div style={{ marginTop: 10, fontSize: 12, color: C.amber }}>טיפ: מלא קודם פרופיל בלשונית "פרופיל" לתוצאה מדויקת יותר.</div>}
      </Card>
    );
  }

  return (
    <div>
      {/* visual flow — the signature spine */}
      <Card style={{ padding: 14, marginBottom: 14 }}>
        <Label>Strategy Builder</Label>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          {FLOW.map((f, i) => (
            <React.Fragment key={f}>
              <div style={{ background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 14px",
                fontSize: 13, color: C.text, fontFamily: MONO, minWidth: 150, textAlign: "center" }}>{f}</div>
              {i < FLOW.length - 1 && <div style={{ width: 1, height: 14, background: `linear-gradient(${C.blue}, ${C.line})` }} />}
            </React.Fragment>
          ))}
        </div>
      </Card>

      {/* editable sections */}
      {SECTIONS.map(([k, lbl, hint]) => (
        <Card key={k} style={{ padding: 12, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ fontWeight: 600, color: C.text, fontSize: 14 }}>{lbl}</div>
            <span style={{ fontSize: 11, color: C.mut2 }}>{hint}</span>
          </div>
          <textarea value={strategy[k] || ""} onChange={(e) => setStrategy({ ...strategy, [k]: e.target.value })} rows={2}
            style={{ width: "100%", marginTop: 8, padding: 10, borderRadius: 8, background: C.bg2, border: `1px solid ${C.lineSoft}`,
              color: C.text, fontSize: 13.5, lineHeight: 1.6, resize: "vertical" }} />
        </Card>
      ))}

      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <Btn kind="ghost" onClick={challenge} disabled={busy} style={{ flex: 1, color: C.amber, borderColor: `${C.amber}44` }}>
          {busy === "challenge" ? <Loader2 size={15} className="spin" /> : <Swords size={15} />} אתגר את השיטה
        </Btn>
        <Btn kind="ghost" onClick={review} disabled={busy} style={{ flex: 1, color: C.blueHi, borderColor: `${C.blue}44` }}>
          {busy === "review" ? <Loader2 size={15} className="spin" /> : <ShieldCheck size={15} />} בדוק את השיטה
        </Btn>
      </div>
      <Btn kind="solid" onClick={() => snapshot(strategy, "עריכה ידנית")} style={{ marginTop: 8, width: "100%" }}>
        <GitBranch size={15} /> שמור גרסה חדשה
      </Btn>

      {analysis && (
        <Card style={{ padding: 14, marginTop: 14, borderColor: `${C.blue}33` }}>
          <div style={{ fontWeight: 700, color: C.text, marginBottom: 10 }}>{analysis.kind}</div>
          <div style={{ color: C.text, fontSize: 13.5, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{analysis.text}</div>
        </Card>
      )}
    </div>
  );
}

/* --- test: backtest + paper trading (real, gated on data) --- */
function TestPane({ strategy, provider, journal, setJournal }) {
  const [bt, setBt] = useState(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [paper, setPaper] = useState([]);
  useEffect(() => { store.get(K.paper).then((p) => p && setPaper(p)); }, []);
  useEffect(() => { store.set(K.paper, paper); }, [paper]);

  const rule = strategy?.backtestRule;
  const canCompute = rule && rule.type && rule.symbol;

  const backtest = async () => {
    setErr(""); setBt(null);
    if (!provider) { setErr("חבר ספק נתונים בלשונית 'השוק' כדי לרוץ על היסטוריה אמיתית."); return; }
    if (!canCompute) { setErr("לשיטה אין כלל בר‑חישוב אוטומטי. בקש מ‑Theo לבנות backtestRule."); return; }
    setBusy("bt");
    try {
      const d = await provider.timeSeries(rule.symbol, "1day", 2000);
      const vals = (d.values || []).map((r) => parseFloat(r.close)).reverse().filter(isFinite);
      if (vals.length < 100) { setErr("אין מספיק היסטוריה זמינה לנכס זה."); setBusy(""); return; }
      // train / out-of-sample split (70/30), no look-ahead inside runBacktest.
      const cut = Math.floor(vals.length * 0.7);
      const train = runBacktest(vals.slice(0, cut), { ...rule, periodsPerYear: 252 });
      const oos = runBacktest(vals.slice(cut), { ...rule, periodsPerYear: 252 });
      const full = runBacktest(vals, { ...rule, periodsPerYear: 252 });
      setBt({ full, train, oos, symbol: rule.symbol });
    } catch (e) { setErr("Backtest נכשל: " + e.message + " (ייתכן חסימת CORS/סביבה)."); }
    setBusy("");
  };

  const checkPaper = async () => {
    setErr("");
    if (!provider) { setErr("חבר ספק נתונים כדי לבדוק תנאי חי."); return; }
    if (!canCompute) { setErr("אין כלל בר‑חישוב לבדיקה חיה."); return; }
    setBusy("paper");
    try {
      const d = await provider.timeSeries(rule.symbol, "1day", Math.max(rule.slow || 210, rule.period || 210) + 5);
      const vals = (d.values || []).map((r) => parseFloat(r.close)).reverse().filter(isFinite);
      const i = vals.length - 1;
      let cond = false, why = "";
      if (rule.type === "buy_hold") { cond = true; why = "Buy & Hold — תמיד מוחזק."; }
      else if (rule.type === "price_above_sma") {
        const m = sma(vals, rule.period, i); cond = m != null && vals[i] > m;
        why = `מחיר ${vals[i].toFixed(2)} ${cond ? "מעל" : "מתחת"} SMA${rule.period} (${m?.toFixed(2)})`;
      } else if (rule.type === "sma_cross") {
        const f = sma(vals, rule.fast, i), s = sma(vals, rule.slow, i); cond = f > s;
        why = `SMA${rule.fast} (${f?.toFixed(2)}) ${cond ? "מעל" : "מתחת"} SMA${rule.slow} (${s?.toFixed(2)})`;
      }
      const entry = { ts: Date.now(), symbol: rule.symbol, met: cond, why };
      setPaper([entry, ...paper].slice(0, 30));
    } catch (e) { setErr("בדיקה נכשלה: " + e.message); }
    setBusy("");
  };

  if (!strategy) return <Card style={{ padding: 16, color: C.mut, fontSize: 13 }}>בנה שיטה תחילה כדי לבדוק אותה.</Card>;

  return (
    <div>
      <Card style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700, color: C.text }}>Backtesting</div>
          {canCompute ? <Pill color={C.teal} bg={`${C.teal}18`}>{rule.type} · {rule.symbol}</Pill> : <Pill color={C.amber}>אין כלל אוטומטי</Pill>}
        </div>
        <div style={{ color: C.mut, fontSize: 12.5, lineHeight: 1.6, marginTop: 8 }}>
          רץ על סגירות יומיות אמיתיות מ‑Twelve Data, ללא Look‑ahead, עם הפרדת Training / Out‑of‑Sample.
        </div>
        <Btn kind="primary" onClick={backtest} disabled={busy === "bt"} style={{ marginTop: 12, width: "100%" }}>
          {busy === "bt" ? <Loader2 size={16} className="spin" /> : <Activity size={16} />} הרץ Backtest
        </Btn>
        {err && <div style={{ color: C.amber, fontSize: 12.5, marginTop: 10, lineHeight: 1.6 }}>{err}</div>}
      </Card>

      {bt && (
        <>
          <BtCard title="תקופה מלאה" r={bt.full} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <BtCard title="Training" r={bt.train} small />
            <BtCard title="Out‑of‑Sample" r={bt.oos} small />
          </div>
          <div style={{ fontSize: 11.5, color: C.mut2, marginTop: 8, lineHeight: 1.6 }}>
            השוואת Training מול Out‑of‑Sample בודקת Robustness — פער גדול מרמז על Overfitting.
          </div>
        </>
      )}

      <Card style={{ padding: 14, marginTop: 14 }}>
        <div style={{ fontWeight: 700, color: C.text }}>Paper Trading</div>
        <div style={{ color: C.mut, fontSize: 12.5, lineHeight: 1.6, marginTop: 6 }}>
          בדיקת התנאי על השוק החי — בלי עסקאות אמיתיות. כשתנאי מתקיים, נסביר איזה כלל הופעל ולמה.
        </div>
        <Btn kind="solid" onClick={checkPaper} disabled={busy === "paper"} style={{ marginTop: 10, width: "100%" }}>
          {busy === "paper" ? <Loader2 size={15} className="spin" /> : <TrendingUp size={15} />} בדוק תנאי עכשיו
        </Btn>
        {paper.map((p, i) => (
          <div key={i} style={{ marginTop: 10, padding: 10, borderRadius: 8, background: C.bg2, border: `1px solid ${C.lineSoft}` }}>
            <div style={{ fontSize: 13, color: p.met ? C.green : C.mut }}>
              {p.met ? "השיטה זיהתה תנאי שעומד בקריטריונים." : "אין כרגע תנאי פעיל."}
            </div>
            <div style={{ fontSize: 11.5, color: C.mut, marginTop: 4, fontFamily: MONO }}>{p.symbol} · {p.why}</div>
            <div style={{ fontSize: 10, color: C.mut2, marginTop: 2, fontFamily: MONO }}>{new Date(p.ts).toLocaleString("he-IL")}</div>
          </div>
        ))}
      </Card>
    </div>
  );
}
function BtCard({ title, r, small }) {
  if (!r) return null;
  const stat = (lbl, val, tone) => (
    <div style={{ padding: small ? "6px 0" : "8px 0" }}>
      <div style={{ fontSize: 10, color: C.mut2, fontFamily: MONO }}>{lbl}</div>
      <div style={{ fontSize: small ? 14 : 17, color: tone || C.text, fontFamily: MONO }}>{val}</div>
    </div>
  );
  const pct = (x) => (x * 100).toFixed(1) + "%";
  return (
    <Card style={{ padding: 12, marginBottom: 10 }}>
      <Label>{title}</Label>
      <div style={{ display: "grid", gridTemplateColumns: small ? "1fr 1fr" : "1fr 1fr 1fr", gap: 4 }}>
        {stat("תשואה", pct(r.total), r.total >= 0 ? C.green : C.red)}
        {stat("Max DD", pct(r.mdd), C.red)}
        {stat("Sharpe", r.sharpe.toFixed(2))}
        {stat("Volatility", pct(r.vol))}
        {stat("עסקאות", r.trades)}
        {stat("Win rate", pct(r.winRate))}
      </div>
    </Card>
  );
}

/* --- journal --- */
function JournalPane({ journal, setJournal, strategy }) {
  const [d, setD] = useState({ decision: "", reason: "", data: "", assumptions: "", risks: "" });
  const add = () => {
    if (!d.decision.trim()) return;
    setJournal([{ ...d, ts: Date.now() }, ...journal]);
    setD({ decision: "", reason: "", data: "", assumptions: "", risks: "" });
  };
  const flds = [["decision", "החלטה"], ["reason", "סיבה"], ["data", "נתונים שהיו זמינים"], ["assumptions", "הנחות"], ["risks", "סיכונים"]];
  return (
    <div>
      <Card style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ fontWeight: 700, color: C.text, marginBottom: 10 }}>Decision Journal</div>
        {flds.map(([k, lbl]) => (
          <div key={k} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: C.mut2, fontFamily: MONO, marginBottom: 3 }}>{lbl}</div>
            <input value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })}
              style={{ width: "100%", padding: "9px 10px", borderRadius: 8, background: C.bg2, border: `1px solid ${C.lineSoft}`, color: C.text, fontSize: 13.5 }} />
          </div>
        ))}
        <Btn kind="primary" onClick={add} disabled={!d.decision.trim()} style={{ width: "100%", marginTop: 4 }}><Plus size={15} /> תעד החלטה</Btn>
      </Card>
      {journal.length === 0 && <div style={{ color: C.mut2, fontSize: 13, textAlign: "center" }}>אין עדיין החלטות מתועדות.</div>}
      {journal.map((j, i) => (
        <Card key={i} style={{ padding: 12, marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: C.mut2, fontFamily: MONO, marginBottom: 6 }}>{new Date(j.ts).toLocaleString("he-IL")}</div>
          <div style={{ color: C.text, fontWeight: 600, fontSize: 14 }}>{j.decision}</div>
          {j.reason && <div style={{ color: C.mut, fontSize: 13, marginTop: 4 }}>סיבה: {j.reason}</div>}
          {(j.assumptions || j.risks) && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              {j.assumptions && <Pill color={C.amber}>הנחה: {j.assumptions}</Pill>}
              {j.risks && <Pill color={C.red}>סיכון: {j.risks}</Pill>}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

/* --- versions --- */
function VersionsPane({ versions }) {
  const [open, setOpen] = useState(null);
  if (versions.length === 0) return <Card style={{ padding: 16, color: C.mut, fontSize: 13 }}>עדיין אין גרסאות. כל שינוי מהותי בשיטה יוצר גרסה.</Card>;
  return (
    <div>
      {versions.map((v, i) => (
        <Card key={i} style={{ padding: 12, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
            onClick={() => setOpen(open === i ? null : i)}>
            <div>
              <span style={{ fontFamily: MONO, color: C.blueHi, fontSize: 14 }}>THESIS v{v.v}</span>
              <span style={{ color: C.mut, fontSize: 12, marginInlineStart: 10 }}>{v.why}</span>
            </div>
            <ChevronDown size={16} color={C.mut} style={{ transform: open === i ? "rotate(180deg)" : "none", transition: ".2s" }} />
          </div>
          <div style={{ fontSize: 10, color: C.mut2, fontFamily: MONO, marginTop: 4 }}>{new Date(v.ts).toLocaleString("he-IL")}</div>
          {open === i && v.snap && (
            <div style={{ marginTop: 10, borderTop: `1px solid ${C.lineSoft}`, paddingTop: 10 }}>
              {SECTIONS.map(([k, lbl]) => v.snap[k] && (
                <div key={k} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: C.mut2, fontFamily: MONO }}>{lbl}</div>
                  <div style={{ fontSize: 13, color: C.text, lineHeight: 1.55 }}>{v.snap[k]}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

/* ============================== shared bits =============================== */
function Header({ title, sub, icon, children }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ marginTop: 3 }}>{icon}</div>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.text }}>{title}</h2>
          {sub && <p style={{ margin: "4px 0 0", fontSize: 12.5, color: C.mut, lineHeight: 1.5, maxWidth: 300 }}>{sub}</p>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>{children}</div>
    </div>
  );
}
function Modal({ children, title, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#000A", display: "flex",
      alignItems: "flex-end", justifyContent: "center", zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderTop: `1px solid ${C.line}`,
        borderRadius: "18px 18px 0 0", width: "100%", maxWidth: 440, padding: 20, maxHeight: "80vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, color: C.text, fontSize: 16 }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.mut, cursor: "pointer" }}><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ================================= APP =================================== */
export default function App() {
  const [ready, setReady] = useState(false);
  const [showSplash, setShowSplash] = useState(false);
  const [tab, setTab] = useState("strategy");
  const [proxyBase, setProxyBase] = useState(PROXY_BASE);
  const [provider, setProvider] = useState(new TwelveData(PROXY_BASE));
  const [profile, setProfile] = useState(null);
  const [strategy, setStrategy] = useState(null);
  const [versions, setVersions] = useState([]);
  const [journal, setJournal] = useState([]);
  const [seed, setSeed] = useState("");

  // hydrate from persistent storage (rule #28: memory)
  useEffect(() => {
    (async () => {
      const [pb, p, s, v, j, seen] = await Promise.all([
        store.get(K.proxy), store.get(K.profile), store.get(K.strategy),
        store.get(K.versions), store.get(K.journal), store.get(K.seen),
      ]);
      if (pb) { setProxyBase(pb); setProvider(new TwelveData(pb)); }
      if (p) setProfile(p);
      if (s) setStrategy(s);
      if (v) setVersions(v);
      if (j) setJournal(j);
      setShowSplash(!seen);
      setReady(true);
    })();
  }, []);

  // persist
  useEffect(() => { if (ready) store.set(K.profile, profile); }, [profile, ready]);
  useEffect(() => { if (ready) store.set(K.strategy, strategy); }, [strategy, ready]);
  useEffect(() => { if (ready) store.set(K.versions, versions); }, [versions, ready]);
  useEffect(() => { if (ready) store.set(K.journal, journal); }, [journal, ready]);

  const setProxy = (url) => { const u = (url || "").trim(); setProxyBase(u); setProvider(new TwelveData(u)); store.set(K.proxy, u); };
  const startApp = () => { setShowSplash(false); store.set(K.seen, true); setTab("strategy"); };
  const sendToStrategy = (text) => { setSeed(text); setTab("strategy"); };

  if (!ready) return <div style={{ background: C.bg, position: "fixed", inset: 0 }} />;

  return (
    <div dir="rtl" style={{ position: "fixed", inset: 0, background: C.bg, color: C.text,
      fontFamily: "system-ui, -apple-system, 'Segoe UI', Arial, sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{`.spin{animation:s 1s linear infinite}@keyframes s{to{transform:rotate(360deg)}}
        *::-webkit-scrollbar{width:6px;height:6px}*::-webkit-scrollbar-thumb{background:${C.line};border-radius:3px}
        textarea,input{outline:none}textarea:focus,input:focus{border-color:${C.blue}66}
        @keyframes slideIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .rise{animation:slideIn .45s cubic-bezier(.2,.7,.3,1) both}
        @keyframes flashUp{0%{background:${C.green}22}100%{background:${C.card}}}
        @keyframes flashDn{0%{background:${C.red}22}100%{background:${C.card}}}
        .flashUp{animation:flashUp .8s ease-out}.flashDn{animation:flashDn .8s ease-out}
        @keyframes drawLine{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
        @keyframes fadeTab{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .fadeTab{animation:fadeTab .3s ease both}`}</style>

      {/* top brand bar */}
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.lineSoft}`, display: "flex",
        alignItems: "center", justifyContent: "space-between", flex: "0 0 auto" }}>
        <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: 4, color: C.text }}>THESIS</div>
        <div style={{ fontSize: 10, color: C.mut2, fontFamily: MONO }}>build · test · improve</div>
      </div>

      {/* body */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        <div key={tab} className="fadeTab" style={{ height: "100%", overflowY: tab === "chat" ? "hidden" : "auto" }}>
          {tab === "market" && <Market provider={provider} proxyBase={proxyBase} onSetProxy={setProxy} />}
          {tab === "chat" && <Chat profile={profile} strategy={strategy} onSendToStrategy={sendToStrategy} />}
          {tab === "strategy" && (
            <Strategy profile={profile} setProfile={setProfile} strategy={strategy} setStrategy={setStrategy}
              versions={versions} setVersions={setVersions} journal={journal} setJournal={setJournal}
              provider={provider} seed={seed} clearSeed={() => setSeed("")} />
          )}
        </div>
        {showSplash && <Splash onStart={startApp} />}
      </div>

      {/* bottom nav — exactly three categories */}
      <div style={{ flex: "0 0 auto", display: "flex", borderTop: `1px solid ${C.line}`, background: C.bg2 }}>
        {[["market", "השוק", LineChart], ["chat", "Chat", MessageSquare], ["strategy", "פיתוח השיטה", Brain]].map(([id, lbl, Icon]) => (
          <button key={id} onClick={() => setTab(id)} style={{ flex: 1, padding: "10px 4px 12px", background: "transparent",
            border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <Icon size={20} color={tab === id ? C.blue : C.mut2} />
            <span style={{ fontSize: 11, color: tab === id ? C.text : C.mut2, fontWeight: tab === id ? 700 : 500 }}>{lbl}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
