const admin = require("firebase-admin");

const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_ADMIN_KEY, "base64").toString("utf8"),
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;
