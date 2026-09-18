import { useAuth } from "@/lib/auth/AuthContext";
import AdminLogin from "@/pages/AdminLogin";

export default function AdminRoute({ children }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          background: "#0f1115",
          color: "#fff",
          fontFamily: "sans-serif",
        }}
      >
        Checking authentication…
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AdminLogin />;
  }

  if (!user?.is_admin) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          background: "#0f1115",
          color: "#fff",
          fontFamily: "sans-serif",
        }}
      >
        Not authorized. This account is not an admin.
      </div>
    );
  }

  return children;
}