#!/usr/bin/env node
/**
 * Bulk upload models from a manifest file.
 * Usage: node scripts/upload-model.mjs <email> <password> [manifest.json]
 *
 * Manifest format:
 * [{
 *   "filePath": "./models/my-model.safetensors",
 *   "coverFile": "./covers/my-model.jpg",   // optional
 *   "name": "My Model",
 *   "description": "A great model",
 *   "version": "1.0.0",
 *   "priceCents": 0,
 *   "format": "SAFETENSORS",
 *   "tags": ["llm", "7b"],
 *   "license": "MIT"
 * }]
 */
import fs from "node:fs";
import path from "node:path";

const API_BASE = process.env.API_BASE || "http://localhost:7480/api";

const [email, password, manifestPath] = process.argv.slice(2);

if (!email || !password) {
  console.error("Usage: node scripts/upload-model.mjs <email> <password> [manifest.json]");
  process.exit(1);
}

const manifest = JSON.parse(
  fs.readFileSync(manifestPath || "model-staging/manifest.json", "utf-8"),
);

// Login
console.log(`Logging in as ${email}...`);
const loginRes = await fetch(`${API_BASE}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
if (!loginRes.ok) {
  console.error("Login failed:", await loginRes.text());
  process.exit(1);
}
const { accessToken } = await loginRes.json();
const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

for (const item of manifest) {
  console.log(`\n--- Processing: ${item.name} ---`);

  // Create model
  const createRes = await fetch(`${API_BASE}/creator/models`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: item.name,
      description: item.description || "",
      priceCents: item.priceCents || 0,
      format: item.format,
      tags: item.tags || [],
      license: item.license || "",
    }),
  });
  if (!createRes.ok) {
    console.error(`  Failed to create model: ${await createRes.text()}`);
    continue;
  }
  const model = await createRes.json();
  console.log(`  Created: ${model.slug} (${model.id})`);

  // Create version
  const versionRes = await fetch(`${API_BASE}/creator/models/${model.id}/versions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ version: item.version || "1.0.0" }),
  });
  if (!versionRes.ok) {
    console.error(`  Failed to create version: ${await versionRes.text()}`);
    continue;
  }
  const version = await versionRes.json();
  console.log(`  Version: ${version.version} (${version.id})`);

  // Upload file
  if (item.filePath && fs.existsSync(item.filePath)) {
    console.log(`  Uploading ${path.basename(item.filePath)}...`);
    const fileBuffer = fs.readFileSync(item.filePath);
    const formData = new FormData();
    formData.append("modelFile", new Blob([fileBuffer]), path.basename(item.filePath));

    const uploadRes = await fetch(
      `${API_BASE}/creator/models/${model.id}/versions/${version.id}/upload`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      },
    );
    if (!uploadRes.ok) {
      console.error(`  Upload failed: ${await uploadRes.text()}`);
      continue;
    }
    console.log("  Upload complete.");
  }

  // Upload cover
  if (item.coverFile && fs.existsSync(item.coverFile)) {
    console.log(`  Uploading cover: ${path.basename(item.coverFile)}...`);
    const coverBuffer = fs.readFileSync(item.coverFile);
    const coverForm = new FormData();
    coverForm.append("cover", new Blob([coverBuffer]), path.basename(item.coverFile));

    const coverRes = await fetch(
      `${API_BASE}/creator/models/${model.id}/cover`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: coverForm,
      },
    );
    if (!coverRes.ok) {
      console.error(`  Cover upload failed: ${await coverRes.text()}`);
    } else {
      console.log("  Cover uploaded.");
    }
  }

  // Publish
  const publishRes = await fetch(`${API_BASE}/creator/models/${model.id}/publish`, {
    method: "PATCH",
    headers,
  });
  if (publishRes.ok) {
    console.log("  Published!");
  } else {
    console.log("  Publish skipped (may need Stripe onboarding for paid models).");
  }
}

console.log("\nDone!");
