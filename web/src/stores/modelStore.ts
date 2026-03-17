import { create } from "zustand";
import { apiFetch, ApiError } from "../api";
import type { ApiModel, ApiModelDetail, ApiModelListResponse } from "../types";

interface ModelState {
  models: ApiModel[];
  total: number;
  page: number;
  totalPages: number;
  loading: boolean;
  error: string | null;
  currentModel: ApiModelDetail | null;
  currentModelLoading: boolean;
  fetchModels: (params?: { page?: number; search?: string; format?: string; tag?: string; sort?: string }) => Promise<void>;
  fetchModelByNamespace: (username: string, slug: string) => Promise<void>;
  clearCurrentModel: () => void;
}

export const useModelStore = create<ModelState>((set) => ({
  models: [],
  total: 0,
  page: 1,
  totalPages: 0,
  loading: false,
  error: null,
  currentModel: null,
  currentModelLoading: false,

  fetchModels: async (params) => {
    set({ loading: true, error: null });
    try {
      const query = new URLSearchParams();
      if (params?.page) query.set("page", String(params.page));
      if (params?.search) query.set("search", params.search);
      if (params?.format) query.set("format", params.format);
      if (params?.tag) query.set("tag", params.tag);
      if (params?.sort) query.set("sort", params.sort);

      const qs = query.toString();
      const data = await apiFetch<ApiModelListResponse>(`/models${qs ? `?${qs}` : ""}`);
      set({
        models: data.models,
        total: data.total,
        page: data.page,
        totalPages: data.totalPages,
        loading: false,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof ApiError ? err.message : "Failed to load models",
      });
    }
  },

  fetchModelByNamespace: async (username, slug) => {
    set({ currentModelLoading: true, error: null });
    try {
      const model = await apiFetch<ApiModelDetail>(`/models/${username}/${slug}`);
      set({ currentModel: model, currentModelLoading: false });
    } catch (err) {
      set({
        currentModelLoading: false,
        error: err instanceof ApiError ? err.message : "Failed to load model",
      });
    }
  },

  clearCurrentModel: () => set({ currentModel: null }),
}));
