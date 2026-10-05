\# JS CODE OUTPUT publishing system



Files: deploy.html, functions/index.js, publisher/server.js, publisher/package.json, publisher/Dockerfile, firebase.json, firestore.rules, storage.rules.



IMPORTANT: Firestore cannot store 1–5 GB in a project document. Large/binary assets must be uploaded to Firebase Storage. The publisher expects: published-sites/{uid}/{projectId}/index.html and other files.



1\) Install functions: cd functions \&\& npm install \&\& firebase deploy --only functions

2\) Configure Firebase Functions secret RAZORPAY\_CONFIG as JSON: {"keyId":"rzp\_live\_...","keySecret":"...","cronSecret":"random-secret"}. Never put keySecret in frontend.

3\) Deploy rules: firebase deploy --only firestore:rules,storage

4\) Deploy publisher: cd publisher \&\& npm install \&\& gcloud run deploy jco-publisher --source . --region asia-south1 --allow-unauthenticated

5\) Give Cloud Run service account access to Firestore and Storage.

6\) Put a global HTTPS load balancer in front of Cloud Run, attach a Google-managed wildcard certificate for \*.jscodoutput.in, and route \*.jscodoutput.in to Cloud Run. Point DNS wildcard \*.jscodoutput.in to the load balancer IP.

7\) Schedule expireWebsiteDeployments daily and send header x-cron-secret equal to cronSecret.

8\) BEFORE payment activation, the workspace must sync current files to published-sites/{uid}/{projectId}/... in Storage. Do not put GB-sized files into Firestore.



Pricing: Basic ₹11 first publish / ₹9 monthly renewal / 1 GB. Pro ₹49 / ₹39 monthly / 5 GB.



