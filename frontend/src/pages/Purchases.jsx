import { useEffect, useState } from "react";
import { Truck } from "lucide-react";
import api from "../api";
import AppShell from "../components/AppShell";

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const newItem = (product = "") => ({ product, stock_type: "filled", quantity: "1", unit_cost: "" });

function errorText(error) {
  const data = error.response?.data;
  return data && typeof data === "object" ? Object.values(data).flat().join(" ") : "Could not save this purchase.";
}

export default function Purchases() {
  const [purchases, setPurchases] = useState([]);
  const [products, setProducts] = useState([]);
  const [purchaseType, setPurchaseType] = useState("stock");
  const [supplier, setSupplier] = useState("");
  const [items, setItems] = useState([newItem()]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadPurchases() {
    const [purchaseResponse, productResponse] = await Promise.all([
      api.get("/api/purchases/"),
      api.get("/api/products/"),
    ]);
    setPurchases(purchaseResponse.data);
    setProducts(productResponse.data);
    setItems((current) => current.map((item) => ({
      ...item,
      product: item.product || String(productResponse.data[0]?.id || ""),
    })));
  }

  useEffect(() => {
    loadPurchases().catch(() => setError("Could not load purchase records."));
  }, []);

  async function savePurchase(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      await api.post("/api/purchases/", {
        supplier,
        purchase_type: purchaseType,
        items: items.map((item) => ({
          product: Number(item.product),
          stock_type: purchaseType === "refill" ? "filled" : item.stock_type,
          quantity: Number(item.quantity),
          unit_cost: item.unit_cost,
        })),
      });
      setSupplier("");
      setItems([newItem(String(products[0]?.id || ""))]);
      setNotice("Purchase record saved.");
      await loadPurchases();
    } catch (requestError) {
      setError(errorText(requestError));
    }
  }

  return (
    <AppShell title="Purchases" subtitle="Supplier and restocking records">
      {error && <div role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}
      <form onSubmit={savePurchase} className="mb-5 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-soft">
        <div className="mb-4 flex items-center gap-2"><Truck size={18} className="text-brand" /><h2 className="text-sm font-bold">Record a received purchase</h2></div>
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_220px_auto] sm:items-end">
          <label className="text-xs font-semibold text-slate-600">Supplier<input className="field mt-1.5" required value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="Supplier name" /></label>
          <label className="text-xs font-semibold text-slate-600">Purchase type
            <select className="field mt-1.5" value={purchaseType} onChange={(event) => setPurchaseType(event.target.value)}>
              <option value="stock">Stock purchase</option>
              <option value="refill">Cylinder refill</option>
            </select>
          </label>
          <p className="text-xs text-muted sm:pb-3">Purchase total: <strong>{money.format(items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unit_cost) || 0), 0))}</strong></p>
        </div>
        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={index} className="grid gap-3 rounded-xl border border-slate-100 p-3 sm:grid-cols-[1.4fr_0.8fr_0.7fr_0.8fr_auto] sm:items-end">
              <label className="text-xs font-semibold text-slate-600">Product / SKU
                <select className="field mt-1.5" required value={item.product} onChange={(event) => setItems((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, product: event.target.value } : line))}>
                  <option value="" disabled>Select a product</option>
                  {products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}
                </select>
              </label>
              {purchaseType === "refill" ? (
                <div className="text-xs font-semibold text-slate-600">Stock type<p className="mt-1.5 rounded-lg bg-emerald-50 px-3 py-2.5 text-brand">Filled (empty returned)</p></div>
              ) : (
                <label className="text-xs font-semibold text-slate-600">Stock type
                  <select className="field mt-1.5" value={item.stock_type} onChange={(event) => setItems((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, stock_type: event.target.value } : line))}>
                    <option value="filled">Filled</option><option value="empty">Empty</option>
                  </select>
                </label>
              )}
              <label className="text-xs font-semibold text-slate-600">Quantity
                <input className="field mt-1.5" type="number" min="1" step="1" required value={item.quantity} onChange={(event) => setItems((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, quantity: event.target.value } : line))} />
              </label>
              <label className="text-xs font-semibold text-slate-600">Unit cost
                <input className="field mt-1.5" type="number" min="0" step="0.01" required value={item.unit_cost} onChange={(event) => setItems((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, unit_cost: event.target.value } : line))} />
              </label>
              <button type="button" disabled={items.length === 1} onClick={() => setItems((current) => current.filter((_, lineIndex) => lineIndex !== index))} className="rounded-lg px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40">Remove</button>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap justify-between gap-3">
          <button type="button" disabled={!products.length} onClick={() => setItems((current) => [...current, newItem(String(products[0].id))])} className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Add item</button>
          <button disabled={!products.length} className="rounded-lg bg-brand px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#12584a] disabled:opacity-50">Save purchase</button>
        </div>
        <p className="mt-3 text-xs text-muted">{purchaseType === "refill" ? "A refill consumes the selected quantity of empty cylinders, adds the same quantity as filled stock, and includes the refill cost in weighted-average cost." : "Saving a received purchase adds its quantities to inventory and updates weighted-average filled stock cost."}</p>
      </form>
      <section className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-soft">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-bold">Purchase history</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-3 font-semibold">Purchase</th><th className="px-5 py-3 font-semibold">Supplier</th><th className="px-5 py-3 font-semibold">Items</th><th className="px-5 py-3 font-semibold">Date</th><th className="px-5 py-3 text-right font-semibold">Amount</th></tr></thead>
            <tbody>{purchases.map((purchase) => <tr key={purchase.id} className="border-t border-slate-100 align-top"><td className="px-5 py-3.5 font-semibold">Purchase #{purchase.id}<span className="mt-1 block text-[10px] font-medium capitalize text-muted">{purchase.purchase_type === "refill" ? "Cylinder refill" : "Stock purchase"}</span></td><td className="px-5 py-3.5">{purchase.supplier || "—"}</td><td className="px-5 py-3.5 text-xs">{purchase.lines?.map((line) => <p key={line.id}>{line.sku} · {line.quantity} {purchase.purchase_type === "refill" ? "refilled" : line.stock_type}</p>)}</td><td className="px-5 py-3.5 text-xs text-muted">{new Date(purchase.created_at).toLocaleString()}</td><td className="px-5 py-3.5 text-right font-semibold">{money.format(Number(purchase.total))}</td></tr>)}</tbody>
          </table>
          {!purchases.length && <p className="py-8 text-center text-sm text-muted">No purchases recorded yet.</p>}
        </div>
      </section>
    </AppShell>
  );
}
