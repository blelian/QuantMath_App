// src/types.ts

// Represents historical OHLC (Open, High, Low, Close) data for a stock
export interface OHLCData {
  time: string;       // e.g., "2025-11-05T14:30:00Z"
  open: number;
  high: number;
  low: number;
  close: number;
}

// Represents a stock with current price and optional historical data
export interface StockData {
  symbol: string;
  price: number;
  history?: OHLCData[];  // Optional: may not always have history
}

// Represents AI predictions for a stock
export interface StockPrediction {
  symbol: string;
  predicted_price: number;
  signal: "BUY" | "SELL" | "HOLD";  // Trading signal
  confidence: number;               // 0–100%
}
