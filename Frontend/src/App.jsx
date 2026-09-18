// App.jsx
import { BrowserRouter, Routes, Route, useSearchParams } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import LandingPage from "@/pages/LandingPage";
import Dashboard from "@/pages/Dashboard";
import Fields from "@/pages/Fields";
import Health from "@/pages/Health";
import Ledger from "@/pages/Ledger";
import Fertilizer from "@/pages/Fertilizer";
import Scanner from "@/pages/Scanner";
import Settings from "@/pages/Settings";
import DroneImagery from "@/pages/DroneImagery";
import ResetPasswordModal from "@/components/auth/ResetPasswordModal";
import PaymentMock from "@/pages/PaymentMock";
import AdminRoute from "@/lib/auth/AdminRoute";
import AdminPanel from "@/pages/AdminPanel";
// import LoginPage from "@/pages/LoginPage";

function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  return (
    <ResetPasswordModal
      token={token}
      onSwitchToLogin={() => { window.location.href = "/"; }}
    />
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LandingPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/payment/mock" element={<PaymentMock />} />

        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminPanel />
            </AdminRoute>
          }
        />

        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/fields" element={<Fields />} />
          <Route path="/health" element={<Health />} />
          <Route path="/ledger" element={<Ledger />} />
          <Route path="/fertilizer" element={<Fertilizer />} />
          <Route path="/scanner" element={<Scanner />} />
          <Route path="/drone" element={<DroneImagery />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;