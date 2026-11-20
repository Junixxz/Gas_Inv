import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshRequest;
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const request = error.config;
    const refresh = localStorage.getItem("refreshToken");
    if (
      error.response?.status !== 401 ||
      !request ||
      request._retry ||
      !refresh ||
      request.url?.includes("/api/auth/token/")
    ) {
      throw error;
    }

    request._retry = true;
    try {
      refreshRequest ??= axios
        .post(`${api.defaults.baseURL}/api/auth/token/refresh/`, { refresh })
        .then(({ data }) => {
          localStorage.setItem("accessToken", data.access);
          return data.access;
        })
        .finally(() => {
          refreshRequest = undefined;
        });
      const access = await refreshRequest;
      request.headers.Authorization = `Bearer ${access}`;
      return api(request);
    } catch (refreshError) {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      window.dispatchEvent(new Event("auth:expired"));
      throw refreshError;
    }
  },
);

export default api;
