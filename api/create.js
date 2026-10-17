
const Razorpay = require("razorpay");
const admin = require("firebase-admin");

function initFirebaseAdmin() {
  if (admin.apps.length) return admin;

  const serviceAccountText =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountText) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured");
  }

  const serviceAccount = JSON.parse(serviceAccountText);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });

  return admin;
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  return header.slice(7);
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return res.status(500).json({
        error: "Razorpay environment variables are not configured",
      });
    }

    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({
        error: "Please sign in with Google first",
      });
    }

    const firebase = initFirebaseAdmin();
    const decoded = await firebase.auth().verifyIdToken(token);

    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    const order = await razorpay.orders.create({
      amount: 200,
      currency: "INR",
      receipt: `jsco_${Date.now()}`,
      notes: {
        firebaseUid: decoded.uid,
        purpose: "download_share_24h",
      },
    });

    return res.status(200).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId,
    });
  } catch (error) {
    console.error("Create payment order failed:", error.message);

    return res.status(500).json({
      error: "Could not create payment order",
    });
  }
};
