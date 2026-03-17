import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiFetch } from "../api";
import type { ApiUserProfile } from "../types";

export default function UserProfile() {
  const { username } = useParams<{ username: string }>();
  const [profile, setProfile] = useState<ApiUserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!username) return;
    setLoading(true);
    apiFetch<ApiUserProfile>(`/users/${username}`)
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, [username]);

  if (loading) return <p style={{ color: "var(--text-dim)" }}>Loading...</p>;
  if (!profile) return <p>User not found.</p>;

  return (
    <div>
      <div style={{ marginBottom: "2rem" }}>
        <h1 className="page-title">{profile.displayName}</h1>
        <p style={{ color: "var(--text-dim)" }}>@{profile.username}</p>
        {profile.bio && <p style={{ marginTop: "0.5rem" }}>{profile.bio}</p>}
      </div>

      <h2 style={{ marginBottom: "1rem" }}>Models</h2>
      <div className="card-grid">
        {profile.models.map((model) => (
          <Link key={model.id} to={`/${profile.username}/${model.slug}`} style={{ textDecoration: "none", color: "inherit" }}>
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
                  <span className="format-badge">{model.format}</span>
                  &middot; {model.downloadCount} downloads
                </div>
                <div className="price">
                  {model.priceCents === 0 ? "Free" : `$${(model.priceCents / 100).toFixed(2)}`}
                </div>
              </div>
            </div>
          </Link>
        ))}
        {profile.models.length === 0 && (
          <p style={{ color: "var(--text-dim)" }}>No published models yet.</p>
        )}
      </div>
    </div>
  );
}
