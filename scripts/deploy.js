#!/usr/bin/env node
/**
 * Single-command deploy: API → Cloud Run, Web → Firebase Hosting, Firestore rules.
 * Requires: gcloud and firebase CLI configured and authenticated.
 *
 * Usage:
 *   Set Firebase project: firebase use <project-id>
 *   Set API URL for frontend: NEXT_PUBLIC_API_URL=https://your-api-xxx.run.app
 *   npm run deploy
 */

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const root = path.resolve(__dirname, "..");
const apiDir = path.join(root, "apps", "api");
const webDir = path.join(root, "apps", "web");

function run(cmd, opts = {}) {
  const cwd = opts.cwd || root;
  console.log(`\n▶ ${cmd}\n`);
  execSync(cmd, { stdio: "inherit", cwd, ...opts });
}

function getFirebaseProject() {
  try {
    const p = path.join(root, ".firebaserc");
    const data = JSON.parse(fs.readFileSync(p, "utf8"));
    return data.projects?.default;
  } catch {
    return process.env.FIREBASE_PROJECT || process.env.GCLOUD_PROJECT;
  }
}

function main() {
  console.log("TrustGate — Deploy (API → Cloud Run, Web → Firebase)\n");

  const project = getFirebaseProject();
  if (!project) {
    console.error("No Firebase/GCP project set. Run: firebase use <project-id>");
    process.exit(1);
  }
  console.log("Project:", project);

  const region = process.env.GCP_REGION || "europe-west1";
  const apiServiceName = process.env.CLOUD_RUN_SERVICE_NAME || "trustgate-api";

  run("npm run build:web", { cwd: root });
  if (!fs.existsSync(path.join(webDir, "out"))) {
    console.error("Web build failed: apps/web/out not found.");
    process.exit(1);
  }

  run(`firebase deploy --only firestore,hosting --project ${project}`, { cwd: root });

  run(
    `gcloud run deploy ${apiServiceName} --source ${apiDir} --region ${region} --project ${project} --allow-unauthenticated --set-env-vars GOOGLE_CLOUD_PROJECT=${project}`,
    { cwd: root }
  );

  console.log("\n✅ Deploy complete.");
  console.log("  Frontend: Firebase Hosting (see Firebase console for URL).");
  console.log("  API: Cloud Run — get URL with:");
  console.log(`  gcloud run services describe ${apiServiceName} --region ${region} --format 'value(status.url)'`);
  console.log("\n  Set NEXT_PUBLIC_API_URL to that URL and rebuild/redeploy web to connect the dashboard.");
}

main();
