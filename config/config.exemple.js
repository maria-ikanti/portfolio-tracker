const PORTFOLIO_CONFIG = {
  assets: [
    // ACTIONS — ticker Yahoo Finance
    { id: "AAPL", type: "stock",  symbol: "AAPL",    name: "Apple",   qty: 0 },
    // CRYPTO — ID CoinGecko
    { id: "BTC",  type: "crypto", symbol: "bitcoin",  name: "Bitcoin", qty: 0 },
    // MÉTAUX — oz troy
    { id: "XAU",  type: "metal",  symbol: "gold",     name: "Or",      qty: 0 },
    { id: "XAG",  type: "metal",  symbol: "silver",   name: "Argent",  qty: 0 },
  ],
  currency_display: "EUR",
  snapshot_hour: 17,
};

export default PORTFOLIO_CONFIG;