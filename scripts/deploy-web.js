#!/usr/bin/env node
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const root = path.resolve(__dirname, "..");
const webDir = path.join(root, "apps", "web");

function run(cmd, opts = {}) {
  console.log(`\n▶ ${cmd}\n`);
  execSync(cmd, { stdio: "inherit", cwd: opts.cwd || root, ...opts });
}

run("npm run build:web", { cwd: root });
if (!fs.existsSync(path.join(webDir, "out"))) {
  console.error("Web build failed: apps/web/out not found.");
  process.exit(1);
}
run("firebase deploy --only hosting", { cwd: root });
console.log("\n✅ Web deployed to Firebase Hosting.");
