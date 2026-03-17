import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  format: z.string().optional(),
  tag: z.string().optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().optional(),
  sort: z.enum(["newest", "popular", "price_asc", "price_desc"]).default("newest"),
});

export const createModelSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(10000).optional(),
  priceCents: z.number().int().min(0, "Price must be non-negative"),
  format: z.string().optional(),
  architecture: z.string().max(200).optional(),
  baseModel: z.string().max(200).optional(),
  quantization: z.string().max(100).optional(),
  license: z.string().max(200).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  readmeContent: z.string().max(50000).optional(),
});

export const updateModelSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(10000).optional(),
  priceCents: z.number().int().min(0).optional(),
  format: z.string().optional(),
  architecture: z.string().max(200).optional(),
  baseModel: z.string().max(200).optional(),
  quantization: z.string().max(100).optional(),
  license: z.string().max(200).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  readmeContent: z.string().max(50000).optional(),
  coverImageUrl: z.string().max(500).optional(),
});

export const createVersionSchema = z.object({
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, "Version must be valid semver (e.g. 1.0.0)"),
  changelog: z.string().max(5000).optional(),
});

export type CreateModelInput = z.infer<typeof createModelSchema>;
export type UpdateModelInput = z.infer<typeof updateModelSchema>;
export type CreateVersionInput = z.infer<typeof createVersionSchema>;
