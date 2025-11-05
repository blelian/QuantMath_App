"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { StockData, StockPrediction } from "../types"; // Optional: define types in separate file

// Dynamically import chart to avoid SSR issues
const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

export default function Home() {
  const [stocks, setStocks] = useState<StockData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [stockSymbol, setStockSymbol] = useState("");
  const [quantity, setQuantity] = useState<number | "">("");
  const [price, setPrice] = useState<number | null>(null);
  const [aiPrediction, setAiPrediction] = useState<StockPrediction | null>(null);
  const [chartData, setChartData] = useState<{ x: string; y: [number, number, number, number] }[]>([]);

  const [showOutput, setShowOutput] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [inputVisible, setInputVisible] = useState(false);
  const [outputVisible, setOutputVisible] = useState(false);
  const [aiVisible, setAIVisible] = useState(false);

  // Animate input panel on mount
  useEffect(() => {
    setTimeout(() => setInputVisible(true), 100);
  }, []);

  // Fetch precached stock data from backend
  useEffect(() => {
    const fetchStocks = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/stocks/cached`);
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        const data: StockData[] = await res.json();
        setStocks(data);
      } catch (err) {
        console.error(err);
        setError("Failed to fetch precached stock data.");
      } finally {
        setLoading(false);
      }
    };
    fetchStocks();
  }, []);

  // Compute output panel values
  const handleCompute = (e: React.FormEvent) => {
    e.preventDefault();
    const selectedStock = stocks.find((s) => s.symbol === stockSymbol);
    if (selectedStock) {
      setPrice(selectedStock.price);
      // Prepare candlestick data for chart (OHLC)
      setChartData(selectedStock.history || []); // `history` field should be in cached stock data
      setShowOutput(true);
      setTimeout(() => setOutputVisible(true), 200);
    }
  };

  // Fetch AI prediction
  const handleAIPredict = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!price || !stockSymbol) return;

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{ symbol: stockSymbol, price }]),
      });
      const [prediction]: StockPrediction[] = await res.json();
      setAiPrediction(prediction);
      setShowAI(true);
      setTimeout(() => setAIVisible(true), 200);
    } catch (err) {
      console.error("AI prediction failed:", err);
    }
  };

  // Helper: signal color
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

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#0b0c1b] to-[#1a1c2e] text-[#E0F7FA] font-sans overflow-x-hidden">
      <header className="text-center p-6 bg-[rgba(10,10,30,0.8)] backdrop-blur-md border-b border-[#00E5FF]">
        <h1 className="text-3xl font-bold">QuantMath Stock Dashboard</h1>
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
            <p className="text-red-500">{error}</p>
          ) : (
            <form onSubmit={handleCompute} className="flex flex-col gap-4">
              <label htmlFor="symbol">Stock Symbol</label>
              <select
                id="symbol"
                value={stockSymbol}
                onChange={(e) => setStockSymbol(e.target.value)}
              >
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
                onChange={(e) =>
                  setQuantity(e.target.value ? parseInt(e.target.value) : "")
                }
              />

              <button
                type="submit"
                className="bg-[rgba(0,229,255,0.2)] border border-[#00E5FF] rounded-xl py-2 font-bold text-[#E0F7FA] shadow-md hover:bg-[rgba(0,229,255,0.4)] hover:scale-105 transition-all"
              >
                Compute
              </button>
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
              <strong>Quantity:</strong> {quantity}
            </p>
            <p>
              <strong>Price:</strong> ${price?.toFixed(2)}
            </p>

            {/* Candlestick chart */}
            {chartData.length > 0 && (
              <Chart
                type="candlestick"
                height={300}
                series={[
                  {
                    data: chartData,
                  },
                  ...(aiPrediction
                    ? [
                        {
                          name: "AI Prediction",
                          type: "line",
                          data: chartData.map((c, i) => [
                            c.x,
                            aiPrediction.predicted_price,
                          ]),
                        },
                      ]
                    : []),
                ]}
                options={{
                  chart: { id: "stock-chart", animations: { enabled: true } },
                  xaxis: { type: "category" },
                  yaxis: { tooltip: { enabled: true } },
                  tooltip: { enabled: true },
                  theme: { mode: "dark" },
                }}
              />
            )}

            <button
              onClick={handleAIPredict}
              className="mt-4 bg-[rgba(0,229,255,0.2)] border border-[#00E5FF] rounded-xl py-2 font-bold text-[#E0F7FA] shadow-md hover:bg-[rgba(0,229,255,0.4)] hover:scale-105 transition-all"
            >
              Run AI Prediction
            </button>
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
            <p>
              <strong>Signal:</strong>{" "}
              <span className={`px-2 py-1 rounded ${signalColor(aiPrediction.signal)}`}>
                {aiPrediction.signal}
              </span>
            </p>
            <p>
              <strong>Confidence:</strong>{" "}
              <span className="block bg-gray-700 rounded h-3 w-full mt-1">
                <span
                  className="bg-blue-400 h-3 rounded block"
                  style={{ width: `${aiPrediction.confidence}%` }}
                ></span>
              </span>
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
