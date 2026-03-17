import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import { getConfig, errorHandler } from "@peerweights/shared";
import { authRouter, creatorRouter } from "@peerweights/auth";
import { modelRouter } from "@peerweights/model";
import { licenseRouter } from "@peerweights/license";
import { paymentRouter } from "@peerweights/payment";
import { torrentRouter } from "@peerweights/torrent";

const config = getConfig();
const app = express();

// Stripe webhooks need raw body — must be before express.json()
app.post("/api/payments/webhook", express.raw({ type: "application/json" }));

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
const allowedOrigins = [
  config.CORS_ORIGIN,
  ...config.CORS_ADDITIONAL_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
  "tauri://localhost",        // Tauri desktop (macOS/Linux)
  "https://tauri.localhost",  // Tauri desktop (Windows)
];
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin or "null" origin (Electron file://, server-to-server)
      if (!origin || origin === "null" || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  }),
);
app.use(compression());
app.use(express.json({ limit: "10mb" }));
app.use(morgan(config.NODE_ENV === "production" ? "combined" : "dev"));

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Mount routes
app.use("/api/auth", authRouter);
app.use("/api", creatorRouter);
app.use("/api", modelRouter);
app.use("/api", licenseRouter);
app.use("/api", paymentRouter);
app.use("/api", torrentRouter);

// Error handler (must be last)
app.use(errorHandler);

app.listen(config.PORT, () => {
  console.log(`PeerWeights API running on port ${config.PORT} [${config.NODE_ENV}]`);
});

export default app;
