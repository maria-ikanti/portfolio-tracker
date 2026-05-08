import { useState, useEffect, useCallback, useRef } from "react";
import "./portfolio.css";
import PORTFOLIO_CONFIG from "../config/config.js";

// ============================================================
// UTILITAIRES
// ============================================================

const API_URL = "http://localhost:3001/api/snapshots";

async function loadHistory() {
  try {
    const r = await fetch(API_URL);
    return await r.json();
  } catch { return []; }
}

async function saveHistory(history) {
  try {
    await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(history),
    });
  } catch { console.warn("Snapshot save failed"); }
}

function formatCurrency(val, currency = "EUR") {
  if (val == null || isNaN(val)) return "—";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 0 }).format(val);
}

function formatPct(pct) {
  if (pct == null || isNaN(pct)) return "";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// ============================================================
// API FETCHERS
// ============================================================
async function fetchEurRate() {
  try {
    const r = await fetch("https://api.frankfurter.dev/v1/latest?from=USD&to=EUR");
    if (!r.ok) {
      console.error(`❌ EUR rate : HTTP ${r.status}`);
      return null;
    }
    const d = await r.json();
    const rate = d.rates?.EUR ?? null;
    if (!rate) console.error("❌ EUR rate : taux non trouvé dans la réponse", d);
    return rate;
  } catch (e) {
    console.error("❌ EUR rate :", e.message);
    return null;
  }
}

async function fetchCryptoPrices(symbols) {
  const ids = symbols.join(",");
  const r = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`
  );
  return await r.json();
}

async function fetchMetalPrices() {
  let gold = null;
  let silver = null;

  // Or via PAXG (CoinGecko)
  try {
    const r = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd"
    );
    const d = await r.json();
    gold = d["pax-gold"]?.usd ?? null;
    if (!gold) console.warn("⚠️ Or : prix non trouvé dans la réponse CoinGecko");
  } catch (e) {
    console.error("❌ Or (CoinGecko) :", e.message);
  }

  // Argent via CoinGecko — token XAGUSD (silver stablecoin)
  try {
    const r = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=silver&vs_currencies=usd"
    );
    const d = await r.json();
    console.log("🔍 Réponse CoinGecko silver :", JSON.stringify(d));
    silver = d["silver"]?.usd ?? null;
    if (!silver) console.warn("⚠️ Argent : prix non trouvé dans la réponse CoinGecko");
  } catch (e) {
    console.error("❌ Argent (CoinGecko) :", e.message);
  }

  // Fallback visible
  if (!gold) {
    console.warn("⚠️ Utilisation du fallback or : 3300");
    gold = 3300;
  }
  if (!silver) {
    console.warn("⚠️ Utilisation du fallback argent : 80");
    silver = 80;
  }

  return { gold, silver };
}

async function fetchStockPrice(symbol) {
  // Source 1 : allorigins proxy (Yahoo Finance)
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
    const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const r = await fetch(proxy);
    const d = await r.json();
    const price = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (price) return price;
  } catch {}

  // Source 2 : corsproxy.io (Yahoo Finance)
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
    const proxy = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    const r = await fetch(proxy);
    const d = await r.json();
    const price = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (price) return price;
  } catch {}

  // Source 3 : Twelve Data (gratuit, 800 req/jour sans clé)
  try {
    const r = await fetch(`https://api.twelvedata.com/price?symbol=${symbol}&apikey=demo`);
    const d = await r.json();
    if (d?.price) return parseFloat(d.price);
  } catch {}

  return null;
}

// ============================================================
// CONSTANTES
// ============================================================
const TYPE_COLORS = { stock: "#7c9dff", crypto: "#f7931a", metal: "#f4d03f" };
const TYPE_LABELS = { stock: "Actions", crypto: "Crypto", metal: "Métaux" };
const TABS = [
  { id: "dashboard", label: "Actifs" },
  { id: "chart",     label: "Courbe" },
  { id: "history",   label: "Historique" },
];

// ============================================================
// COMPOSANT PRINCIPAL
// ============================================================
export default function PortfolioTracker() {
  const [prices, setPrices]         = useState({});
  const [eurRate, setEurRate]       = useState(0.92);
  const [loading, setLoading]       = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError]           = useState(null);
  const [activeTab, setActiveTab]   = useState("dashboard");
  const snapshotDoneRef             = useRef(false);
  const canvasRef                   = useRef(null);
  const config                      = PORTFOLIO_CONFIG;

  // ── Calcul valeurs ──────────────────────────────────────
  const getPrice = useCallback((asset) => {
    if (asset.type === "crypto") return prices[asset.symbol]?.usd ?? null;
    if (asset.type === "metal")  return prices[asset.symbol] ?? null;
    if (asset.type === "stock")  return prices[asset.symbol] ?? null;
    return null;
  }, [prices]);

  const getValueUSD = useCallback((asset) => {
    const p = getPrice(asset);
    return p != null ? p * asset.qty : null;
  }, [getPrice]);

  const totalUSD = config.assets.reduce((sum, a) => sum + (getValueUSD(a) ?? 0), 0);
  const totalEUR = totalUSD * eurRate;

  const [history, setHistory] = useState([]);

  // Charge l'historique au démarrage
  useEffect(() => {
    loadHistory().then(setHistory);
  }, []);

  // ── Fetch toutes les données ─────────────────────────────
const fetchAll = useCallback(async () => {
  setLoading(true);
  setError(null);
  try {
  const [eur, metals] = await Promise.all([fetchEurRate(), fetchMetalPrices()]);

  if (eur) {
    setEurRate(eur);
  } else {
    console.warn("⚠️ Taux EUR non mis à jour — utilisation du dernier taux connu :", eurRate);
    setError("Taux EUR indisponible — valeurs approximatives.");
  }

    const cryptoSymbols = config.assets.filter(a => a.type === "crypto").map(a => a.symbol);
    let cryptoData = {};
    try {
      cryptoData = cryptoSymbols.length > 0 ? await fetchCryptoPrices(cryptoSymbols) : {};
    } catch { console.warn("Crypto fetch failed"); }

    const stockAssets = config.assets.filter(a => a.type === "stock");
    const stockResults = await Promise.allSettled(stockAssets.map(a => fetchStockPrice(a.symbol)));
    const stockData = {};
    stockAssets.forEach((a, i) => {
      if (stockResults[i].status === "fulfilled") stockData[a.symbol] = stockResults[i].value;
    });

    setPrices({ ...cryptoData, ...metals, ...stockData });
    setLastUpdate(new Date());
  } catch(e) {
    console.error("fetchAll error:", e);
    setError("Erreur lors de la récupération des prix.");
  }
  setLoading(false);
}, [config.assets]);

  // ── Snapshot 17h ────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const key = todayKey();
      if (now.getHours() === config.snapshot_hour && now.getMinutes() === 0 && !snapshotDoneRef.current) {
        snapshotDoneRef.current = true;
        const snap = {
          date: key,
          timestamp: now.toISOString(),
          totalEUR: totalUSD * eurRate,
          totalUSD,
          assets: config.assets.map(a => ({ id: a.id, price: getPrice(a), value: getValueUSD(a) })),
        };
        setHistory(prev => {
          const next = [...prev.filter(h => h.date !== key), snap].slice(-365);
          saveHistory(next);
          return next;
        });
      }
      if (now.getHours() === 0 && now.getMinutes() === 0) snapshotDoneRef.current = false;
    }, 60_000);
    return () => clearInterval(interval);
  }, [totalUSD, eurRate, config, getPrice, getValueUSD]);

  useEffect(() => { fetchAll(); }, []);
  useEffect(() => {
    const t = setInterval(fetchAll, 5 * 60_000);
    return () => clearInterval(t);
  }, [fetchAll]);

  // ── Chart Canvas ─────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== "chart" || !canvasRef.current || history.length < 2) return;
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d");
    canvas.width  = canvas.offsetWidth  * window.devicePixelRatio;
    canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    const cW = canvas.offsetWidth;
    const cH = canvas.offsetHeight;

    const data = history.filter(h => h.totalEUR > 0);
    if (data.length < 2) return;

    const vals = data.map(h => h.totalEUR);
    const minV = Math.min(...vals) * 0.97;
    const maxV = Math.max(...vals) * 1.03;
    const pad  = { t: 30, r: 20, b: 50, l: 70 };
    const w    = cW - pad.l - pad.r;
    const h    = cH - pad.t - pad.b;

    ctx.clearRect(0, 0, cW, cH);
    ctx.fillStyle = "#0a0e1a";
    ctx.fillRect(0, 0, cW, cH);

    const xOf = (i) => pad.l + (i / (data.length - 1)) * w;
    const yOf = (v) => pad.t + (1 - (v - minV) / (maxV - minV)) * h;

    // Grid
    for (let i = 0; i <= 5; i++) {
      const y   = pad.t + (h / 5) * i;
      const val = maxV - ((maxV - minV) / 5) * i;
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth   = 1;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + w, y); ctx.stroke();
      ctx.fillStyle  = "rgba(255,255,255,0.35)";
      ctx.font       = "11px 'DM Mono', monospace";
      ctx.textAlign  = "right";
      ctx.fillText(formatCurrency(val), pad.l - 8, y + 4);
    }

    // Gradient fill
    const grad = ctx.createLinearGradient(pad.l, pad.t, pad.l, pad.t + h);
    grad.addColorStop(0, "rgba(99,220,160,0.5)");
    grad.addColorStop(1, "rgba(99,220,160,0.0)");

    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(vals[0]));
    for (let i = 1; i < data.length; i++) {
      const cpx = (xOf(i - 1) + xOf(i)) / 2;
      ctx.bezierCurveTo(cpx, yOf(vals[i - 1]), cpx, yOf(vals[i]), xOf(i), yOf(vals[i]));
    }
    ctx.lineTo(xOf(data.length - 1), pad.t + h);
    ctx.lineTo(xOf(0), pad.t + h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Courbe
    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(vals[0]));
    for (let i = 1; i < data.length; i++) {
      const cpx = (xOf(i - 1) + xOf(i)) / 2;
      ctx.bezierCurveTo(cpx, yOf(vals[i - 1]), cpx, yOf(vals[i]), xOf(i), yOf(vals[i]));
    }
    ctx.strokeStyle = "#63dca0";
    ctx.lineWidth   = 2.5;
    ctx.stroke();

    // Points & labels
    const step = Math.ceil(data.length / Math.min(data.length, 8));
    data.forEach((d, i) => {
      ctx.beginPath();
      ctx.arc(xOf(i), yOf(vals[i]), 3.5, 0, Math.PI * 2);
      ctx.fillStyle = "#63dca0";
      ctx.fill();
      if (i % step === 0 || i === data.length - 1) {
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.font      = "10px 'DM Mono', monospace";
        ctx.textAlign = "center";
        ctx.fillText(d.date.slice(5), xOf(i), cH - pad.b + 18);
      }
    });

    // Variation totale
    const pctChange = ((vals[vals.length - 1] - vals[0]) / vals[0]) * 100;
    ctx.fillStyle  = pctChange >= 0 ? "#63dca0" : "#ff6b6b";
    ctx.font       = "bold 13px 'DM Mono', monospace";
    ctx.textAlign  = "left";
    ctx.fillText(`${formatPct(pctChange)} depuis le début`, pad.l + 4, pad.t - 8);
  }, [activeTab, history]);

  // ── Variation depuis hier ────────────────────────────────
  const yesterday = history.length >= 2 ? history[history.length - 2]?.totalEUR : null;
  const changeEUR = yesterday != null ? totalEUR - yesterday : null;
  const changePct = yesterday != null && yesterday > 0 ? ((totalEUR - yesterday) / yesterday) * 100 : null;

  // ── Générer données démo ─────────────────────────────────
  const generateDemo = () => {
    if (history.length >= 2) return;
    const demo = [];
    const base = totalEUR > 0 ? totalEUR : 50000;
    for (let i = 29; i >= 0; i--) {
      const d     = new Date();
      d.setDate(d.getDate() - i);
      const noise = 1 + (Math.random() - 0.48) * 0.025;
      const prev  = demo.length > 0 ? demo[demo.length - 1].totalEUR : base;
      demo.push({ date: d.toISOString().slice(0, 10), timestamp: d.toISOString(), totalEUR: prev * noise, totalUSD: (prev * noise) / eurRate });
    }
    saveHistory(demo);
    setHistory(demo);
  };

  // ============================================================
  // RENDU
  // ============================================================
  return (
    <div className="app">

      {/* ── Header ── */}
      <header className="header">
        <div className="header-top">
          <div className="header-left">
            <div className="label">◆ Portfolio Tracker</div>
            <h1>{formatCurrency(totalEUR, "EUR")}</h1>
            <div className="subtitle">
              ≈ {formatCurrency(totalUSD, "USD")} · 1€ = {(1 / eurRate).toFixed(4)} USD
            </div>
          </div>

          <div className="header-right">
            {changeEUR != null && (
              <div className={`change-badge ${changeEUR >= 0 ? "positive" : "negative"}`}>
                <div className="change-amount">
                  {changeEUR >= 0 ? "+" : ""}{formatCurrency(changeEUR, "EUR")}
                </div>
                <div className="change-label">
                  {formatPct(changePct)} vs snapshot d'hier
                </div>
              </div>
            )}
            <div className="refresh-bar">
              {loading && <span className="pulse" style={{ fontSize: 11, color: "#63dca0" }}>⟳ Mise à jour…</span>}
              {lastUpdate && !loading && (
                <span className="last-update">
                  {lastUpdate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
              <button className="btn-refresh" onClick={fetchAll} disabled={loading}>
                ↺ Rafraîchir
              </button>
            </div>
          </div>
        </div>

        <nav className="tabs">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      {error && <div className="error-bar">⚠ {error}</div>}

      {/* ── Tab: Dashboard ── */}
      {activeTab === "dashboard" && (
        <div className="tab-content">
          <div className="type-cards">
            {["stock", "crypto", "metal"].map(type => {
              const typeTotal = config.assets
                .filter(a => a.type === type)
                .reduce((s, a) => s + (getValueUSD(a) ?? 0), 0) * eurRate;
              const pct = totalEUR > 0 ? (typeTotal / totalEUR) * 100 : 0;
              return (
                <div key={type} className="type-card">
                  <div className="type-label" style={{ color: TYPE_COLORS[type] }}>
                    {TYPE_LABELS[type]}
                  </div>
                  <div className="type-value">{formatCurrency(typeTotal)}</div>
                  <div className="type-bar-track">
                    <div className="type-bar-fill" style={{ width: `${pct}%`, background: TYPE_COLORS[type] }} />
                  </div>
                  <div className="type-pct">{pct.toFixed(1)}%</div>
                </div>
              );
            })}
          </div>

          <div className="assets-table">
            <div className="table-header">
              <span>Actif</span>
              <span>Quantité</span>
              <span>Prix</span>
              <span>Valeur USD</span>
              <span>Valeur EUR</span>
            </div>

            {config.assets.map((asset) => {
              const p    = getPrice(asset);
              const vUSD = getValueUSD(asset);
              const vEUR = vUSD != null ? vUSD * eurRate : null;
              const pct  = vEUR != null && totalEUR > 0 ? (vEUR / totalEUR) * 100 : 0;
              return (
                <div key={asset.id} className="asset-row">
                  <div className="asset-cell">
                    <span className="asset-dot" style={{ background: TYPE_COLORS[asset.type] }} />
                    <div>
                      <div className="asset-name">{asset.name}</div>
                      <div className="asset-id">{asset.id}</div>
                    </div>
                  </div>
                  <div className="cell-right">{asset.qty.toLocaleString("fr-FR")}</div>
                  <div className="cell-right">
                    {p != null
                      ? `$${p.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}`
                      : <span className="pulse" style={{ color: "rgba(255,255,255,0.2)" }}>…</span>
                    }
                  </div>
                  <div className="cell-right">{vUSD != null ? formatCurrency(vUSD, "USD") : "—"}</div>
                  <div className="cell-value-eur">
                    <div className="value">{vEUR != null ? formatCurrency(vEUR, "EUR") : "—"}</div>
                    <div className="pct">{pct > 0 ? `${pct.toFixed(1)}%` : ""}</div>
                  </div>
                </div>
              );
            })}

            <div className="table-total">
              <div className="total-label">TOTAL</div>
              <div /><div />
              <div className="total-usd">{formatCurrency(totalUSD, "USD")}</div>
              <div className="total-eur">{formatCurrency(totalEUR, "EUR")}</div>
            </div>
          </div>

          <div className="snapshot-info">
            📸 Snapshot automatique tous les jours à {config.snapshot_hour}h00 · {history.length} snapshot(s) enregistré(s)
          </div>
        </div>
      )}

      {/* ── Tab: Chart ── */}
      {activeTab === "chart" && (
        <div className="tab-content">
          <div className="chart-toolbar">
            <div className="chart-subtitle">Valeur totale du portfolio (snapshots 17h quotidiens)</div>
            <button className="btn-demo" onClick={generateDemo}>
              {history.length < 2 ? "⊕ Générer données démo" : `${history.length} jours`}
            </button>
          </div>

          {history.length < 2 ? (
            <div className="chart-empty">
              <div className="icon">📈</div>
              <div className="title">Pas encore assez de données</div>
              <div className="desc">Les snapshots s'accumulent tous les jours à 17h</div>
              <div className="hint">Clique sur "Générer données démo" pour prévisualiser</div>
            </div>
          ) : (
            <canvas ref={canvasRef} className="chart-canvas" />
          )}
        </div>
      )}

      {/* ── Tab: Historique ── */}
      {activeTab === "history" && (
        <div className="tab-content">
          <div className="history-toolbar">
            <div className="history-count">{history.length} snapshot(s) enregistré(s)</div>
            <button className="btn-clear" onClick={() => { saveHistory([]); setHistory([]); }}>
              ✕ Effacer l'historique
            </button>
          </div>

          {history.length === 0 ? (
            <div className="history-empty">Aucun snapshot enregistré</div>
          ) : (
            <div className="history-table">
              <div className="history-header">
                <span>Date</span>
                <span>Heure</span>
                <span>Total EUR</span>
                <span>Variation</span>
              </div>
              {[...history].reverse().map((snap, i, arr) => {
                const prev = arr[i + 1];
                const chg  = prev ? ((snap.totalEUR - prev.totalEUR) / prev.totalEUR) * 100 : null;
                return (
                  <div key={snap.date} className="history-row">
                    <div className="history-date">{snap.date}</div>
                    <div className="history-time">
                      {new Date(snap.timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <div className="history-total">{formatCurrency(snap.totalEUR)}</div>
                    <div className={`history-change ${chg == null ? "" : chg >= 0 ? "positive" : "negative"}`}>
                      {chg != null ? formatPct(chg) : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
