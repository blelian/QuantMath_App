// src/types.ts

// Represents a single stock in your precached data
export interface OHLCData {
  x: string; // date or timestamp
  y: [number, number, number, number]; // [open, high, low, close]
}

export interface StockData {
  symbol: string;
  price: number;
  history?: OHLCData[]; // optional candlestick data
}

// Represents the AI prediction for a stock
export interface StockPrediction {
  symbol: string;
  predicted_price: number;
  signal: "BUY" | "SELL" | "HOLD"; // trading recommendation
  confidence: number; // percentage 0-100
}
