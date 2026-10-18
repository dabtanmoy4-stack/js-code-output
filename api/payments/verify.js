
const crypto = require("crypto");
const Razorpay = require("razorpay");
const admin = require("firebase-admin");

function initFirebaseAdmin() {
  if (admin.apps.length) return admin;

  const serviceAccountText =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountText) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_JSON is not configured"
    );
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

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  const first = Buffer.from(a, "utf8");
  const second = Buffer.from(b, "utf8");

  return (
    first.length === second.length &&
    crypto.timingSafeEqual(first, second)
  );
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return res.status(405).json({
      verified: false,
      error: "Method not allowed",
    });
  }

  try {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return res.status(500).json({
        verified: false,
        error: "Razorpay environment variables are not configured",
      });
    }

    const token = getBearerToken(req);

    if (!token) {
      return res.status(401).json({
        verified: false,
        error: "Please sign in first",
      });
    }

    const firebase = initFirebaseAdmin();
    const decoded = await firebase.auth().verifyIdToken(token);

    const body = req.body || {};

    // Accept both frontend and Razorpay field names.
    const orderId =
      body.razorpay_order_id || body.orderId;

    const paymentId =
      body.razorpay_payment_id || body.paymentId;

    const signature =
      body.razorpay_signature || body.signature;

    if (
      typeof orderId !== "string" ||
      typeof paymentId !== "string" ||
      typeof signature !== "string" ||
      !orderId ||
      !paymentId ||
      !signature
    ) {
      return res.status(400).json({
        verified: false,
        error: "Missing payment verification fields",
      });
    }

    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    // Confirm the order belongs to the signed-in user.
    const order = await razorpay.orders.fetch(orderId);

    if (
      order.amount !== 200 ||
      order.currency !== "INR" ||
      order.notes?.firebaseUid !== decoded.uid ||
      order.notes?.purpose !== "download_share_24h"
    ) {
      return res.status(400).json({
        verified: false,
        error: "Payment order is invalid",
      });
    }

    // Verify Razorpay's payment signature.
    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    if (!safeEqual(signature, expectedSignature)) {
      return res.status(400).json({
        verified: false,
        error: "Payment signature is invalid",
      });
    }

    // Verify payment status directly with Razorpay.
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

    // Grant or renew access for 24 hours.
    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000;

    await firebase
      .database()
      .ref(
        `payment_entitlements/${decoded.uid}/download_share`
      )
      .set({
        active: true,
        expiresAt,
        orderId,
        paymentId,
        updatedAt: now,
      });

    return res.status(200).json({
      verified: true,
      expiresAt,
      message: "Payment verified successfully",
    });
  } catch (error) {
    // Keep detailed errors in server logs, not in the public response.
    console.error("Verify payment failed:", error.message);

    return res.status(500).json({
      verified: false,
      error: "Could not verify payment",
    });
  }
};
