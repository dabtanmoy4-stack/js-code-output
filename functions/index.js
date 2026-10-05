const {
  onCall,
  onRequest,
  HttpsError,
} = require("firebase-functions/v2/https");

const { defineJsonSecret } = require("firebase-functions/params");

const {
  initializeApp,
} = require("firebase-admin/app");

const {
  getFirestore,
  FieldValue,
} = require("firebase-admin/firestore");

const {
  getStorage,
} = require("firebase-admin/storage");

const crypto = require("crypto");
const Razorpay = require("razorpay");

initializeApp();

const db = getFirestore();
const bucket = getStorage().bucket();

const RAZORPAY_CONFIG = defineJsonSecret("RAZORPAY_CONFIG");


// ============================================================
// PLANS
// ============================================================

const PLANS = {
  basic: {
    name: "Basic Website",
    initial: 900,
    renewal: 900,
    days: 30,
    limit: 1 * 1024 ** 3,
    storageLimitGB: 1,
    bandwidthLimitGB: 10,
  },

  pro: {
    name: "Pro Website",
    initial: 2900,
    renewal: 2900,
    days: 30,
    limit: 5 * 1024 ** 3,
    storageLimitGB: 5,
    bandwidthLimitGB: 50,
  },

  business: {
    name: "Business Website",
    initial: 9900,
    renewal: 9900,
    days: 30,
    limit: 20 * 1024 ** 3,
    storageLimitGB: 20,
    bandwidthLimitGB: 250,
  },
};


// ============================================================
// HELPERS
// ============================================================

function getConfig() {
  const config = RAZORPAY_CONFIG.value();

  if (
    !config ||
    !config.keyId ||
    !config.keySecret ||
    !config.cronSecret
  ) {
    throw new Error(
      "RAZORPAY_CONFIG is missing keyId, keySecret or cronSecret."
    );
  }

  return config;
}


function deploymentRef(uid, projectId) {
  return db.doc(`websiteDeployments/${uid}_${projectId}`);
}


function requireAuth(request) {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError(
      "unauthenticated",
      "Please sign in."
    );
  }

  return request.auth.uid;
}


function getRazorpay() {
  const config = getConfig();

  return new Razorpay({
    key_id: config.keyId,
    key_secret: config.keySecret,
  });
}


function makeSlug(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}


function safeProjectPath(filePath) {
  let path = String(filePath || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");

  if (!path) {
    return null;
  }

  if (
    path.includes("..") ||
    path.includes("\0")
  ) {
    return null;
  }

  return path;
}


async function getUserProject(uid, projectId) {
  if (!projectId) {
    throw new HttpsError(
      "invalid-argument",
      "Project ID is required."
    );
  }

  const snapshot = await db
    .doc(`users/${uid}/projects/${projectId}`)
    .get();

  if (!snapshot.exists) {
    throw new HttpsError(
      "not-found",
      "Project not found."
    );
  }

  const project = snapshot.data();

  if (
    project.ownerId &&
    project.ownerId !== uid
  ) {
    throw new HttpsError(
      "permission-denied",
      "Access denied."
    );
  }

  return project;
}


function verifyRazorpaySignature(
  orderId,
  paymentId,
  signature
) {
  if (
    !orderId ||
    !paymentId ||
    !signature
  ) {
    return false;
  }

  const config = getConfig();

  const expected = crypto
    .createHmac(
      "sha256",
      config.keySecret
    )
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(String(signature));

  if (
    expectedBuffer.length !==
    signatureBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    expectedBuffer,
    signatureBuffer
  );
}


async function createRazorpayOrder(
  amount,
  notes
) {
  const razorpay = getRazorpay();

  return razorpay.orders.create({
    amount,
    currency: "INR",
    receipt: `jco_${Date.now()}`,
    notes,
  });
}


async function getAndValidateRazorpayOrder(
  orderId,
  expected
) {
  if (!orderId) {
    throw new HttpsError(
      "invalid-argument",
      "Razorpay order ID is required."
    );
  }

  const razorpay = getRazorpay();

  let order;

  try {
    order = await razorpay.orders.fetch(
      orderId
    );
  } catch (error) {
    console.error(
      "Razorpay order fetch failed:",
      error
    );

    throw new HttpsError(
      "failed-precondition",
      "Unable to verify Razorpay order."
    );
  }

  if (!order) {
    throw new HttpsError(
      "failed-precondition",
      "Razorpay order not found."
    );
  }

  if (
    String(order.currency) !== "INR"
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Invalid payment currency."
    );
  }

  if (
    expected.amount !== undefined &&
    Number(order.amount) !==
      Number(expected.amount)
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Payment amount does not match the selected plan."
    );
  }

  const notes = order.notes || {};

  if (
    expected.uid &&
    String(notes.uid || "") !==
      String(expected.uid)
  ) {
    throw new HttpsError(
      "permission-denied",
      "Payment ownership verification failed."
    );
  }

  if (
    expected.projectId &&
    String(notes.projectId || "") !==
      String(expected.projectId)
  ) {
    throw new HttpsError(
      "permission-denied",
      "Payment project verification failed."
    );
  }

  if (
    expected.plan &&
    String(notes.plan || "") !==
      String(expected.plan)
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Payment plan verification failed."
    );
  }

  if (
    expected.type &&
    String(notes.type || "") !==
      String(expected.type)
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Payment type verification failed."
    );
  }

  return order;
}


// ============================================================
// PROJECT FILE HELPERS
// ============================================================

function decodeProjectFile(value) {
  if (typeof value === "string") {
    return Buffer.from(value, "utf8");
  }

  if (
    value &&
    typeof value === "object"
  ) {
    if (
      typeof value.dataUrl === "string"
    ) {
      const match = value.dataUrl.match(
        /^data:[^;]+;base64,(.*)$/s
      );

      if (match) {
        return Buffer.from(
          match[1],
          "base64"
        );
      }

      return Buffer.from(
        value.dataUrl,
        "utf8"
      );
    }

    if (
      typeof value.content === "string"
    ) {
      if (
        value.encoding === "base64"
      ) {
        return Buffer.from(
          value.content,
          "base64"
        );
      }

      return Buffer.from(
        value.content,
        "utf8"
      );
    }

    if (
      typeof value.base64 === "string"
    ) {
      return Buffer.from(
        value.base64,
        "base64"
      );
    }

    try {
      return Buffer.from(
        JSON.stringify(value),
        "utf8"
      );
    } catch (error) {
      return Buffer.from("", "utf8");
    }
  }

  if (
    value === null ||
    value === undefined
  ) {
    return Buffer.from("", "utf8");
  }

  return Buffer.from(
    String(value),
    "utf8"
  );
}


function contentTypeForPath(filePath) {
  const lower = String(filePath)
    .toLowerCase();

  if (lower.endsWith(".html") ||
      lower.endsWith(".htm")) {
    return "text/html; charset=utf-8";
  }

  if (lower.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }

  if (lower.endsWith(".js")) {
    return "application/javascript; charset=utf-8";
  }

  if (lower.endsWith(".json")) {
    return "application/json; charset=utf-8";
  }

  if (lower.endsWith(".svg")) {
    return "image/svg+xml";
  }

  if (lower.endsWith(".png")) {
    return "image/png";
  }

  if (
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg")
  ) {
    return "image/jpeg";
  }

  if (lower.endsWith(".gif")) {
    return "image/gif";
  }

  if (lower.endsWith(".webp")) {
    return "image/webp";
  }

  if (lower.endsWith(".ico")) {
    return "image/x-icon";
  }

  if (lower.endsWith(".txt")) {
    return "text/plain; charset=utf-8";
  }

  if (lower.endsWith(".xml")) {
    return "application/xml";
  }

  if (lower.endsWith(".pdf")) {
    return "application/pdf";
  }

  return "application/octet-stream";
}


function normalizeProjectFiles(
  projectFiles
) {
  if (
    !projectFiles ||
    typeof projectFiles !== "object"
  ) {
    return {};
  }

  const output = {};

  for (
    const [rawPath, value]
    of Object.entries(projectFiles)
  ) {
    const path =
      safeProjectPath(rawPath);

    if (!path) {
      continue;
    }

    output[path] = value;
  }

  return output;
}


async function deletePublishedProjectFiles(
  uid,
  projectId
) {
  const prefix =
    `published-sites/${uid}/${projectId}/`;

  const [files] =
    await bucket.getFiles({
      prefix,
    });

  if (!files.length) {
    return;
  }

  await Promise.all(
    files.map(file =>
      file.delete().catch(error => {
        console.error(
          "Storage delete failed:",
          file.name,
          error
        );
      })
    )
  );
}


async function publishProjectFiles(
  uid,
  projectId,
  projectFiles,
  storageLimit
) {
  const files =
    normalizeProjectFiles(projectFiles);

  if (!files["index.html"]) {
    throw new HttpsError(
      "failed-precondition",
      "Your project must contain index.html."
    );
  }

  const entries =
    Object.entries(files);

  if (!entries.length) {
    throw new HttpsError(
      "failed-precondition",
      "Project has no files."
    );
  }

  let totalBytes = 0;

  const prepared = [];

  for (
    const [path, value]
    of entries
  ) {
    const buffer =
      decodeProjectFile(value);

    totalBytes += buffer.length;

    if (
      totalBytes >
      Number(storageLimit)
    ) {
      throw new HttpsError(
        "resource-exhausted",
        "Project exceeds the storage limit of the selected plan."
      );
    }

    prepared.push({
      path,
      buffer,
    });
  }

  await deletePublishedProjectFiles(
    uid,
    projectId
  );

  for (
    const item of prepared
  ) {
    const storagePath =
      `published-sites/${uid}/${projectId}/${item.path}`;

    const file =
      bucket.file(storagePath);

    await file.save(
      item.buffer,
      {
        resumable: false,
        metadata: {
          contentType:
            contentTypeForPath(
              item.path
            ),
          cacheControl:
            "public,max-age=3600",
        },
      }
    );
  }

  return {
    fileCount: prepared.length,
    storageBytes: totalBytes,
  };
}


// ============================================================
// GET DEPLOYMENT
// ============================================================

exports.getWebsiteDeployment =
  onCall(
    {
      region: "asia-south1",
    },
    async request => {
      const uid =
        requireAuth(request);

      const projectId =
        String(
          request.data?.projectId || ""
        );

      const snapshot =
        await deploymentRef(
          uid,
          projectId
        ).get();

      if (!snapshot.exists) {
        return null;
      }

      return snapshot.data();
    }
  );


// ============================================================
// CREATE INITIAL PUBLISH PAYMENT
// ============================================================

exports.createWebsitePublishPayment =
  onCall(
    {
      region: "asia-south1",
      secrets: [RAZORPAY_CONFIG],
    },
    async request => {
      const uid =
        requireAuth(request);

      const projectId =
        String(
          request.data?.projectId || ""
        );

      const planId =
        String(
          request.data?.plan || ""
        );

      if (!PLANS[planId]) {
        throw new HttpsError(
          "invalid-argument",
          "Invalid plan."
        );
      }

      const project =
        await getUserProject(
          uid,
          projectId
        );

      const deployment =
        await deploymentRef(
          uid,
          projectId
        ).get();

      if (
        deployment.exists &&
        deployment.data().active
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Website is already active."
        );
      }

      const slug =
        makeSlug(
          project.name
        );

      if (!slug) {
        throw new HttpsError(
          "failed-precondition",
          "Project name cannot be converted into a valid website address."
        );
      }

      const existing =
        await db
          .collection(
            "websiteDeployments"
          )
          .where(
            "slug",
            "==",
            slug
          )
          .where(
            "active",
            "==",
            true
          )
          .limit(1)
          .get();

      if (!existing.empty) {
        throw new HttpsError(
          "already-exists",
          "This website address is already in use. Please change the project name."
        );
      }

      const order =
        await createRazorpayOrder(
          PLANS[planId].initial,
          {
            uid,
            projectId,
            plan: planId,
            type: "website_publish",
          }
        );

      const config =
        getConfig();

      return {
        orderId: order.id,
        amount: order.amount,
        keyId: config.keyId,
        description:
          `${PLANS[planId].name} — ${
            project.name || "Project"
          }`,
      };
    }
  );


// ============================================================
// VERIFY INITIAL PUBLISH PAYMENT
// ============================================================

exports.verifyWebsitePublishPayment =
  onCall(
    {
      region: "asia-south1",
      secrets: [RAZORPAY_CONFIG],
    },
    async request => {
      const uid =
        requireAuth(request);

      const data =
        request.data || {};

      const projectId =
        String(
          data.projectId || ""
        );

      const planId =
        String(
          data.plan || ""
        );

      const paymentId =
        String(
          data.razorpay_payment_id ||
          ""
        );

      const orderId =
        String(
          data.razorpay_order_id ||
          ""
        );

      const signature =
        String(
          data.razorpay_signature ||
          ""
        );

      const plan =
        PLANS[planId];

      if (!plan) {
        throw new HttpsError(
          "invalid-argument",
          "Invalid plan."
        );
      }

      if (
        !verifyRazorpaySignature(
          orderId,
          paymentId,
          signature
        )
      ) {
        throw new HttpsError(
          "permission-denied",
          "Payment verification failed."
        );
      }

      const deploymentDoc =
        deploymentRef(
          uid,
          projectId
        );

      const existing =
        await deploymentDoc.get();

      if (
        existing.exists &&
        existing.data()
          .publishPaymentId ===
          paymentId
      ) {
        return {
          ok: true,
          liveUrl:
            existing.data().liveUrl,
        };
      }

      await getAndValidateRazorpayOrder(
        orderId,
        {
          uid,
          projectId,
          plan: planId,
          type: "website_publish",
          amount: plan.initial,
        }
      );

      const project =
        await getUserProject(
          uid,
          projectId
        );

      const slug =
        makeSlug(
          project.name
        );

      if (!slug) {
        throw new HttpsError(
          "failed-precondition",
          "Project name cannot be converted into a valid website address."
        );
      }

      const collision =
        await db
          .collection(
            "websiteDeployments"
          )
          .where(
            "slug",
            "==",
            slug
          )
          .where(
            "active",
            "==",
            true
          )
          .limit(1)
          .get();

      if (
        !collision.empty &&
        collision.docs[0].id !==
          `${uid}_${projectId}`
      ) {
        throw new HttpsError(
          "already-exists",
          "This website address is already in use."
        );
      }

      const projectFiles =
        project.files || {};

      const published =
        await publishProjectFiles(
          uid,
          projectId,
          projectFiles,
          plan.limit
        );

      const expiresAt =
        Date.now() +
        plan.days *
          86400000;

      const liveUrl =
        `https://${slug}-shop.jscodoutput.in`;

      await deploymentDoc.set(
        {
          uid,
          projectId,

          projectName:
            project.name ||
            "Project",

          slug,
          liveUrl,

          plan: planId,
          planName: plan.name,

          active: true,
          status: "active",

          expiresAt,

          storageLimit:
            plan.limit,

          storageLimitGB:
            plan.storageLimitGB,

          bandwidthLimitGB:
            plan.bandwidthLimitGB,

          storageUsedBytes:
            published.storageBytes,

          storageUsedGB:
            published.storageBytes /
            1024 ** 3,

          bandwidthUsedBytes:
            0,

          bandwidthUsedGB:
            0,

          fileCount:
            published.fileCount,

          paymentId,
          orderId,

          publishPaymentId:
            paymentId,

          publishedAt:
            FieldValue.serverTimestamp(),

          updatedAt:
            FieldValue.serverTimestamp(),

          version:
            existing.exists
              ? Number(
                  existing.data().version ||
                    0
                ) + 1
              : 1,
        },
        {
          merge: true,
        }
      );

      return {
        ok: true,
        liveUrl,
        slug,
        expiresAt,
        plan: planId,
      };
    }
  );


// ============================================================
// CREATE RENEWAL PAYMENT
// ============================================================

exports.createWebsiteRenewalPayment =
  onCall(
    {
      region: "asia-south1",
      secrets: [RAZORPAY_CONFIG],
    },
    async request => {
      const uid =
        requireAuth(request);

      const projectId =
        String(
          request.data?.projectId || ""
        );

      const deployment =
        await deploymentRef(
          uid,
          projectId
        ).get();

      if (!deployment.exists) {
        throw new HttpsError(
          "not-found",
          "Deployment not found."
        );
      }

      const data =
        deployment.data();

      const plan =
        PLANS[data.plan];

      if (!plan) {
        throw new HttpsError(
          "failed-precondition",
          "Plan not found."
        );
      }

      const order =
        await createRazorpayOrder(
          plan.renewal,
          {
            uid,
            projectId,
            plan: data.plan,
            type: "website_renewal",
          }
        );

      const config =
        getConfig();

      return {
        orderId: order.id,
        amount: order.amount,
        keyId: config.keyId,
        description:
          `Renew ${data.projectName || "Website"}`,
      };
    }
  );


// ============================================================
// VERIFY RENEWAL PAYMENT
// ============================================================

exports.verifyWebsiteRenewalPayment =
  onCall(
    {
      region: "asia-south1",
      secrets: [RAZORPAY_CONFIG],
    },
    async request => {
      const uid =
        requireAuth(request);

      const data =
        request.data || {};

      const projectId =
        String(
          data.projectId || ""
        );

      const paymentId =
        String(
          data.razorpay_payment_id ||
          ""
        );

      const orderId =
        String(
          data.razorpay_order_id ||
          ""
        );

      const signature =
        String(
          data.razorpay_signature ||
          ""
        );

      if (
        !verifyRazorpaySignature(
          orderId,
          paymentId,
          signature
        )
      ) {
        throw new HttpsError(
          "permission-denied",
          "Payment verification failed."
        );
      }

      const deploymentDoc =
        deploymentRef(
          uid,
          projectId
        );

      const snapshot =
        await deploymentDoc.get();

      if (!snapshot.exists) {
        throw new HttpsError(
          "not-found",
          "Deployment not found."
        );
      }

      const deployment =
        snapshot.data();

      if (
        deployment.lastRenewalPaymentId ===
        paymentId
      ) {
        return {
          ok: true,
          expiresAt:
            deployment.expiresAt,
          liveUrl:
            deployment.liveUrl,
        };
      }

      const plan =
        PLANS[deployment.plan];

      if (!plan) {
        throw new HttpsError(
          "failed-precondition",
          "Plan not found."
        );
      }

      await getAndValidateRazorpayOrder(
        orderId,
        {
          uid,
          projectId,
          plan: deployment.plan,
          type: "website_renewal",
          amount: plan.renewal,
        }
      );

      const expiresAt =
        Math.max(
          Date.now(),
          Number(
            deployment.expiresAt || 0
          )
        ) +
        plan.days *
          86400000;

      await deploymentDoc.set(
        {
          active: true,
          status: "active",

          expiresAt,

          lastRenewalPaymentId:
            paymentId,

          lastRenewalOrderId:
            orderId,

          bandwidthUsedBytes:
            0,

          bandwidthUsedGB:
            0,

          updatedAt:
            FieldValue.serverTimestamp(),
        },
        {
          merge: true,
        }
      );

      return {
        ok: true,
        expiresAt,
        liveUrl:
          deployment.liveUrl,
      };
    }
  );


// ============================================================
// CREATE PLAN CHANGE PAYMENT
// ============================================================

exports.createWebsitePlanChangePayment =
  onCall(
    {
      region: "asia-south1",
      secrets: [RAZORPAY_CONFIG],
    },
    async request => {
      const uid =
        requireAuth(request);

      const projectId =
        String(
          request.data?.projectId || ""
        );

      const targetPlanId =
        String(
          request.data?.plan || ""
        );

      if (!PLANS[targetPlanId]) {
        throw new HttpsError(
          "invalid-argument",
          "Invalid target plan."
        );
      }

      const deployment =
        await deploymentRef(
          uid,
          projectId
        ).get();

      if (!deployment.exists) {
        throw new HttpsError(
          "not-found",
          "Deployment not found."
        );
      }

      const current =
        deployment.data();

      if (
        current.plan ===
        targetPlanId
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Website is already using this plan."
        );
      }

      const target =
        PLANS[targetPlanId];

      const currentStorage =
        Number(
          current.storageUsedBytes || 0
        );

      if (
        currentStorage >
        target.limit
      ) {
        throw new HttpsError(
          "resource-exhausted",
          "Your current website storage is larger than the selected plan allows."
        );
      }

      const order =
        await createRazorpayOrder(
          target.initial,
          {
            uid,
            projectId,
            plan: targetPlanId,
            type: "website_plan_change",
          }
        );

      const config =
        getConfig();

      return {
        orderId: order.id,
        amount: order.amount,
        keyId: config.keyId,

        description:
          `Change to ${target.name}`,
      };
    }
  );


// ============================================================
// VERIFY PLAN CHANGE PAYMENT
// ============================================================

exports.verifyWebsitePlanChangePayment =
  onCall(
    {
      region: "asia-south1",
      secrets: [RAZORPAY_CONFIG],
    },
    async request => {
      const uid =
        requireAuth(request);

      const data =
        request.data || {};

      const projectId =
        String(
          data.projectId || ""
        );

      const targetPlanId =
        String(
          data.plan || ""
        );

      const paymentId =
        String(
          data.razorpay_payment_id ||
          ""
        );

      const orderId =
        String(
          data.razorpay_order_id ||
          ""
        );

      const signature =
        String(
          data.razorpay_signature ||
          ""
        );

      const targetPlan =
        PLANS[targetPlanId];

      if (!targetPlan) {
        throw new HttpsError(
          "invalid-argument",
          "Invalid target plan."
        );
      }

      if (
        !verifyRazorpaySignature(
          orderId,
          paymentId,
          signature
        )
      ) {
        throw new HttpsError(
          "permission-denied",
          "Payment verification failed."
        );
      }

      const deploymentDoc =
        deploymentRef(
          uid,
          projectId
        );

      const snapshot =
        await deploymentDoc.get();

      if (!snapshot.exists) {
        throw new HttpsError(
          "not-found",
          "Deployment not found."
        );
      }

      const current =
        snapshot.data();

      if (
        current.lastPlanChangePaymentId ===
        paymentId
      ) {
        return {
          ok: true,
          plan: current.plan,
          planName:
            current.planName,
          expiresAt:
            current.expiresAt,
          liveUrl:
            current.liveUrl,
        };
      }

      const storageUsed =
        Number(
          current.storageUsedBytes || 0
        );

      if (
        storageUsed >
        targetPlan.limit
      ) {
        throw new HttpsError(
          "resource-exhausted",
          "Your current website storage is larger than the selected plan allows."
        );
      }

      await getAndValidateRazorpayOrder(
        orderId,
        {
          uid,
          projectId,
          plan: targetPlanId,
          type: "website_plan_change",
          amount: targetPlan.initial,
        }
      );

      const expiresAt =
        Math.max(
          Date.now(),
          Number(
            current.expiresAt || 0
          )
        ) +
        targetPlan.days *
          86400000;

      await deploymentDoc.set(
        {
          plan:
            targetPlanId,

          planName:
            targetPlan.name,

          storageLimit:
            targetPlan.limit,

          storageLimitGB:
            targetPlan.storageLimitGB,

          bandwidthLimitGB:
            targetPlan.bandwidthLimitGB,

          expiresAt,

          active: true,
          status: "active",

          lastPlanChangePaymentId:
            paymentId,

          lastPlanChangeOrderId:
            orderId,

          updatedAt:
            FieldValue.serverTimestamp(),
        },
        {
          merge: true,
        }
      );

      return {
        ok: true,

        plan:
          targetPlanId,

        planName:
          targetPlan.name,

        expiresAt,

        liveUrl:
          current.liveUrl,
      };
    }
  );


// ============================================================
// UNPUBLISH WEBSITE
// ============================================================

exports.unpublishWebsite =
  onCall(
    {
      region: "asia-south1",
    },
    async request => {
      const uid =
        requireAuth(request);

      const projectId =
        String(
          request.data?.projectId || ""
        );

      const deploymentDoc =
        deploymentRef(
          uid,
          projectId
        );

      const snapshot =
        await deploymentDoc.get();

      if (!snapshot.exists) {
        throw new HttpsError(
          "not-found",
          "Deployment not found."
        );
      }

      const deployment =
        snapshot.data();

      await deletePublishedProjectFiles(
        uid,
        projectId
      );

      await deploymentDoc.set(
        {
          active: false,
          status: "unpublished",

          storageUsedBytes: 0,
          storageUsedGB: 0,

          bandwidthUsedBytes: 0,
          bandwidthUsedGB: 0,

          unpublishedAt:
            FieldValue.serverTimestamp(),

          updatedAt:
            FieldValue.serverTimestamp(),
        },
        {
          merge: true,
        }
      );

      return {
        ok: true,
        status: "unpublished",
      };
    }
  );


// ============================================================
// EXPIRE WEBSITES
// ============================================================

exports.expireWebsiteDeployments =
  onRequest(
    {
      region: "asia-south1",
      secrets: [RAZORPAY_CONFIG],
    },
    async (request, response) => {
      try {
        const config =
          getConfig();

        const cronSecret =
          request.headers[
            "x-cron-secret"
          ];

        if (
          cronSecret !==
          config.cronSecret
        ) {
          return response
            .status(401)
            .send("Unauthorized");
        }

        const now =
          Date.now();

        const snapshot =
          await db
            .collection(
              "websiteDeployments"
            )
            .where(
              "active",
              "==",
              true
            )
            .get();

        const batch =
          db.batch();

        let expired = 0;

        snapshot.forEach(doc => {
          const data =
            doc.data();

          if (
            Number(
              data.expiresAt || 0
            ) <= now
          ) {
            batch.update(
              doc.ref,
              {
                active: false,
                status: "expired",

                updatedAt:
                  FieldValue.serverTimestamp(),
              }
            );

            expired++;
          }
        });

        if (expired > 0) {
          await batch.commit();
        }

        return response.json({
          ok: true,
          expired,
        });

      } catch (error) {
        console.error(
          "Expiration job failed:",
          error
        );

        return response
          .status(500)
          .json({
            ok: false,
            error:
              "Expiration job failed.",
          });
      }
    }
  );