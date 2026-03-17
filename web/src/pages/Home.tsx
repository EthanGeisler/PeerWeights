import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useModelStore } from "../stores/modelStore";

export default function Home() {
  const { models, loading, fetchModels } = useModelStore();

  useEffect(() => {
    fetchModels({ sort: "newest" });
  }, [fetchModels]);

  return (
    <div>
      <div style={{ textAlign: "center", padding: "3rem 0" }}>
        <h1 style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>
          AI Models, Distributed by the Community
        </h1>
        <p style={{ color: "var(--text-dim)", fontSize: "1.1rem", maxWidth: "600px", margin: "0 auto 2rem" }}>
          Upload, share, and download AI models via BitTorrent.
          Creators keep 95% of revenue. Everyone seeds.
        </p>
        <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
          <Link to="/search" className="btn-primary" style={{ padding: "0.75rem 2rem", fontSize: "1rem" }}>
            Browse Models
          </Link>
          <Link to="/register" className="btn-secondary" style={{ padding: "0.75rem 2rem", fontSize: "1rem" }}>
            Start Creating
          </Link>
        </div>
      </div>

      <h2 className="page-title">Recent Models</h2>
      {loading ? (
        <p style={{ color: "var(--text-dim)" }}>Loading...</p>
      ) : (
        <div className="card-grid">
          {models.map((model) => (
            <Link key={model.id} to={`/${model.username}/${model.slug}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div className="model-card">
                <div className="model-card-cover">
                  {model.coverImageUrl ? (
                    <img src={model.coverImageUrl} alt={model.name} />
                  ) : (
                    <span>AI</span>
                  )}
                </div>
                <div className="model-card-body">
                  <h3>{model.name}</h3>
                  <div className="meta">
                    {model.username} &middot; <span className="format-badge">{model.format}</span>
                  </div>
                  <div className="price">
                    {model.priceCents === 0 ? "Free" : `$${(model.priceCents / 100).toFixed(2)}`}
                  </div>
                  {model.tags.length > 0 && (
                    <div className="tags">
                      {model.tags.slice(0, 3).map((t) => (
                        <span key={t} className="tag">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
          {models.length === 0 && !loading && (
            <p style={{ color: "var(--text-dim)" }}>No models published yet. Be the first!</p>
          )}
        </div>
      )}
    </div>
  );
}
