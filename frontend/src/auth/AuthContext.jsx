import { createContext, useContext, useEffect, useState } from "react";
import api from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const expire = () => setUser(null);
    window.addEventListener("auth:expired", expire);
    const access = localStorage.getItem("accessToken");
    if (!access) {
      setLoading(false);
    } else {
      api
        .get("/api/auth/me/")
        .then(({ data }) => setUser(data))
        .catch(() => {
          localStorage.removeItem("accessToken");
          localStorage.removeItem("refreshToken");
        })
        .finally(() => setLoading(false));
    }
    return () => window.removeEventListener("auth:expired", expire);
  }, []);

  async function login(username, password) {
    const { data } = await api.post("/api/auth/token/", { username, password });
    localStorage.setItem("accessToken", data.access);
    localStorage.setItem("refreshToken", data.refresh);
    const profile = await api.get("/api/auth/me/");
    setUser(profile.data);
  }

  async function changePassword(currentPassword, newPassword) {
    const { data } = await api.post("/api/auth/change-password/", {
      current_password: currentPassword,
      new_password: newPassword,
    });
    setUser(data);
  }

  function logout() {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
