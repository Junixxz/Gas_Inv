import { useState } from "react";

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

export default function CheckoutModal({ total, items, error, submitting, onCancel, onConfirm }) {
  const [customerName, setCustomerName] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [emptyReturned, setEmptyReturned] = useState({});
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentAccount, setPaymentAccount] = useState("");
  const payment = Number(amountPaid);
  const validPayment = amountPaid !== ""
    && Number.isFinite(payment)
    && payment >= total
    && (paymentMethod !== "bank_transfer" || payment === total);
  const change = validPayment ? payment - total : 0;
  const validReturns = items.every((item) => {
    const quantity = Number(emptyReturned[item.id] || 0);
    return Number.isInteger(quantity) && quantity >= 0 && quantity <= item.quantity;
  });

  function submit(event) {
    event.preventDefault();
    if (!customerName.trim() || !validPayment || !validReturns) return;
    onConfirm({
      customer_name: customerName.trim(),
      amount_paid: payment.toFixed(2),
      payment_method: paymentMethod,
      payment_account: paymentAccount.trim(),
      empty_returned: emptyReturned,
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-title"
        className="my-auto w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl sm:p-8"
      >
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">Payment</p>
        <h2 id="checkout-title" className="mt-2 text-2xl font-bold tracking-tight">Complete this sale</h2>
        <p className="mt-2 text-sm text-muted">Enter the customer’s name and the amount received.</p>
        <p className="mt-1 text-xs text-muted">The customer is added to Customers automatically; matching names reuse the existing profile.</p>

        <div className="mt-5 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
          <span className="text-sm font-semibold text-slate-600">Sale total</span>
          <span className="text-lg font-bold">{money.format(total)}</span>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-slate-700">Empty cylinders returned for exchange</legend>
            <p className="text-xs text-muted">Filled stock goes out and each returned empty is recorded as Empty in. The sale price stays the same.</p>
            {items.map((item) => (
              <label key={item.id} className="flex items-center justify-between gap-3 text-xs font-medium text-slate-600">
                <span className="min-w-0 truncate">{item.name} (up to {item.quantity})</span>
                <input
                  type="number"
                  min="0"
                  max={item.quantity}
                  step="1"
                  inputMode="numeric"
                  className="field max-w-24"
                  value={emptyReturned[item.id] ?? "0"}
                  onChange={(event) => setEmptyReturned({ ...emptyReturned, [item.id]: event.target.value })}
                  aria-label={`Empty ${item.name} cylinders returned`}
                />
              </label>
            ))}
          </fieldset>
          <label className="block text-sm font-semibold text-slate-700">
            Customer name
            <input
              autoFocus
              autoComplete="name"
              className="field mt-1.5"
              maxLength={160}
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="Enter customer name"
              required
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Payment method
            <select
              className="field mt-1.5"
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value)}
            >
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="other">Other</option>
            </select>
          </label>
          {paymentMethod !== "cash" && (
            <label className="block text-sm font-semibold text-slate-700">
              {paymentMethod === "bank_transfer" ? "Bank/account" : "Payment reference"}
              <input
                className="field mt-1.5"
                maxLength={160}
                value={paymentAccount}
                onChange={(event) => setPaymentAccount(event.target.value)}
                placeholder={paymentMethod === "bank_transfer" ? "e.g. bank or account name" : "Optional"}
                required={paymentMethod === "bank_transfer"}
              />
            </label>
          )}
          <label className="block text-sm font-semibold text-slate-700">
            Amount paid
            <input
              className="field mt-1.5"
              type="number"
              min={total.toFixed(2)}
              step="0.01"
              inputMode="decimal"
              value={amountPaid}
              onChange={(event) => setAmountPaid(event.target.value)}
              placeholder="Enter amount received"
              required
            />
          </label>
          {amountPaid !== "" && payment < total && (
            <p role="alert" className="text-xs text-red-600">
              Payment is short by {money.format(total - (Number.isFinite(payment) ? payment : 0))}.
            </p>
          )}
          {paymentMethod === "bank_transfer" && amountPaid !== "" && payment > total && (
            <p role="alert" className="text-xs text-red-600">
              Bank transfer amount must match the sale total exactly.
            </p>
          )}
          {validPayment && (
            <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3">
              <span className="text-sm font-semibold text-emerald-800">Change due</span>
              <span className="font-bold text-emerald-800">{money.format(change)}</span>
            </div>
          )}
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3.5 py-3 text-sm text-red-700">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              disabled={submitting}
              onClick={onCancel}
              className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              disabled={!customerName.trim() || !validPayment || !validReturns || submitting}
              className="flex-1 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white hover:bg-[#12584a] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Processing…" : "Confirm payment"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
