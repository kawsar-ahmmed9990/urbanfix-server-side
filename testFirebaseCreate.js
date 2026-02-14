// testFirebaseCreate.js
require("dotenv").config(); // <-- dotenv load
const admin = require("./firebaseAdmin");

async function testCreateUser() {
  try {
    const email = "testuser@urbanfix.com";
    const password = "123456";
    const displayName = "Test User";

    // Check if user exists first
    let existingUser;
    try {
      existingUser = await admin.auth().getUserByEmail(email);
      console.log("User already exists:", existingUser.uid);
      return;
    } catch {}

    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName,
    });

    console.log("✅ User created:", userRecord.uid);
  } catch (err) {
    console.error("❌ Firebase create failed:", err.message);
  }
}

testCreateUser();
