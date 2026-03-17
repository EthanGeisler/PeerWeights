import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useModelStore } from "../stores/modelStore";

export default function Search() {
  const { models, total, page, totalPages, loading, fetchModels } = useModelStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");

  const currentFormat = searchParams.get("format") || "";
  const currentSort = searchParams.get("sort") || "newest";

  useEffect(() => {
    fetchModels({
      search: searchParams.get("q") || undefined,
      format: searchParams.get("format") || undefined,
      sort: searchParams.get("sort") || "newest",
      page: Number(searchParams.get("page")) || 1,
    });
  }, [searchParams, fetchModels]);

  const doSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params: Record<string, string> = {};
    if (query) params.q = query;
    if (currentFormat) params.format = currentFormat;
    if (currentSort !== "newest") params.sort = currentSort;
    setSearchParams(params);
  };

  return (
    <div>
      <h1 className="page-title">Browse Models</h1>

      <form onSubmit={doSearch} className="search-bar">
        <input
          type="text"
          placeholder="Search models..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          value={currentFormat}
          onChange={(e) => {
            const params = Object.fromEntries(searchParams);
            if (e.target.value) params.format = e.target.value;
            else delete params.format;
            setSearchParams(params);
          }}
          style={{ background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--text)", padding: "0.6rem" }}
        >
          <option value="">All Formats</option>
          <option value="SAFETENSORS">Safetensors</option>
          <option value="GGUF">GGUF</option>
          <option value="ONNX">ONNX</option>
          <option value="PYTORCH">PyTorch</option>
        </select>
        <select
          value={currentSort}
          onChange={(e) => {
            const params = Object.fromEntries(searchParams);
            params.sort = e.target.value;
            setSearchParams(params);
          }}
          style={{ background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--text)", padding: "0.6rem" }}
        >
          <option value="newest">Newest</option>
          <option value="popular">Most Popular</option>
          <option value="price_asc">Price: Low to High</option>
          <option value="price_desc">Price: High to Low</option>
        </select>
        <button type="submit" className="btn-primary">Search</button>
      </form>

      {loading ? (
        <p style={{ color: "var(--text-dim)" }}>Loading...</p>
      ) : (
        <>
          <p style={{ color: "var(--text-dim)", marginBottom: "1rem" }}>
            {total} model{total !== 1 ? "s" : ""} found
          </p>
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
                      &middot; {model.downloadCount} downloads
                    </div>
                    <div className="price">
                      {model.priceCents === 0 ? "Free" : `$${(model.priceCents / 100).toFixed(2)}`}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", marginTop: "2rem" }}>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  className={p === page ? "btn-primary" : "btn-secondary"}
                  onClick={() => {
                    const params = Object.fromEntries(searchParams);
                    params.page = String(p);
                    setSearchParams(params);
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
