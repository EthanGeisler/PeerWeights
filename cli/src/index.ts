#!/usr/bin/env node
import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const CONFIG_DIR = path.join(os.homedir(), ".peerweights");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const API_BASE = process.env.PEERWEIGHTS_API || "https://peerweights.com/api";

interface Config {
  accessToken?: string;
  refreshToken?: string;
  email?: string;
  username?: string;
}

function loadConfig(): Config {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveConfig(config: Config) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const config = loadConfig();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (config.accessToken) {
    headers["Authorization"] = `Bearer ${config.accessToken}`;
  }

  let res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  // Auto-refresh on 401
  if (res.status === 401 && config.refreshToken) {
    const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: config.refreshToken }),
    });
    if (refreshRes.ok) {
      const data = await refreshRes.json();
      saveConfig({ ...config, accessToken: data.accessToken, refreshToken: data.refreshToken });
      headers["Authorization"] = `Bearer ${data.accessToken}`;
      res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.error?.message || body.message || `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

const program = new Command();
program
  .name("peerweights")
  .description("PeerWeights CLI — Torrent-based AI model marketplace")
  .version("0.1.0");

// ── Login ──────────────────────────────────────────────────────────────────

program
  .command("login")
  .description("Login to PeerWeights")
  .requiredOption("-e, --email <email>", "Email address")
  .requiredOption("-p, --password <password>", "Password")
  .action(async (opts) => {
    try {
      const data = await apiFetch<any>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: opts.email, password: opts.password }),
      });
      saveConfig({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        email: data.user.email,
        username: data.user.username,
      });
      console.log(`Logged in as ${data.user.username} (${data.user.email})`);
    } catch (err: any) {
      console.error("Login failed:", err.message);
      process.exit(1);
    }
  });

// ── Search ─────────────────────────────────────────────────────────────────

program
  .command("search <query>")
  .description("Search for models")
  .option("-f, --format <format>", "Filter by format (SAFETENSORS, GGUF, etc.)")
  .option("-l, --limit <n>", "Results per page", "20")
  .action(async (query, opts) => {
    try {
      const params = new URLSearchParams({ search: query, limit: opts.limit });
      if (opts.format) params.set("format", opts.format);

      const data = await apiFetch<any>(`/models?${params}`);
      if (data.models.length === 0) {
        console.log("No models found.");
        return;
      }

      console.log(`Found ${data.total} model(s):\n`);
      for (const m of data.models) {
        const price = m.priceCents === 0 ? "FREE" : `$${(m.priceCents / 100).toFixed(2)}`;
        console.log(`  ${m.username}/${m.slug}  [${m.format}]  ${price}  ${m.downloadCount} downloads`);
        if (m.description) {
          console.log(`    ${m.description.slice(0, 80)}${m.description.length > 80 ? "..." : ""}`);
        }
      }
    } catch (err: any) {
      console.error("Search failed:", err.message);
      process.exit(1);
    }
  });

// ── Pull (download) ────────────────────────────────────────────────────────

program
  .command("pull <namespace>")
  .description("Download a model (username/model-name)")
  .action(async (namespace) => {
    const [username, slug] = namespace.split("/");
    if (!username || !slug) {
      console.error("Usage: peerweights pull username/model-name");
      process.exit(1);
    }

    try {
      // Get model info
      const model = await apiFetch<any>(`/models/${username}/${slug}`);
      console.log(`Model: ${model.name} [${model.format}]`);

      // Attempt checkout (will grant free license or return checkout URL)
      try {
        const checkout = await apiFetch<any>("/payments/checkout", {
          method: "POST",
          body: JSON.stringify({ modelId: model.id }),
        });
        if (checkout.free) {
          console.log("Free model — license granted.");
        } else {
          console.log(`Paid model. Complete purchase at: ${checkout.checkoutUrl}`);
          return;
        }
      } catch (err: any) {
        if (err.message?.includes("already own")) {
          console.log("Already licensed.");
        } else {
          throw err;
        }
      }

      // Get torrent info
      const torrent = await apiFetch<any>(`/torrents/${model.id}/latest`);
      console.log(`\nMagnet URI:\n${torrent.magnetUri}`);
      console.log(`\nInfo Hash: ${torrent.infoHash}`);
      console.log(`File size: ${torrent.fileSizeBytes} bytes`);
      console.log("\nUse this magnet URI with your BitTorrent client to download.");
    } catch (err: any) {
      console.error("Pull failed:", err.message);
      process.exit(1);
    }
  });

// ── Push (upload) ──────────────────────────────────────────────────────────

program
  .command("push <file>")
  .description("Upload a model file")
  .requiredOption("-n, --name <name>", "Model name")
  .option("-d, --description <desc>", "Description")
  .option("--price <cents>", "Price in cents (0 = free)", "0")
  .option("--format <format>", "Model format")
  .option("--tags <tags>", "Comma-separated tags")
  .option("--license <license>", "License type")
  .action(async (filePath, opts) => {
    try {
      const resolvedPath = path.resolve(filePath);
      if (!fs.existsSync(resolvedPath)) {
        console.error(`File not found: ${resolvedPath}`);
        process.exit(1);
      }

      console.log(`Creating model "${opts.name}"...`);
      const tags = opts.tags ? opts.tags.split(",").map((t: string) => t.trim()) : [];
      const model = await apiFetch<any>("/creator/models", {
        method: "POST",
        body: JSON.stringify({
          name: opts.name,
          description: opts.description || "",
          priceCents: Number(opts.price),
          format: opts.format,
          tags,
          license: opts.license,
        }),
      });

      console.log(`Created model: ${model.slug}`);
      console.log("Creating version 1.0.0...");

      const version = await apiFetch<any>(`/creator/models/${model.id}/versions`, {
        method: "POST",
        body: JSON.stringify({ version: "1.0.0" }),
      });

      console.log(`Uploading ${path.basename(resolvedPath)}...`);
      const config = loadConfig();
      const fileBuffer = fs.readFileSync(resolvedPath);
      const formData = new FormData();
      formData.append("modelFile", new Blob([fileBuffer]), path.basename(resolvedPath));

      const uploadRes = await fetch(
        `${API_BASE}/creator/models/${model.id}/versions/${version.id}/upload`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${config.accessToken}` },
          body: formData,
        },
      );

      if (!uploadRes.ok) {
        const body = await uploadRes.json().catch(() => ({}));
        throw new Error(body.error?.message || `Upload failed: HTTP ${uploadRes.status}`);
      }

      console.log("Upload complete! Model is ready to publish.");
      console.log(`Publish with: peerweights publish ${model.id}`);
    } catch (err: any) {
      console.error("Push failed:", err.message);
      process.exit(1);
    }
  });

// ── List ───────────────────────────────────────────────────────────────────

program
  .command("list")
  .description("List your published models")
  .action(async () => {
    try {
      const data = await apiFetch<any>("/creator/models");
      if (data.models.length === 0) {
        console.log("No models found.");
        return;
      }
      for (const m of data.models) {
        console.log(`  ${m.slug}  [${m.status}]  ${m.format}  ${m.versionsCount} ver  ${m.licensesCount} licenses`);
      }
    } catch (err: any) {
      console.error("List failed:", err.message);
      process.exit(1);
    }
  });

// ── Seed Stats ─────────────────────────────────────────────────────────────

program
  .command("seed")
  .description("Show seed stats")
  .option("--status", "Show per-model seed ratios")
  .action(async (opts) => {
    try {
      const data = await apiFetch<any>("/torrents/seed-stats/me");
      if (data.stats.length === 0) {
        console.log("No seeding activity recorded.");
        return;
      }

      console.log("Seed Stats:\n");
      for (const s of data.stats) {
        const ratio = s.ratio.toFixed(2);
        const status = s.ratio >= 1.0 ? "OK" : "BELOW 1.0x";
        const uploaded = (s.bytesUploaded / (1024 * 1024 * 1024)).toFixed(1);
        const total = (s.fileSizeBytes / (1024 * 1024 * 1024)).toFixed(1);
        console.log(`  ${s.modelSlug} v${s.version}  ${ratio}x  (${uploaded}GB / ${total}GB uploaded)  [${status}]`);
      }
    } catch (err: any) {
      console.error("Seed stats failed:", err.message);
      process.exit(1);
    }
  });

program.parse();
