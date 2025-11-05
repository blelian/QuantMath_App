from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List
import asyncpg
import os
import numpy as np
import tensorflow as tf
from dotenv import load_dotenv
import ssl

load_dotenv()

app = FastAPI(title="QuantMath AI Service")

DATABASE_URL = os.getenv("DATABASE_URL")
MODEL_PATH = os.getenv("MODEL_PATH", "model.h5")

db_pool: asyncpg.pool.Pool = None
model = None

# Try to load TensorFlow model safely
if os.path.exists(MODEL_PATH):
    try:
        model = tf.keras.models.load_model(MODEL_PATH)
        print("✅ TensorFlow model loaded successfully")
    except Exception as e:
        print(f"⚠️ Model found but failed to load: {e}")
else:
    print("⚠️ No ML model found yet. API will run without predictions.")


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
    return {"message": "FastAPI AI backend with TensorFlow is running!"}


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
        predicted_prices = model.predict(prices, verbose=0).flatten()

        return [
            {"symbol": stock["symbol"], "predicted_price": float(pred)}
            for stock, pred in zip(data, predicted_prices)
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
        predicted_prices = model.predict(prices, verbose=0).flatten()

        return [
            {"symbol": stock.symbol, "predicted_price": float(pred)}
            for stock, pred in zip(data, predicted_prices)
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction error: {e}")
