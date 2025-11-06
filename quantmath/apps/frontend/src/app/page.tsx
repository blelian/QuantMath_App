"use client";

import * as React from "react";
import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";

type StockData = {
  symbol: string;
  price: number;
  history?: { time: string; open: number; high: number; low: number; close: number }[];
};
type StockPrediction = {
  symbol: string;
  predicted_price: number;
  signal?: string;
  confidence?: number;
};

type StockPredictionAug = StockPrediction & {
  signal?: "BUY" | "SELL" | "HOLD" | string;
  confidence?: number;
};

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

export default function Home(): React.JSX.Element {
  const [stocks, setStocks] = useState<StockData[]>([]);
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

  const [computed, setComputed] = useState(false); // <-- NEW: whether Compute ran
  const aiPanelRef = useRef<HTMLDivElement | null>(null);
  const metaRef = useRef<HTMLDivElement | null>(null);
  const [modelMeta, setModelMeta] = useState<any | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setInputVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // fetch stocks + metadata
  useEffect(() => {
    const fetchAll = async () => {
      try {
        const backend = process.env.NEXT_PUBLIC_BACKEND_URLAI ?? "";
        if (!backend) throw new Error("NEXT_PUBLIC_BACKEND_URLAI not set");
        const [resStocks, resMeta] = await Promise.allSettled([
          fetch(`${backend}/stocks/cached`),
          fetch(`${backend}/model/metadata`),
        ]);

        if (resStocks.status === "fulfilled") {
          const r = resStocks.value;
          if (!r.ok) throw new Error(`Failed to fetch stocks: ${r.status}`);
          const data: StockData[] = await r.json();
          setStocks(data);
        } else {
          console.error(resStocks.reason);
          setError("Failed to fetch stocks.");
        }

        if (resMeta.status === "fulfilled") {
          const rm = resMeta.value;
          if (rm.ok) {
            const jm = await rm.json();
            setModelMeta(jm);
          }
        }
      } catch (err) {
        console.error(err);
        setError("Failed to fetch backend data. Check backend URL.");
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  // deterministic small-history generator when no history available
  const generateHistoryFromPrice = (p: number, days = 30) => {
    let seed = Math.floor((p % 1) * 100000) || Math.floor(p % 1000) + 1;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    const out = [];
    const baseDate = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const dt = new Date(baseDate);
      dt.setDate(baseDate.getDate() - i);
      const time = dt.toISOString().slice(0, 10);

      const variability = 0.015 + rand() * 0.02;
      const open = p * (1 + (rand() - 0.5) * variability);
      const close = p * (1 + (rand() - 0.5) * variability);
      const high = Math.max(open, close) * (1 + rand() * 0.01);
      const low = Math.min(open, close) * (1 - rand() * 0.01);
      out.push({
        time,
        open: Number(open.toFixed(4)),
        high: Number(high.toFixed(4)),
        low: Number(low.toFixed(4)),
        close: Number(close.toFixed(4)),
      });
    }
    return out;
  };

  // Reset computed + AI prediction when user selects a different stock
  const onSelectStock = (symbol: string) => {
    setStockSymbol(symbol);
    setComputed(false);
    setAiPrediction(null);
    setShowAI(false);
  };

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

    const rawHistory = stock.history && stock.history.length ? stock.history : generateHistoryFromPrice(stock.price);
    const ohlc = rawHistory.map((h) => ({
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

    // mark that compute has been performed for this selection
    setComputed(true);
    setAiPrediction(null);
    setShowAI(false);

    setTimeout(() => setOutputVisible(true), 200);
  };

  // Confidence helpers
  const normalizeConfidenceToPct = (raw?: number) => {
    if (raw === undefined || raw === null || Number.isNaN(raw)) return 0;
    // backend may return 0-1 or 0-100
    if (raw <= 1) return Math.round(raw * 100);
    return Math.round(Math.min(raw, 100));
  };

  // continuous color from red -> yellow -> green based on percent (0..100)
  const confidenceColor = (pct: number) => {
    const p = Math.max(0, Math.min(100, pct));
    // if p <= 50 => red -> yellow (255, 0, 0) -> (255,255,0)
    // if p > 50 => yellow -> green (255,255,0) -> (0,255,0)
    if (p <= 50) {
      const g = Math.round((p / 50) * 255);
      return `rgb(255,${g},0)`;
    } else {
      const r = Math.round(((100 - p) / 50) * 255);
      return `rgb(${r},255,0)`;
    }
  };

  // AI prediction
  const handleAIPredict = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockSymbol) {
      setError("Select a stock to predict.");
      return;
    }

    // require compute before calling AI
    if (!computed) {
      setError("Press Compute first to enable Run AI Prediction.");
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

      const predicted_price = Number(pred?.predicted_price ?? usedPrice);
      const rawConfidence = typeof pred?.confidence === "number" ? pred.confidence : (pred?.confidence ? Number(pred.confidence) : undefined);
      const pct = normalizeConfidenceToPct(rawConfidence);

      const safePred: StockPredictionAug = {
        symbol: pred?.symbol ?? stockSymbol,
        predicted_price,
        signal: pred?.signal ?? deriveSignal(predicted_price, usedPrice),
        confidence: pct,
      };

      setAiPrediction(safePred);
      setShowAI(true);
      setAIVisible(false);

      setTimeout(() => {
        setAIVisible(true);
        if (aiPanelRef.current) {
          aiPanelRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
          aiPanelRef.current.focus?.();
        }
      }, 200);
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
        return "bg-green-500 text-black";
      case "SELL":
        return "bg-red-500 text-white";
      case "HOLD":
        return "bg-yellow-400 text-black";
      default:
        return "bg-gray-400 text-black";
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
    stroke: { width: [1, 3] },
    plotOptions: {
      candlestick: {
        colors: { upward: "#00E5FF", downward: "#FF6B6B" },
      },
    },
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#0b0c1b] to-[#1a1c2e] text-[#E0F7FA] font-sans overflow-x-hidden">
      <header className="text-center p-6 bg-[rgba(10,10,30,0.8)] backdrop-blur-md border-b border-[#00E5FF]">
        <h1 className="text-3xl font-bold">QuantMath Stock Dashboard</h1>
        <p className="text-sm mt-1 text-[#BEEAF6]">AI predictions powered by TensorFlow + FastAPI</p>
        {modelMeta ? (
          <div ref={metaRef} className="mt-2 text-xs text-[#9CE8FF]">
            Model trained for <strong>{modelMeta.epochs}</strong> epochs — final val_loss:{" "}
            <strong>{modelMeta.final_val_loss?.toFixed?.(6) ?? "n/a"}</strong>
          </div>
        ) : null}
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
              <select id="symbol" value={stockSymbol} onChange={(e) => onSelectStock(e.target.value)}>
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
                  className="flex-1 cursor-pointer bg-[rgba(0,229,255,0.2)] border border-[#00E5FF] rounded-xl py-2 font-bold text-[#E0F7FA] shadow-md hover:bg-[rgba(0,229,255,0.4)] hover:scale-105 focus:outline-none focus:ring-2 focus:ring-[#00E5FF] transition-all"
                >
                  Compute
                </button>

                <button
                  type="button"
                  onClick={handleAIPredict}
                  disabled={!computed || !stockSymbol || (!price && !stocks.find((s) => s.symbol === stockSymbol))}
                  className="flex-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed bg-[rgba(0,229,255,0.15)] border border-[#00E5FF] rounded-xl py-2 font-bold text-[#E0F7FA] shadow-md hover:bg-[rgba(0,229,255,0.35)] hover:scale-105 focus:outline-none focus:ring-2 focus:ring-[#00E5FF] transition-all"
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
            ref={aiPanelRef}
            tabIndex={-1}
            className={`panel bg-[rgba(10,10,30,0.9)] border border-[#00E5FF] rounded-xl p-6 shadow-2xl w-full max-w-[500px] transform transition-all duration-500 ${
              aiVisible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
            }`}
          >
            <h2 className="text-xl font-bold mb-2">AI Prediction</h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[#BEEAF6]">{aiPrediction.symbol}</p>
                <p className="text-2xl font-bold">${aiPrediction.predicted_price.toFixed(4)}</p>
              </div>
              <div className="text-right">
                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded ${signalColor(aiPrediction.signal)}`}>
                  <span className="font-semibold">{aiPrediction.signal}</span>
                </div>
                <p className="text-xs mt-2 text-[#9CE8FF]">Confidence: {Math.round(aiPrediction.confidence ?? 0)}%</p>
                <div className="w-full bg-gray-700 rounded h-3 mt-1 overflow-hidden">
                  <div
                    style={{
                      width: `${Math.round(aiPrediction.confidence ?? 0)}%`,
                      height: "100%",
                      background: confidenceColor(Math.round(aiPrediction.confidence ?? 0)),
                      transition: "width 400ms ease",
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 text-xs text-[#BEEAF6]">
              Note: Predictions are model outputs. See training metadata in the header.
            </div>
          </div>
        )}
      </section>

      <footer className="text-center text-xs text-[#8FDDE8] p-4">
        Tip: Select a stock, press <strong>Compute</strong> to see chart, then <strong>Run AI Prediction</strong>.
      </footer>
    </main>
  );
}
