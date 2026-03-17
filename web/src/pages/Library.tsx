import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useLibraryStore } from "../stores/libraryStore";
import { useAuthStore } from "../stores/authStore";

export default function Library() {
  const { licenses, loading, fetchLicenses } = useLibraryStore();
  const { user } = useAuthStore();

  useEffect(() => {
    if (user) fetchLicenses();
  }, [user, fetchLicenses]);

  if (!user) {
    return (
      <div>
        <h1 className="page-title">Library</h1>
        <p>Please <Link to="/login">login</Link> to view your library.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">My Library</h1>

      {loading ? (
        <p style={{ color: "var(--text-dim)" }}>Loading...</p>
      ) : licenses.length === 0 ? (
        <p style={{ color: "var(--text-dim)" }}>
          No models in your library yet. <Link to="/search">Browse models</Link> to get started.
        </p>
      ) : (
        <div className="card-grid">
          {licenses.map((license) => (
            <Link
              key={license.id}
              to={`/${license.model.username}/${license.model.slug}`}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div className="model-card">
                <div className="model-card-cover">
                  {license.model.coverImageUrl ? (
                    <img src={license.model.coverImageUrl} alt={license.model.name} />
                  ) : (
                    <span>AI</span>
                  )}
                </div>
                <div className="model-card-body">
                  <h3>{license.model.name}</h3>
                  <div className="meta">
                    {license.model.username} &middot;{" "}
                    <span className="format-badge">{license.model.format}</span>
                  </div>
                  {license.seedStats && (
                    <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--text-dim)" }}>
                      Seed ratio: {license.seedStats.ratio.toFixed(2)}x
                      {license.seedStats.ratio < 1.0 && (
                        <span style={{ color: "var(--orange)", marginLeft: "0.5rem" }}>
                          (below 1.0x)
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
