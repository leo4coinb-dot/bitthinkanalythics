import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(cors());

let cache = {
  markets: null,
  global: null,
  btcChart: null,
  updated: 0
};

// -------- SAFE FETCH --------
async function fetchJSON(url) {
  try {
    const res = await fetch(url, { timeout: 8000 });

    if (!res.ok) {
      console.log("API ERROR", url, res.status);
      return null;
    }

    const text = await res.text();

    try {
      return JSON.parse(text);
    } catch {
      console.log("JSON PARSE FAILED:", url, text);
      return null;
    }

  } catch (e) {
    console.log("FETCH FAILED:", url, e.message);
    return null;
  }
}

// -------- REFRESH CACHE --------
async function refreshCache() {
  const now = Date.now();

  if (now - cache.updated < 60_000) return;

  console.log("Refreshing cache...");

  const [global, markets, btcChart] = await Promise.all([
    fetchJSON("https://api.coingecko.com/api/v3/global"),
    fetchJSON("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=200&page=1"),
    fetchJSON("https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=1&interval=hourly")
  ]);

  if (global) cache.global = global;
  if (markets) cache.markets = markets;
  if (btcChart) cache.btcChart = btcChart;

  cache.updated = now;

  console.log("Cache updated OK");
}

setInterval(refreshCache, 15000);
refreshCache();

// ███████████████████████████████████
//               ROUTES
// ███████████████████████████████████

// -------- OVERVIEW --------
app.get("/overview", (req, res) => {
  if (!cache.global) return res.status(200).json({ error: true });

  const d = cache.global.data;

  res.json({
    market_cap: d.total_market_cap.usd,
    volume_24h: d.total_volume.usd,
    btc_dominance: d.market_cap_percentage.btc,
    eth_dominance: d.market_cap_percentage.eth,
    market_change_24h: d.market_cap_change_percentage_24h_usd,
    top5: cache.markets ? cache.markets.slice(0, 5) : []
  });
});

// -------- GAINERS --------
app.get("/gainers", (req, res) => {
  if (!cache.markets) return res.json({ error: true });

  const sorted = [...cache.markets];

  const gainers = sorted
    .filter(c => c.price_change_percentage_24h != null)
    .sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h)
    .slice(0, 10);

  const losers = sorted
    .filter(c => c.price_change_percentage_24h != null)
    .sort((a, b) => a.price_change_percentage_24h - b.price_change_percentage_24h)
    .slice(0, 10);

  res.json({ gainers, losers });
});

// -------- HEATMAP --------
app.get("/heatmap", (req, res) => {
  if (!cache.markets) return res.json({ error: true });

  res.json(
    cache.markets.slice(0, 50).map(c => ({
      symbol: c.symbol,
      change24: c.price_change_percentage_24h
    }))
  );
});

// -------- FEAR & GREED --------
app.get("/feargreed", async (req, res) => {
  const fg = await fetchJSON("https://api.alternative.me/fng/?limit=1");

  if (!fg || !fg.data) {
    return res.json({
      value: "—",
      value_classification: "No data"
    });
  }

  res.json({
    latest: fg.data[0]
  });
});

// -------- BTC FORECAST --------
app.get("/btcforecast", (req, res) => {
  if (!cache.btcChart) return res.json({ error: true });

  const prices = cache.btcChart.prices.map(p => p[1]);
  const last24 = prices.slice(-24);

  const last = last24[last24.length - 1];
  const prev = last24[0];
  const change = ((last - prev) / prev) * 100;

  res.json({
    trend: change >= 0 ? "UP" : "DOWN",
    change,
    confidence: 65,
    last24
  });
});

// SERVER
app.listen(10000, () => console.log("API RUNNING 🔥"));
