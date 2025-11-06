# main.py
import os
import json
import ssl
import traceback
from typing import List, Optional, Any, Dict

import asyncpg
import joblib
import numpy as np
import tensorflow as tf
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

app = FastAPI(title="QuantMath AI Service")

# ===== CORS =====
origins = [
    "https://quant-math-app.vercel.app",
    "http://localhost:3000",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===== ENV VARS =====
DATABASE_URL = os.getenv("DATABASE_URL")
MODEL_PATH = os.getenv("MODEL_PATH", "models/model.keras")
SCALER_PATH = os.getenv("SCALER_PATH", "models/scaler.pkl")
METADATA_PATH = os.getenv("METADATA_PATH", "models/metadata.json")

# runtime state
db_pool: Optional[asyncpg.pool.Pool] = None
model: Optional[Any] = None
scaler: Optional[Any] = None
loaded_model_path: Optional[str] = None
compute_ready = False  # <---- NEW: prevents prediction before compute
last_scaled_input = None  # memory buffer

# ===== Load scaler =====
if os.path.exists(SCALER_PATH):
    try:
        scaler = joblib.load(SCALER_PATH)
        print(f"✅ Loaded scaler: {SCALER_PATH}")
    except:
        traceback.print_exc()
else:
    print(f"⚠️ Scaler not found at {SCALER_PATH}")

# ===== Load model =====
def try_load_model() -> bool:
    global model, loaded_model_path
    if MODEL_PATH and os.path.exists(MODEL_PATH):
        try:
            model = tf.keras.models.load_model(MODEL_PATH, compile=False)
            loaded_model_path = MODEL_PATH
            print(f"✅ Model loaded from: {MODEL_PATH}")
            return True
        except:
            traceback.print_exc()
    print("⚠️ No model loaded.")
    return False

try_load_model()

# ===== Pydantic Models =====
class MarketInput(BaseModel):
    open_price: float
    high: float
    low: float
    close: float
    volume: float

class StockData(BaseModel):
    symbol: str
    price: float

class StockPrediction(BaseModel):
    symbol: str
    predicted_price: float
    signal: Optional[str] = None
    confidence: Optional[float] = None

# ===== Startup / Shutdown =====
@app.on_event("startup")
async def startup():
    global db_pool
    if not DATABASE_URL:
        print("⚠️ DATABASE_URL missing; DB features disabled.")
        return
    try:
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE
        db_pool = await asyncpg.create_pool(DATABASE_URL, ssl=ssl_context)
        print("✅ Database pool created")
    except:
        traceback.print_exc()

@app.on_event("shutdown")
async def shutdown():
    global db_pool
    if db_pool:
        await db_pool.close()
        print("🛑 Database pool closed")

# ===== DB Fetch =====
async def fetch_stocks(limit: int = 10):
    if not db_pool:
        raise HTTPException(status_code=500, detail="DB not initialized")
    try:
        async with db_pool.acquire() as conn:
            rows = await conn.fetch("SELECT symbol, price FROM stocks ORDER BY id ASC LIMIT $1;", limit)
            return [{"symbol": r["symbol"], "price": r["price"]} for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB fetch error: {e}")

# ===== Compute Route (NEW) =====
@app.post("/compute")
def compute(m: MarketInput):
    """Normalize & store input. Prediction disabled until this runs."""
    global compute_ready, last_scaled_input

    if scaler is None:
        raise HTTPException(status_code=500, detail="Scaler not loaded.")

    raw = np.array([[m.open_price, m.high, m.low, m.close, m.volume]])
    last_scaled_input = scaler.transform(raw)
    compute_ready = True

    return {"status": "computed", "message": "Run AI Prediction is now enabled."}

# ===== Confidence Function (NEW) =====
def compute_confidence(pred: float, current: float) -> float:
    diff_ratio = abs(pred - current) / max(current, 1e-6)
    # convert to 0–1 scale (cap at 100%)
    return float(np.clip(diff_ratio, 0, 1))

# ===== Predict from DB (updated confidence) =====
@app.get("/predict_db", response_model=List[StockPrediction])
async def predict_from_db(limit: int = 10):
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    data = await fetch_stocks(limit)
    prices = np.array([s["price"] for s in data]).reshape(-1, 1)

    if scaler:
        prices = scaler.transform(prices)

    preds = model.predict(prices, verbose=0).flatten()

    results = []
    for s, p in zip(data, preds):
        confidence = compute_confidence(float(p), s["price"])
        signal = "BUY" if p > s["price"] else "SELL"
        results.append({
            "symbol": s["symbol"],
            "predicted_price": float(p),
            "signal": signal,
            "confidence": confidence,
        })
    return results

# ===== Predict from client (requires compute first) =====
@app.get("/predict_single")
def predict_single():
    global compute_ready, last_scaled_input

    if not compute_ready:
        raise HTTPException(status_code=400, detail="You must compute first")

    if last_scaled_input is None:
        raise HTTPException(status_code=500, detail="No computed input stored")

    pred = model.predict(last_scaled_input, verbose=0)[0][0]
    return {"prediction": float(pred)}

@app.get("/")
def root():
    return {"message": "QuantMath AI running", "model_loaded": loaded_model_path is not None}
