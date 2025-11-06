import os
import asyncio
import ssl
import joblib
import numpy as np
import tensorflow as tf
from sklearn.preprocessing import MinMaxScaler
from sklearn.model_selection import train_test_split
import asyncpg
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
MODEL_PATH = os.getenv("MODEL_PATH", "models/model.keras")
SCALER_PATH = os.getenv("SCALER_PATH", "models/scaler.pkl")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL not set in environment (check .env)")

# Ensure directories exist
os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
os.makedirs(os.path.dirname(SCALER_PATH), exist_ok=True)

# Async fetch from DB
async def fetch_stock_data():
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE

    pool = await asyncpg.create_pool(DATABASE_URL, ssl=ssl_context)
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT price FROM stocks;")
    await pool.close()
    return [r["price"] for r in rows]

# Build TensorFlow model
def build_model():
    model = tf.keras.Sequential([
        tf.keras.layers.Input(shape=(1,)),
        tf.keras.layers.Dense(32, activation="relu"),
        tf.keras.layers.Dense(16, activation="relu"),
        tf.keras.layers.Dense(1)
    ])
    model.compile(optimizer="adam", loss="mse")
    return model

# Train and save model
async def train_model():
    prices = await fetch_stock_data()
    if not prices or len(prices) < 4:
        raise ValueError("Not enough stock prices in DB (min 4 rows).")

    X = np.array(prices).reshape(-1, 1)
    y = X * 1.01  # simulate next-day price

    # Scale data
    scaler = MinMaxScaler()
    X_scaled = scaler.fit_transform(X)
    y_scaled = scaler.transform(y)
    joblib.dump(scaler, SCALER_PATH)
    print(f"✅ Saved scaler -> {SCALER_PATH}")

    # Split data
    X_train, X_test, y_train, y_test = train_test_split(
        X_scaled, y_scaled, test_size=0.2, random_state=42
    )

    # Train model
    model = build_model()
    model.fit(X_train, y_train, validation_data=(X_test, y_test),
              epochs=50, batch_size=8, verbose=1)

    # Save Keras model
    model.save(MODEL_PATH)
    print(f"✅ Model saved at {MODEL_PATH}")

    # Optional: Generate placeholder predictions with confidence for verification
    preds = model.predict(X_scaled, verbose=0).flatten()
    results = []
    for actual, pred in zip(X.flatten(), preds):
        signal = "BUY" if pred > actual else "SELL" if pred < actual else "HOLD"
        confidence = float(abs(pred - actual) / actual * 100)
        results.append({
            "predicted_price": float(pred),
            "signal": signal,
            "confidence": confidence
        })
    print(f"✅ Sample predictions: {results[:5]}")

if __name__ == "__main__":
    asyncio.run(train_model())
