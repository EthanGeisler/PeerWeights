import fs from "node:fs/promises";
import path from "node:path";
import { db, NotFoundError, ForbiddenError, ValidationError, getConfig } from "@peerweights/shared";
import { createModelTorrent } from "@peerweights/torrent";
import { detectFormat, getAdaptivePieceLength } from "./format-detector.js";
import type { CreateModelInput, UpdateModelInput } from "./schemas.js";
import type { Prisma } from "@prisma/client";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── Public Queries ──────────────────────────────────────────────────────────

export async function listPublishedModels(
  page: number,
  limit: number,
  options?: { search?: string; format?: string; tag?: string; minPrice?: number; maxPrice?: number; sort?: string },
) {
  const skip = (page - 1) * limit;

  const where: Prisma.ModelWhereInput = {
    status: "PUBLISHED",
    ...(options?.search && {
      OR: [
        { name: { contains: options.search, mode: "insensitive" } },
        { description: { contains: options.search, mode: "insensitive" } },
      ],
    }),
    ...(options?.format && { format: options.format as any }),
    ...(options?.tag && { tags: { has: options.tag } }),
    ...(options?.minPrice !== undefined && { priceCents: { gte: options.minPrice } }),
    ...(options?.maxPrice !== undefined && { priceCents: { ...((where as any).priceCents || {}), lte: options.maxPrice } }),
  };

  // Handle price range properly
  if (options?.minPrice !== undefined || options?.maxPrice !== undefined) {
    where.priceCents = {
      ...(options?.minPrice !== undefined && { gte: options.minPrice }),
      ...(options?.maxPrice !== undefined && { lte: options.maxPrice }),
    };
  }

  const orderBy: Prisma.ModelOrderByWithRelationInput =
    options?.sort === "popular" ? { downloadCount: "desc" } :
    options?.sort === "price_asc" ? { priceCents: "asc" } :
    options?.sort === "price_desc" ? { priceCents: "desc" } :
    { createdAt: "desc" };

  const [models, total] = await Promise.all([
    db.model.findMany({
      where,
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        priceCents: true,
        format: true,
        tags: true,
        coverImageUrl: true,
        downloadCount: true,
        creator: {
          select: {
            user: { select: { username: true, displayName: true } },
          },
        },
      },
      orderBy,
      skip,
      take: limit,
    }),
    db.model.count({ where }),
  ]);

  return {
    models: models.map((m) => ({
      id: m.id,
      slug: m.slug,
      name: m.name,
      description: m.description,
      priceCents: m.priceCents,
      format: m.format,
      tags: m.tags,
      coverImageUrl: m.coverImageUrl,
      downloadCount: m.downloadCount,
      username: m.creator.user.username,
      displayName: m.creator.user.displayName,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getModelByNamespace(username: string, slug: string) {
  const user = await db.user.findUnique({
    where: { username },
    include: {
      creator: {
        include: {
          models: {
            where: { slug },
            include: {
              versions: {
                where: { status: "READY" },
                orderBy: { createdAt: "desc" },
                take: 1,
                select: {
                  id: true,
                  version: true,
                  fileSizeBytes: true,
                  format: true,
                  changelog: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user?.creator?.models?.[0]) {
    throw new NotFoundError("Model");
  }

  const model = user.creator.models[0];
  if (model.status !== "PUBLISHED") {
    throw new NotFoundError("Model");
  }

  return {
    id: model.id,
    slug: model.slug,
    name: model.name,
    description: model.description,
    priceCents: model.priceCents,
    format: model.format,
    architecture: model.architecture,
    parameterCount: model.parameterCount ? Number(model.parameterCount) : null,
    baseModel: model.baseModel,
    quantization: model.quantization,
    license: model.license,
    tags: model.tags,
    coverImageUrl: model.coverImageUrl,
    readmeContent: model.readmeContent,
    downloadCount: model.downloadCount,
    username: user.username,
    displayName: user.displayName,
    latestVersion: model.versions[0]
      ? {
          ...model.versions[0],
          fileSizeBytes: Number(model.versions[0].fileSizeBytes),
        }
      : null,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
  };
}

export async function getUserProfile(username: string) {
  const user = await db.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      displayName: true,
      bio: true,
      avatarUrl: true,
      createdAt: true,
      creator: {
        select: {
          models: {
            where: { status: "PUBLISHED" },
            select: {
              id: true,
              slug: true,
              name: true,
              description: true,
              priceCents: true,
              format: true,
              tags: true,
              coverImageUrl: true,
              downloadCount: true,
            },
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
  });

  if (!user) {
    throw new NotFoundError("User");
  }

  return {
    ...user,
    models: user.creator?.models ?? [],
  };
}

export async function listTags() {
  return db.tag.findMany({
    orderBy: { modelCount: "desc" },
    take: 100,
  });
}

// ── Creator Operations ──────────────────────────────────────────────────────

export async function getCreatorByUserId(userId: string) {
  const creator = await db.creator.findUnique({ where: { userId } });
  if (!creator) {
    throw new ForbiddenError("Creator profile not found. Register as a creator first.");
  }
  return creator;
}

export async function createModel(creatorId: string, username: string, input: CreateModelInput) {
  const slug = slugify(input.name);

  // Check if slug already exists for this creator
  const existing = await db.model.findUnique({
    where: { creatorId_slug: { creatorId, slug } },
  });
  if (existing) {
    throw new ValidationError(`A model with slug "${slug}" already exists. Choose a different name.`);
  }

  const model = await db.model.create({
    data: {
      creatorId,
      slug,
      name: input.name,
      description: input.description ?? "",
      priceCents: input.priceCents,
      format: (input.format as any) ?? "OTHER",
      architecture: input.architecture ?? null,
      baseModel: input.baseModel ?? null,
      quantization: input.quantization ?? null,
      license: input.license ?? "",
      tags: input.tags ?? [],
      readmeContent: input.readmeContent ?? "",
    },
  });

  return model;
}

export async function updateModel(modelId: string, creatorId: string, input: UpdateModelInput) {
  const model = await db.model.findUnique({ where: { id: modelId } });
  if (!model) throw new NotFoundError("Model");
  if (model.creatorId !== creatorId) {
    throw new ForbiddenError("You can only update your own models");
  }

  const updated = await db.model.update({
    where: { id: modelId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.priceCents !== undefined && { priceCents: input.priceCents }),
      ...(input.format !== undefined && { format: input.format as any }),
      ...(input.architecture !== undefined && { architecture: input.architecture }),
      ...(input.baseModel !== undefined && { baseModel: input.baseModel }),
      ...(input.quantization !== undefined && { quantization: input.quantization }),
      ...(input.license !== undefined && { license: input.license }),
      ...(input.tags !== undefined && { tags: input.tags }),
      ...(input.readmeContent !== undefined && { readmeContent: input.readmeContent }),
      ...(input.coverImageUrl !== undefined && { coverImageUrl: input.coverImageUrl }),
    },
  });

  return updated;
}

export async function listCreatorModels(creatorId: string) {
  const models = await db.model.findMany({
    where: { creatorId },
    include: {
      versions: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          version: true,
          status: true,
          fileSizeBytes: true,
          createdAt: true,
        },
      },
      _count: {
        select: { licenses: true, payments: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return models.map((m) => ({
    id: m.id,
    slug: m.slug,
    name: m.name,
    description: m.description,
    priceCents: m.priceCents,
    status: m.status,
    format: m.format,
    tags: m.tags,
    coverImageUrl: m.coverImageUrl,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    versionsCount: m.versions.length,
    latestVersion: m.versions[0] ?? null,
    licensesCount: m._count.licenses,
    salesCount: m._count.payments,
  }));
}

export async function createVersion(modelId: string, creatorId: string, version: string, changelog?: string) {
  const model = await db.model.findUnique({ where: { id: modelId } });
  if (!model) throw new NotFoundError("Model");
  if (model.creatorId !== creatorId) {
    throw new ForbiddenError("You can only create versions for your own models");
  }

  const modelVersion = await db.modelVersion.create({
    data: {
      modelId,
      version,
      changelog: changelog ?? "",
      status: "PROCESSING",
    },
  });

  return {
    id: modelVersion.id,
    version: modelVersion.version,
    status: modelVersion.status,
  };
}

export async function publishModel(modelId: string, creatorId: string) {
  const model = await db.model.findUnique({
    where: { id: modelId },
    include: {
      versions: { where: { status: "READY" }, take: 1 },
      creator: true,
    },
  });

  if (!model) throw new NotFoundError("Model");
  if (model.creatorId !== creatorId) {
    throw new ForbiddenError("You can only publish your own models");
  }

  // Paid models require Stripe Connect onboarding
  if (model.priceCents > 0 && !model.creator.stripeOnboarded) {
    throw new ValidationError(
      "Complete Stripe onboarding before publishing paid models. Free models can be published without Stripe.",
    );
  }

  return db.model.update({
    where: { id: modelId },
    data: { status: "PUBLISHED" },
  });
}

export async function unpublishModel(modelId: string, creatorId: string) {
  const model = await db.model.findUnique({ where: { id: modelId } });
  if (!model) throw new NotFoundError("Model");
  if (model.creatorId !== creatorId) {
    throw new ForbiddenError("You can only unpublish your own models");
  }

  return db.model.update({
    where: { id: modelId },
    data: { status: "DRAFT" },
  });
}

// ── Upload & Processing ─────────────────────────────────────────────────────

async function getFileSize(filePath: string): Promise<bigint> {
  const stat = await fs.stat(filePath);
  return BigInt(stat.size);
}

export async function uploadAndProcessVersion(
  modelId: string,
  creatorId: string,
  versionId: string,
  filePath: string,
) {
  // 1. Verify ownership and version status
  const model = await db.model.findUnique({
    where: { id: modelId },
    include: { creator: { include: { user: true } } },
  });
  if (!model) throw new NotFoundError("Model");
  if (model.creatorId !== creatorId) {
    throw new ForbiddenError("You can only upload to your own models");
  }

  const version = await db.modelVersion.findUnique({ where: { id: versionId } });
  if (!version || version.modelId !== modelId) {
    throw new NotFoundError("Version");
  }
  if (version.status !== "PROCESSING") {
    throw new ForbiddenError("Version is not in PROCESSING state");
  }

  const modelsDir = getConfig().MODELS_DIR;
  const username = model.creator.user.username;
  const modelDir = path.join(modelsDir, username, model.slug, version.version);

  try {
    // 2. Move uploaded file to final location
    await fs.mkdir(modelDir, { recursive: true });
    const fileName = path.basename(filePath);
    const finalPath = path.join(modelDir, fileName);
    await fs.rename(filePath, finalPath);

    // 3. Calculate file size
    const fileSizeBytes = await getFileSize(finalPath);

    // 4. Detect model format and extract metadata
    const formatResult = await detectFormat(finalPath);

    // 5. Create torrent with adaptive piece size
    const pieceLength = getAdaptivePieceLength(Number(fileSizeBytes));
    const { torrentBuffer, infoHash, magnetUri } = await createModelTorrent(
      modelDir,
      `${username}-${model.slug}-${version.version}`,
      pieceLength,
    );

    // 6. Create Torrent DB record + update version in a transaction
    const updatedVersion = await db.$transaction(async (tx) => {
      const torrent = await tx.torrent.create({
        data: {
          infoHash,
          magnetUri,
          torrentFile: new Uint8Array(torrentBuffer),
        },
      });

      const ver = await tx.modelVersion.update({
        where: { id: versionId },
        data: {
          torrentId: torrent.id,
          fileSizeBytes,
          format: formatResult.format,
          metadata: formatResult.metadata ?? undefined,
          status: "READY",
        },
        include: {
          torrent: {
            select: { id: true, infoHash: true, magnetUri: true, createdAt: true },
          },
        },
      });

      // Update model format if it's still OTHER
      if (model.format === "OTHER" && formatResult.format !== "OTHER") {
        await tx.model.update({
          where: { id: modelId },
          data: { format: formatResult.format },
        });
      }

      return ver;
    });

    // 7. Add to Transmission (non-blocking, failure is non-fatal)
    addToTransmission(torrentBuffer, modelsDir).catch((err) => {
      console.warn("Failed to add torrent to Transmission:", err);
    });

    return {
      id: updatedVersion.id,
      version: updatedVersion.version,
      status: updatedVersion.status,
      fileSizeBytes: Number(updatedVersion.fileSizeBytes),
      format: updatedVersion.format,
      torrent: updatedVersion.torrent,
    };
  } catch (err) {
    // On any error, mark version as FAILED
    await db.modelVersion.update({
      where: { id: versionId },
      data: { status: "FAILED" },
    }).catch(() => {});

    // Clean up temp file if it still exists at original path
    await fs.unlink(filePath).catch(() => {});

    throw err;
  }
}

async function addToTransmission(torrentBuffer: Buffer, downloadDir: string): Promise<void> {
  const rpcUrl = getConfig().TRANSMISSION_RPC_URL;
  const body = JSON.stringify({
    method: "torrent-add",
    arguments: {
      "metainfo": torrentBuffer.toString("base64"),
      "download-dir": downloadDir,
    },
  });

  console.log(`[transmission] Adding torrent to ${rpcUrl}, download-dir: ${downloadDir}`);

  // First attempt — will get 409 with session ID
  const first = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  let response: Response;

  if (first.status === 409) {
    const sessionId = first.headers.get("X-Transmission-Session-Id") ?? "";
    if (!sessionId) throw new Error("Transmission returned 409 but no session ID");

    response = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Transmission-Session-Id": sessionId,
      },
      body,
    });
  } else {
    response = first;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Transmission RPC HTTP ${response.status}: ${text}`);
  }

  const result = await response.json() as { result: string; arguments?: Record<string, unknown> };
  if (result.result !== "success") {
    throw new Error(`Transmission RPC failed: ${result.result}`);
  }

  console.log("[transmission] Torrent added successfully:", JSON.stringify(result.arguments));
}
