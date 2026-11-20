import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Boxes, CircleDollarSign, PackageCheck, ShoppingBasket, Truck, Wallet } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import api from "../api";
import AppShell from "../components/AppShell";

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });

function StatCard({ label, value, note, icon: Icon, tone = "green", currency = false }) {
  const tones = {
    green: "bg-emerald-50 text-brand",
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600",
    violet: "bg-violet-50 text-violet-600",
  };
  return (
    <article className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-soft">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-muted">{label}</p>
        <span className={`grid h-10 w-10 place-items-center rounded-xl ${tones[tone]}`}><Icon size={19} /></span>
      </div>
      <p className="mt-5 text-2xl font-bold tracking-tight">{currency ? money.format(Number(value || 0)) : value ?? "—"}</p>
      <div className="mt-2 flex items-center gap-1 text-xs text-muted">{note}</div>
    </article>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-3.5 py-2.5 shadow-soft">
      <p className="text-xs text-muted">{new Date(`${label}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
      <p className="mt-1 text-sm font-bold">{money.format(Number(payload[0].value || 0))}</p>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/api/dashboard/").then(({ data: result }) => setData(result)).catch(() => {
      setError("We couldn’t load dashboard data. Check your connection and try again.");
    });
  }, []);

  const metrics = data?.metrics || {};
  const chart = data?.sales_chart || [];
  const salesChange = null;

  return (
    <AppShell title="Dashboard" subtitle="Your business performance at a glance">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Here’s what’s happening with your business.</p>
          <p className="mt-1 text-xs text-slate-400">{new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
        </div>
      </div>

      {error && <div role="alert" className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Products" value={metrics.products} note={<><PackageCheck size={14} /> Products in catalog</>} icon={Boxes} tone="green" />
        <StatCard
          label="Sales today"
          value={metrics.sales_today}
          currency
          note={<>{salesChange === null ? <span className="text-slate-400">Daily sales total</span> : <><ArrowUpRight size={14} className="text-emerald-600" /> <span className="font-semibold text-emerald-600">{salesChange}%</span><span>vs. yesterday</span></>}</>}
          icon={CircleDollarSign}
          tone="blue"
        />
        <StatCard label="Purchases" value={metrics.purchases} note={<><ShoppingBasket size={14} /> Recorded purchases</>} icon={ShoppingBasket} tone="violet" />
        <StatCard label="Supplier purchases" value={metrics.supplier_purchase_total} currency note={<><Truck size={14} /> Total recorded supplier costs</>} icon={Truck} tone="blue" />
        <StatCard label="Operating expenses" value={metrics.expenses} currency note={<><Wallet size={14} /> Recorded expenses</>} icon={Wallet} tone="amber" />
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1.65fr_1fr]">
        <article className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-soft sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold">Sales overview</h2>
              <p className="mt-1 text-xs text-muted">Daily sales over the last 7 days</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-brand">Last 7 days</span>
          </div>
          <div className="mt-6 h-[260px] w-full">
            {data ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#176b5b" stopOpacity={0.19} />
                      <stop offset="95%" stopColor="#176b5b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#edf1f5" />
                  <XAxis dataKey="date" tickFormatter={(value) => new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" })} axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} dy={10} />
                  <YAxis tickFormatter={(value) => value === 0 ? "0" : `${Math.round(value / 1000)}k`} axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} width={38} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="sales" stroke="#176b5b" strokeWidth={2.5} fill="url(#salesFill)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : <div className="grid h-full place-items-center text-sm text-muted">Loading sales data…</div>}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-soft sm:p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-sm font-bold">Inventory health</h2>
              <p className="mt-1 text-xs text-muted">Products that need attention</p>
            </div>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-50 text-amber-600"><Boxes size={18} /></span>
          </div>
          <div className="mt-7 flex items-end gap-3">
            <p className="text-4xl font-bold tracking-tight">{metrics.low_stock ?? "—"}</p>
            <p className="pb-1.5 text-sm text-muted">low-stock products</p>
          </div>
          <div className="my-5 h-px bg-slate-100" />
          <div className="flex items-center gap-2 rounded-xl bg-amber-50/70 px-3.5 py-3 text-xs leading-5 text-amber-800">
            <ArrowDownRight size={16} className="shrink-0" />
            <span>Products with 5 or fewer units are flagged for review.</span>
          </div>
          <div className="mt-5 flex items-center justify-between text-xs">
            <span className="text-muted">Catalog size</span>
            <span className="font-semibold">{metrics.products ?? "—"} products</span>
          </div>
        </article>
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-soft sm:p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold">Recent sales</h2>
            <p className="mt-1 text-xs text-muted">Your latest recorded transactions</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wider text-slate-400">
                <th className="pb-3 font-semibold">Sale</th><th className="pb-3 font-semibold">Date</th><th className="pb-3 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data?.recent_sales?.length ? data.recent_sales.map((sale) => (
                <tr key={sale.id} className="border-b border-slate-50 last:border-0">
                  <td className="py-3.5 font-semibold">Sale #{sale.id}</td>
                  <td className="py-3.5 text-xs text-muted">{new Date(sale.created_at).toLocaleString()}</td>
                  <td className="py-3.5 text-right font-semibold">{money.format(Number(sale.total))}</td>
                </tr>
              )) : (
                <tr><td colSpan="3" className="py-8 text-center text-sm text-muted">{data ? "No sales recorded yet." : "Loading sales…"}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
