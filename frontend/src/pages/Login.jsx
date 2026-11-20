import { useState } from "react";
import { Activity, ArrowRight, Eye, EyeOff, LockKeyhole, Moon, Sun, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useTheme } from "../auth/ThemeContext";

export default function Login() {
  const { login } = useAuth();
  const { isDarkMode, toggleDarkMode } = useTheme();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(username.trim(), password);
      navigate("/", { replace: true });
    } catch {
      setError("Sign in failed. Check your username and password, then try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-white lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      <button
        type="button"
        onClick={toggleDarkMode}
        className="absolute right-5 top-5 z-10 flex items-center gap-2 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-ink"
        aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
        aria-pressed={isDarkMode}
        title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
      >
        {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
        <span className="hidden text-xs font-medium sm:inline">Theme</span>
      </button>
      <section className="relative hidden overflow-hidden bg-[#123e38] px-12 py-10 text-white lg:flex lg:flex-col lg:justify-between xl:px-20">
        <div className="absolute -right-32 -top-32 h-[440px] w-[440px] rounded-full border border-white/10" />
        <div className="absolute -right-12 -top-12 h-[280px] w-[280px] rounded-full border border-white/10" />
        <div className="relative flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/10"><Activity size={21} /></div>
          <span className="font-bold">Gas Inventory</span>
        </div>
        <div className="relative max-w-xl">
          <p className="mb-5 text-xs font-bold uppercase tracking-[0.24em] text-emerald-200">Operations at a glance</p>
          <h1 className="text-5xl font-semibold leading-[1.12] tracking-tight xl:text-6xl">
            Keep your business moving.
          </h1>
          <p className="mt-6 max-w-md text-base leading-7 text-emerald-100/75">
            A clearer view of your products, inventory, sales, purchases, and expenses—all in one place.
          </p>
          <div className="mt-12 flex items-center gap-3">
            <span className="h-1.5 w-8 rounded-full bg-emerald-300" />
            <span className="h-1.5 w-2 rounded-full bg-white/30" />
            <span className="h-1.5 w-2 rounded-full bg-white/30" />
          </div>
        </div>
        <p className="relative text-xs text-emerald-100/50">Secure access for your team</p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-6 py-12">
        <div className="w-full max-w-[420px]">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-white"><Activity size={21} /></div>
            <span className="font-bold">Gas Inventory</span>
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">Welcome back</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight">Sign in to your account</h2>
          <p className="mt-2 text-sm leading-6 text-muted">Enter your credentials to access your dashboard.</p>

          <form onSubmit={handleSubmit} className="mt-9 space-y-5">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Username</span>
              <span className="relative block">
                <UserRound className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  autoComplete="username"
                  className="field pl-11"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="Your username"
                  required
                />
              </span>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Password</span>
              <span className="relative block">
                <LockKeyhole className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  autoComplete="current-password"
                  className="field pl-11 pr-12"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>
            {error && <p role="alert" className="rounded-lg bg-red-50 px-3.5 py-3 text-sm text-red-700">{error}</p>}
            <button disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-[#12584a] disabled:cursor-not-allowed disabled:opacity-60">
              {submitting ? "Signing in…" : "Sign in"}
              {!submitting && <ArrowRight size={17} />}
            </button>
          </form>
          <p className="mt-8 text-center text-xs text-slate-400">Need an account? Ask your Superadmin or Head.</p>
        </div>
      </section>
    </div>
  );
}
