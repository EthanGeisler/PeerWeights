/// Desktop (Tauri) integration bridge.
/// All functions no-op gracefully when running in a browser.

export const isDesktop = Boolean((window as any).__TAURI_INTERNALS__);

interface TorrentStats {
  id: number;
  modelId: string;
  versionId: string;
  state: string;
  progressBytes: number;
  uploadedBytes: number;
  totalBytes: number;
  finished: boolean;
  seedRatio: number;
  error: string | null;
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke(cmd, args);
}

export async function fetchAndStartTorrent(
  modelId: string,
  versionId: string,
  accessToken: string,
): Promise<number> {
  const apiBase = "https://peerweights.com/api";
  return invoke("fetch_and_start_torrent", {
    modelId,
    versionId,
    accessToken,
    apiBase,
  });
}

export async function getAllTorrents(): Promise<TorrentStats[]> {
  return invoke("get_all_torrents");
}

export async function pauseTorrent(id: number): Promise<void> {
  return invoke("pause_torrent", { id });
}

export async function resumeTorrent(id: number): Promise<void> {
  return invoke("resume_torrent", { id });
}

export async function removeTorrent(id: number, deleteFiles: boolean): Promise<void> {
  return invoke("remove_torrent", { id, deleteFiles });
}

export async function openModelFolder(id: number): Promise<void> {
  return invoke("open_model_folder", { id });
}

export async function getDownloadDir(): Promise<string> {
  return invoke("get_download_dir");
}

export async function syncAuthToken(token: string | null): Promise<void> {
  if (!isDesktop) return;
  return invoke("set_auth_token", { token });
}

export type { TorrentStats };
