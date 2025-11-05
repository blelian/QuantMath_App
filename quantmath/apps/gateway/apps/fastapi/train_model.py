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

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
MODEL_PATH = os.getenv("MODEL_PATH", "model.h5")

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

# Main training function
async def train_model():
    prices = await fetch_stock_data()
    if not prices:
        raise ValueError("No stock prices found in database to train model.")

    X = np.array(prices).reshape(-1, 1)
    y = X * 1.01  # simple simulated next-day price

    # Scale data
    scaler = MinMaxScaler()
    X_scaled = scaler.fit_transform(X)
    y_scaled = scaler.transform(y)

    # Train/test split
    X_train, X_test, y_train, y_test = train_test_split(X_scaled, y_scaled, test_size=0.2, random_state=42)

    # Build model
    model = tf.keras.Sequential([
        tf.keras.layers.Input(shape=(1,)),
        tf.keras.layers.Dense(32, activation="relu"),
        tf.keras.layers.Dense(16, activation="relu"),
        tf.keras.layers.Dense(1)
    ])
    model.compile(optimizer="adam", loss="mse")

    # Train
    model.fit(X_train, y_train, validation_data=(X_test, y_test), epochs=50, batch_size=8)

    # Save as .h5
    model.save(MODEL_PATH)
    print(f"Model saved at {MODEL_PATH}")

# Run training
if __name__ == "__main__":
    asyncio.run(train_model())
