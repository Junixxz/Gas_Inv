import { useEffect, useState } from "react";
import { Eye, KeyRound, Pencil, Plus, UserRoundCheck, UserRoundX, Users, X } from "lucide-react";
import api from "../api";
import { useAuth } from "../auth/AuthContext";
import AppShell from "../components/AppShell";

const initialForm = { username: "", first_name: "", last_name: "", email: "", role: "staff" };
const memberForm = (member) => ({
  first_name: member.first_name,
  last_name: member.last_name,
  email: member.email,
  role: member.role,
  is_active: member.is_active,
});

function getErrorMessage(requestError, fallback) {
  const response = requestError.response?.data;
  return response && typeof response === "object"
    ? Object.values(response).flat().join(" ")
    : fallback;
}

export default function Team() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editing, setEditing] = useState(false);
  const [memberError, setMemberError] = useState("");
  const [memberNotice, setMemberNotice] = useState("");

  async function loadUsers() {
    try {
      const { data } = await api.get("/api/users/");
      setUsers(data);
    } catch {
      setError("Could not load team members.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadUsers(); }, []);

  async function createUser(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      const { data } = await api.post("/api/users/", form);
      setForm(initialForm);
      setShowForm(false);
      setNotice(`Account created. Temporary password for ${form.username}: ${data.temporary_password}. Share it securely; it must be changed at next sign-in.`);
      await loadUsers();
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Could not create this account."));
    }
  }

  function openMember(member) {
    setSelectedMember(member);
    setEditForm(memberForm(member));
    setEditing(false);
    setMemberError("");
    setMemberNotice("");
  }

  async function saveMember(event) {
    event.preventDefault();
    setMemberError("");
    try {
      const { data } = await api.patch(`/api/users/${selectedMember.id}/`, editForm);
      setSelectedMember(data);
      setEditForm(memberForm(data));
      setUsers((current) => current.map((member) => member.id === data.id ? data : member));
      setEditing(false);
      setMemberNotice("Team member updated.");
    } catch (requestError) {
      setMemberError(getErrorMessage(requestError, "Could not update this account."));
    }
  }

  async function setMemberStatus(isActive) {
    setMemberError("");
    try {
      const { data } = await api.patch(`/api/users/${selectedMember.id}/`, { is_active: isActive });
      setSelectedMember(data);
      setEditForm(memberForm(data));
      setUsers((current) => current.map((member) => member.id === data.id ? data : member));
      setMemberNotice(isActive ? "Account enabled." : "Account disabled.");
    } catch (requestError) {
      setMemberError(getErrorMessage(requestError, "Could not update account status."));
    }
  }

  async function resetMemberPassword() {
    if (!window.confirm(`Reset ${selectedMember.username}'s password? They will need to change it at next sign-in.`)) return;
    setMemberError("");
    setMemberNotice("");
    try {
      const { data } = await api.post(`/api/users/${selectedMember.id}/reset-password/`);
      setSelectedMember((member) => ({ ...member, must_change_password: true }));
      setUsers((current) => current.map((member) => member.id === selectedMember.id
        ? { ...member, must_change_password: true }
        : member));
      setMemberNotice(`Password reset. Temporary password: ${data.temporary_password}. Share it securely; it must be changed at next sign-in.`);
    } catch (requestError) {
      setMemberError(getErrorMessage(requestError, "Could not reset this account's password."));
    }
  }

  return (
    <AppShell
      title="Team"
      subtitle="Manage who can access your workspace"
      action={<button onClick={() => setShowForm((open) => !open)} className="flex items-center gap-2 rounded-xl bg-brand px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-[#12584a]"><Plus size={16} /> Add user</button>}
    >
      <div className="mb-6 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-brand"><Users size={20} /></div>
        <div>
          <p className="text-lg font-bold">{users.length} team members</p>
          {user?.role === "head" && <p className="text-xs text-muted">Superadmin accounts are hidden.</p>}
        </div>
      </div>
      {error && <div role="alert" className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div role="status" className="mb-5 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

      {showForm && (
        <form onSubmit={createUser} className="mb-5 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-soft">
          <h2 className="mb-4 text-sm font-bold">Create team account</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["username", "Username"], ["first_name", "First name"], ["last_name", "Last name"],
              ["email", "Email address"],
            ].map(([key, label]) => (
              <label key={key} className="text-xs font-semibold text-slate-600">{label}
                <input
                  className="field mt-1.5"
                  type={key === "email" ? "email" : "text"}
                  required={key === "username"}
                  value={form[key]}
                  onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                />
              </label>
            ))}
            <p className="self-center text-xs text-muted">A unique temporary password will be shown after account creation.</p>
            <label className="text-xs font-semibold text-slate-600">Role
              <select className="field mt-1.5" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
                <option value="staff">Staff</option><option value="head">Head</option>
                {user?.role === "superadmin" && <option value="superadmin">Superadmin</option>}
              </select>
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50">Cancel</button>
            <button className="rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white hover:bg-[#12584a]">Create account</button>
          </div>
        </form>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-soft">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-slate-50/70">
              <tr className="text-[11px] uppercase tracking-wider text-slate-400">
                <th className="px-5 py-3.5 font-semibold">Name</th><th className="px-5 py-3.5 font-semibold">Username</th><th className="px-5 py-3.5 font-semibold">Role</th><th className="px-5 py-3.5 font-semibold">Status</th><th className="px-5 py-3.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-slate-100">
                  <td className="px-5 py-4 font-semibold">{[user.first_name, user.last_name].filter(Boolean).join(" ") || "—"}</td>
                  <td className="px-5 py-4 text-xs text-muted">{user.username}</td>
                  <td className="px-5 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold capitalize text-slate-600">{user.role}</span></td>
                  <td className="px-5 py-4"><span className={`text-xs font-medium ${user.is_active ? "text-emerald-700" : "text-slate-400"}`}>{user.is_active ? "Active" : "Inactive"}</span></td>
                  <td className="px-5 py-3 text-right">
                    <button type="button" onClick={() => openMember(user)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-brand hover:bg-emerald-50">
                      <Eye size={14} /> Details
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && !users.length && <tr><td colSpan="5" className="px-5 py-10 text-center text-sm text-muted">No team members found.</td></tr>}
              {loading && <tr><td colSpan="5" className="px-5 py-10 text-center text-sm text-muted">Loading team…</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedMember(null);
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby="member-dialog-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 id="member-dialog-title" className="text-lg font-bold">{editing ? "Edit team member" : "Team member details"}</h2>
                <p className="mt-1 text-xs text-muted">{selectedMember.username}</p>
              </div>
              <button type="button" aria-label="Close details" onClick={() => setSelectedMember(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
            </div>
            {memberError && <div role="alert" className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{memberError}</div>}
            {memberNotice && <div role="status" className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{memberNotice}</div>}

            {editing ? (
              <form onSubmit={saveMember}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-slate-600">First name
                    <input className="field mt-1.5" value={editForm.first_name} onChange={(event) => setEditForm({ ...editForm, first_name: event.target.value })} />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">Last name
                    <input className="field mt-1.5" value={editForm.last_name} onChange={(event) => setEditForm({ ...editForm, last_name: event.target.value })} />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">Email address
                    <input className="field mt-1.5" type="email" value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">Role
                    <select className="field mt-1.5" value={editForm.role} disabled={selectedMember.id === user?.id || (user?.role === "head" && selectedMember.role === "superadmin")} onChange={(event) => setEditForm({ ...editForm, role: event.target.value })}>
                      <option value="staff">Staff</option><option value="head">Head</option>
                      {user?.role === "superadmin" && <option value="superadmin">Superadmin</option>}
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-600">Account status
                    <select className="field mt-1.5" value={editForm.is_active ? "active" : "disabled"} disabled={selectedMember.id === user?.id || (user?.role === "head" && selectedMember.role === "superadmin")} onChange={(event) => setEditForm({ ...editForm, is_active: event.target.value === "active" })}>
                      <option value="active">Active</option><option value="disabled">Disabled</option>
                    </select>
                  </label>
                </div>
                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" onClick={() => { setEditing(false); setEditForm(memberForm(selectedMember)); setMemberError(""); }} className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50">Cancel</button>
                  <button className="rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white hover:bg-[#12584a]">Save changes</button>
                </div>
              </form>
            ) : (
              <>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <div><dt className="text-xs text-muted">First name</dt><dd className="mt-1 text-sm font-medium">{selectedMember.first_name || "—"}</dd></div>
                  <div><dt className="text-xs text-muted">Last name</dt><dd className="mt-1 text-sm font-medium">{selectedMember.last_name || "—"}</dd></div>
                  <div><dt className="text-xs text-muted">Username</dt><dd className="mt-1 text-sm font-medium">{selectedMember.username}</dd></div>
                  <div><dt className="text-xs text-muted">Email</dt><dd className="mt-1 text-sm font-medium">{selectedMember.email || "—"}</dd></div>
                  <div><dt className="text-xs text-muted">Role</dt><dd className="mt-1 text-sm font-medium capitalize">{selectedMember.role}</dd></div>
                  <div><dt className="text-xs text-muted">Status</dt><dd className={`mt-1 text-sm font-medium ${selectedMember.is_active ? "text-emerald-700" : "text-slate-500"}`}>{selectedMember.is_active ? "Active" : "Disabled"}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-xs text-muted">Password</dt><dd className="mt-1 text-sm font-medium">{selectedMember.must_change_password ? "Change required at next sign-in" : "No password change required"}</dd></div>
                </dl>
                <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                  {selectedMember.id !== user?.id && !(user?.role === "head" && selectedMember.role === "superadmin") && (
                    <>
                      <button type="button" onClick={resetMemberPassword} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><KeyRound size={14} /> Reset password</button>
                      <button type="button" onClick={() => setMemberStatus(!selectedMember.is_active)} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${selectedMember.is_active ? "border-red-100 text-red-700 hover:bg-red-50" : "border-emerald-100 text-emerald-700 hover:bg-emerald-50"}`}>
                        {selectedMember.is_active ? <UserRoundX size={14} /> : <UserRoundCheck size={14} />}
                        {selectedMember.is_active ? "Disable account" : "Enable account"}
                      </button>
                    </>
                  )}
                  {!(user?.role === "head" && selectedMember.role === "superadmin") && (
                    <button type="button" onClick={() => { setEditing(true); setMemberError(""); setMemberNotice(""); }} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white hover:bg-[#12584a]"><Pencil size={14} /> Edit details</button>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
