
const crypto = require("crypto");
const Razorpay = require("razorpay");
const admin = require("firebase-admin");

function initFirebaseAdmin() {
  if (admin.apps.length) return admin;

  const serviceAccountText =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  const databaseURL = process.env.FIREBASE_DATABASE_URL;

  if (!serviceAccountText) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured");
  }

  if (!databaseURL) {
    throw new Error("FIREBASE_DATABASE_URL is not configured");
  }

  const serviceAccount = JSON.parse(serviceAccountText);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL,
  });

  return admin;
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) return null;

  return header.slice(7).trim();
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

function sendError(res, status, message) {
  return res.status(status).json({
    verified: false,
    error: message,
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendError(res, 405, "Method not allowed");
  }

  try {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      console.error("Razorpay credentials are not configured");
      return sendError(res, 500, "Payment service is not configured");
    }

    const token = getBearerToken(req);

    if (!token) {
      return sendError(res, 401, "Please sign in first");
    }

    const firebase = initFirebaseAdmin();

    // Verify the signed-in Firebase user.
    const decoded = await firebase.auth().verifyIdToken(token);

    const body = req.body || {};

    const orderId = body.razorpay_order_id || body.orderId;
    const paymentId = body.razorpay_payment_id || body.paymentId;
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
      return sendError(
        res,
        400,
        "Missing payment verification fields"
      );
    }

    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    // Verify Razorpay checkout signature.
    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    if (!safeEqual(signature, expectedSignature)) {
      console.error("Razorpay signature verification failed", {
        orderId,
        uid: decoded.uid,
      });

      return sendError(
        res,
        400,
        "Payment signature is invalid"
      );
    }

    // Fetch the order from Razorpay; never trust client-supplied amounts.
    const order = await razorpay.orders.fetch(orderId);

    if (
      order.id !== orderId ||
      Number(order.amount) !== 200 ||
      order.currency !== "INR" ||
      !order.notes ||
      order.notes.firebaseUid !== decoded.uid ||
      order.notes.purpose !== "download_share_24h"
    ) {
      console.error("Razorpay order validation failed", {
        orderId,
        uid: decoded.uid,
      });

      return sendError(res, 400, "Payment order is invalid");
    }

    // Verify the payment directly with Razorpay.
    const payment = await razorpay.payments.fetch(paymentId);

    if (
      payment.id !== paymentId ||
      payment.order_id !== orderId ||
      Number(payment.amount) !== 200 ||
      payment.currency !== "INR"
    ) {
      console.error("Razorpay payment details mismatch", {
        orderId,
        paymentId,
        uid: decoded.uid,
      });

      return sendError(res, 400, "Payment details do not match");
    }

    if (payment.status !== "captured") {
      console.error("Razorpay payment is not captured", {
        orderId,
        paymentId,
        paymentStatus: payment.status,
      });

      return sendError(
        res,
        402,
        `Payment is not captured yet. Current status: ${payment.status}`
      );
    }

    // Grant 24-hour access to both Download and Share.
    const entitlementRef = firebase
      .database()
      .ref(`payment_entitlements/${decoded.uid}/download_share`);

    const snapshot = await entitlementRef.once("value");
    const existing = snapshot.val();

    // Idempotency: retrying the same successful payment must not
    // extend the entitlement repeatedly.
    if (
      existing &&
      existing.active === true &&
      existing.orderId === orderId &&
      existing.paymentId === paymentId &&
      Number(existing.expiresAt) > Date.now()
    ) {
      return res.status(200).json({
        verified: true,
        expiresAt: Number(existing.expiresAt),
        message: "Payment already verified",
      });
    }

    const now = Date.now();

    // A new payment extends any still-active access instead of
    // accidentally shortening it.
    const previousExpiry =
      existing && existing.active === true
        ? Number(existing.expiresAt) || 0
        : 0;

    const expiresAt =
      Math.max(now, previousExpiry) + 24 * 60 * 60 * 1000;

    await entitlementRef.set({
      active: true,
      expiresAt,
      orderId,
      paymentId,
      updatedAt: now,
    });

    // Confirm the entitlement was actually written.
    const savedSnapshot = await entitlementRef.once("value");
    const saved = savedSnapshot.val();

    if (
      !saved ||
      saved.active !== true ||
      saved.orderId !== orderId ||
      saved.paymentId !== paymentId ||
      Number(saved.expiresAt) !== expiresAt
    ) {
      throw new Error("Entitlement write could not be confirmed");
    }

    console.log("Payment verified and entitlement saved", {
      uid: decoded.uid,
      orderId,
      paymentId,
      expiresAt,
    });

    return res.status(200).json({
      verified: true,
      expiresAt,
      message: "Payment verified successfully",
    });
  } catch (error) {
    // Detailed errors stay in server logs; never log secrets or tokens.
    console.error("Verify payment failed:", {
      message: error.message,
      code: error.code || null,
    });

    return sendError(
      res,
      500,
      "Could not verify payment. Do not pay again; contact support if money was deducted."
    );
  }
};
