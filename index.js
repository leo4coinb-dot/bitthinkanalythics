// index.js
import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// Simple in-memory cache to reduce CoinGecko calls
const CACHE_TTL_MS = 25_000; // 25s
const cache = {
  markets: { ts: 0, data: null }, // top250 markets
  global: { ts: 0, data: null },
  fng: { ts: 0, data: null },
  market_chart_btc: { ts: 0, data: null }
};

const CG = "https://api.coingecko.com/api/v3";

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text().catch(()=>null);
    throw new Error(`${res.status} ${res.statusText} ${txt || ""}`);
  }
  return res.json();
}

async function getMarkets() {
  const now = Date.now();
  if (cache.markets.data && (now - cache.markets.ts) < CACHE_TTL_MS) return cache.markets.data;
  // fetch top 250 markets once
  const url = `${CG}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=true&price_change_percentage=24h,7d,30d`;
  const data = await fetchJson(url);
  cache.markets = { ts: now, data };
  return data;
}

async function getGlobal() {
  const now = Date.now();
  if (cache.global.data && (now - cache.global.ts) < CACHE_TTL_MS) return cache.global.data;
  const url = `${CG}/global`;
  const data = await fetchJson(url);
  cache.global = { ts: now, data };
  return data;
}

async function getFNG() {
  const now = Date.now();
  if (cache.fng.data && (now - cache.fng.ts) < CACHE_TTL_MS) return cache.fng.data;
  const url = `https://api.alternative.me/fng/?limit=30`; // store last 30 days if needed
  const data = await fetchJson(url);
  cache.fng = { ts: now, data };
  return data;
}

async function getBTCMarketChart() {
  const now = Date.now();
  if (cache.market_chart_btc.data && (now - cache.market_chart_btc.ts) < CACHE_TTL_MS) return cache.market_chart_btc.data;
  const url = `${CG}/coins/bitcoin/market_chart?vs_currency=usd&days=7&interval=hourly`;
  const data = await fetchJson(url);
  cache.market_chart_btc = { ts: now, data };
  return data;
}

// Endpoint: overview
app.get("/overview", async (req, res) => {
  try {
    const globalResp = await getGlobal(); // uses cache
    const topCoins = await getMarkets();  // uses cache

    // global
    const g = globalResp.data || {};
    const market_cap = g.total_market_cap ? g.total_market_cap.usd : null;
    const volume_24h = g.total_volume ? g.total_volume.usd : null;
    const btc_dominance = g.market_cap_percentage ? g.market_cap_percentage.btc : null;
    const eth_dominance = g.market_cap_percentage ? g.market_cap_percentage.eth : null;
    const market_change_24h = g.market_cap_change_percentage_24h_usd || null;

    // top 5 coins simple list
    const top5 = (Array.isArray(topCoins) ? topCoins.slice(0,5).map(c => ({
      id: c.id, symbol: c.symbol, name: c.name, rank: c.market_cap_rank, price: c.current_price, market_cap: c.market_cap
    })) : []);

    res.json({
      market_cap, volume_24h, btc_dominance, eth_dominance, market_change_24h,
      top5
    });
  } catch (e) {
    console.error("overview error", e.message || e);
    res.status(500).json({ error: true, message: String(e.message || e) });
  }
});

// Endpoint: gainers
app.get("/gainers", async (req, res) => {
  try {
    const markets = await getMarkets();
    // annotate with price_change fields
    const by24 = [...markets].filter(m => m.price_change_percentage_24h !== null && m.price_change_percentage_24h !== undefined);
    const gainers = by24.sort((a,b)=> b.price_change_percentage_24h - a.price_change_percentage_24h).slice(0,12);
    const losers = by24.sort((a,b)=> a.price_change_percentage_24h - b.price_change_percentage_24h).slice(0,12);
    res.json({ gainers, losers });
  } catch(e) {
    console.error("gainers error", e);
    res.status(500).json({ error:true, message:String(e.message||e) });
  }
});

// Endpoint: heatmap -> returns top N markets (default 24)
app.get("/heatmap", async (req, res) => {
  try {
    const per_page = Math.min(100, Number(req.query.limit) || 24);
    const markets = await getMarkets();
    res.json((markets || []).slice(0, per_page).map(c => ({
      id:c.id, symbol:c.symbol, name:c.name, price:c.current_price, change24: c.price_change_percentage_24h
    })));
  } catch(e) {
    console.error("heatmap error", e);
    res.status(500).json({ error:true, message:String(e.message||e) });
  }
});

// Endpoint: fear & greed
app.get("/feargreed", async (req, res) => {
  try {
    const fg = await getFNG();
    // return latest entry and sparkline last 30
    const latest = fg.data && fg.data.length ? fg.data[0] : null;
    res.json({ latest, series: fg.data || [] });
  } catch(e) {
    console.error("fng error", e);
    res.status(500).json({ error:true, message:String(e.message||e) });
  }
});

// Endpoint: btcforecast
app.get("/btcforecast", async (req, res) => {
  try {
    const chart = await getBTCMarketChart();
    // chart.prices => [[unixms, price], ...]
    const prices = Array.isArray(chart.prices) ? chart.prices.map(p=>p[1]) : [];
    const last24 = prices.slice(-24);
    const avgPrev = last24.slice(0,12).reduce((a,b)=>a+b,0)/(Math.max(1,last24.slice(0,12).length));
    const avgNow = last24.slice(12).reduce((a,b)=>a+b,0)/(Math.max(1,last24.slice(12).length));
    const change = avgPrev === 0 ? 0 : ((avgNow - avgPrev)/avgPrev)*100;
    const trend = change>0.5 ? "Bullish" : (change < -0.5 ? "Bearish" : "Neutral");
    const confidence = Math.min(95, Math.round(Math.abs(change)*10 + 40));
    const last = prices.length ? prices[prices.length-1] : null;
    res.json({ last, avg: prices.length ? (prices.reduce((a,b)=>a+b,0)/prices.length) : null, last24, trend, change, confidence });
  } catch(e) {
    console.error("btcforecast error", e);
    res.status(500).json({ error:true, message:String(e.message||e) });
  }
});

// Health route
app.get("/health", (req,res)=> res.json({ ok:true, ts: Date.now() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log(`API listening on ${PORT}`));
