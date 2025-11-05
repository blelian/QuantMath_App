// src/types.ts

// Individual OHLC (Open, High, Low, Close) data point for candlestick chart
export interface OHLCData {
  time: string;       // Timestamp or date string
  open: number;
  high: number;
  low: number;
  close: number;
}

// Stock data with optional historical price data
export interface StockData {
  symbol: string;
  price: number;
  history?: OHLCData[]; // Optional array of historical OHLC data
}

// Predicted stock price data
export interface StockPrediction {
  symbol: string;
  predicted_price: number;
}
