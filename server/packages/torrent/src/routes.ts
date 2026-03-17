import { Router } from "express";
import { authenticate, ValidationError } from "@peerweights/shared";
import * as torrentService from "./service.js";

export const torrentRouter = Router();

torrentRouter.get(
  "/torrents/:modelId/latest",
  authenticate,
  async (req, res, next) => {
    try {
      const result = await torrentService.getLatestTorrent(
        req.user!.sub,
        String(req.params.modelId),
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

torrentRouter.get(
  "/torrents/:modelId/latest/file",
  authenticate,
  async (req, res, next) => {
    try {
      const buffer = await torrentService.getLatestTorrentFile(
        req.user!.sub,
        String(req.params.modelId),
      );
      res.set("Content-Type", "application/x-bittorrent");
      res.set("Content-Disposition", "attachment");
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  },
);

torrentRouter.post(
  "/torrents/seed-stats",
  authenticate,
  async (req, res, next) => {
    try {
      const { modelVersionId, bytesUploaded, seedingSeconds } = req.body;
      if (!modelVersionId || typeof modelVersionId !== "string") {
        throw new ValidationError("modelVersionId is required");
      }

      await torrentService.reportSeedStats(
        req.user!.sub,
        modelVersionId,
        BigInt(bytesUploaded ?? 0),
        Number(seedingSeconds ?? 0),
      );

      res.json({ received: true });
    } catch (err) {
      next(err);
    }
  },
);

torrentRouter.get(
  "/torrents/seed-stats/me",
  authenticate,
  async (req, res, next) => {
    try {
      const stats = await torrentService.getUserSeedStats(req.user!.sub);
      res.json({ stats });
    } catch (err) {
      next(err);
    }
  },
);
