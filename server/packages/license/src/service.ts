import { db } from "@peerweights/shared";

export async function listUserLicenses(userId: string) {
  const licenses = await db.license.findMany({
    where: { userId },
    include: {
      model: {
        select: {
          id: true,
          slug: true,
          name: true,
          format: true,
          coverImageUrl: true,
          creator: {
            select: {
              user: { select: { username: true, displayName: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Enrich with seed stats
  const modelVersionIds = new Set<string>();
  const modelIds = licenses.map((l) => l.modelId);

  // Get latest version for each model
  const latestVersions = await db.modelVersion.findMany({
    where: {
      modelId: { in: modelIds },
      status: "READY",
    },
    orderBy: { createdAt: "desc" },
    distinct: ["modelId"],
    select: { id: true, modelId: true, fileSizeBytes: true },
  });

  const versionByModel = new Map(latestVersions.map((v) => [v.modelId, v]));

  // Get user's seed stats for these versions
  const versionIds = latestVersions.map((v) => v.id);
  const seedStats = await db.seedStats.findMany({
    where: {
      userId,
      modelVersionId: { in: versionIds },
    },
  });
  const statsByVersion = new Map(seedStats.map((s) => [s.modelVersionId, s]));

  return licenses.map((l) => {
    const version = versionByModel.get(l.modelId);
    const stats = version ? statsByVersion.get(version.id) : null;

    return {
      id: l.id,
      status: l.status,
      createdAt: l.createdAt,
      model: {
        id: l.model.id,
        slug: l.model.slug,
        name: l.model.name,
        format: l.model.format,
        coverImageUrl: l.model.coverImageUrl,
        username: l.model.creator.user.username,
        displayName: l.model.creator.user.displayName,
      },
      seedStats: stats ? {
        bytesUploaded: Number(stats.bytesUploaded),
        fileSizeBytes: version ? Number(version.fileSizeBytes) : 0,
        ratio: version && version.fileSizeBytes > 0
          ? Number(stats.bytesUploaded) / Number(version.fileSizeBytes)
          : 0,
        seedingSeconds: stats.seedingSeconds,
      } : null,
    };
  });
}
