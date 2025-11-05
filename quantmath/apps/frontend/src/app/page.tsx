"use client";

/**
 * src/app/page.tsx
 * QuantMath Stock Dashboard:
 * - Compute quantity-adjusted chart
 * - AI prediction line
 * - TypeScript-safe
 * - Smooth panel animations
 */

import * as React from "react";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import type { StockData, StockPrediction } from "../types";
import type { ApexOptions } from "apexcharts";

type StockPredictionAug = StockPrediction & {
  signal?: "BUY" | "SELL" | "HOLD" | string;
  confidence?: number;
};

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

export default function Home(): React.JSX.Element {
  const [stocks, setStocks] = useState<(StockData & { history?: StockData["history"] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [stockSymbol, setStockSymbol] = useState("");
  const [quantity, setQuantity] = useState<number | "">("");
  const [price, setPrice] = useState<number | null>(null);
  const [aiPrediction, setAiPrediction] = useState<StockPredictionAug | null>(null);

  const [chartData, setChartData] = useState<{ x: string; y: [number, number, number, number] }[]>([]);
  const [showOutput, setShowOutput] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [inputVisible, setInputVisible] = useState(false);
  const [outputVisible, setOutputVisible] = useState(false);
  const [aiVisible, setAIVisible] = useState(false);

  // Animate input panel
  useEffect(() => {
    const timer = setTimeout(() => setInputVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Fetch cached stocks
  useEffect(() => {
    const fetchStocks = async () => {
      try {
        const backend = process.env.NEXT_PUBLIC_BACKEND_URLAI ?? "";
        if (!backend) throw new Error("NEXT_PUBLIC_BACKEND_URLAI not set");

        const res = await fetch(`${backend}/stocks/cached`);
        if (!res.ok) throw new Error(`Failed to fetch stocks: ${res.status}`);

        const data: (StockData & { history?: StockData["history"] })[] = await res.json();
        setStocks(data);
      } catch (err) {
        console.error(err);
        setError("Failed to fetch stocks. Check backend URL.");
      } finally {
        setLoading(false);
      }
    };
    fetchStocks();
  }, []);

  // Compute chart with quantity adjustment
  const handleCompute = (e: React.FormEvent) => {
    e.preventDefault();
    const stock = stocks.find((s) => s.symbol === stockSymbol);
    if (!stock) {
      setError("Select a valid stock before computing.");
      return;
    }
    setError(null);

    const qty = quantity || 1;
    setPrice(stock.price);

    const ohlc = (stock.history || []).map((h) => ({
      x: h.time,
      y: [
        h.open * qty,
        h.high * qty,
        h.low * qty,
        h.close * qty,
      ] as [number, number, number, number],
    }));

    setChartData(ohlc);
    setShowOutput(true);
    setOutputVisible(false);

    setTimeout(() => setOutputVisible(true), 200);
  };

  // AI prediction
  const handleAIPredict = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockSymbol) {
      setError("Select a stock to predict.");
      return;
    }

    const stock = stocks.find((s) => s.symbol === stockSymbol);
    const usedPrice = price ?? stock?.price ?? null;
    if (usedPrice === null) {
      setError("Price not available. Press Compute or check stock.");
      return;
    }

    setError(null);
    try {
      const backend = process.env.NEXT_PUBLIC_BACKEND_URLAI ?? "";
      if (!backend) throw new Error("NEXT_PUBLIC_BACKEND_URLAI not set");

      const res = await fetch(`${backend}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{ symbol: stockSymbol, price: usedPrice }]),
      });
      if (!res.ok) throw new Error(`Prediction failed: ${res.status}`);

      const resp = await res.json();
      const [pred] = Array.isArray(resp) ? resp : [resp];

      const safePred: StockPredictionAug = {
        symbol: pred?.symbol ?? stockSymbol,
        predicted_price: Number(pred?.predicted_price ?? usedPrice),
        signal: pred?.signal ?? deriveSignal(Number(pred?.predicted_price ?? usedPrice), usedPrice),
        confidence: typeof pred?.confidence === "number" ? pred.confidence : 50,
      };

      setAiPrediction(safePred);
      setShowAI(true);
      setAIVisible(false);

      setTimeout(() => setAIVisible(true), 200);
    } catch (err) {
      console.error(err);
      setError("AI prediction failed. Check backend logs or network.");
    }
  };

  const deriveSignal = (pred: number, curr: number) => {
    const pct = ((pred - curr) / curr) * 100;
    if (pct >= 1) return "BUY";
    if (pct <= -1) return "SELL";
    return "HOLD";
  };

  const signalColor = (signal?: string) => {
    switch (signal) {
      case "BUY":
        return "bg-green-500";
      case "SELL":
        return "bg-red-500";
      case "HOLD":
        return "bg-yellow-400";
      default:
        return "bg-gray-400";
    }
  };

  // Chart series
  const series = [
    { name: "Price", type: "candlestick" as const, data: chartData },
    ...(aiPrediction && chartData.length > 0
      ? [
          {
            name: "AI Prediction",
            type: "line" as const,
            data: chartData.map((c) => ({ x: c.x, y: aiPrediction.predicted_price })),
          },
        ]
      : []),
  ];

  const chartOptions: ApexOptions = {
    chart: { id: "stock-chart", animations: { enabled: true } },
    xaxis: { type: "category" },
    yaxis: { tooltip: { enabled: true } },
    tooltip: { enabled: true },
    theme: { mode: "dark" },
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#0b0c1b] to-[#1a1c2e] text-[#E0F7FA] font-sans overflow-x-hidden">
      <header className="text-center p-6 bg-[rgba(10,10,30,0.8)] backdrop-blur-md border-b border-[#00E5FF]">
        <h1 className="text-3xl font-bold">QuantMath Stock Dashboard</h1>
        <p className="text-sm mt-1 text-[#BEEAF6]">AI predictions powered by TensorFlow + FastAPI</p>
      </header>

      <section className="container flex flex-wrap justify-center gap-8 p-8">
        {/* Input Panel */}
        <div
          className={`panel bg-[rgba(10,10,30,0.6)] border border-[#00E5FF] rounded-xl p-8 shadow-lg flex-1 min-w-[300px] transform transition-all duration-700 ${
            inputVisible ? "translate-x-0 opacity-100" : "-translate-x-full opacity-0"
          }`}
        >
          <h2 className="text-xl font-bold mb-4">Stock Input</h2>

          {loading ? (
            <p>Loading stocks...</p>
          ) : error ? (
            <p className="text-red-400">{error}</p>
          ) : (
            <form onSubmit={handleCompute} className="flex flex-col gap-4">
              <label htmlFor="symbol">Stock Symbol</label>
              <select id="symbol" value={stockSymbol} onChange={(e) => setStockSymbol(e.target.value)}>
                <option value="">Select stock</option>
                {stocks.map((s) => (
                  <option key={s.symbol} value={s.symbol}>
                    {s.symbol}
                  </option>
                ))}
              </select>

              <label htmlFor="quantity">Quantity</label>
              <input
                type="number"
                id="quantity"
                placeholder="e.g. 100"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value ? parseInt(e.target.value) : "")}
              />

              <div className="flex gap-3 mt-2">
                <button
                  type="submit"
                  className="flex-1 bg-[rgba(0,229,255,0.2)] border border-[#00E5FF] rounded-xl py-2 font-bold text-[#E0F7FA] shadow-md hover:bg-[rgba(0,229,255,0.4)] hover:scale-105 transition-all"
                >
                  Compute
                </button>

                <button
                  type="button"
                  onClick={handleAIPredict}
                  disabled={!stockSymbol || (!price && !stocks.find((s) => s.symbol === stockSymbol))}
                  className="flex-1 disabled:opacity-50 disabled:cursor-not-allowed bg-[rgba(0,229,255,0.15)] border border-[#00E5FF] rounded-xl py-2 font-bold text-[#E0F7FA] shadow-md hover:bg-[rgba(0,229,255,0.35)] hover:scale-105 transition-all"
                >
                  Run AI Prediction
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Output Panel */}
        {showOutput && (
          <div
            className={`panel bg-[rgba(10,10,30,0.6)] border border-[#00E5FF] rounded-xl p-8 shadow-lg flex-1 min-w-[300px] transform transition-all duration-700 ${
              outputVisible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"
            }`}
          >
            <h2 className="text-xl font-bold mb-4">Output</h2>
            <p>
              <strong>Stock:</strong> {stockSymbol}
            </p>
            <p>
              <strong>Quantity:</strong> {quantity || "—"}
            </p>
            <p>
              <strong>Price per unit:</strong> ${price !== null ? price.toFixed(2) : "—"}
            </p>

            {typeof Chart !== "undefined" ? (
              <Chart type="candlestick" height={350} series={series as any} options={chartOptions} />
            ) : (
              <p className="mt-4">Chart not loaded (check package or SSR).</p>
            )}
          </div>
        )}

        {/* AI Prediction Panel */}
        {showAI && aiPrediction && (
          <div
            className={`panel bg-[rgba(10,10,30,0.6)] border border-[#00E5FF] rounded-xl p-8 shadow-lg flex-1 min-w-[300px] transform transition-all duration-700 ${
              aiVisible ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
            }`}
          >
            <h2 className="text-xl font-bold mb-4">AI Prediction</h2>
            <p>
              <strong>Predicted Price:</strong> ${aiPrediction.predicted_price.toFixed(2)}
            </p>
            <p className="flex items-center gap-3 mt-2">
              <strong>Signal:</strong>
              <span className={`px-2 py-1 rounded ${signalColor(aiPrediction.signal)}`}>{aiPrediction.signal}</span>
            </p>
            <p className="mt-3">
              <strong>Confidence:</strong>
              <div className="w-full bg-gray-700 rounded h-3 mt-1">
                <div
                  className="bg-blue-400 h-3 rounded"
                  style={{ width: `${Math.max(0, Math.min(100, aiPrediction.confidence ?? 50))}%` }}
                />
              </div>
            </p>
          </div>
        )}
      </section>

      <footer className="text-center text-xs text-[#8FDDE8] p-4">
        Tip: Select a stock, press <strong>Compute</strong> to see chart, then <strong>Run AI Prediction</strong>.
      </footer>
    </main>
  );
}
