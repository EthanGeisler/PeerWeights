import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useModelStore } from "../stores/modelStore";
import { useLibraryStore } from "../stores/libraryStore";
import { useAuthStore } from "../stores/authStore";
import { apiDownload } from "../api";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export default function ModelDetail() {
  const { username, slug } = useParams<{ username: string; slug: string }>();
  const { currentModel, currentModelLoading, fetchModelByNamespace, clearCurrentModel } = useModelStore();
  const { checkout, licenses } = useLibraryStore();
  const { user } = useAuthStore();
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (username && slug) {
      fetchModelByNamespace(username, slug);
    }
    return () => clearCurrentModel();
  }, [username, slug, fetchModelByNamespace, clearCurrentModel]);

  if (currentModelLoading) {
    return <p style={{ color: "var(--text-dim)" }}>Loading...</p>;
  }

  if (!currentModel) {
    return <p>Model not found.</p>;
  }

  const m = currentModel;
  const owned = licenses.some((l) => l.model.id === m.id && l.status === "ACTIVE");

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const filename = `${m.username}-${m.slug}.torrent`;
      await apiDownload(`/torrents/${m.id}/latest/file`, filename);
    } catch (err: any) {
      alert(err.message || "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const handleCheckout = async () => {
    try {
      const result = await checkout(m.id);
      if (!result.free && result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      }
    } catch (err: any) {
      alert(err.message || "Checkout failed");
    }
  };

  return (
    <div className="model-detail">
      <div>
        <div style={{ marginBottom: "0.5rem" }}>
          <Link to={`/${m.username}`} style={{ color: "var(--text-dim)" }}>{m.username}</Link>
          <span style={{ color: "var(--text-dim)" }}> / </span>
          <span style={{ fontWeight: 600 }}>{m.slug}</span>
        </div>

        <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>{m.name}</h1>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1.5rem" }}>
          <span className="format-badge">{m.format}</span>
          {m.quantization && <span className="tag">{m.quantization}</span>}
          {m.architecture && <span className="tag">{m.architecture}</span>}
          {m.parameterCount && <span className="tag">{(m.parameterCount / 1e9).toFixed(1)}B params</span>}
        </div>

        {m.description && (
          <div className="card" style={{ marginBottom: "1.5rem" }}>
            <p style={{ whiteSpace: "pre-wrap" }}>{m.description}</p>
          </div>
        )}

        {m.readmeContent && (
          <div className="card">
            <h3 style={{ marginBottom: "0.75rem" }}>README</h3>
            <pre style={{ whiteSpace: "pre-wrap", color: "var(--text-dim)", fontSize: "0.9rem" }}>
              {m.readmeContent}
            </pre>
          </div>
        )}

        {m.tags.length > 0 && (
          <div style={{ marginTop: "1rem" }}>
            <div className="tags">
              {m.tags.map((t) => (
                <Link key={t} to={`/search?tag=${t}`} className="tag">{t}</Link>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="model-detail-sidebar">
        <div className="card">
          <div style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.75rem", color: "var(--green)" }}>
            {m.priceCents === 0 ? "Free" : `$${(m.priceCents / 100).toFixed(2)}`}
          </div>

          {m.latestVersion && (
            <div style={{ marginBottom: "1rem", color: "var(--text-dim)", fontSize: "0.85rem" }}>
              <div>Version {m.latestVersion.version}</div>
              <div>{formatBytes(m.latestVersion.fileSizeBytes)}</div>
              <div>{m.downloadCount} downloads</div>
            </div>
          )}

          {user ? (
            owned ? (
              <div>
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="btn-primary"
                  style={{ width: "100%", marginBottom: "0.5rem" }}
                >
                  {downloading ? "Preparing..." : "Download .torrent"}
                </button>
                <div style={{ color: "var(--green)", fontWeight: 600, fontSize: "0.85rem", textAlign: "center" }}>
                  Owned
                </div>
              </div>
            ) : (
              <button onClick={handleCheckout} className="btn-primary" style={{ width: "100%" }}>
                {m.priceCents === 0 ? "Get Model (Free)" : `Buy — $${(m.priceCents / 100).toFixed(2)}`}
              </button>
            )
          ) : (
            <Link to="/login" className="btn-primary" style={{ display: "block", textAlign: "center" }}>
              Login to Download
            </Link>
          )}

          {m.license && (
            <div style={{ marginTop: "1rem", color: "var(--text-dim)", fontSize: "0.85rem" }}>
              License: {m.license}
            </div>
          )}

          {m.baseModel && (
            <div style={{ marginTop: "0.5rem", color: "var(--text-dim)", fontSize: "0.85rem" }}>
              Base: {m.baseModel}
            </div>
          )}

          <div style={{ marginTop: "1rem", fontSize: "0.8rem", color: "var(--text-dim)" }}>
            By <Link to={`/${m.username}`}>{m.displayName}</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
