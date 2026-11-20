import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import PasswordChangeModal from "./components/PasswordChangeModal";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import Inventory from "./pages/Inventory";
import Login from "./pages/Login";
import PointOfSale from "./pages/PointOfSale";
import Purchases from "./pages/Purchases";
import Reports from "./pages/Reports";
import Team from "./pages/Team";

function Protected({ children, userManagement = false }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="grid min-h-screen place-items-center text-sm text-muted">Loading your workspace…</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (userManagement && !["superadmin", "head"].includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  return (
    <>
      {children}
      {user.must_change_password && <PasswordChangeModal />}
    </>
  );
}

export default function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/"
        element={
          <Protected>
            <Dashboard />
          </Protected>
        }
      />
      <Route
        path="/team"
        element={
          <Protected userManagement>
            <Team />
          </Protected>
        }
      />
      <Route path="/pos" element={<Protected><PointOfSale /></Protected>} />
      <Route path="/inventory" element={<Protected><Inventory /></Protected>} />
      <Route path="/purchases" element={<Protected><Purchases /></Protected>} />
      <Route path="/customers" element={<Protected><Customers /></Protected>} />
      <Route path="/reports" element={<Protected><Reports /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
