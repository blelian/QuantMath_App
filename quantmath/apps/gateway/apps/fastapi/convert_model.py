from keras.models import load_model

# Load your existing trained model
model = load_model("model.keras")   # Or "model.h5" if that’s the filename

# Re-save using the new Keras v3 save format
model.save("model.keras", save_format="keras")

print("✅ Model successfully converted to Keras v3 format.")
