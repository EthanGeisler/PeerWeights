import { Link } from "react-router-dom";

export default function CheckoutCancel() {
  return (
    <div style={{ textAlign: "center", padding: "3rem 0" }}>
      <h1 style={{ marginBottom: "1rem" }}>Payment Cancelled</h1>
      <p style={{ color: "var(--text-dim)", marginBottom: "2rem" }}>
        Your payment was cancelled. No charges were made.
      </p>
      <Link to="/search" className="btn-primary" style={{ padding: "0.75rem 2rem" }}>
        Continue Browsing
      </Link>
    </div>
  );
}
