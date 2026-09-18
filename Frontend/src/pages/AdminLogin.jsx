import { useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";

export default function AdminLogin() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login(email, password);
    } catch (err) {
      console.error("Admin login failed:", err);
      setError(
        err?.message?.includes("Network") || err?.status === 0
          ? "Cannot reach server. Is the backend running?"
          : "Invalid email or password."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "#0f1115",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: "#fff",
          padding: 32,
          borderRadius: 8,
          width: 320,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <h2 style={{ margin: 0, marginBottom: 8 }}>Admin Login</h2>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          style={{ padding: 10, borderRadius: 4, border: "1px solid #ccc" }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          style={{ padding: 10, borderRadius: 4, border: "1px solid #ccc" }}
        />

        {error && (
          <div style={{ color: "#c0392b", fontSize: 14 }}>{error}</div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            padding: 10,
            borderRadius: 4,
            border: "none",
            background: isSubmitting ? "#555" : "#14532d",
            color: "#fff",
            fontWeight: 600,
            cursor: isSubmitting ? "default" : "pointer",
          }}
        >
          {isSubmitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}