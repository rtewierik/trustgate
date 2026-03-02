#!/usr/bin/env node
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const root = path.resolve(__dirname, "..");
const apiDir = path.join(root, "apps", "api");

function run(cmd, opts = {}) {
  console.log(`\n▶ ${cmd}\n`);
  execSync(cmd, { stdio: "inherit", cwd: opts.cwd || root, ...opts });
}

const project = process.env.FIREBASE_PROJECT || process.env.GCLOUD_PROJECT;
const region = process.env.GCP_REGION || "europe-west1";
const serviceName = process.env.CLOUD_RUN_SERVICE_NAME || "trustgate-api";

if (!project) {
  console.error("Set FIREBASE_PROJECT or GCLOUD_PROJECT (or run firebase use <project-id>)");
  process.exit(1);
}

run(`gcloud run deploy ${serviceName} --source ${apiDir} --region ${region} --project ${project} --allow-unauthenticated --set-env-vars GOOGLE_CLOUD_PROJECT=${project}`);
console.log("\n✅ API deployed. URL:");
run(`gcloud run services describe ${serviceName} --region ${region} --project ${project} --format "value(status.url)"`, { cwd: root });
