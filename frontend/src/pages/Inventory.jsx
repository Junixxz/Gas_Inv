import { useEffect, useState } from "react";
import { Boxes, Plus } from "lucide-react";
import api from "../api";
import { useAuth } from "../auth/AuthContext";
import AppShell from "../components/AppShell";

const emptyProduct = { name: "", unit_price: "", average_unit_cost: "", stock_quantity: "0" };
const emptyMovement = { product: "", stock_type: "filled", direction: "in", quantity: "1" };
const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

function makeSkuPreview(name) {
  const namePart = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase() || "PRODUCT";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const date = `${parts.find((part) => part.type === "year").value}${parts.find((part) => part.type === "month").value}${parts.find((part) => part.type === "day").value}`;
  return `${namePart}-${date}`.slice(0, 60);
}

function errorText(error, fallback) {
  const data = error.response?.data;
  return data && typeof data === "object" ? Object.values(data).flat().join(" ") : fallback;
}

export default function Inventory() {
  const { user } = useAuth();
  const canManageProducts = ["superadmin", "head"].includes(user?.role);
  const [products, setProducts] = useState([]);
  const activeProducts = products.filter((item) => item.is_active);
  const [movements, setMovements] = useState([]);
  const [costDrafts, setCostDrafts] = useState({});
  const [updatingProductId, setUpdatingProductId] = useState(null);
  const [product, setProduct] = useState(emptyProduct);
  const [movement, setMovement] = useState(emptyMovement);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadInventory() {
    const [productResponse, movementResponse] = await Promise.all([
      api.get("/api/products/", {
        params: canManageProducts ? { include_archived: "true" } : {},
      }),
      api.get("/api/inventory-movements/"),
    ]);
    setProducts(productResponse.data);
    setCostDrafts(Object.fromEntries(
      productResponse.data.map((item) => [item.id, item.average_unit_cost ?? ""]),
    ));
    setMovements(movementResponse.data);
    setMovement((current) => ({
      ...current,
      product: current.product &&
        productResponse.data.some((item) => item.id === Number(current.product) && item.is_active)
        ? String(current.product)
        : String(productResponse.data.find((item) => item.is_active)?.id || ""),
    }));
  }

  useEffect(() => {
    loadInventory().catch(() => setError("Could not load inventory."));
  }, []);

  async function createProduct(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      const { data } = await api.post("/api/products/", {
        ...product,
        average_unit_cost: product.average_unit_cost || null,
      });
      setProduct(emptyProduct);
      setNotice(`Product added with SKU ${data.sku}.`);
      await loadInventory();
    } catch (requestError) {
      setError(errorText(requestError, "Could not add product."));
    }
  }

  async function createMovement(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      await api.post("/api/inventory-movements/", {
        ...movement,
        product: Number(movement.product),
        quantity: Number(movement.quantity),
      });
      setNotice("Stock movement recorded.");
      setMovement((current) => ({ ...current, quantity: "1" }));
      await loadInventory();
    } catch (requestError) {
      setError(errorText(requestError, "Could not record stock movement."));
    }
  }

  async function saveAverageCost(productId) {
    setError("");
    setNotice("");
    try {
      await api.patch(`/api/products/${productId}/`, {
        average_unit_cost: costDrafts[productId] === "" ? null : costDrafts[productId],
      });
      setNotice("Average unit cost updated.");
      await loadInventory();
    } catch (requestError) {
      setError(errorText(requestError, "Could not update average unit cost."));
    }
  }

  async function setProductArchived(product, archive) {
    if (archive && !window.confirm(`Archive ${product.name}? It will be hidden from sales and new purchases; its history will be kept.`)) {
      return;
    }
    setError("");
    setNotice("");
    setUpdatingProductId(product.id);
    try {
      const action = archive ? "archive" : "restore";
      await api.post(`/api/products/${product.id}/${action}/`);
      setNotice(archive ? `${product.name} archived.` : `${product.name} restored.`);
      await loadInventory();
    } catch (requestError) {
      setError(errorText(requestError, `Could not ${archive ? "archive" : "restore"} this product.`));
    } finally {
      setUpdatingProductId(null);
    }
  }

  return (
    <AppShell title="Inventory" subtitle="Products, stock levels, and movement history">
      {error && <div role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

      <div className="grid gap-5 xl:grid-cols-2">
        <form onSubmit={createProduct} className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-soft">
          <div className="mb-4 flex items-center gap-2"><Plus size={18} className="text-brand" /><h2 className="text-sm font-bold">Add product</h2></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-600">Product name<input className="field mt-1.5" required value={product.name} onChange={(event) => setProduct({ ...product, name: event.target.value })} /></label>
            <label className="text-xs font-semibold text-slate-600">Generated SKU<input className="field mt-1.5 bg-slate-50 text-slate-500" readOnly value={product.name ? makeSkuPreview(product.name) : ""} placeholder="Enter a product name" /><span className="mt-1 block text-[11px] font-normal text-muted">Name and date added; duplicates get a number suffix.</span></label>
            <label className="text-xs font-semibold text-slate-600">Unit price<input className="field mt-1.5" type="number" min="0" step="0.01" required value={product.unit_price} onChange={(event) => setProduct({ ...product, unit_price: event.target.value })} /></label>
            <label className="text-xs font-semibold text-slate-600">Opening average unit cost<input className="field mt-1.5" type="number" min="0" step="0.01" value={product.average_unit_cost} onChange={(event) => setProduct({ ...product, average_unit_cost: event.target.value })} /><span className="mt-1 block text-[11px] font-normal text-muted">Enter this to calculate profit for opening stock.</span></label>
            <label className="text-xs font-semibold text-slate-600">Opening filled stock<input className="field mt-1.5" type="number" min="0" step="1" required value={product.stock_quantity} onChange={(event) => setProduct({ ...product, stock_quantity: event.target.value })} /></label>
          </div>
          <button className="mt-4 rounded-lg bg-brand px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#12584a]">Add product</button>
        </form>

        <form onSubmit={createMovement} className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-soft">
          <div className="mb-4 flex items-center gap-2"><Boxes size={18} className="text-brand" /><h2 className="text-sm font-bold">Record stock movement</h2></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-semibold text-slate-600 sm:col-span-3">Product<select className="field mt-1.5" required value={movement.product} onChange={(event) => setMovement({ ...movement, product: event.target.value })}><option value="" disabled>Select a product</option>{activeProducts.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.stock_quantity} filled / {item.empty_stock_quantity} empty</option>)}</select></label>
            <label className="text-xs font-semibold text-slate-600">Cylinder type<select className="field mt-1.5" value={movement.stock_type} onChange={(event) => setMovement({ ...movement, stock_type: event.target.value })}><option value="filled">Filled product</option><option value="empty">Empty cylinders</option></select></label>
            <label className="text-xs font-semibold text-slate-600">Direction<select className="field mt-1.5" value={movement.direction} onChange={(event) => setMovement({ ...movement, direction: event.target.value })}><option value="in">Stock in</option><option value="out">Stock out</option></select></label>
            <label className="text-xs font-semibold text-slate-600">Quantity<input className="field mt-1.5" type="number" min="1" step="1" required value={movement.quantity} onChange={(event) => setMovement({ ...movement, quantity: event.target.value })} /></label>
          </div>
          <button disabled={!activeProducts.length} className="mt-4 rounded-lg bg-brand px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#12584a] disabled:opacity-50">Save movement</button>
        </form>
      </div>

      <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-soft">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-bold">Products</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-3 font-semibold">Product</th><th className="px-5 py-3 font-semibold">SKU</th><th className="px-5 py-3 text-right font-semibold">Unit price</th><th className="px-5 py-3 font-semibold">Avg. unit cost</th><th className="px-5 py-3 text-right font-semibold">Filled stock</th><th className="px-5 py-3 text-right font-semibold">Empty cylinders</th>{canManageProducts && <th className="px-5 py-3 text-right font-semibold">Actions</th>}</tr></thead>
            <tbody>{products.map((item) => <tr key={item.id} className={`border-t border-slate-100 ${item.is_active ? "" : "bg-slate-50/70 text-slate-400"}`}><td className="px-5 py-3.5 font-semibold">{item.name}{!item.is_active && <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">Archived</span>}</td><td className="px-5 py-3.5 text-xs text-muted">{item.sku}</td><td className="px-5 py-3.5 text-right">{money.format(Number(item.unit_price))}</td><td className="px-5 py-3.5">{item.is_active ? <div className="flex items-center gap-2"><input className="field max-w-32" aria-label={`Average unit cost for ${item.name}`} type="number" min="0" step="0.01" value={costDrafts[item.id] ?? ""} onChange={(event) => setCostDrafts((current) => ({ ...current, [item.id]: event.target.value }))} /><button type="button" onClick={() => saveAverageCost(item.id)} className="rounded-lg border border-slate-200 px-2.5 py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">Save</button></div> : <span className="text-slate-400">—</span>}</td><td className={`px-5 py-3.5 text-right font-semibold ${item.stock_quantity <= 5 ? "text-amber-700" : ""}`}>{item.stock_quantity}</td><td className="px-5 py-3.5 text-right font-semibold">{item.empty_stock_quantity}</td>{canManageProducts && <td className="px-5 py-3.5 text-right"><button type="button" disabled={updatingProductId === item.id} onClick={() => setProductArchived(item, item.is_active)} className={`rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50 ${item.is_active ? "text-red-600 hover:bg-red-50" : "text-brand hover:bg-emerald-50"}`}>{updatingProductId === item.id ? "Saving…" : item.is_active ? "Archive" : "Restore"}</button></td>}</tr>)}</tbody>
          </table>
          {!products.length && <p className="py-8 text-center text-sm text-muted">No products yet. Add one above.</p>}
        </div>
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-soft">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-bold">Recent stock movements</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-3 font-semibold">Product</th><th className="px-5 py-3 font-semibold">Movement</th><th className="px-5 py-3 text-right font-semibold">Quantity</th><th className="px-5 py-3 text-right font-semibold">Date</th></tr></thead>
            <tbody>{movements.slice(0, 10).map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="px-5 py-3.5 font-semibold">{item.product_name}</td><td className="px-5 py-3.5">{item.stock_type === "empty" ? "Empty" : "Filled"} {item.direction === "in" ? "in" : "out"}</td><td className="px-5 py-3.5 text-right">{item.quantity}</td><td className="px-5 py-3.5 text-right text-xs text-muted">{new Date(item.created_at).toLocaleString()}</td></tr>)}</tbody>
          </table>
          {!movements.length && <p className="py-8 text-center text-sm text-muted">No stock movements recorded.</p>}
        </div>
      </section>
    </AppShell>
  );
}
