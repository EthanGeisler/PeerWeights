import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { Router } from "express";
import { ZodError } from "zod";
import multer from "multer";
import { authenticate, requireRole, ValidationError, NotFoundError, getConfig } from "@peerweights/shared";
import * as modelService from "./service.js";
import {
  paginationSchema,
  createModelSchema,
  updateModelSchema,
  createVersionSchema,
} from "./schemas.js";

export const modelRouter = Router();

function handleZodError(err: unknown): never {
  if (err instanceof ZodError) {
    throw new ValidationError(err.errors.map((e) => e.message).join(", "));
  }
  throw err;
}

// Multer config — disk storage for model files, 200GB limit
const modelUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const tmpDir = path.join(getConfig().MODELS_DIR, ".tmp");
      fs.mkdirSync(tmpDir, { recursive: true });
      cb(null, tmpDir);
    },
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${unique}-${file.originalname}`);
    },
  }),
  limits: { fileSize: getConfig().MODEL_UPLOAD_MAX_SIZE },
});

// Multer config — cover image uploads, 10MB limit
const ALLOWED_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

const coverUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const coversDir = path.join(getConfig().MODELS_DIR, "covers");
      fs.mkdirSync(coversDir, { recursive: true });
      cb(null, coversDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_MIMES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ValidationError("Only image files (jpg, png, webp) are allowed"));
    }
  },
});

// ── Public Routes ────────────────────────────────────────────────────────────

modelRouter.get("/models", async (req, res, next) => {
  try {
    let params;
    try {
      params = paginationSchema.parse(req.query);
    } catch (err) {
      handleZodError(err);
    }
    const result = await modelService.listPublishedModels(params.page, params.limit, {
      search: params.search,
      format: params.format,
      tag: params.tag,
      minPrice: params.minPrice,
      maxPrice: params.maxPrice,
      sort: params.sort,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

modelRouter.get("/models/:username/:slug", async (req, res, next) => {
  try {
    const model = await modelService.getModelByNamespace(
      String(req.params.username),
      String(req.params.slug),
    );
    res.json(model);
  } catch (err) {
    next(err);
  }
});

modelRouter.get("/users/:username", async (req, res, next) => {
  try {
    const profile = await modelService.getUserProfile(String(req.params.username));
    res.json(profile);
  } catch (err) {
    next(err);
  }
});

modelRouter.get("/tags", async (_req, res, next) => {
  try {
    const tags = await modelService.listTags();
    res.json({ tags });
  } catch (err) {
    next(err);
  }
});

// ── Creator Routes ──────────────────────────────────────────────────────────

modelRouter.get(
  "/creator/models",
  authenticate,
  requireRole("CREATOR", "ADMIN"),
  async (req, res, next) => {
    try {
      const creator = await modelService.getCreatorByUserId(req.user!.sub);
      const models = await modelService.listCreatorModels(creator.id);
      res.json({ models });
    } catch (err) {
      next(err);
    }
  },
);

modelRouter.post(
  "/creator/models",
  authenticate,
  requireRole("CREATOR", "ADMIN"),
  async (req, res, next) => {
    try {
      let input;
      try {
        input = createModelSchema.parse(req.body);
      } catch (err) {
        handleZodError(err);
      }
      const creator = await modelService.getCreatorByUserId(req.user!.sub);
      const model = await modelService.createModel(creator.id, req.user!.username, input);
      res.status(201).json(model);
    } catch (err) {
      next(err);
    }
  },
);

modelRouter.put(
  "/creator/models/:id",
  authenticate,
  requireRole("CREATOR", "ADMIN"),
  async (req, res, next) => {
    try {
      let input;
      try {
        input = updateModelSchema.parse(req.body);
      } catch (err) {
        handleZodError(err);
      }
      const creator = await modelService.getCreatorByUserId(req.user!.sub);
      const model = await modelService.updateModel(String(req.params.id), creator.id, input);
      res.json(model);
    } catch (err) {
      next(err);
    }
  },
);

modelRouter.patch(
  "/creator/models/:id/publish",
  authenticate,
  requireRole("CREATOR", "ADMIN"),
  async (req, res, next) => {
    try {
      const creator = await modelService.getCreatorByUserId(req.user!.sub);
      const model = await modelService.publishModel(String(req.params.id), creator.id);
      res.json(model);
    } catch (err) {
      next(err);
    }
  },
);

modelRouter.patch(
  "/creator/models/:id/unpublish",
  authenticate,
  requireRole("CREATOR", "ADMIN"),
  async (req, res, next) => {
    try {
      const creator = await modelService.getCreatorByUserId(req.user!.sub);
      const model = await modelService.unpublishModel(String(req.params.id), creator.id);
      res.json(model);
    } catch (err) {
      next(err);
    }
  },
);

modelRouter.post(
  "/creator/models/:id/versions",
  authenticate,
  requireRole("CREATOR", "ADMIN"),
  async (req, res, next) => {
    try {
      let input;
      try {
        input = createVersionSchema.parse(req.body);
      } catch (err) {
        handleZodError(err);
      }
      const creator = await modelService.getCreatorByUserId(req.user!.sub);
      const result = await modelService.createVersion(
        String(req.params.id),
        creator.id,
        input.version,
        input.changelog,
      );
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ── File Upload ─────────────────────────────────────────────────────────────

modelRouter.post(
  "/creator/models/:id/versions/:versionId/upload",
  authenticate,
  requireRole("CREATOR", "ADMIN"),
  (req, _res, next) => {
    // Set a 30-minute timeout for large uploads
    req.setTimeout(30 * 60 * 1000);
    next();
  },
  modelUpload.single("modelFile"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        throw new ValidationError("No model file provided");
      }

      const creator = await modelService.getCreatorByUserId(req.user!.sub);
      const result = await modelService.uploadAndProcessVersion(
        String(req.params.id),
        creator.id,
        String(req.params.versionId),
        req.file.path,
      );

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ── Cover Image Upload ──────────────────────────────────────────────────────

modelRouter.post(
  "/creator/models/:id/cover",
  authenticate,
  requireRole("CREATOR", "ADMIN"),
  coverUpload.single("cover"),
  async (req, res, next) => {
    const tmpPath = req.file?.path;
    try {
      if (!req.file) {
        throw new ValidationError("No image file provided");
      }

      const modelId = String(req.params.id);
      const creator = await modelService.getCreatorByUserId(req.user!.sub);

      // Ownership check via updateModel
      const model = await modelService.updateModel(modelId, creator.id, {
        coverImageUrl: `/api/covers/${modelId}`,
      });

      // Rename temp file to final name
      const coversDir = path.join(getConfig().MODELS_DIR, "covers");
      const uploadedExt = path.extname(req.file.filename).toLowerCase();
      const finalPath = path.join(coversDir, `${modelId}${uploadedExt}`);

      await fsp.rename(tmpPath!, finalPath);

      // Delete old cover files with different extensions
      for (const ext of [".jpg", ".jpeg", ".png", ".webp"]) {
        if (ext !== uploadedExt) {
          await fsp.unlink(path.join(coversDir, `${modelId}${ext}`)).catch(() => {});
        }
      }

      res.json(model);
    } catch (err) {
      if (tmpPath) {
        await fsp.unlink(tmpPath).catch(() => {});
      }
      next(err);
    }
  },
);

// ── Public Cover Serve ──────────────────────────────────────────────────────

modelRouter.get("/covers/:modelId", async (req, res, next) => {
  try {
    const modelId = String(req.params.modelId);

    if (!/^[a-zA-Z0-9_-]+$/.test(modelId)) {
      throw new ValidationError("Invalid model ID");
    }

    const coversDir = path.join(getConfig().MODELS_DIR, "covers");
    const extensions = [".jpg", ".jpeg", ".png", ".webp"];
    const mimeMap: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
    };

    for (const ext of extensions) {
      const filePath = path.join(coversDir, `${modelId}${ext}`);
      try {
        await fsp.access(filePath);
      } catch {
        continue;
      }
      res.set("Content-Type", mimeMap[ext]!);
      res.set("Cache-Control", "public, max-age=86400");
      res.sendFile(filePath);
      return;
    }

    throw new NotFoundError("Cover image");
  } catch (err) {
    next(err);
  }
});
