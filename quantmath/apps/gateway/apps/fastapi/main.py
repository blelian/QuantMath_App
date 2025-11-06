# main.py
import os
import ssl
import traceback
from typing import List, Optional

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

db_pool: Optional[asyncpg.pool.Pool] = None
model = None
scaler = None
loaded_model_path = None

# ===== LOAD SCALER =====
if os.path.exists(SCALER_PATH):
    try:
        scaler = joblib.load(SCALER_PATH)
        print(f"✅ Loaded scaler: {SCALER_PATH}")
    except Exception as e:
        print(f"⚠️ Failed to load scaler: {e}")
        traceback.print_exc()

# ===== LOAD MODEL =====
def try_load_model():
    global model, loaded_model_path
    if os.path.exists(MODEL_PATH):
        try:
            print(f"Attempting to load model from {MODEL_PATH} (compile=False)...")
            model = tf.keras.models.load_model(MODEL_PATH, compile=False)
            loaded_model_path = MODEL_PATH
            print(f"✅ Model loaded from {MODEL_PATH}")
            return True
        except Exception as e:
            print(f"⚠️ Failed to load model: {e}")
            traceback.print_exc()
    print("⚠️ No model loaded.")
    return False

try_load_model()

# ===== DATA MODELS =====
class StockData(BaseModel):
    symbol: str
    price: float

class StockPrediction(BaseModel):
    symbol: str
    predicted_price: float
    signal: Optional[str] = None
    confidence: Optional[float] = None

# ===== STARTUP / SHUTDOWN =====
@app.on_event("startup")
async def startup():
    global db_pool
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL not provided")
    try:
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE

        db_pool = await asyncpg.create_pool(
            DATABASE_URL,
            min_size=1,
            max_size=10,
            ssl=ssl_context
        )
        print("✅ Database pool created")
    except Exception as e:
        print(f"❌ DB connection failed: {e}")
        raise e

@app.on_event("shutdown")
async def shutdown():
    global db_pool
    if db_pool:
        await db_pool.close()
        print("🛑 Database pool closed")

# ===== DB FETCH =====
async def fetch_stocks(limit: int = 10):
    global db_pool
    if not db_pool:
        raise HTTPException(status_code=500, detail="Database not initialized")
    try:
        async with db_pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT symbol, price FROM stocks ORDER BY id ASC LIMIT $1;",
                limit
            )
            return [{"symbol": r["symbol"], "price": r["price"]} for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB fetch error: {e}")

# ===== UTILS =====
def derive_signal(pred: float, curr: float) -> str:
    pct = ((pred - curr) / curr) * 100
    if pct >= 1:
        return "BUY"
    if pct <= -1:
        return "SELL"
    return "HOLD"

# ===== ROUTES =====
@app.get("/")
def read_root():
    return {
        "message": "FastAPI AI backend with TensorFlow is running!",
        "model_loaded": loaded_model_path is not None,
        "model_path": loaded_model_path,
    }

@app.get("/stocks/cached", response_model=List[StockData])
async def get_cached_stocks(limit: int = 10):
    return await fetch_stocks(limit)

@app.get("/predict_db", response_model=List[StockPrediction])
async def predict_from_db(limit: int = 10):
    if model is None:
        raise HTTPException(status_code=503, detail="ML model not loaded")
    data = await fetch_stocks(limit)
    if not data:
        return []
    try:
        prices = np.array([stock["price"] for stock in data]).reshape(-1, 1)
        if scaler:
            prices = scaler.transform(prices)
        preds = model.predict(prices, verbose=0).flatten()
        results = []
        for s, p in zip(data, preds):
            signal = derive_signal(float(p), s["price"])
            results.append({
                "symbol": s["symbol"],
                "predicted_price": float(p),
                "signal": signal,
                "confidence": 50  # default, can be improved later
            })
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction error: {e}")

@app.post("/predict", response_model=List[StockPrediction])
async def predict_from_client(data: List[StockData]):
    if model is None:
        raise HTTPException(status_code=503, detail="ML model not loaded")
    if not data:
        raise HTTPException(status_code=400, detail="No data provided")
    try:
        prices = np.array([s.price for s in data]).reshape(-1, 1)
        if scaler:
            prices = scaler.transform(prices)
        preds = model.predict(prices, verbose=0).flatten()
        results = []
        for s, p in zip(data, preds):
            signal = derive_signal(float(p), s.price)
            results.append({
                "symbol": s.symbol,
                "predicted_price": float(p),
                "signal": signal,
                "confidence": 50  # placeholder, can be replaced with model-derived confidence
            })
        return results
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Prediction error: {e}")
