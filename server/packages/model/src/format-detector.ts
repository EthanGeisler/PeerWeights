import fs from "node:fs/promises";
import type { ModelFormat } from "@prisma/client";

/**
 * Detect AI model format from file extension and header bytes.
 * All extraction is best-effort with try/catch — never fails fatally.
 */

interface FormatResult {
  format: ModelFormat;
  metadata?: Record<string, unknown>;
}

export async function detectFormat(filePath: string): Promise<FormatResult> {
  const lower = filePath.toLowerCase();

  if (lower.endsWith(".safetensors")) {
    const metadata = await extractSafetensorsMetadata(filePath);
    return { format: "SAFETENSORS", metadata };
  }

  if (lower.endsWith(".gguf")) {
    const metadata = await extractGgufMetadata(filePath);
    return { format: "GGUF", metadata };
  }

  if (lower.endsWith(".onnx")) {
    return { format: "ONNX" };
  }

  if (lower.endsWith(".pt") || lower.endsWith(".pth") || lower.endsWith(".bin")) {
    return { format: "PYTORCH" };
  }

  if (lower.endsWith(".pkl") || lower.endsWith(".pickle")) {
    // Never unpickle on server — just detect the format
    return { format: "PICKLE" };
  }

  return { format: "OTHER" };
}

/**
 * Safetensors files have a JSON header at the start:
 * First 8 bytes = little-endian uint64 header length
 * Next N bytes = JSON header with tensor metadata
 */
async function extractSafetensorsMetadata(filePath: string): Promise<Record<string, unknown> | undefined> {
  try {
    const fd = await fs.open(filePath, "r");
    try {
      // Read header length (8 bytes, little-endian uint64)
      const lenBuf = Buffer.alloc(8);
      await fd.read(lenBuf, 0, 8, 0);
      const headerLen = Number(lenBuf.readBigUInt64LE());

      // Sanity check — header shouldn't be > 100MB
      if (headerLen > 100 * 1024 * 1024) return undefined;

      // Read JSON header
      const headerBuf = Buffer.alloc(headerLen);
      await fd.read(headerBuf, 0, headerLen, 8);
      const header = JSON.parse(headerBuf.toString("utf-8"));

      // Extract __metadata__ key if present (contains model info)
      const meta = header.__metadata__ ?? {};
      const tensorCount = Object.keys(header).filter((k) => k !== "__metadata__").length;

      return {
        tensorCount,
        ...meta,
      };
    } finally {
      await fd.close();
    }
  } catch {
    return undefined;
  }
}

/**
 * GGUF files have a magic number and versioned header.
 * Magic: "GGUF" (0x46475547)
 * We extract version and basic metadata key-value pairs.
 */
async function extractGgufMetadata(filePath: string): Promise<Record<string, unknown> | undefined> {
  try {
    const fd = await fs.open(filePath, "r");
    try {
      const headerBuf = Buffer.alloc(24);
      await fd.read(headerBuf, 0, 24, 0);

      // Check magic number "GGUF"
      const magic = headerBuf.toString("ascii", 0, 4);
      if (magic !== "GGUF") return undefined;

      const version = headerBuf.readUInt32LE(4);
      const tensorCount = Number(headerBuf.readBigUInt64LE(8));
      const metadataKvCount = Number(headerBuf.readBigUInt64LE(16));

      return {
        ggufVersion: version,
        tensorCount,
        metadataKvCount,
      };
    } finally {
      await fd.close();
    }
  } catch {
    return undefined;
  }
}

/**
 * Get adaptive piece length for torrent creation based on file size.
 * Smaller files get smaller pieces for faster initial downloads.
 * Larger files get bigger pieces to reduce metadata overhead.
 */
export function getAdaptivePieceLength(fileSizeBytes: number): number {
  if (fileSizeBytes < 1024 * 1024 * 1024) {
    // < 1GB: 256KB pieces
    return 2 ** 18;
  }
  if (fileSizeBytes < 10 * 1024 * 1024 * 1024) {
    // 1-10GB: 1MB pieces
    return 2 ** 20;
  }
  // > 10GB: 4MB pieces
  return 2 ** 22;
}
