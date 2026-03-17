import { useEffect } from "react";
import { useDownloadStore } from "../stores/downloadStore";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function stateLabel(state: string, finished: boolean): string {
  if (finished && state === "live") return "Seeding";
  if (state === "live") return "Downloading";
  if (state === "paused") return "Paused";
  if (state === "initializing") return "Starting...";
  if (state === "error") return "Error";
  return state;
}

export default function Downloads() {
  const { torrents, startPolling, stopPolling, pauseTorrent, resumeTorrent, removeTorrent } =
    useDownloadStore();

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  return (
    <div>
      <h1 className="page-title">Downloads</h1>

      {torrents.length === 0 ? (
        <p style={{ color: "var(--text-dim)" }}>
          No active downloads or seeds. Purchase a model to get started.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {torrents.map((t) => {
            const progress = t.totalBytes > 0 ? (t.progressBytes / t.totalBytes) * 100 : 0;
            const label = stateLabel(t.state, t.finished);
            const isSeeding = t.finished && t.state === "live";
            const isPaused = t.state === "paused";

            return (
              <div key={t.id} className="card" style={{ padding: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <div>
                    <strong>{t.modelId.slice(0, 8)}...</strong>
                    <span
                      style={{
                        marginLeft: "0.75rem",
                        fontSize: "0.85rem",
                        color: isSeeding ? "var(--green)" : isPaused ? "var(--text-dim)" : "var(--blue, #4a9eff)",
                      }}
                    >
                      {label}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
                    {formatBytes(t.progressBytes)} / {formatBytes(t.totalBytes)}
                  </div>
                </div>

                {/* Progress bar */}
                <div
                  style={{
                    height: "6px",
                    background: "var(--surface, #1a1a2e)",
                    borderRadius: "3px",
                    overflow: "hidden",
                    marginBottom: "0.5rem",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.min(progress, 100)}%`,
                      background: isSeeding ? "var(--green)" : "var(--blue, #4a9eff)",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
                    <span>
                      Ratio:{" "}
                      <span style={{ color: t.seedRatio >= 1.0 ? "var(--green)" : "var(--orange, #f0a030)" }}>
                        {t.seedRatio.toFixed(2)}x
                      </span>
                    </span>
                    <span style={{ marginLeft: "1rem" }}>
                      Up: {formatBytes(t.uploadedBytes)}
                    </span>
                    {t.error && (
                      <span style={{ marginLeft: "1rem", color: "var(--red, #ff4444)" }}>
                        {t.error}
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    {isPaused ? (
                      <button className="btn-link" onClick={() => resumeTorrent(t.id)}>
                        Resume
                      </button>
                    ) : (
                      <button className="btn-link" onClick={() => pauseTorrent(t.id)}>
                        Pause
                      </button>
                    )}
                    <button
                      className="btn-link"
                      style={{ color: "var(--red, #ff4444)" }}
                      onClick={() => {
                        if (confirm("Remove torrent? Choose OK to also delete files, Cancel to keep them.")) {
                          removeTorrent(t.id, true);
                        } else {
                          removeTorrent(t.id, false);
                        }
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
