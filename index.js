import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());

let cache = {
  markets: null,
  global: null,
  btcChart: null,
  lastUpdate: 0
};

async function fetchSafe(url) {
  const res = await fetch(url);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("JSON parse error: " + text);
  }
}

async function refreshCache() {
  const now = Date.now();

  if (now - cache.lastUpdate < 60000) return; // 60 sec cache

  try {
    console.log("Refreshing cache...");

    const global = await fetchSafe(
      "https://api.coingecko.com/api/v3/global"
    );

    const markets = await fetchSafe(
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false"
    );

    const btcChart = await fetchSafe(
      "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=7&interval=hourly"
    );

    cache = {
      global,
      markets,
      btcChart,
      lastUpdate: now
    };

    console.log("Cache updated.");
  } catch (e) {
    console.log("CACHE ERROR:", e.message);
  }
}

setInterval(refreshCache, 5000);
refreshCache();

// ─────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────

// Overview
app.get("/overview", (req, res) => {
  if (!cache.global) return res.json({ error: true });
  const d = cache.global.data;

  res.json({
    market_cap: d.total_market_cap.usd,
    volume_24h: d.total_volume.usd,
    btc_dominance: d.market_cap_percentage.btc,
    eth_dominance: d.market_cap_percentage.eth,
    market_change_24h: d.market_cap_change_percentage_24h_usd
  });
});

// Gainers / Losers
app.get("/gainers", (req, res) => {
  if (!cache.markets) return res.json({ error: true });

  const sorted = [...cache.markets];

  const gainers = sorted
    .sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h)
    .slice(0, 10);

  const losers = sorted
    .sort((a, b) => a.price_change_percentage_24h - b.price_change_percentage_24h)
    .slice(0, 10);

  res.json({ gainers, losers });
});

// Heatmap
app.get("/heatmap", (req, res) => {
  if (!cache.markets) return res.json({ error: true });
  res.json(cache.markets.slice(0, 50));
});

// Fear & Greed
app.get("/feargreed", async (req, res) => {
  try {
    const fg = await fetchSafe("https://api.alternative.me/fng/?limit=1");
    res.json({
      value: fg.data[0].value,
      value_classification: fg.data[0].value_classification
    });
  } catch (e) {
    res.json({ error: true });
  }
});

// BTC forecast
app.get("/btcforecast", (req, res) => {
  if (!cache.btcChart) return res.json({ error: true });

  const prices = cache.btcChart.prices.map(p => p[1]);
  const last = prices[prices.length - 1];
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;

  res.json({
    last_price: last,
    average_price: avg,
    forecast_price: (last * 1.02).toFixed(2)
  });
});

app.listen(10000, () => console.log("API running on port 10000"));
