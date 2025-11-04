from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List
import asyncpg
import os
import numpy as np
import tensorflow as tf
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = FastAPI(title="QuantMath AI Service")

DATABASE_URL = os.getenv("DATABASE_URL")
MODEL_PATH = os.getenv("MODEL_PATH", "tf_model")  # TensorFlow SavedModel directory

db_pool: asyncpg.pool.Pool = None

# Load TensorFlow model
try:
    model = tf.keras.models.load_model(MODEL_PATH)
    print("TensorFlow model loaded successfully")
except Exception as e:
    print(f"Failed to load TensorFlow model: {e}")
    raise e

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
        db_pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=10)
        print("Database pool created successfully")
    except Exception as e:
        print(f"Failed to create database pool: {e}")
        raise e

@app.on_event("shutdown")
async def shutdown():
    global db_pool
    if db_pool:
        await db_pool.close()
        print("Database pool closed")

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

# Root
@app.get("/")
def read_root():
    return {"message": "FastAPI AI backend with TensorFlow is running!"}

# Predict from DB
@app.get("/predict_db", response_model=List[StockPrediction])
async def predict_from_db(limit: int = 10):
    data = await fetch_stocks(limit)
    if not data:
        return []

    try:
        prices = np.array([stock["price"] for stock in data]).reshape(-1, 1)
        predicted_prices = model.predict(prices).flatten()
        return [
            {"symbol": stock["symbol"], "predicted_price": float(pred)}
            for stock, pred in zip(data, predicted_prices)
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction error: {e}")

# Predict from client data
@app.post("/predict", response_model=List[StockPrediction])
async def predict_from_client(data: List[StockData]):
    if not data:
        raise HTTPException(status_code=400, detail="No data provided")
    try:
        prices = np.array([stock.price for stock in data]).reshape(-1, 1)
        predicted_prices = model.predict(prices).flatten()
        return [
            {"symbol": stock.symbol, "predicted_price": float(pred)}
            for stock, pred in zip(data, predicted_prices)
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction error: {e}")
