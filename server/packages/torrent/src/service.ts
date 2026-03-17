/// <reference path="./vendor.d.ts" />
import { db, NotFoundError, ForbiddenError } from "@peerweights/shared";
import createTorrent from "create-torrent";
import parseTorrent, { toMagnetURI } from "parse-torrent";

// ── Torrent Access (license-gated) ──────────────────────────────────────────

export async function getLatestTorrent(userId: string, modelId: string) {
  // Verify the user owns a valid license
  const license = await db.license.findUnique({
    where: { userId_modelId: { userId, modelId } },
  });
  if (!license || license.status !== "ACTIVE") {
    throw new ForbiddenError("You do not own a valid license for this model");
  }

  // Find the latest READY version with its torrent
  const version = await db.modelVersion.findFirst({
    where: {
      modelId,
      status: "READY",
      torrentId: { not: null },
    },
    orderBy: { createdAt: "desc" },
    include: { torrent: true },
  });

  if (!version || !version.torrent) {
    throw new NotFoundError("Torrent");
  }

  return {
    modelId,
    versionId: version.id,
    version: version.version,
    fileSizeBytes: version.fileSizeBytes.toString(),
    magnetUri: version.torrent.magnetUri,
    infoHash: version.torrent.infoHash,
  };
}

export async function getLatestTorrentFile(userId: string, modelId: string): Promise<Buffer> {
  const license = await db.license.findUnique({
    where: { userId_modelId: { userId, modelId } },
  });
  if (!license || license.status !== "ACTIVE") {
    throw new ForbiddenError("You do not own a valid license for this model");
  }

  const version = await db.modelVersion.findFirst({
    where: {
      modelId,
      status: "READY",
      torrentId: { not: null },
    },
    orderBy: { createdAt: "desc" },
    include: { torrent: true },
  });

  if (!version?.torrent?.torrentFile) {
    throw new NotFoundError("Torrent file");
  }

  return Buffer.from(version.torrent.torrentFile);
}

// ── Seed Stats ──────────────────────────────────────────────────────────────

export async function reportSeedStats(
  userId: string,
  modelVersionId: string,
  bytesUploaded: bigint,
  seedingSeconds: number,
) {
  return db.seedStats.upsert({
    where: {
      userId_modelVersionId: { userId, modelVersionId },
    },
    create: {
      userId,
      modelVersionId,
      bytesUploaded,
      seedingSeconds,
      lastReportedAt: new Date(),
    },
    update: {
      bytesUploaded,
      seedingSeconds,
      lastReportedAt: new Date(),
    },
  });
}

export async function getUserSeedStats(userId: string) {
  const stats = await db.seedStats.findMany({
    where: { userId },
    include: {
      modelVersion: {
        select: {
          id: true,
          version: true,
          fileSizeBytes: true,
          model: {
            select: { id: true, name: true, slug: true },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return stats.map((s) => ({
    modelVersionId: s.modelVersionId,
    modelName: s.modelVersion.model.name,
    modelSlug: s.modelVersion.model.slug,
    modelId: s.modelVersion.model.id,
    version: s.modelVersion.version,
    fileSizeBytes: Number(s.modelVersion.fileSizeBytes),
    bytesUploaded: Number(s.bytesUploaded),
    seedingSeconds: s.seedingSeconds,
    // Ratio: bytes uploaded / file size downloaded
    ratio: s.modelVersion.fileSizeBytes > 0
      ? Number(s.bytesUploaded) / Number(s.modelVersion.fileSizeBytes)
      : 0,
    lastReportedAt: s.lastReportedAt,
  }));
}

export async function canStopSeeding(userId: string, modelVersionId: string): Promise<boolean> {
  const stats = await db.seedStats.findUnique({
    where: { userId_modelVersionId: { userId, modelVersionId } },
    include: {
      modelVersion: { select: { fileSizeBytes: true } },
    },
  });

  if (!stats) return false;

  // Must have uploaded at least as much as the file size (1.0x ratio)
  return stats.bytesUploaded >= stats.modelVersion.fileSizeBytes;
}

// ── Torrent Creation ────────────────────────────────────────────────────────

const ANNOUNCE_LIST = [
  ["udp://tracker.opentrackr.org:1337/announce"],
  ["udp://open.tracker.cl:1337/announce"],
  ["udp://open.demonii.com:1339/announce"],
  ["udp://open.stealth.si:80/announce"],
  ["udp://tracker.torrent.eu.org:451/announce"],
  ["udp://exodus.desync.com:6969/announce"],
  ["wss://tracker.openwebtorrent.com"],
  ["wss://tracker.webtorrent.dev"],
  ["wss://tracker.btorrent.xyz"],
];

export async function createModelTorrent(
  dirPath: string,
  name: string,
  pieceLength: number = 2 ** 18,
): Promise<{ torrentBuffer: Buffer; infoHash: string; magnetUri: string }> {
  const torrentBuffer = await new Promise<Buffer>((resolve, reject) => {
    createTorrent(
      dirPath,
      {
        name,
        comment: "Published on PeerWeights",
        createdBy: "PeerWeights",
        announceList: ANNOUNCE_LIST,
        private: false,
        pieceLength,
      },
      (err: Error | null, buf: Buffer) => {
        if (err) reject(err);
        else resolve(buf);
      },
    );
  });

  const parsed = await parseTorrent(torrentBuffer);
  const magnetUri = toMagnetURI(parsed);

  return {
    torrentBuffer,
    infoHash: parsed.infoHash!,
    magnetUri,
  };
}
