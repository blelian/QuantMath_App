"use client";

import { useState, useEffect } from "react";

interface Stock {
  symbol: string;
  price: number;
  updatedAt: string;
}

export default function Home() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [stockSymbol, setStockSymbol] = useState("");
  const [quantity, setQuantity] = useState<number | "">("");
  const [price, setPrice] = useState<number | null>(null);
  const [movingAvg, setMovingAvg] = useState<number | null>(null);
  const [aiPrediction, setAiPrediction] = useState<number | null>(null);

  const [chartValues, setChartValues] = useState<number[]>(Array(10).fill(0));

  // Fetch stocks from NestJS API
  useEffect(() => {
    const fetchStocks = async () => {
      try {
        const res = await fetch("https://quantmath-app.onrender.com/stocks");
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data: Stock[] = await res.json();
        setStocks(data);
        setLoading(false);
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    };
    fetchStocks();
  }, []);

  const handleCompute = (e: React.FormEvent) => {
    e.preventDefault();
    const selectedStock = stocks.find((s) => s.symbol === stockSymbol);
    if (selectedStock) {
      setPrice(selectedStock.price);
      setMovingAvg(selectedStock.price * 0.95); // example: mock moving avg
    } else {
      setPrice(null);
      setMovingAvg(null);
    }
  };

  const handleAIPredict = (e: React.FormEvent) => {
    e.preventDefault();
    if (price !== null) {
      setAiPrediction(price * (Math.random() * 0.1 + 0.95)); // mock AI prediction
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#0b0c1b] to-[#1a1c2e] text-[#E0F7FA] font-sans overflow-x-hidden">
      <header className="text-center p-6 bg-[rgba(10,10,30,0.8)] backdrop-blur-md border-b border-[#00E5FF]">
        <h1 className="text-3xl font-bold">QuantMath Stock Dashboard</h1>
      </header>

      <section className="container flex flex-wrap justify-center gap-8 p-8">
        {/* Input Panel */}
        <div className="panel bg-[rgba(10,10,30,0.6)] border border-[#00E5FF] rounded-xl p-8 shadow-lg flex-1 min-w-[300px]">
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
        {price !== null && (
          <div className="panel bg-[rgba(10,10,30,0.6)] border border-[#00E5FF] rounded-xl p-8 shadow-lg flex-1 min-w-[300px]">
            <h2 className="text-xl font-bold mb-4">Output</h2>
            <p>
              <strong>Stock:</strong> {stockSymbol}
            </p>
            <p>
              <strong>Quantity:</strong> {quantity}
            </p>
            <p>
              <strong>Price:</strong> ${price.toFixed(2)}
            </p>
            <p>
              <strong>Moving Avg:</strong> ${movingAvg?.toFixed(2)}
            </p>

            <button
              onClick={handleAIPredict}
              className="mt-4 bg-[rgba(0,229,255,0.2)] border border-[#00E5FF] rounded-xl py-2 font-bold text-[#E0F7FA] shadow-md hover:bg-[rgba(0,229,255,0.4)] hover:scale-105 transition-all"
            >
              Run AI Prediction
            </button>

            {aiPrediction !== null && (
              <p className="mt-2">
                <strong>AI Prediction:</strong> ${aiPrediction.toFixed(2)}
              </p>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
