import { useEffect, useMemo, useState } from "react";
import { Plus, ShoppingCart } from "lucide-react";
import api from "../api";
import AppShell from "../components/AppShell";
import CheckoutModal from "../components/CheckoutModal";

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

function messageFrom(error, fallback) {
  const data = error.response?.data;
  return data && typeof data === "object" ? Object.values(data).flat().join(" ") : fallback;
}

export default function PointOfSale() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState({});
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  async function loadProducts() {
    const { data } = await api.get("/api/products/");
    setProducts(data);
  }

  useEffect(() => {
    loadProducts().catch(() => setError("Could not load products for checkout."));
  }, []);

  const cartItems = useMemo(
    () => Object.entries(cart)
      .map(([id, quantity]) => {
        const product = products.find((item) => item.id === Number(id));
        return product ? { ...product, quantity } : null;
      })
      .filter(Boolean),
    [cart, products],
  );
  const totalCents = cartItems.reduce(
    (sum, item) => sum + Math.round(Number(item.unit_price) * 100) * (Number(item.quantity) || 0),
    0,
  );
  const total = totalCents / 100;
  const availableProducts = products.filter((product) => product.stock_quantity > 0);
  const validCart = cartItems.length > 0 && cartItems.every((item) => {
    const quantity = Number(item.quantity);
    return Number.isInteger(quantity) && quantity > 0 && quantity <= item.stock_quantity;
  });

  function addProduct(product) {
    setError("");
    const currentQuantity = cart[product.id] || 0;
    if (currentQuantity >= product.stock_quantity) {
      setError(`Only ${product.stock_quantity} units of ${product.name} are in stock.`);
      return;
    }
    setCart((current) => ({
      ...current,
      [product.id]: Math.min((Number(current[product.id]) || 0) + 1, product.stock_quantity),
    }));
  }

  function setQuantity(productId, quantity) {
    setCart((current) => ({ ...current, [productId]: quantity }));
  }

  function removeIfEmpty(productId, quantity) {
    if (quantity !== "" && quantity !== "0") return;
    setCart((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
  }

  async function checkout(payment) {
    if (!cartItems.length) return;
    setError("");
    setSubmitting(true);
    try {
      const { empty_returned: emptyReturned, ...paymentDetails } = payment;
      const { data } = await api.post("/api/checkout/", {
        items: cartItems.map(({ id, quantity }) => ({
          product: id,
          quantity: Number(quantity),
          empty_returned: Number(emptyReturned[id] || 0),
        })),
        ...paymentDetails,
      });
      setReceipt(data);
      setCart({});
      setCheckoutOpen(false);
      loadProducts().catch(() => setError("Sale completed, but inventory could not refresh. Reload this page."));
    } catch (requestError) {
      setError(messageFrom(requestError, "Could not complete the sale."));
      loadProducts().catch(() => setError("Could not complete the sale or refresh inventory."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell title="Point of Sale" subtitle="Create a sale and update stock in one checkout">
      {error && !checkoutOpen && <div role="alert" className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {receipt && (
        <div role="status" className="mb-5 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Sale #{receipt.id} for {receipt.customer_name} completed. Paid {money.format(Number(receipt.amount_paid))}; change {money.format(Number(receipt.change_due))}.
          <ul className="mt-2 list-inside list-disc text-xs">
            {receipt.items.map((item) => <li key={item.id}>{item.product_name}: Filled out {item.quantity}, Empty in {item.empty_returned}</li>)}
          </ul>
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-[1.4fr_0.9fr]">
        <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-soft">
          <div className="mb-4 flex items-center gap-2">
            <ShoppingCart size={18} className="text-brand" />
            <h2 className="text-sm font-bold">Available products</h2>
          </div>
          {availableProducts.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {availableProducts.map((product) => (
                <article key={product.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{product.name}</p>
                    <p className="mt-1 text-xs text-muted">{product.sku} · {product.stock_quantity} in stock</p>
                    <p className="text-xs text-muted">{product.empty_stock_quantity} empty cylinders</p>
                    <p className="mt-2 text-sm font-bold text-brand">{money.format(Number(product.unit_price))}</p>
                  </div>
                  <button
                    onClick={() => addProduct(product)}
                    disabled={product.stock_quantity < 1}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-brand hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={`Add ${product.name} to sale`}
                  >
                    <Plus size={18} />
                  </button>
                </article>
              ))}
            </div>
          ) : <p className="py-8 text-center text-sm text-muted">{products.length ? "No products are currently in stock. Replenish inventory to make a sale." : "Add products in Inventory to start a sale."}</p>}
        </section>

        <section className="h-fit rounded-2xl border border-slate-200/70 bg-white p-5 shadow-soft">
          <h2 className="text-sm font-bold">Current sale</h2>
          <div className="mt-4 divide-y divide-slate-100">
            {cartItems.length ? cartItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{item.name}</p>
                  <p className="text-xs text-muted">{money.format(Number(item.unit_price))} each</p>
                </div>
                <input
                  type="number"
                  min="1"
                  max={item.stock_quantity}
                  step="1"
                  inputMode="numeric"
                  value={item.quantity}
                  onChange={(event) => setQuantity(item.id, event.target.value)}
                  onBlur={(event) => removeIfEmpty(item.id, event.target.value)}
                  className="h-9 w-20 rounded-lg border border-slate-200 px-2 text-center text-sm font-semibold outline-none focus:border-brand focus:ring-2 focus:ring-emerald-100"
                  aria-label={`Quantity of ${item.name}`}
                />
              </div>
            )) : <p className="py-8 text-center text-sm text-muted">No products in this sale yet.</p>}
          </div>
          {cartItems.some((item) => {
            const quantity = Number(item.quantity);
            return !Number.isInteger(quantity) || quantity <= 0 || quantity > item.stock_quantity;
          }) && <p className="mt-2 text-xs text-red-600">Enter a whole quantity within the available stock.</p>}
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-4">
            <span className="text-sm font-semibold">Total</span>
            <span className="text-lg font-bold">{money.format(total)}</span>
          </div>
          <button
            onClick={() => {
              setError("");
              setCheckoutOpen(true);
            }}
            disabled={!validCart || submitting}
            className="mt-4 w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white hover:bg-[#12584a] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Processing…" : "Complete sale"}
          </button>
        </section>
      </div>
      {checkoutOpen && (
        <CheckoutModal
          total={total}
          items={cartItems}
          error={error}
          submitting={submitting}
          onCancel={() => setCheckoutOpen(false)}
          onConfirm={checkout}
        />
      )}
    </AppShell>
  );
}
