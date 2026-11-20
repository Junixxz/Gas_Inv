import { useState } from "react";
import { KeyRound, LogOut } from "lucide-react";
import { useAuth } from "../auth/AuthContext";

export default function PasswordChangeModal() {
  const { changePassword, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
    } catch (requestError) {
      const details = requestError.response?.data;
      const message = details && typeof details === "object"
        ? Object.values(details).flat().join(" ")
        : "Could not update your password. Please try again.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="password-change-title"
        className="my-auto w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl sm:p-8"
      >
        <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-brand">
          <KeyRound size={22} />
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">One-time setup</p>
        <h2 id="password-change-title" className="mt-2 text-2xl font-bold tracking-tight">
          Change your temporary password
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          For your account security, create a new password before continuing to your workspace.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block text-sm font-semibold text-slate-700">
            Temporary password
            <input
              autoComplete="current-password"
              autoFocus
              className="field mt-1.5"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            New password
            <input
              autoComplete="new-password"
              className="field mt-1.5"
              type="password"
              minLength={8}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Confirm new password
            <input
              autoComplete="new-password"
              className="field mt-1.5"
              type="password"
              minLength={8}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </label>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3.5 py-3 text-sm text-red-700">{error}</p>}
          <button
            disabled={saving}
            className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#12584a] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Updating password…" : "Update password"}
          </button>
        </form>

        <button
          type="button"
          onClick={logout}
          className="mx-auto mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-700"
        >
          <LogOut size={14} /> Sign out
        </button>
      </section>
    </div>
  );
}
