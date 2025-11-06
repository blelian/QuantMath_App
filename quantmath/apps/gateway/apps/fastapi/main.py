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

# ===== UTIL: load scaler =====
if os.path.exists(SCALER_PATH):
    try:
        scaler = joblib.load(SCALER_PATH)
        print(f"✅ Loaded scaler: {SCALER_PATH}")
    except Exception as e:
        print(f"⚠️ Failed to load scaler ({SCALER_PATH}): {e}")
        traceback.print_exc()
else:
    print(f"⚠️ Scaler not found at {SCALER_PATH} (ok for now if training hasn't run)")

# ===== UTIL: load model =====
def try_load_model() -> bool:
    global model, loaded_model_path
    candidates = [MODEL_PATH]
    for p in candidates:
        if not p:
            continue
        if os.path.exists(p):
            try:
                print(f"Attempting to load model from {p} (compile=False)...")
                model = tf.keras.models.load_model(p, compile=False)
                loaded_model_path = p
                print(f"✅ Model loaded from: {p}")
                return True
            except Exception as e:
                print(f"⚠️ Failed to load model from {p}: {e}")
                traceback.print_exc()
    print("⚠️ No compatible model loaded.")
    return False

try_load_model()

# ===== Pydantic models =====
class StockData(BaseModel):
    symbol: str
    price: float

class StockPrediction(BaseModel):
    symbol: str
    predicted_price: float
    signal: Optional[str] = None
    confidence: Optional[float] = None  # now returns 0..1

# ===== Startup / Shutdown =====
@app.on_event("startup")
async def startup() -> None:
    global db_pool
    if not DATABASE_URL:
        print("❌ DATABASE_URL not provided in environment.")
        return

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
        traceback.print_exc()
        raise e

@app.on_event("shutdown")
async def shutdown() -> None:
    global db_pool
    if db_pool:
        await db_pool.close()
        print("🛑 Database pool closed")

# ===== DB helper =====
async def fetch_stocks(limit: int = 10) -> List[Dict[str, Any]]:
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

# ===== Utility: derive signal =====
def derive_signal(pred: float, curr: float) -> str:
    pct = ((pred - curr) / curr) * 100
    if pct >= 1:
        return "BUY"
    if pct <= -1:
        return "SELL"
    return "HOLD"

# ===== Utility: derive confidence dynamically =====
def compute_confidence(pred: float, curr: float) -> float:
    """Return confidence as 0..1 based on how strong the prediction delta is."""
    delta_pct = abs((pred - curr) / curr) * 100
    conf = min(delta_pct / 5.0, 1.0)  # normalize: 5% delta => 100% confidence
    return conf

# ===== Utility: read training metadata =====
def read_model_metadata() -> Dict[str, Any]:
    if os.path.exists(METADATA_PATH):
        try:
            with open(METADATA_PATH, "r", encoding="utf-8") as fh:
                return json.load(fh)
        except Exception as e:
            print(f"⚠️ Failed to read metadata at {METADATA_PATH}: {e}")
            traceback.print_exc()
    return {
        "trained": loaded_model_path is not None,
        "model_path": loaded_model_path,
        "epochs": None,
        "final_val_loss": None
    }

# ===== Routes =====
@app.get("/")
def read_root():
    return {
        "message": "FastAPI AI backend with TensorFlow is running!",
        "model_loaded": loaded_model_path is not None,
        "model_path": loaded_model_path,
    }

@app.get("/healthz")
def healthz():
    return {"status": "ok", "model_loaded": loaded_model_path is not None}

@app.get("/model/metadata")
def model_metadata():
    meta = read_model_metadata()
    return meta

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
            conf = compute_confidence(float(p), s["price"])
            results.append({
                "symbol": s["symbol"],
                "predicted_price": float(p),
                "signal": signal,
                "confidence": conf
            })
        return results
    except Exception as e:
        traceback.print_exc()
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
            conf = compute_confidence(float(p), s.price)
            results.append({
                "symbol": s.symbol,
                "predicted_price": float(p),
                "signal": signal,
                "confidence": conf
            })
        return results
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Prediction error: {e}")
