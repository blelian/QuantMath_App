# train_model.py
import pandas as pd
import numpy as np
import tensorflow as tf
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import MinMaxScaler
import os
import asyncio
import asyncpg
from dotenv import load_dotenv
import ssl
import joblib

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
MODEL_PATH = os.getenv("MODEL_PATH", "model.keras")  # preferred native Keras format
MODEL_H5 = "model.h5"
SCALER_PATH = "scaler.pkl"

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL not set in environment (check .env)")

# Async function to fetch historical stock data from Neon
async def fetch_stock_data():
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE

    pool = await asyncpg.create_pool(DATABASE_URL, ssl=ssl_context)
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT price FROM stocks;")
    await pool.close()
    return [r["price"] for r in rows]

# Build model function (keep consistent with downstream inference)
def build_model():
    model = tf.keras.Sequential([
        tf.keras.layers.Input(shape=(1,)),
        tf.keras.layers.Dense(32, activation="relu"),
        tf.keras.layers.Dense(16, activation="relu"),
        tf.keras.layers.Dense(1)
    ])
    # compile WITHOUT metrics to avoid serialization/deserialization issues
    model.compile(optimizer="adam", loss="mse")
    return model

# Main training function
async def train_model():
    prices = await fetch_stock_data()
    if not prices or len(prices) < 4:
        raise ValueError("Not enough stock prices found in database to train model. Need at least 4 rows.")

    X = np.array(prices).reshape(-1, 1)
    y = X * 1.01  # simple simulated next-day price target

    # Scale data
    scaler = MinMaxScaler()
    X_scaled = scaler.fit_transform(X)
    y_scaled = scaler.transform(y)

    # Save scaler for inference
    joblib.dump(scaler, SCALER_PATH)
    print(f"Saved scaler -> {SCALER_PATH}")

    # Train/test split
    X_train, X_test, y_train, y_test = train_test_split(X_scaled, y_scaled, test_size=0.2, random_state=42)

    # Build & train model
    model = build_model()
    model.fit(X_train, y_train, validation_data=(X_test, y_test), epochs=50, batch_size=8, verbose=1)

    # Save native Keras (.keras) AND legacy HDF5 (.h5) for compatibility
    model.save(MODEL_PATH)  # native Keras
    print(f"✅ Model saved at {MODEL_PATH}")

    try:
        model.save(MODEL_H5, save_format="h5")
        print(f"✅ Also saved HDF5 copy at {MODEL_H5}")
    except Exception as e:
        print(f"⚠️ Couldn't save HDF5 copy: {e}")

# Run training
if __name__ == "__main__":
    asyncio.run(train_model())
