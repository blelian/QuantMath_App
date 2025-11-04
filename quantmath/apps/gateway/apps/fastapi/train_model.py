import pandas as pd
import numpy as np
import tensorflow as tf
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import MinMaxScaler
import os

# Load historical stock data (CSV or from DB export)
# For simplicity, let's use a CSV with columns: symbol, price
data = pd.read_csv("stocks_history.csv")  # example file

# Only using price for now, but you can add moving averages, volume, etc.
X = data["price"].values.reshape(-1, 1)
y = X * 1.01  # Simulated "next price" (replace with real target if available)

# Scale data for better training
scaler = MinMaxScaler()
X_scaled = scaler.fit_transform(X)
y_scaled = scaler.transform(y)

# Train/test split
X_train, X_test, y_train, y_test = train_test_split(X_scaled, y_scaled, test_size=0.2, random_state=42)

# Build a simple regression model
model = tf.keras.Sequential([
    tf.keras.layers.Input(shape=(1,)),
    tf.keras.layers.Dense(32, activation="relu"),
    tf.keras.layers.Dense(16, activation="relu"),
    tf.keras.layers.Dense(1)
])

model.compile(optimizer="adam", loss="mse")

# Train model
model.fit(X_train, y_train, validation_data=(X_test, y_test), epochs=50, batch_size=8)

# Save model
model_path = "tf_model"
os.makedirs(model_path, exist_ok=True)
model.save(model_path)
print(f"Model saved at {model_path}")
