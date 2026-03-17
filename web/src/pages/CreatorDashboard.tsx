import { useEffect, useState } from "react";
import { useAuthStore } from "../stores/authStore";
import { useCreatorStore } from "../stores/creatorStore";
import { apiFetch } from "../api";
import { Link } from "react-router-dom";

export default function CreatorDashboard() {
  const { user, loadSession } = useAuthStore();
  const { models, loading, fetchModels, createModel, createVersion, uploadModelFile, publishModel, unpublishModel, registerAsCreator } = useCreatorStore();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceCents, setPriceCents] = useState(0);
  const [format, setFormat] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [licenseInput, setLicenseInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role === "CREATOR" || user?.role === "ADMIN") {
      fetchModels();
    }
  }, [user, fetchModels]);

  if (!user) {
    return <p>Please <Link to="/login">login</Link> first.</p>;
  }

  if (user.role === "USER") {
    return (
      <div>
        <h1 className="page-title">Creator Dashboard</h1>
        <div className="card" style={{ maxWidth: "500px" }}>
          <h3 style={{ marginBottom: "0.75rem" }}>Become a Creator</h3>
          <p style={{ color: "var(--text-dim)", marginBottom: "1rem" }}>
            Start uploading and selling AI models. Creators keep 95% of revenue.
          </p>
          <button
            className="btn-primary"
            onClick={async () => {
              try {
                await registerAsCreator();
                await loadSession(); // Refresh JWT with new role
              } catch (err: any) {
                setError(err.message);
              }
            }}
          >
            Register as Creator
          </button>
          {error && <div className="form-error" style={{ marginTop: "1rem" }}>{error}</div>}
        </div>
      </div>
    );
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
      await createModel({ name, description, priceCents, format: format || undefined, tags, license: licenseInput || undefined });
      setShowCreate(false);
      setName("");
      setDescription("");
      setPriceCents(0);
      setFormat("");
      setTagsInput("");
      setLicenseInput("");
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpload = async (modelId: string) => {
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setUploading(modelId);
      try {
        // Create a version first
        const version = await createVersion(modelId, "1.0.0");
        await uploadModelFile(modelId, version.id, file);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setUploading(null);
      }
    };
    input.click();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h1 className="page-title" style={{ margin: 0 }}>Creator Dashboard</h1>
        <button className="btn-primary" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? "Cancel" : "New Model"}
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      {showCreate && (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ marginBottom: "1rem" }}>Create Model</h3>
          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div className="form-group">
                <label>Price (cents, 0 = free)</label>
                <input type="number" value={priceCents} onChange={(e) => setPriceCents(Number(e.target.value))} min={0} />
              </div>
              <div className="form-group">
                <label>Format</label>
                <select value={format} onChange={(e) => setFormat(e.target.value)} style={{ width: "100%", padding: "0.6rem", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--text)" }}>
                  <option value="">Auto-detect</option>
                  <option value="SAFETENSORS">Safetensors</option>
                  <option value="GGUF">GGUF</option>
                  <option value="ONNX">ONNX</option>
                  <option value="PYTORCH">PyTorch</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Tags (comma-separated)</label>
              <input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="llm, text-generation, 7b" />
            </div>
            <div className="form-group">
              <label>License</label>
              <input value={licenseInput} onChange={(e) => setLicenseInput(e.target.value)} placeholder="MIT, Apache-2.0, etc." />
            </div>
            <button type="submit" className="btn-primary">Create</button>
          </form>
        </div>
      )}

      {loading ? (
        <p style={{ color: "var(--text-dim)" }}>Loading...</p>
      ) : models.length === 0 ? (
        <p style={{ color: "var(--text-dim)" }}>No models yet. Click "New Model" to get started.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {models.map((model) => (
            <div key={model.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ marginBottom: "0.25rem" }}>
                  <Link to={`/${user.username}/${model.slug}`}>{model.name}</Link>
                </h3>
                <div style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>
                  {model.status} &middot; {model.format} &middot; {model.versionsCount} version(s)
                  &middot; {model.licensesCount} licenses &middot; {model.salesCount} sales
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {model.status === "DRAFT" && model.versionsCount > 0 && (
                  <button className="btn-primary" onClick={() => publishModel(model.id)} style={{ fontSize: "0.85rem" }}>
                    Publish
                  </button>
                )}
                {model.status === "PUBLISHED" && (
                  <button className="btn-secondary" onClick={() => unpublishModel(model.id)} style={{ fontSize: "0.85rem" }}>
                    Unpublish
                  </button>
                )}
                <button
                  className="btn-secondary"
                  onClick={() => handleUpload(model.id)}
                  disabled={uploading === model.id}
                  style={{ fontSize: "0.85rem" }}
                >
                  {uploading === model.id ? "Uploading..." : "Upload File"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
