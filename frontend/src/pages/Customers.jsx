import { useEffect, useState } from "react";
import { UserRoundPlus, UsersRound } from "lucide-react";
import api from "../api";
import AppShell from "../components/AppShell";

const emptyCustomer = { name: "", phone: "", email: "", notes: "" };

function errorText(error) {
  const data = error.response?.data;
  return data && typeof data === "object" ? Object.values(data).flat().join(" ") : "Could not save this customer.";
}

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState(emptyCustomer);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadCustomers() {
    const { data } = await api.get("/api/customers/");
    setCustomers(data);
  }

  useEffect(() => {
    loadCustomers().catch(() => setError("Could not load customers."));
  }, []);

  async function saveCustomer(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      await api.post("/api/customers/", form);
      setForm(emptyCustomer);
      setNotice("Customer profile created.");
      await loadCustomers();
    } catch (requestError) {
      setError(errorText(requestError));
    }
  }

  async function deleteCustomer(customer) {
    setError("");
    setNotice("");
    try {
      await api.delete(`/api/customers/${customer.id}/`);
      setNotice(`${customer.name} was removed.`);
      await loadCustomers();
    } catch (requestError) {
      setError(errorText(requestError));
    }
  }

  return (
    <AppShell title="Customers" subtitle="Customer profiles and contact details">
      {error && <div role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}
      <form onSubmit={saveCustomer} className="mb-5 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-soft">
        <div className="mb-4 flex items-center gap-2"><UserRoundPlus size={18} className="text-brand" /><h2 className="text-sm font-bold">Add customer</h2></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-semibold text-slate-600">Name<input className="field mt-1.5" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label className="text-xs font-semibold text-slate-600">Phone<input className="field mt-1.5" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
          <label className="text-xs font-semibold text-slate-600">Email<input className="field mt-1.5" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
          <label className="text-xs font-semibold text-slate-600">Notes<input className="field mt-1.5" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
        </div>
        <button className="mt-4 rounded-lg bg-brand px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#12584a]">Save customer</button>
      </form>
      <section className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-soft">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4"><UsersRound size={17} className="text-brand" /><h2 className="text-sm font-bold">Customer list <span className="ml-1 font-normal text-muted">({customers.length})</span></h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-3 font-semibold">Name</th><th className="px-5 py-3 font-semibold">Phone</th><th className="px-5 py-3 font-semibold">Email</th><th className="px-5 py-3 font-semibold">Sales</th><th className="px-5 py-3 text-right font-semibold">Total paid</th><th className="px-5 py-3"></th></tr></thead>
            <tbody>{customers.map((customer) => <tr key={customer.id} className="border-t border-slate-100"><td className="px-5 py-3.5 font-semibold">{customer.name}</td><td className="px-5 py-3.5">{customer.phone || "—"}</td><td className="px-5 py-3.5">{customer.email || "—"}</td><td className="px-5 py-3.5">{customer.sales_count}</td><td className="px-5 py-3.5 text-right font-semibold">{new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(customer.total_paid || 0))}</td><td className="px-5 py-3.5 text-right"><button onClick={() => deleteCustomer(customer)} className="text-xs font-semibold text-red-600 hover:text-red-800">Remove</button></td></tr>)}</tbody>
          </table>
          {!customers.length && <p className="py-8 text-center text-sm text-muted">No customer profiles yet.</p>}
        </div>
      </section>
    </AppShell>
  );
}
