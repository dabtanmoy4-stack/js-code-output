const { onCall, HttpsError, onRequest } = require("firebase-functions/v2/https");
const { defineJsonSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const crypto = require("crypto");
const Razorpay = require("razorpay");

initializeApp();

const db = getDatabase();

const RAZORPAY_CONFIG = defineJsonSecret("RAZORPAY_CONFIG");

// ===============================
// PREMIUM PLANS
// ===============================

const PLANS = {
  first_week: {
    name: "First Week Offer",
    amount: 900, // ₹9
    interval: "weekly",
    durationDays: 7,
    firstOffer: true
  },

  weekly: {
    name: "Premium Weekly",
    amount: 2500, // ₹25
    interval: "weekly",
    durationDays: 7,
    firstOffer: false
  },

  monthly: {
    name: "Premium Monthly",
    amount: 8900, // ₹89
    interval: "monthly",
    durationDays: 30,
    firstOffer: false
  },

  yearly: {
    name: "Premium Yearly",
    amount: 79900, // ₹799
    interval: "yearly",
    durationDays: 365,
    firstOffer: false
  }
};


// ===============================
// AUTH
// ===============================

function requireAuth(request) {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError(
      "unauthenticated",
      "You must be logged in."
    );
  }

  return request.auth.uid;
}


// ===============================
// RAZORPAY
// ===============================

function razorpayClient() {
  const config = RAZORPAY_CONFIG.value();

  return new Razorpay({
    key_id: config.keyId,
    key_secret: config.keySecret
  });
}


// ===============================
// CREATE PAYMENT
// ===============================

exports.createPremiumPayment = onCall(
  {
    secrets: [RAZORPAY_CONFIG]
  },
  async (request) => {

    const uid = requireAuth(request);

    const planId = request.data?.plan;

    if (!planId || !PLANS[planId]) {
      throw new HttpsError(
        "invalid-argument",
        "Invalid Premium plan."
      );
    }

    const plan = PLANS[planId];

    const premiumRef =
      db.ref(`premiumUsers/${uid}`);

    const snapshot =
      await premiumRef.once("value");

    const current =
      snapshot.val() || {};

    // First offer only once
    if (
      plan.firstOffer &&
      current.firstOfferUsed === true
    ) {
      throw new HttpsError(
        "failed-precondition",
        "First week offer has already been used."
      );
    }

    // Don't create another payment
    // while Premium is active
    if (
      current.active === true &&
      current.expiresAt &&
      Number(current.expiresAt) > Date.now()
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Premium is already active."
      );
    }

    const razorpay =
      razorpayClient();

    const receipt =
      `jco_${uid.substring(0, 10)}_${Date.now()}`;

    const order =
      await razorpay.orders.create({
        amount: plan.amount,
        currency: "INR",
        receipt,

        notes: {
          uid,
          plan: planId,
          product: "JS CODE OUTPUT Premium"
        }
      });

    await premiumRef
      .child("pendingPayment")
      .set({
        orderId: order.id,
        plan: planId,
        amount: plan.amount,
        createdAt: Date.now()
      });

    const config =
      RAZORPAY_CONFIG.value();

    return {
      success: true,
      orderId: order.id,
      amount: plan.amount,
      currency: "INR",
      keyId: config.keyId,
      plan: planId
    };
  }
);


// ===============================
// VERIFY PAYMENT
// ===============================

exports.verifyPremiumPayment = onCall(
  {
    secrets: [RAZORPAY_CONFIG]
  },
  async (request) => {

    const uid = requireAuth(request);

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = request.data || {};

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Incomplete payment information."
      );
    }

    const premiumRef =
      db.ref(`premiumUsers/${uid}`);

    const snapshot =
      await premiumRef.once("value");

    const current =
      snapshot.val() || {};

    const pending =
      current.pendingPayment;

    if (!pending) {
      throw new HttpsError(
        "failed-precondition",
        "No pending payment found."
      );
    }

    if (
      pending.orderId !==
      razorpay_order_id
    ) {
      throw new HttpsError(
        "permission-denied",
        "Order does not belong to this account."
      );
    }

    const config =
      RAZORPAY_CONFIG.value();

    const expectedSignature =
      crypto
        .createHmac(
          "sha256",
          config.keySecret
        )
        .update(
          `${razorpay_order_id}|${razorpay_payment_id}`
        )
        .digest("hex");

    if (
      expectedSignature !==
      razorpay_signature
    ) {
      throw new HttpsError(
        "permission-denied",
        "Payment signature verification failed."
      );
    }

    const planId =
      pending.plan;

    const plan =
      PLANS[planId];

    if (!plan) {
      throw new HttpsError(
        "internal",
        "Invalid stored plan."
      );
    }

    const razorpay =
      razorpayClient();

    const payment =
      await razorpay.payments.fetch(
        razorpay_payment_id
      );

    if (
      payment.status !== "captured"
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Payment has not been captured."
      );
    }

    // Verify actual paid amount
    if (
      Number(payment.amount) !==
      Number(plan.amount)
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Payment amount mismatch."
      );
    }

    const now =
      Date.now();

    let expiresAt =
      now +
      plan.durationDays *
      24 *
      60 *
      60 *
      1000;

    // Extend existing active Premium
    if (
      current.expiresAt &&
      Number(current.expiresAt) > now
    ) {
      expiresAt =
        Number(current.expiresAt) +
        plan.durationDays *
        24 *
        60 *
        60 *
        1000;
    }

    const update = {
      active: true,
      status: "active",

      plan: plan.name,
      interval: plan.interval,

      paymentId:
        razorpay_payment_id,

      orderId:
        razorpay_order_id,

      amount:
        plan.amount,

      expiresAt,

      updatedAt: now
    };

    // Permanently mark first offer used
    if (plan.firstOffer) {
      update.firstOfferUsed = true;
    }

    await premiumRef.update(update);

    await premiumRef
      .child("pendingPayment")
      .remove();

    return {
      success: true,
      active: true,
      plan: plan.name,
      expiresAt
    };
  }
);


// ===============================
// GET PREMIUM STATUS
// ===============================

exports.getPremiumStatus = onCall(
  async (request) => {

    const uid =
      requireAuth(request);

    const snapshot =
      await db
        .ref(`premiumUsers/${uid}`)
        .once("value");

    const data =
      snapshot.val() || {};

    const now =
      Date.now();

    const expiresAt =
      Number(data.expiresAt || 0);

    const active =
      data.active === true &&
      expiresAt > now;

    if (
      data.active === true &&
      expiresAt <= now
    ) {
      await db
        .ref(`premiumUsers/${uid}`)
        .update({
          active: false,
          status: "expired",
          updatedAt: now
        });
    }

    return {
      active,

      status:
        active
          ? "active"
          : "inactive",

      plan:
        active
          ? data.plan || null
          : null,

      interval:
        active
          ? data.interval || null
          : null,

      expiresAt:
        active
          ? expiresAt
          : null,

      firstOfferUsed:
        data.firstOfferUsed === true
    };
  }
);


// ===============================
// RAZORPAY WEBHOOK
// ===============================

exports.razorpayWebhook = onRequest(
  {
    secrets: [RAZORPAY_CONFIG]
  },
  async (req, res) => {

    if (req.method !== "POST") {
      return res
        .status(405)
        .send("Method Not Allowed");
    }

    const config =
      RAZORPAY_CONFIG.value();

    const webhookSecret =
      config.webhookSecret;

    const receivedSignature =
      req.headers["x-razorpay-signature"];

    if (!receivedSignature) {
      return res
        .status(400)
        .send("Missing signature");
    }

    const rawBody =
      req.rawBody;

    const expectedSignature =
      crypto
        .createHmac(
          "sha256",
          webhookSecret
        )
        .update(rawBody)
        .digest("hex");

    if (
      expectedSignature !==
      receivedSignature
    ) {
      return res
        .status(400)
        .send("Invalid signature");
    }

    const event =
      req.body?.event;

    console.log(
      "Razorpay webhook:",
      event
    );

    return res
      .status(200)
      .send("OK");
  }
);
