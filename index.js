import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());

// Utility fetch
async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("API error: " + res.status);
  return res.json();
}

// 1 — Overview (market cap, volume, dominance)
app.get("/overview", async (req, res) => {
  try {
    const global = await getJSON(
      "https://api.coingecko.com/api/v3/global"
    );

    const data = global.data;
    res.json({
      market_cap: data.total_market_cap.usd,
      volume_24h: data.total_volume.usd,
      btc_dominance: data.market_cap_percentage.btc,
      eth_dominance: data.market_cap_percentage.eth,
      market_change_24h: data.market_cap_change_percentage_24h_usd
    });
  } catch (e) {
    res.json({ error: true, message: e.message });
  }
});

// 2 — Top gainers/losers
app.get("/gainers", async (req, res) => {
  try {
    const coins = await getJSON(
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false"
    );

    const gainers = [...coins]
      .sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h)
      .slice(0, 10);

    const losers = [...coins]
      .sort((a, b) => a.price_change_percentage_24h - b.price_change_percentage_24h)
      .slice(0, 10);

    res.json({ gainers, losers });
  } catch (e) {
    res.json({ error: true, message: e.message });
  }
});

// 3 — Heatmap (top 50)
app.get("/heatmap", async (req, res) => {
  try {
    const coins = await getJSON(
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false"
    );

    res.json(coins);
  } catch (e) {
    res.json({ error: true, message: e.message });
  }
});

// 4 — Fear & Greed
app.get("/feargreed", async (req, res) => {
  try {
    const fg = await getJSON(
      "https://api.alternative.me/fng/?limit=1"
    );

    res.json({
      value: fg.data[0].value,
      value_classification: fg.data[0].value_classification
    });
  } catch (e) {
    res.json({ error: true, message: e.message });
  }
});

// 5 — BTC forecast (7 days)
app.get("/btcforecast", async (req, res) => {
  try {
    const chart = await getJSON(
      "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=7&interval=hourly"
    );

    const prices = chart.prices.map(p => p[1]);

    const last = prices[prices.length - 1];
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;

    const forecast = (last * 1.02).toFixed(2); // +2% modello semplice

    res.json({
      last_price: last,
      average_price: avg,
      forecast_price: forecast
    });
  } catch (e) {
    res.json({ error: true, message: e.message });
  }
});

app.listen(3000, () => console.log("API running on port 3000"));
