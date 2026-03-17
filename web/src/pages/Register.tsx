import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";

export default function Register() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const { register, loading, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await register(email, password, username, displayName);
      navigate("/");
    } catch {
      // Error is set in store
    }
  };

  return (
    <div className="auth-page">
      <h1 className="page-title">Create Account</h1>

      {error && <div className="form-error">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); clearError(); }}
            required
          />
        </div>
        <div className="form-group">
          <label>Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => { setUsername(e.target.value.toLowerCase()); clearError(); }}
            pattern="^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$"
            title="Lowercase letters, numbers, and hyphens"
            required
          />
        </div>
        <div className="form-group">
          <label>Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => { setDisplayName(e.target.value); clearError(); }}
            required
          />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); clearError(); }}
            minLength={8}
            required
          />
        </div>
        <button type="submit" className="btn-primary" style={{ width: "100%" }} disabled={loading}>
          {loading ? "Creating account..." : "Sign Up"}
        </button>
      </form>

      <p style={{ marginTop: "1rem", textAlign: "center", color: "var(--text-dim)" }}>
        Already have an account? <Link to="/login">Login</Link>
      </p>
    </div>
  );
}
