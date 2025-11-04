# main.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List
import asyncpg
import os
from dotenv import load_dotenv

# Load .env
load_dotenv()

app = FastAPI(title="QuantMath AI Service")

# Database URL from environment
DATABASE_URL = os.getenv("DATABASE_URL")

# Global connection pool
db_pool: asyncpg.pool.Pool = None

# Data models
class StockData(BaseModel):
    symbol: str
    price: float

class StockPrediction(BaseModel):
    symbol: str
    predicted_price: float

# Startup: create DB pool
@app.on_event("startup")
async def startup():
    global db_pool
    try:
        db_pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=10)
        print("Database pool created successfully")
    except Exception as e:
        print(f"Failed to create database pool: {e}")
        raise e

# Shutdown: close pool
@app.on_event("shutdown")
async def shutdown():
    global db_pool
    if db_pool:
        await db_pool.close()
        print("Database pool closed")

# Fetch stock data from DB
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

# Root endpoint
@app.get("/")
def read_root():
    return {"message": "FastAPI backend is running!"}

# GET endpoint: fetch from DB and predict
@app.get("/predict_db", response_model=List[StockPrediction])
async def predict_from_db(limit: int = 10):
    data = await fetch_stocks(limit)
    # Placeholder AI logic
    predictions = [{"symbol": stock["symbol"], "predicted_price": stock["price"] * 1.01} for stock in data]
    return predictions

# POST endpoint: client sends data for prediction
@app.post("/predict", response_model=List[StockPrediction])
async def predict_from_client(data: List[StockData]):
    try:
        predictions = [{"symbol": stock.symbol, "predicted_price": stock.price * 1.01} for stock in data]
        return predictions
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction error: {e}")
