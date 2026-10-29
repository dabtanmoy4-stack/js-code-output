# JS CODE OUTPUT Publishing System

This document describes the complete production publishing system used by JS CODE OUTPUT.

The system consists of the following files and services:

- `deploy.html`
- `js-deploy-engine.html`
- `deploy_website.html`
- `functions/index.js`
- `functions/package.json`
- `publisher/server.js`
- `publisher/package.json`
- `publisher/Dockerfile`
- `firebase.json`
- `firestore.rules`
- `storage.rules`

The publishing system uses Firebase Authentication, Firestore, Firebase Storage, Firebase Functions, Razorpay and Google Cloud Run.

---

## 1. Publishing Architecture

The publishing flow is:

```text
User
  ↓
JS CODE OUTPUT Workspace
  ↓
Project saved in Firestore
  ↓
Deploy Website
  ↓
Select Hosting Plan
  ↓
Razorpay Payment
  ↓
Firebase Function verifies payment
  ↓
Project files are read
  ↓
Files are uploaded to Firebase Storage
  ↓
Deployment record is created in Firestore
  ↓
Cloud Run Publisher serves the files
  ↓
https://project-name-shop.jscodoutput.in
```

Firestore stores project metadata and project information.

Firebase Storage stores the actual published website files.

Cloud Run is responsible for serving the published website to visitors.

---

# 2. Important Storage Rule

Firestore must NOT be used to store 1–5 GB of website files.

Large files and binary assets must be stored in Firebase Storage.

Published files use this structure:

```text
published-sites/
└── {uid}/
    └── {projectId}/
        ├── index.html
        ├── style.css
        ├── script.js
        ├── images/
        │   ├── logo.png
        │   └── banner.jpg
        └── other project files
```

The main entry point must be:

```text
published-sites/{uid}/{projectId}/index.html
```

The publisher reads website files from this Storage location.

---

# 3. Firebase Authentication

Users must be authenticated before they can:

- create a deployment
- publish a website
- renew a website
- change a hosting plan
- unpublish a website
- view their deployment information

The backend must never trust a user-supplied UID.

The Firebase Authentication UID from the authenticated request must be used.

---

# 4. Firestore Project Structure

User projects are stored under:

```text
users/{uid}/projects/{projectId}
```

A project contains information such as:

```text
name
files
updatedAt
```

The publishing system reads the authenticated user's project.

The backend must verify that the project belongs to the authenticated user.

---

# 5. Deployment Record

Published website information is stored in:

```text
websiteDeployments/{uid}_{projectId}
```

A deployment record can contain:

```text
uid
projectId
projectName
slug
liveUrl

plan
planName

active
status
expiresAt

storageLimit
storageLimitGB
storageUsedBytes
storageUsedGB

bandwidthLimitGB
bandwidthUsedBytes
bandwidthUsedGB

fileCount

paymentId
orderId

publishPaymentId
lastRenewalPaymentId
lastRenewalOrderId

publishedAt
updatedAt
version
```

This record is used by the deploy dashboard and publisher.

---

# 6. Hosting Plans

The production hosting plans are:

## Basic

```text
Price: ₹9/month
Storage: 1 GB
Bandwidth: 10 GB/month
Duration: 30 days
```

## Pro

```text
Price: ₹29/month
Storage: 5 GB
Bandwidth: 50 GB/month
Duration: 30 days
```

## Business

```text
Price: ₹99/month
Storage: 20 GB
Bandwidth: 250 GB/month
Duration: 30 days
```

The same plan limits must be used consistently across:

- frontend plan cards
- deployment dashboard
- Firebase Functions
- publisher quota handling
- renewal system
- plan-change system

Razorpay amounts are stored in paise:

```text
Basic    = 900 paise
Pro      = 2900 paise
Business = 9900 paise
```

---

# 7. Razorpay Secret Configuration

Razorpay private credentials must never be placed inside frontend HTML or JavaScript.

Firebase Secret Manager must contain:

```text
RAZORPAY_CONFIG
```

The value must be JSON:

```json
{
  "keyId": "rzp_live_...",
  "keySecret": "...",
  "cronSecret": "random-secret"
}
```

`keySecret` must remain server-side.

`cronSecret` is used to protect the website-expiration endpoint.

The public Razorpay `keyId` may be returned by the backend when creating a checkout session.

---

# 8. Installing Firebase Functions

Open the project terminal:

```bash
cd functions
npm install
```

Then deploy:

```bash
firebase deploy --only functions
```

The Firebase Functions should use:

```text
asia-south1
```

---

# 9. Firebase Functions

The backend provides the following functions:

```text
getWebsiteDeployment

createWebsitePublishPayment
verifyWebsitePublishPayment

createWebsiteRenewalPayment
verifyWebsiteRenewalPayment

createWebsitePlanChangePayment
verifyWebsitePlanChangePayment

unpublishWebsite

expireWebsiteDeployments
```

These functions connect the frontend, Firestore, Storage and Razorpay.

---

# 10. Initial Website Publishing

When a user chooses a hosting plan, the frontend requests:

```text
createWebsitePublishPayment
```

The backend:

1. authenticates the user
2. validates the project
3. validates the selected plan
4. creates a Razorpay order
5. returns the Razorpay order ID
6. returns the public Razorpay key ID

The user then completes payment through Razorpay Checkout.

After payment, the frontend sends the Razorpay payment information to:

```text
verifyWebsitePublishPayment
```

The backend verifies:

```text
razorpay_order_id
razorpay_payment_id
razorpay_signature
```

The Razorpay order must also match:

```text
uid
projectId
plan
payment type
amount
```

Only after successful server-side verification should the website become active.

---

# 11. Publishing Project Files

After successful payment verification, the backend reads the project files.

The project must contain:

```text
index.html
```

The files are uploaded to:

```text
published-sites/{uid}/{projectId}/
```

For example:

```text
published-sites/user123/project456/index.html
published-sites/user123/project456/style.css
published-sites/user123/project456/script.js
published-sites/user123/project456/images/logo.png
```

The backend calculates the total published storage size.

If the project exceeds the selected plan's storage limit, publishing must be rejected.

---

# 12. Website URL

The project name is converted into a safe URL slug.

For example:

```text
My Portfolio
```

becomes:

```text
my-portfolio
```

The live website becomes:

```text
https://my-portfolio-shop.jscodoutput.in
```

The publisher uses:

```text
{slug}-shop.jscodoutput.in
```

to identify the correct deployment.

---

# 13. Slug Collision Protection

Two active websites must not use the same slug.

Before publishing, the backend checks whether the slug is already being used.

If it is already active, publishing must fail and the user should be asked to change the project name.

---

# 14. Website Renewal

An active or expired website can be renewed using:

```text
createWebsiteRenewalPayment
```

and:

```text
verifyWebsiteRenewalPayment
```

The renewal price is based on the website's current plan.

After successful payment:

```text
expiresAt
```

is extended by another 30 days.

Bandwidth usage is reset for the new hosting period.

---

# 15. Plan Changes

The system supports changing an existing website's hosting plan.

The backend functions are:

```text
createWebsitePlanChangePayment
verifyWebsitePlanChangePayment
```

The target plan must be validated before payment.

The website's current storage usage must fit within the target plan's storage limit.

For example, a website using more than 5 GB cannot move to the Pro plan.

After successful payment, the deployment record is updated with the new:

```text
plan
planName
storageLimit
storageLimitGB
bandwidthLimitGB
expiresAt
```

---

# 16. Unpublishing a Website

A user can unpublish an active website.

The frontend calls:

```text
unpublishWebsite
```

The backend removes the published files from:

```text
published-sites/{uid}/{projectId}/
```

The deployment is then marked:

```text
active: false
status: "unpublished"
```

The original project remains available in the user's workspace.

Unpublishing a website must not delete the user's source project.

---

# 17. Publisher Server

The publisher runs as a separate Node.js service.

The main file is:

```text
publisher/server.js
```

The publisher receives requests such as:

```text
https://my-project-shop.jscodoutput.in/
```

It extracts the website slug:

```text
my-project
```

Then it finds the matching active deployment.

The publisher reads the requested file from:

```text
published-sites/{uid}/{projectId}/{requested-file}
```

and returns it to the visitor.

---

# 18. Default File

When a visitor opens:

```text
https://my-project-shop.jscodoutput.in/
```

the publisher serves:

```text
index.html
```

A request such as:

```text
/style.css
```

loads:

```text
published-sites/{uid}/{projectId}/style.css
```

An image such as:

```text
/images/logo.png
```

loads:

```text
published-sites/{uid}/{projectId}/images/logo.png
```

---

# 19. Expiration

Every deployment has:

```text
expiresAt
```

The website is considered expired when:

```text
expiresAt <= current time
```

Expired deployments must not remain publicly accessible.

The scheduled function:

```text
expireWebsiteDeployments
```

checks active deployments and marks expired websites as:

```text
active: false
status: "expired"
```

---

# 20. Expiration Cron Security

The expiration endpoint is protected using:

```text
x-cron-secret
```

The request must contain the same secret stored inside:

```text
RAZORPAY_CONFIG.cronSecret
```

The cron job should run daily.

Never expose the cron secret in frontend code.

---

# 21. Bandwidth Tracking

The deployment record tracks bandwidth usage.

The plan limits are:

```text
Basic    → 10 GB/month
Pro      → 50 GB/month
Business → 250 GB/month
```

The publisher updates the deployment's bandwidth usage as website files are served.

The publisher must prevent continued public access when the website exceeds its allowed bandwidth or when the deployment has expired.

---

# 22. Storage Tracking

The published website's storage usage is calculated from the files uploaded to:

```text
published-sites/{uid}/{projectId}/
```

The deployment stores:

```text
storageUsedBytes
storageUsedGB
```

The storage limits are:

```text
Basic    → 1 GB
Pro      → 5 GB
Business → 20 GB
```

A project must not be published when its total file size exceeds its selected plan's storage limit.

---

# 23. Firebase Storage Rules

Storage rules must protect user-owned project data while allowing the backend to publish and serve files correctly.

The Firebase Admin SDK used by trusted backend services bypasses normal client-side Storage rules.

Frontend users should not be allowed to directly modify another user's published website files.

---

# 24. Firestore Rules

Firestore rules must protect:

```text
users/{uid}/projects/{projectId}
```

so that authenticated users can access only their own projects.

Users must not be able to directly modify another user's:

```text
websiteDeployments
```

Deployment state, payment state and hosting limits should be controlled by Firebase Functions.

---

# 25. Deploy Firebase Rules

From the project root:

```bash
firebase deploy --only firestore:rules,storage
```

---

# 26. Publisher Installation

Go to the publisher directory:

```bash
cd publisher
```

Install dependencies:

```bash
npm install
```

The publisher uses:

```text
publisher/server.js
publisher/package.json
publisher/Dockerfile
```

---

# 27. Deploy Publisher to Google Cloud Run

Run:

```bash
gcloud run deploy jco-publisher \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated
```

The Cloud Run service must be able to access:

```text
Firestore
Firebase Storage
```

using its service account.

---

# 28. Cloud Run Service Account

The Cloud Run service account must have the permissions required to:

- read deployment records from Firestore
- read published website files from Firebase Storage

Do not put Firebase private credentials inside the publisher source code.

Use the Cloud Run service account and Google Cloud IAM.

---

# 29. Custom Domain Infrastructure

The production website URLs use:

```text
*.jscodoutput.in
```

A global HTTPS Load Balancer should be placed in front of Cloud Run.

Configure:

```text
Global HTTPS Load Balancer
        ↓
Google-managed SSL certificate
        ↓
*.jscodoutput.in
        ↓
Cloud Run
        ↓
jco-publisher
```

The Google-managed certificate should cover:

```text
*.jscodoutput.in
```

DNS should contain a wildcard record:

```text
*.jscodoutput.in
```

pointing to the Load Balancer IP address.

---

# 30. DNS

The production wildcard domain should point to the HTTPS Load Balancer.

The final website format is:

```text
https://{project-slug}-shop.jscodoutput.in
```

For example:

```text
https://portfolio-shop.jscodoutput.in
```

---

# 31. Frontend Deployment Dashboard

The deployment dashboard allows users to see:

- current hosting plan
- website URL
- website status
- storage usage
- bandwidth usage
- expiry date
- project information
- payment information

The dashboard can also provide:

```text
Open Website
Copy Website URL
Renew
Change Plan
Unpublish
```

---

# 32. Payment Security

The frontend must never decide whether a payment was successful.

The frontend only sends Razorpay's payment response to Firebase Functions.

The backend verifies:

```text
Razorpay signature
Razorpay order
Payment amount
User ID
Project ID
Plan
Payment type
```

Only after all checks succeed should hosting access be activated.

---

# 33. Payment Idempotency

Payment verification should not publish or renew the same payment multiple times.

The deployment record stores payment identifiers such as:

```text
publishPaymentId
lastRenewalPaymentId
lastPlanChangePaymentId
```

If the same payment is submitted again, the backend should return the existing result instead of performing the operation again.

---

# 34. Required Deployment Order

For a new production installation, use this order:

### Step 1 — Install Functions

```bash
cd functions
npm install
firebase deploy --only functions
```

### Step 2 — Configure Secret

Create:

```text
RAZORPAY_CONFIG
```

with:

```json
{
  "keyId": "rzp_live_...",
  "keySecret": "...",
  "cronSecret": "random-secret"
}
```

### Step 3 — Deploy Rules

```bash
firebase deploy --only firestore:rules,storage
```

### Step 4 — Install Publisher

```bash
cd publisher
npm install
```

### Step 5 — Deploy Cloud Run

```bash
gcloud run deploy jco-publisher \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated
```

### Step 6 — Configure IAM

Give the Cloud Run service account access to the required Firestore and Storage resources.

### Step 7 — Configure Load Balancer

Create the global HTTPS Load Balancer and connect it to Cloud Run.

### Step 8 — Configure SSL

Attach a Google-managed wildcard certificate:

```text
*.jscodoutput.in
```

### Step 9 — Configure DNS

Point:

```text
*.jscodoutput.in
```

to the Load Balancer IP.

### Step 10 — Configure Expiration Job

Schedule:

```text
expireWebsiteDeployments
```

to run daily with:

```text
x-cron-secret: <cronSecret>
```

---

# 35. Important Production Rule

The workspace must synchronize the current project files before the publishing process reads them.

The publishing system must always publish the latest saved project state.

Large assets must go to Firebase Storage rather than attempting to store gigabytes of data inside a Firestore document.

---

# 36. Production Safety Checklist

Before considering the publishing system production-ready, verify:

- [ ] Firebase Authentication works
- [ ] Users can access only their own projects
- [ ] Razorpay live credentials are configured
- [ ] `keySecret` is never present in frontend code
- [ ] `cronSecret` is never present in frontend code
- [ ] Payment signature verification works
- [ ] Razorpay order validation works
- [ ] Project ownership is verified
- [ ] `index.html` is required
- [ ] Storage limits are enforced
- [ ] Bandwidth limits are enforced
- [ ] Website expiration works
- [ ] Renewal works
- [ ] Plan changes work
- [ ] Unpublish works
- [ ] Duplicate website slugs are rejected
- [ ] Published files are stored in Firebase Storage
- [ ] Cloud Run can read Firestore
- [ ] Cloud Run can read Firebase Storage
- [ ] Wildcard SSL certificate is active
- [ ] Wildcard DNS is configured
- [ ] HTTPS Load Balancer routes to Cloud Run
- [ ] Daily expiration job is configured
- [ ] Cron secret is protected
- [ ] Razorpay live payment has been tested
- [ ] A real website has been published and opened from its live URL

---

# 37. Final Production Flow

The complete production system should work like this:

```text
User signs in
      ↓
Creates website project
      ↓
Saves project
      ↓
Clicks Deploy
      ↓
Chooses Basic / Pro / Business
      ↓
Razorpay Checkout
      ↓
Payment completed
      ↓
Firebase Function verifies payment
      ↓
Latest project files are collected
      ↓
Storage limit is checked
      ↓
Files uploaded to Firebase Storage
      ↓
Deployment record created
      ↓
Website becomes active
      ↓
Cloud Run receives visitor request
      ↓
Slug identifies deployment
      ↓
Cloud Run reads published file
      ↓
Website is served
      ↓
Storage + bandwidth are tracked
      ↓
Website expires after 30 days
      ↓
User renews or changes plan
```

The system should therefore operate as a real hosting/publishing system rather than a frontend-only demo.
