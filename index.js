// Backend Node.js + Express + Ethers.js
// ------------------------------
// INSTALLA:
// npm install express cors ethers axios dotenv
// CREA .env con:
// RPC_ETH=https://mainnet.infura.io/v3/xxx
// RPC_BSC=https://bsc-dataseed.binance.org
// RPC_POLYGON=https://polygon-rpc.com
// ETHERSCAN_KEY=xxxxx

const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();
const { ethers } = require("ethers");

import cors from "cors";
import axios from "axios";
import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Providers per le chain
const providers = {
  ethereum: new ethers.JsonRpcProvider(process.env.RPC_ETH),
  bsc: new ethers.JsonRpcProvider(process.env.RPC_BSC),
  polygon: new ethers.JsonRpcProvider(process.env.RPC_POLYGON),
};

// ----------------------
// FUNZIONE PRINCIPALE DI SCAN
// ----------------------
app.post("/api/scan", async (req, res) => {
  try {
    const { network, address } = req.body;

    if (!providers[network]) return res.status(400).json({ error: "Network non supportato" });
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return res.status(400).json({ error: "Address non valido" });

    const provider = providers[network];

    // 1) Ottieni bytecode
    const bytecode = await provider.getCode(address);
    if (bytecode === "0x") return res.status(404).json({ error: "Contract non trovato" });

    // 2) Ottieni ABI da Etherscan (solo ETH nella demo)
    let abi = [];
    let sourceVerified = false;
    try {
      if (network === "ethereum") {
        const resp = await axios.get(
          `https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${address}&apikey=${process.env.ETHERSCAN_KEY}`
        );
        const data = resp.data?.result?.[0];
        if (data && data.ABI && data.ABI !== "Contract source code not verified") {
          abi = JSON.parse(data.ABI);
          sourceVerified = true;
        }
      }
    } catch (e) {}

    // 3) Controlli principali
    const checks = [];

    // CONTROLLA FUNZIONI SOSPETTE
    const suspicious = ["mint", "setFee", "blacklist", "pause", "owner", "transferOwnership"];
    let foundSuspicious = suspicious.filter((s) => bytecode.toLowerCase().includes(s.toLowerCase()));

    checks.push({ title: "Funzioni sospette", status: foundSuspicious.length ? "bad" : "ok", description: "Ricerca nel bytecode", value: foundSuspicious.join(", ") || "None" });

    // 4) SCORE
    let score = 80;
    if (foundSuspicious.length >= 3) score -= 25;
    if (!sourceVerified) score -= 10;
    if (score < 10) score = 10;

    const response = {
      address,
      network,
      name: "Unknown",
      symbol: "?",
      holders: "N/A",
      liquidity: "N/A",
      explorer: network === "ethereum" ? `https://etherscan.io/token/${address}` : "",
      score,
      bytecodeSnippet: bytecode.slice(0, 300) + "...",
      checks,
    };

    res.json(response);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno" });
  }
});

app.listen(3001, () => console.log("Backend attivo su http://localhost:3001"));

