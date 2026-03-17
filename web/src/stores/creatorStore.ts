import { create } from "zustand";
import { apiFetch, apiUpload, ApiError } from "../api";

interface CreatorModel {
  id: string;
  slug: string;
  name: string;
  description: string;
  priceCents: number;
  status: string;
  format: string;
  tags: string[];
  coverImageUrl: string | null;
  createdAt: string;
  versionsCount: number;
  latestVersion: { id: string; version: string; status: string } | null;
  licensesCount: number;
  salesCount: number;
}

interface CreatorState {
  models: CreatorModel[];
  loading: boolean;
  error: string | null;
  fetchModels: () => Promise<void>;
  createModel: (data: {
    name: string;
    description?: string;
    priceCents: number;
    format?: string;
    tags?: string[];
    license?: string;
  }) => Promise<CreatorModel>;
  createVersion: (modelId: string, version: string, changelog?: string) => Promise<{ id: string; version: string; status: string }>;
  uploadModelFile: (modelId: string, versionId: string, file: File) => Promise<void>;
  publishModel: (modelId: string) => Promise<void>;
  unpublishModel: (modelId: string) => Promise<void>;
  registerAsCreator: () => Promise<void>;
}

export const useCreatorStore = create<CreatorState>((set, get) => ({
  models: [],
  loading: false,
  error: null,

  fetchModels: async () => {
    set({ loading: true, error: null });
    try {
      const data = await apiFetch<{ models: CreatorModel[] }>("/creator/models");
      set({ models: data.models, loading: false });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof ApiError ? err.message : "Failed to load models",
      });
    }
  },

  createModel: async (data) => {
    const model = await apiFetch<CreatorModel>("/creator/models", {
      method: "POST",
      body: JSON.stringify(data),
    });
    set({ models: [model, ...get().models] });
    return model;
  },

  createVersion: async (modelId, version, changelog) => {
    return apiFetch<{ id: string; version: string; status: string }>(
      `/creator/models/${modelId}/versions`,
      {
        method: "POST",
        body: JSON.stringify({ version, changelog }),
      },
    );
  },

  uploadModelFile: async (modelId, versionId, file) => {
    const formData = new FormData();
    formData.append("modelFile", file);
    await apiUpload(`/creator/models/${modelId}/versions/${versionId}/upload`, formData);
    // Refresh models list to get updated version status
    await get().fetchModels();
  },

  publishModel: async (modelId) => {
    await apiFetch(`/creator/models/${modelId}/publish`, { method: "PATCH" });
    await get().fetchModels();
  },

  unpublishModel: async (modelId) => {
    await apiFetch(`/creator/models/${modelId}/unpublish`, { method: "PATCH" });
    await get().fetchModels();
  },

  registerAsCreator: async () => {
    await apiFetch("/creator/register", { method: "POST" });
  },
}));
