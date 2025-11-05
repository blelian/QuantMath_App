# main.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import asyncpg
import os
import numpy as np
import tensorflow as tf
from dotenv import load_dotenv
import ssl
import joblib
import traceback

load_dotenv()

app = FastAPI(title="QuantMath AI Service")

DATABASE_URL = os.getenv("DATABASE_URL")
MODEL_PATH = os.getenv("MODEL_PATH", "model.keras")  # preferred native Keras format
MODEL_H5 = "model.h5"
SCALER_PATH = "scaler.pkl"

db_pool: Optional[asyncpg.pool.Pool] = None
model = None
scaler = None
loaded_model_path = None

# Helper: list files in cwd for debugging
def list_files():
    try:
        items = os.listdir(".")
        print("CWD files:", items)
    except Exception as e:
        print("Failed to list files:", e)

list_files()

# Try load scaler
if os.path.exists(SCALER_PATH):
    try:
        scaler = joblib.load(SCALER_PATH)
        print("✅ Loaded scaler:", SCALER_PATH)
    except Exception as e:
        print("⚠️ Failed to load scaler:", e)

# Attempt to load model (try MODEL_PATH, fallback to model.h5) with compile=False (safe)
def try_load_model():
    global model, loaded_model_path
    candidate_paths = [MODEL_PATH, MODEL_H5]
    for p in candidate_paths:
        if not p:
            continue
        if os.path.exists(p):
            try:
                print(f"Attempting to load model from {p} (compile=False)...")
                model = tf.keras.models.load_model(p, compile=False)
                loaded_model_path = p
                print("✅ Model loaded from:", p)
                return True
            except Exception as e:
                print(f"⚠️ Failed to load model from {p}: {e}")
                traceback.print_exc()
    print("⚠️ No compatible model loaded.")
    return False

try_load_model()

# Data models
class StockData(BaseModel):
    symbol: str
    price: float

class StockPrediction(BaseModel):
    symbol: str
    predicted_price: float

# Startup / Shutdown
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
        print("✅ Database pool created successfully")
    except Exception as e:
        print(f"❌ Failed to connect to database: {e}")
        raise e

@app.on_event("shutdown")
async def shutdown():
    global db_pool
    if db_pool:
        await db_pool.close()
        print("🛑 Database pool closed")

# Fetch stocks from DB
async def fetch_stocks(limit: int = 10):
    global db_pool
    if not db_pool:
        raise HTTPException(status_code=500, detail="Database not initialized")
    try:
        async with db_pool.acquire() as conn:
            rows = await conn.fetch("SELECT symbol, price FROM stocks LIMIT $1;", limit)
            return [{"symbol": r["symbol"], "price": r["price"]} for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB fetch error: {e}")

@app.get("/")
def read_root():
    return {
        "message": "FastAPI AI backend with TensorFlow is running!",
        "model_loaded": loaded_model_path is not None,
        "model_path": loaded_model_path,
    }

# Predict from DB
@app.get("/predict_db", response_model=List[StockPrediction])
async def predict_from_db(limit: int = 10):
    if model is None:
        raise HTTPException(status_code=503, detail="ML model not loaded yet")
    data = await fetch_stocks(limit)
    if not data:
        return []
    try:
        prices = np.array([stock["price"] for stock in data]).reshape(-1, 1)
        if scaler is not None:
            prices = scaler.transform(prices)
        preds = model.predict(prices, verbose=0).flatten()
        # If you saved scaler for y, you'd inverse transform here; for simple model we return raw preds
        return [
            {"symbol": stock["symbol"], "predicted_price": float(pred)}
            for stock, pred in zip(data, preds)
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction error: {e}")

# Predict from client POST data
@app.post("/predict", response_model=List[StockPrediction])
async def predict_from_client(data: List[StockData]):
    if model is None:
        raise HTTPException(status_code=503, detail="ML model not loaded yet")
    if not data:
        raise HTTPException(status_code=400, detail="No data provided")
    try:
        prices = np.array([stock.price for stock in data]).reshape(-1, 1)
        if scaler is not None:
            prices = scaler.transform(prices)
        preds = model.predict(prices, verbose=0).flatten()
        return [
            {"symbol": stock.symbol, "predicted_price": float(pred)}
            for stock, pred in zip(data, preds)
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction error: {e}")
