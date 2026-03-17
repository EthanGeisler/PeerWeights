import { useEffect } from "react";
import { Routes, Route, Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "./stores/authStore";
import Home from "./pages/Home";
import Search from "./pages/Search";
import ModelDetail from "./pages/ModelDetail";
import UserProfile from "./pages/UserProfile";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Library from "./pages/Library";
import CreatorDashboard from "./pages/CreatorDashboard";
import CheckoutSuccess from "./pages/CheckoutSuccess";
import CheckoutCancel from "./pages/CheckoutCancel";

export default function App() {
  const { user, loading, loadSession, logout } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="app">
      <header className="header">
        <nav className="nav">
          <Link to="/" className="logo">PeerWeights</Link>
          <div className="nav-links">
            <Link to="/search">Browse</Link>
            {user ? (
              <>
                <Link to="/library">Library</Link>
                {(user.role === "CREATOR" || user.role === "ADMIN") && (
                  <Link to="/dashboard">Dashboard</Link>
                )}
                <span className="nav-user">{user.username}</span>
                <button onClick={() => { logout(); navigate("/"); }} className="btn-link">
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link to="/login">Login</Link>
                <Link to="/register" className="btn-primary">Sign Up</Link>
              </>
            )}
          </div>
        </nav>
      </header>

      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/library" element={<Library />} />
          <Route path="/dashboard" element={<CreatorDashboard />} />
          <Route path="/checkout/success" element={<CheckoutSuccess />} />
          <Route path="/checkout/cancel" element={<CheckoutCancel />} />
          <Route path="/:username/:slug" element={<ModelDetail />} />
          <Route path="/:username" element={<UserProfile />} />
        </Routes>
      </main>

      <footer className="footer">
        <p>PeerWeights — Torrent-based AI Model Marketplace</p>
      </footer>
    </div>
  );
}
