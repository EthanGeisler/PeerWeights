import { create } from "zustand";
import type { TorrentStats } from "../desktop";

interface DownloadState {
  torrents: TorrentStats[];
  polling: boolean;
  startPolling: () => void;
  stopPolling: () => void;
  refresh: () => Promise<void>;
  pauseTorrent: (id: number) => Promise<void>;
  resumeTorrent: (id: number) => Promise<void>;
  removeTorrent: (id: number, deleteFiles: boolean) => Promise<void>;
}

let pollInterval: ReturnType<typeof setInterval> | null = null;

export const useDownloadStore = create<DownloadState>((set, get) => ({
  torrents: [],
  polling: false,

  refresh: async () => {
    try {
      const { getAllTorrents } = await import("../desktop");
      const torrents = await getAllTorrents();
      set({ torrents });
    } catch {
      // Not in desktop or error — ignore
    }
  },

  startPolling: () => {
    if (get().polling) return;
    set({ polling: true });
    get().refresh();
    pollInterval = setInterval(() => get().refresh(), 2000);
  },

  stopPolling: () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    set({ polling: false });
  },

  pauseTorrent: async (id: number) => {
    const { pauseTorrent } = await import("../desktop");
    await pauseTorrent(id);
    await get().refresh();
  },

  resumeTorrent: async (id: number) => {
    const { resumeTorrent } = await import("../desktop");
    await resumeTorrent(id);
    await get().refresh();
  },

  removeTorrent: async (id: number, deleteFiles: boolean) => {
    const { removeTorrent } = await import("../desktop");
    await removeTorrent(id, deleteFiles);
    await get().refresh();
  },
}));
