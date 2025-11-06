# main.py
import os
import json
import ssl
import traceback
from datetime import datetime
from typing import List, Optional, Any, Dict

import asyncpg
import joblib
import numpy as np
import tensorflow as tf
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

app = FastAPI(title="QuantMath AI Service")

# ===== CORS =====
# Allow Vercel frontend and both Render deployments + localhost (dev)
origins = [
    "https://quant-math-app.vercel.app",
    "https://quantmath-app.onrender.com",
    "https://quantmath-app-1fastapi.onrender.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
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
    print(f"⚠️ Scaler not found at {SCALER_PATH} (ok if training not finished yet)")

# ===== UTIL: load model =====
def try_load_model() -> bool:
    global model, loaded_model_path
    if MODEL_PATH and os.path.exists(MODEL_PATH):
        try:
            print(f"Attempting to load model from {MODEL_PATH} (compile=False)...")
            model = tf.keras.models.load_model(MODEL_PATH, compile=False)
            loaded_model_path = MODEL_PATH
            print(f"✅ Model loaded from: {MODEL_PATH}")
            return True
        except Exception as e:
            print(f"⚠️ Failed loading model: {e}")
            traceback.print_exc()
    else:
        print(f"⚠️ MODEL_PATH not provided or file missing: {MODEL_PATH}")
    return False

try_load_model()

# ===== Pydantic =====
class StockData(BaseModel):
    symbol: str
    price: float

class StockPrediction(BaseModel):
    symbol: str
    predicted_price: float
    signal: Optional[str] = None
    confidence: Optional[float] = None  # 0..1

class UserAction(BaseModel):
    symbol: str
    action: str  # BUY / SELL / HOLD (frontend enforces)
    confidence: Optional[float] = None  # 0..1 or 0..100 (we'll accept either)
    quantity: Optional[int] = None
    note: Optional[str] = None

# ===== Startup / Shutdown =====
@app.on_event("startup")
async def startup() -> None:
    global db_pool
    if not DATABASE_URL:
        print("❌ DATABASE_URL missing; DB routes will fail if used.")
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
        print(f"❌ Database pool creation failed: {e}")
        traceback.print_exc()

@app.on_event("shutdown")
async def shutdown() -> None:
    global db_pool
    if db_pool:
        await db_pool.close()
        print("🛑 Database pool closed")

# ===== DB Helper =====
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

# ===== Signal =====
def derive_signal(pred: float, curr: float) -> str:
    pct = ((pred - curr) / curr) * 100
    if pct >= 1:
        return "BUY"
    if pct <= -1:
        return "SELL"
    return "HOLD"

# ===== Dynamic Confidence (0..1) =====
def compute_confidence(pred: float, curr: float) -> float:
    """
    Produces a confidence score between 0..1 based on absolute price movement.
    - 0% change => 0.0 confidence
    - 3% change => 0.6
    - 5%+ change => 1.0 (capped)
    """
    try:
        delta = abs((pred - curr) / curr) * 100.0
        conf = min(delta / 5.0, 1.0)
        return float(conf)
    except Exception:
        return 0.0

# ===== Metadata =====
def read_model_metadata() -> Dict[str, Any]:
    if os.path.exists(METADATA_PATH):
        try:
            with open(METADATA_PATH, "r", encoding="utf-8") as fh:
                return json.load(fh)
        except Exception as e:
            print(f"⚠️ Metadata read failed: {e}")
    return {
        "trained": loaded_model_path is not None,
        "model_path": loaded_model_path,
        "epochs": None,
        "final_val_loss": None
    }

# ===== Routes =====
@app.get("/")
def root():
    return {
        "message": "FastAPI backend is running",
        "model_loaded": loaded_model_path is not None,
        "model_path": loaded_model_path,
    }

@app.get("/healthz")
def healthz():
    return {"status": "ok", "model_loaded": loaded_model_path is not None}

@app.get("/model/metadata")
def model_metadata():
    return read_model_metadata()

@app.get("/stocks/cached", response_model=List[StockData])
async def get_cached_stocks(limit: int = 10):
    return await fetch_stocks(limit)

@app.get("/predict_db", response_model=List[StockPrediction])
async def predict_db(limit: int = 10):
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    data = await fetch_stocks(limit)
    if not data:
        return []

    try:
        prices = np.array([s["price"] for s in data]).reshape(-1, 1)
        if scaler is not None:
            prices = scaler.transform(prices)

        preds = model.predict(prices, verbose=0).flatten()
        results = []

        for s, p in zip(data, preds):
            results.append({
                "symbol": s["symbol"],
                "predicted_price": float(p),
                "signal": derive_signal(float(p), s["price"]),
                "confidence": compute_confidence(float(p), s["price"])
            })

        return results
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Prediction error: {e}")

@app.post("/predict", response_model=List[StockPrediction])
async def predict_from_client(data: List[StockData]):
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    if not data:
        raise HTTPException(status_code=400, detail="No data provided")

    try:
        prices = np.array([d.price for d in data]).reshape(-1, 1)
        if scaler is not None:
            prices = scaler.transform(prices)

        preds = model.predict(prices, verbose=0).flatten()
        results = []

        for s, p in zip(data, preds):
            results.append({
                "symbol": s.symbol,
                "predicted_price": float(p),
                "signal": derive_signal(float(p), s.price),
                "confidence": compute_confidence(float(p), s.price)
            })

        return results
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Prediction error: {e}")

# ===== New endpoint: receive user actions (BUY/SELL/HOLD) =====
@app.post("/action")
async def receive_action(action: UserAction, request: Request):
    """
    Accept actions from frontend buttons.
    Attempts to persist in DB (table 'actions' expected),
    otherwise logs the action and returns acknowledgement.
    """
    payload = {
        "symbol": action.symbol,
        "action": action.action.upper(),
        # normalize confidence to 0..1 if frontend sent 0..100
        "confidence": (action.confidence / 100.0) if action.confidence and action.confidence > 1 else (action.confidence or None),
        "quantity": action.quantity,
        "note": action.note,
        "received_at": datetime.utcnow().isoformat() + "Z",
        "remote_addr": request.client.host if request.client else None,
    }

    # Try to persist to DB if available
    if db_pool:
        try:
            async with db_pool.acquire() as conn:
                # Create a simple actions table if it doesn't exist (safe-to-run)
                await conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS actions (
                        id SERIAL PRIMARY KEY,
                        symbol TEXT NOT NULL,
                        action TEXT NOT NULL,
                        confidence DOUBLE PRECISION,
                        quantity INTEGER,
                        note TEXT,
                        received_at TIMESTAMP WITH TIME ZONE,
                        remote_addr TEXT
                    );
                    """
                )
                await conn.execute(
                    """
                    INSERT INTO actions(symbol, action, confidence, quantity, note, received_at, remote_addr)
                    VALUES($1,$2,$3,$4,$5,$6,$7)
                    """,
                    payload["symbol"],
                    payload["action"],
                    payload["confidence"],
                    payload["quantity"],
                    payload["note"],
                    datetime.utcnow(),
                    payload["remote_addr"],
                )
            return {"status": "ok", "persisted": True, "payload": payload}
        except Exception as e:
            print(f"⚠️ Failed to persist action: {e}")
            traceback.print_exc()
            # fallthrough to returning ack
    # If we get here, either no DB or persisting failed — log and ack
    print("ACTION RECEIVED (no DB):", json.dumps(payload))
    return {"status": "ok", "persisted": False, "payload": payload}
