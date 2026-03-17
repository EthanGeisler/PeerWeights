import { create } from "zustand";
import { apiFetch, ApiError } from "../api";
import type { ApiLicense, ApiCheckoutResult } from "../types";

interface LibraryState {
  licenses: ApiLicense[];
  loading: boolean;
  error: string | null;
  fetchLicenses: () => Promise<void>;
  checkout: (modelId: string) => Promise<ApiCheckoutResult>;
}

export const useLibraryStore = create<LibraryState>((set) => ({
  licenses: [],
  loading: false,
  error: null,

  fetchLicenses: async () => {
    set({ loading: true, error: null });
    try {
      const data = await apiFetch<{ licenses: ApiLicense[] }>("/licenses");
      const licenses = Array.isArray(data.licenses) ? data.licenses : [];
      set({ licenses, loading: false });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof ApiError ? err.message : "Failed to load library",
      });
    }
  },

  checkout: async (modelId: string) => {
    const result = await apiFetch<ApiCheckoutResult>("/payments/checkout", {
      method: "POST",
      body: JSON.stringify({ modelId }),
    });

    // If free, refresh licenses
    if (result.free) {
      const data = await apiFetch<{ licenses: ApiLicense[] }>("/licenses");
      set({ licenses: Array.isArray(data.licenses) ? data.licenses : [] });
    }

    return result;
  },
}));
