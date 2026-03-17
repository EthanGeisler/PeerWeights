import { Link } from "react-router-dom";

export default function CheckoutSuccess() {
  return (
    <div style={{ textAlign: "center", padding: "3rem 0" }}>
      <h1 style={{ color: "var(--green)", marginBottom: "1rem" }}>Purchase Complete!</h1>
      <p style={{ color: "var(--text-dim)", marginBottom: "2rem" }}>
        Your model license has been activated. You can now download it from your library.
      </p>
      <Link to="/library" className="btn-primary" style={{ padding: "0.75rem 2rem" }}>
        Go to Library
      </Link>
    </div>
  );
}
