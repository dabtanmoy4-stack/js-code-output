
const crypto = require("crypto");
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
        error: "Please sign in first",
      });
    }

    const firebase = initFirebaseAdmin();
    const decoded = await firebase.auth().verifyIdToken(token);

    const {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
    } = req.body || {};

    if (
      typeof orderId !== "string" ||
      typeof paymentId !== "string" ||
      typeof signature !== "string"
    ) {
      return res.status(400).json({
        error: "Missing payment verification fields",
      });
    }

    // Verify that this order belongs to this signed-in user.
    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    const order = await razorpay.orders.fetch(orderId);

    if (
      order.amount !== 200 ||
      order.currency !== "INR" ||
      order.notes?.firebaseUid !== decoded.uid ||
      order.notes?.purpose !== "download_share_24h"
    ) {
      return res.status(400).json({
        error: "Payment order is invalid",
      });
    }

    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    const received = Buffer.from(signature, "utf8");
    const expected = Buffer.from(expectedSignature, "utf8");

    if (
      received.length !== expected.length ||
      !crypto.timingSafeEqual(received, expected)
    ) {
      return res.status(400).json({
        verified: false,
        error: "Payment signature is invalid",
      });
    }

    // Confirm payment status with Razorpay, not only the browser response.
    const payment = await razorpay.payments.fetch(paymentId);

    if (
      payment.order_id !== orderId ||
      payment.amount !== 200 ||
      payment.currency !== "INR" ||
      payment.status !== "captured"
    ) {
      return res.status(402).json({
        verified: false,
        error: "Payment has not been captured",
      });
    }

    // Grant 24-hour access to this Firebase user.
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

    await firebase.database().ref(
      `payment_entitlements/${decoded.uid}/download_share`
    ).set({
      active: true,
      expiresAt,
      orderId,
      paymentId,
      updatedAt: Date.now(),
    });

    return res.status(200).json({
      verified: true,
      expiresAt,
      message: "Payment verified successfully",
    });
  } catch (error) {
    console.error("Verify payment failed:", error.message);

    return res.status(500).json({
      verified: false,
      error: "Could not verify payment",
    });
  }
};
