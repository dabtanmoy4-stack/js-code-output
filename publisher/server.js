const express = require("express");

const {
  initializeApp
} = require("firebase-admin/app");

const {
  getFirestore,
  FieldValue
} = require("firebase-admin/firestore");

const {
  getStorage
} = require("firebase-admin/storage");

initializeApp();

const db = getFirestore();
const bucket = getStorage().bucket();

const app = express();

const PORT =
  Number(process.env.PORT) || 8080;

const PLANS = {
  basic: {
    storageLimitGB: 1,
    bandwidthLimitGB: 10
  },

  pro: {
    storageLimitGB: 5,
    bandwidthLimitGB: 50
  },

  business: {
    storageLimitGB: 20,
    bandwidthLimitGB: 250
  }
};

function getHostSlug(host) {
  const cleanHost =
    String(host || "")
      .split(":")[0]
      .toLowerCase();

  const match =
    cleanHost.match(
      /^([a-z0-9-]+)-shop\.jscodoutput\.in$/
    );

  return match
    ? match[1]
    : null;
}

function safePath(requestPath) {
  let path;

  try {
    path =
      decodeURIComponent(
        requestPath || "/"
      );
  } catch (_) {
    return null;
  }

  path =
    path
      .replace(/\\/g, "/")
      .replace(/^\/+/, "");

  if (!path) {
    path = "index.html";
  }

  const parts =
    path
      .split("/")
      .filter(Boolean);

  if (
    path.includes("\0") ||
    parts.some(
      part =>
        part === "." ||
        part === ".."
    )
  ) {
    return null;
  }

  return parts.join("/");
}

function mime(path) {
  const ext =
    String(path)
      .toLowerCase()
      .split(".")
      .pop();

  const types = {
    html: "text/html; charset=utf-8",
    htm: "text/html; charset=utf-8",

    css: "text/css; charset=utf-8",

    js: "text/javascript; charset=utf-8",
    mjs: "text/javascript; charset=utf-8",

    json: "application/json; charset=utf-8",

    txt: "text/plain; charset=utf-8",

    svg: "image/svg+xml",

    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    avif: "image/avif",
    ico: "image/x-icon",

    mp3: "audio/mpeg",
    wav: "audio/wav",

    mp4: "video/mp4",
    webm: "video/webm",

    pdf: "application/pdf",

    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    otf: "font/otf"
  };

  return (
    types[ext] ||
    "application/octet-stream"
  );
}

function quotaPage(
  title,
  message,
  projectName
) {
  const safeTitle =
    String(title || "")
      .replace(/[<>&"]/g, "");

  const safeMessage =
    String(message || "")
      .replace(/[<>&"]/g, "");

  const safeProject =
    String(projectName || "")
      .replace(/[<>&"]/g, "");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport"
      content="width=device-width,initial-scale=1">

<title>${safeTitle} | JS CODE OUTPUT</title>

<style>
*{
  box-sizing:border-box;
}

body{
  margin:0;
  min-height:100vh;

  display:flex;
  align-items:center;
  justify-content:center;

  padding:30px;

  background:#f8f6ee;
  color:#24221f;

  font-family:
    Georgia,
    "Times New Roman",
    serif;
}

.card{
  width:min(700px,100%);

  padding:48px;

  background:#fffdf8;

  border:1px solid #ddd3c2;

  border-radius:24px;

  box-shadow:
    0 25px 70px
    rgba(70,50,20,.12);

  text-align:center;
}

.logo{
  width:72px;
  height:72px;

  object-fit:contain;

  border-radius:16px;

  margin-bottom:22px;
}

h1{
  margin:0 0 15px;

  font-size:34px;
}

p{
  margin:10px 0;

  line-height:1.8;

  color:#6f522f;
}

.project{
  margin-top:20px;

  font-weight:700;

  color:#24221f;
}
</style>
</head>

<body>

<div class="card">

<img
  class="logo"
  src="https://www.jscodoutput.in/logo.jpeg"
  alt="JS CODE OUTPUT"
>

<h1>${safeTitle}</h1>

<p>
  ${safeMessage}
</p>

${
  safeProject
    ? `<p class="project">${safeProject}</p>`
    : ""
}

<p>
  Powered by JS CODE OUTPUT.
</p>

</div>

</body>
</html>`;
}

/*
=========================================
HEALTH CHECK
=========================================
*/

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "JS CODE OUTPUT Deploy Engine"
  });
});

/*
=========================================
LIVE WEBSITE ROUTER
=========================================
*/

app.get("*", async (req, res) => {
  try {
    const slug =
      getHostSlug(
        req.headers.host
      );

    if (!slug) {
      return res
        .status(404)
        .send(
          "Website not found"
        );
    }

    /*
    -------------------------------------
    Find deployment by slug
    -------------------------------------
    */

    const snapshot =
      await db
        .collection(
          "websiteDeployments"
        )
        .where(
          "slug",
          "==",
          slug
        )
        .limit(5)
        .get();

    if (snapshot.empty) {
      return res
        .status(404)
        .send(
          "Website unavailable"
        );
    }

    /*
    -------------------------------------
    Find valid matching deployment
    -------------------------------------
    */

    let deploymentDoc = null;

    for (
      const document of snapshot.docs
    ) {
      const data =
        document.data();

      if (
        data.active === true &&
        Number(
          data.expiresAt || 0
        ) > Date.now()
      ) {
        deploymentDoc =
          document;

        break;
      }
    }

    /*
    -------------------------------------
    Check expired / unavailable
    -------------------------------------
    */

    if (!deploymentDoc) {
      const first =
        snapshot.docs[0].data();

      if (
        first &&
        Number(
          first.expiresAt || 0
        ) <= Date.now()
      ) {
        return res
          .status(410)
          .send(
            quotaPage(
              "Website Expired",
              "This website deployment has expired. The owner can renew the website from JS CODE OUTPUT.",
              first.projectName
            )
          );
      }

      return res
        .status(404)
        .send(
          "Website unavailable"
        );
    }

    const deployment =
      deploymentDoc.data();

    /*
    -------------------------------------
    Quota already exceeded
    -------------------------------------
    */

    if (
      deployment.quotaExceeded === true
    ) {
      return res
        .status(429)
        .send(
          quotaPage(
            "Bandwidth Limit Reached",
            deployment.quotaWarning ||
              "This website has reached its monthly bandwidth limit.",
            deployment.projectName
          )
        );
    }

    /*
    -------------------------------------
    Resolve requested file
    -------------------------------------
    */

    const requestedPath =
      safePath(
        req.path
      );

    if (!requestedPath) {
      return res
        .status(400)
        .send(
          "Bad path"
        );
    }

    const storagePath =
      `published-sites/${deployment.uid}/${deployment.projectId}/${requestedPath}`;

    const file =
      bucket.file(
        storagePath
      );

    const [exists] =
      await file.exists();

    if (!exists) {
      return res
        .status(404)
        .send(
          "File not found"
        );
    }

    /*
    -------------------------------------
    File metadata
    -------------------------------------
    */

    const [metadata] =
      await file.getMetadata();

    const size =
      Number(
        metadata.size || 0
      );

    /*
    -------------------------------------
    Bandwidth limit
    -------------------------------------
    */

    const plan =
      PLANS[
        deployment.plan
      ];

    if (!plan) {
      return res
        .status(500)
        .send(
          "Invalid deployment plan"
        );
    }

    const bandwidthLimit =
      plan.bandwidthLimitGB *
      1024 ** 3;

    /*
    -------------------------------------
    Atomic bandwidth update
    -------------------------------------
    */

    const deploymentRef =
      deploymentDoc.ref;

    let blocked = false;

    await db.runTransaction(
      async transaction => {
        const fresh =
          await transaction.get(
            deploymentRef
          );

        const latest =
          fresh.data() || {};

        const current =
          Number(
            latest.bandwidthUsedBytes ||
            0
          );

        const next =
          current + size;

        if (
          latest.quotaExceeded === true ||
          next > bandwidthLimit
        ) {
          blocked = true;

          transaction.update(
            deploymentRef,
            {
              quotaExceeded: true,

              quotaWarning:
                `This website has reached its ${plan.bandwidthLimitGB} GB bandwidth limit.`,

              status:
                "quota_exceeded",

              updatedAt:
                FieldValue.serverTimestamp()
            }
          );

          return;
        }

        transaction.update(
          deploymentRef,
          {
            bandwidthUsedBytes:
              next,

            bandwidthUsedGB:
              Number(
                (
                  next /
                  1024 ** 3
                ).toFixed(4)
              ),

            updatedAt:
              FieldValue.serverTimestamp()
          }
        );
      }
    );

    if (blocked) {
      return res
        .status(429)
        .send(
          quotaPage(
            "Bandwidth Limit Reached",
            `This website has reached its ${plan.bandwidthLimitGB} GB bandwidth limit.`,
            deployment.projectName
          )
        );
    }

    /*
    -------------------------------------
    Response headers
    -------------------------------------
    */

    res.set(
      "Content-Type",
      metadata.contentType ||
        mime(requestedPath)
    );

    res.set(
      "Cache-Control",
      "public,max-age=300"
    );

    res.set(
      "X-Powered-By",
      "JS CODE OUTPUT Deploy Engine"
    );

    /*
    -------------------------------------
    Stream file
    -------------------------------------
    */

    file
      .createReadStream()
      .on("error", error => {
        console.error(
          "Storage stream error:",
          error
        );

        if (!res.headersSent) {
          res
            .status(500)
            .send(
              "Publisher error"
            );
        }
      })
      .pipe(res);

  } catch (error) {
    console.error(
      "Publisher error:",
      error
    );

    if (!res.headersSent) {
      res
        .status(500)
        .send(
          "Publisher error"
        );
    }
  }
});

/*
=========================================
START SERVER
=========================================
*/

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `JS CODE OUTPUT publisher running on port ${PORT}`
    );
  }
);