require("dotenv").config();

try {
  const keyBase64 = process.env.FIREBASE_ADMIN_KEY;
  if (!keyBase64) throw new Error("FIREBASE_ADMIN_KEY empty!");

  const keyJson = Buffer.from(keyBase64, "base64").toString("utf8");
  const parsed = JSON.parse(keyJson);

  console.log("✅ Firebase key loaded successfully:");
  console.log(parsed);
} catch (err) {
  console.error("❌ Firebase key error:", err.message);
}
