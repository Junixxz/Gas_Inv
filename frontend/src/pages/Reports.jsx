import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, CircleDollarSign, Download, Truck, Wallet } from "lucide-react";
import api from "../api";
import AppShell from "../components/AppShell";

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = new Date();
const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

async function downloadReportPdf(report, reportDate) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 16;
  const right = pageWidth - margin;
  let y = 20;
  const writeParagraph = (text, { size = 9, bold = false, indent = 0 } = {}) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(String(text), pageWidth - margin * 2 - indent);
    const lineHeight = size * 0.48;
    if (y + lines.length * lineHeight > pageHeight - margin) {
      pdf.addPage();
      y = 20;
    }
    pdf.text(lines, margin + indent, y);
    y += lines.length * lineHeight + 2;
  };
  const writeSection = (title) => {
    y += 4;
    writeParagraph(title, { size: 11, bold: true });
    y += 2;
  };
  const php = (value) => `PHP ${decimal.format(Number(value || 0))}`;

  pdf.setProperties({ title: "Sales and Supplier Report", creator: "Gas Inventory" });
  pdf.setTextColor(23, 107, 91);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text("Gas Inventory", margin, y);
  y += 8;
  pdf.setTextColor(30, 41, 59);
  pdf.setFontSize(12);
  pdf.text("Sales and Supplier Report", margin, y);
  y += 9;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(`Period: ${report.period[0].toUpperCase()}${report.period.slice(1)}`, margin, y);
  y += 6;
  pdf.text(`Date range: ${report.start_date} to ${report.end_date}`, margin, y);
  y += 6;
  pdf.text(`Date selected: ${reportDate}`, margin, y);
  y += 8;
  pdf.setDrawColor(220, 228, 232);
  pdf.line(margin, y, right, y);
  y += 8;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("Summary", margin, y);
  y += 8;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  const summary = [
    ["Sales count", report.sales_count],
    ["Sales total", `PHP ${decimal.format(Number(report.sales_total || 0))}`],
    ["Gross profit", report.profit_complete ? php(report.profit_total) : "Incomplete - cost missing"],
    ["Filled cylinders sold", report.filled_cylinders_sold],
    ["Empty cylinders returned", report.empty_cylinders_returned],
    ["Purchase orders", report.purchase_order_count],
    ["Purchase total", `PHP ${decimal.format(Number(report.purchase_total || 0))}`],
    ["Supplier refill purchases", `PHP ${decimal.format(Number(report.refill_purchase_total || 0))}`],
  ];
  summary.forEach(([label, value]) => {
    pdf.text(String(label), margin, y);
    pdf.text(String(value), right, y, { align: "right" });
    y += 7;
  });
  y += 4;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("Purchase orders by supplier", margin, y);
  y += 8;

  const addSupplierHeading = () => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.text("Supplier", margin, y);
    pdf.text("Orders", right - 46, y, { align: "right" });
    pdf.text("Total (PHP)", right, y, { align: "right" });
    y += 6;
    pdf.setDrawColor(220, 228, 232);
    pdf.line(margin, y - 3, right, y - 3);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
  };
  addSupplierHeading();

  if (!report.suppliers.length) {
    pdf.text("No purchase orders recorded for this period.", margin, y);
  } else {
    report.suppliers.forEach((supplier) => {
      const supplierLines = pdf.splitTextToSize(supplier.supplier || "Unspecified", right - margin - 110);
      const rowHeight = Math.max(supplierLines.length * 5, 6);
      if (y + rowHeight > pageHeight - margin) {
        pdf.addPage();
        y = 20;
        addSupplierHeading();
      }
      pdf.text(supplierLines, margin, y);
      pdf.text(String(supplier.orders), right - 46, y, { align: "right" });
      pdf.text(decimal.format(Number(supplier.total || 0)), right, y, { align: "right" });
      y += rowHeight + 2;
    });
  }

  if (report.payment_summary?.length) {
    writeSection("Payment summary");
    report.payment_summary.forEach((payment) => {
      const method = payment.method.replace("_", " ");
      writeParagraph(`${method} / ${payment.account}: ${payment.sales} sales, ${php(payment.total)}`);
    });
  }

  if (report.period === "day") {
    writeSection("Sales ledger");
    if (!report.daily_sales?.length) {
      writeParagraph("No sales recorded for this day.");
    }
    report.daily_sales?.forEach((sale) => {
      const payment = `${sale.payment_method.replace("_", " ")}${sale.payment_account ? ` / ${sale.payment_account}` : ""}`;
      writeParagraph(
        `Sale #${sale.id} | ${sale.customer_name || "Walk-in"} | ${payment} | Total ${php(sale.total)}`,
        { bold: true },
      );
      sale.items.forEach((item) => {
        const costAmount = item.unit_cost === null
          ? "Unknown"
          : php(Number(item.unit_cost) * item.quantity);
        const profit = item.unit_cost === null
          ? "Unknown"
          : php((Number(item.unit_price) - Number(item.unit_cost)) * item.quantity);
        writeParagraph(
          `${item.sku} | Filled ${item.quantity} | Empty returned ${item.empty_returned} | Cost ${costAmount} | Unit price ${php(item.unit_price)} | Amount ${php(Number(item.unit_price) * item.quantity)} | Profit ${profit}`,
          { size: 8, indent: 4 },
        );
      });
    });

    writeSection("Purchase orders");
    if (!report.purchase_records?.length) {
      writeParagraph("No purchase orders recorded for this day.");
    }
    report.purchase_records?.forEach((purchase) => {
      const purchaseType = purchase.purchase_type === "refill" ? "Cylinder refill" : "Stock purchase";
      writeParagraph(`${purchaseType} #${purchase.id} | ${purchase.supplier || "Unspecified"} | Total ${php(purchase.total)}`, { bold: true });
      purchase.lines.forEach((line) => {
        writeParagraph(
          `${line.sku} | ${purchase.purchase_type === "refill" ? "Refilled from empties" : line.stock_type} | Qty ${line.quantity} | Unit cost ${php(line.unit_cost)} | Amount ${php(Number(line.unit_cost) * line.quantity)}`,
          { size: 8, indent: 4 },
        );
      });
    });

    writeSection("Daily cash and closing");
    if (!report.daily_closing) {
      writeParagraph("Daily closing worksheet has not been saved.");
    } else {
      const dayClose = report.daily_closing;
      writeParagraph(`Cash sales: ${php(report.closing_totals.cash_sales)}`);
      writeParagraph(
        `${dayClose.additional_cash_label || "Additional cash"}: ${php(dayClose.additional_cash_amount)}`,
      );
      writeParagraph(`Deposits: ${php(report.closing_totals.deposits_total)}`);
      writeParagraph(`Expected cash on hand: ${php(report.closing_totals.expected_cash_on_hand)}`);
      writeParagraph(
        `Actual cash counted: ${dayClose.actual_cash_count === null ? "Not entered" : php(dayClose.actual_cash_count)}`,
      );
      if (report.closing_totals.cash_difference !== null) {
        writeParagraph(`Cash difference (actual minus expected): ${php(report.closing_totals.cash_difference)}`);
      }
      dayClose.deposits.forEach((deposit) => {
        writeParagraph(`Deposit / ${deposit.account_name}: ${php(deposit.amount)}`, { size: 8, indent: 4 });
      });
      writeParagraph(`Crates: ${dayClose.crate_count} | Overall cans: ${dayClose.floor_cans_count}`);
      dayClose.floor_stocks.forEach((stock) => {
        writeParagraph(`${stock.label}: ${stock.quantity}`, { size: 8, indent: 4 });
      });
      dayClose.stock_counts.forEach((count) => {
        writeParagraph(
          `${count.sku} ${count.product_name}: ${count.filled_quantity} filled / ${count.empty_quantity} empty`,
          { size: 8, indent: 4 },
        );
      });
      writeParagraph(`Prepared by: ${dayClose.prepared_by_name || "Not entered"} | Checked by: ${dayClose.checked_by_name || "Not entered"}`);
      if (dayClose.notes) writeParagraph(`Notes: ${dayClose.notes}`);
    }
  }

  pdf.save(`sales-report-${report.period}-${reportDate}.pdf`);
}

function SummaryCard({ label, value, icon: Icon, currency = false }) {
  return (
    <article className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-soft">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-brand"><Icon size={19} /></span>
      <p className="mt-4 text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold">{currency ? money.format(Number(value || 0)) : value ?? "—"}</p>
    </article>
  );
}

function closingFormState(closing, products) {
  const counts = new Map((closing.stock_counts || []).map((count) => [count.product, count]));
  return {
    ...closing,
    actual_cash_count: closing.actual_cash_count ?? "",
    deposits: closing.deposits || [],
    floor_stocks: (closing.floor_stocks || []).map((stock) => ({
      ...stock,
      quantity: String(stock.quantity),
    })),
    stock_counts: products.map((product) => {
      const count = counts.get(product.id);
      return {
        product: product.id,
        product_name: product.name,
        sku: product.sku,
        filled_quantity: count ? String(count.filled_quantity) : "",
        empty_quantity: count ? String(count.empty_quantity) : "",
      };
    }),
  };
}

export default function Reports() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [reportPeriod, setReportPeriod] = useState("month");
  const [reportDate, setReportDate] = useState(localToday);
  const [reportError, setReportError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [closing, setClosing] = useState(null);
  const [closingError, setClosingError] = useState("");
  const [closingNotice, setClosingNotice] = useState("");
  const [closingLoading, setClosingLoading] = useState(false);
  const [savingClosing, setSavingClosing] = useState(false);
  const [products, setProducts] = useState([]);

  useEffect(() => {
    api.get("/api/dashboard/").then(({ data: result }) => setData(result)).catch(() => {
      setError("Could not load reports.");
    });
  }, []);

  useEffect(() => {
    if (reportPeriod !== "day") return undefined;
    let active = true;
    setClosingLoading(true);
    setClosingError("");
    Promise.all([
      api.get("/api/reports/daily-closing/", { params: { date: reportDate } }),
      api.get("/api/products/", { params: { include_archived: "true" } }),
    ]).then(([closingResponse, productResponse]) => {
      if (!active) return;
      setProducts(productResponse.data);
      setClosing(closingFormState(closingResponse.data, productResponse.data));
    }).catch(() => {
      if (active) setClosingError("Could not load the daily closing worksheet.");
    }).finally(() => {
      if (active) setClosingLoading(false);
    });
    return () => { active = false; };
  }, [reportPeriod, reportDate]);

  async function saveDailyClosing(event) {
    event.preventDefault();
    setClosingError("");
    setClosingNotice("");
    setSavingClosing(true);
    try {
      const payload = {
        ...closing,
        report_date: reportDate,
        additional_cash_amount: closing.additional_cash_amount || "0.00",
        actual_cash_count: closing.actual_cash_count === "" ? null : closing.actual_cash_count,
        crate_count: Number(closing.crate_count || 0),
        floor_cans_count: Number(closing.floor_cans_count || 0),
        deposits: closing.deposits
          .filter((deposit) => deposit.account_name.trim() && deposit.amount !== "")
          .map((deposit) => ({
            account_name: deposit.account_name.trim(),
            amount: deposit.amount,
          })),
        floor_stocks: closing.floor_stocks
          .filter((stock) => stock.label.trim() && stock.quantity !== "")
          .map((stock) => ({
            label: stock.label.trim(),
            quantity: Number(stock.quantity),
          })),
        stock_counts: closing.stock_counts.map((count) => ({
          product: Number(count.product),
          filled_quantity: Number(count.filled_quantity),
          empty_quantity: Number(count.empty_quantity),
        })),
      };
      const { data: savedClosing } = await api.put(
        "/api/reports/daily-closing/",
        payload,
        { params: { date: reportDate } },
      );
      setClosing(closingFormState(savedClosing, products));
      setClosingNotice("Daily closing saved.");
    } catch (requestError) {
      const response = requestError.response?.data;
      setClosingError(response && typeof response === "object"
        ? Object.values(response).flat().join(" ")
        : "Could not save the daily closing.");
    } finally {
      setSavingClosing(false);
    }
  }

  async function exportReport() {
    setReportError("");
    setExporting(true);
    try {
      const { data: report } = await api.get("/api/reports/periodic/", {
        params: { period: reportPeriod, date: reportDate },
      });
      await downloadReportPdf(report, reportDate);
    } catch {
      setReportError("Could not export this report. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <AppShell title="Reports" subtitle="Daily sales and expense reports">
      {error && <div role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Sales today" value={data?.metrics.sales_today} icon={CircleDollarSign} currency />
        <SummaryCard label="Recorded purchases" value={data?.metrics.purchases} icon={BarChart3} />
        <SummaryCard label="Supplier refill purchases" value={data?.metrics.refill_purchase_total} icon={Truck} currency />
        <SummaryCard label="Operating expenses" value={data?.metrics.expenses} icon={Wallet} currency />
      </section>
      <section className="mt-5 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-soft">
        <div className="mb-4">
          <h2 className="text-sm font-bold">Export sales and supplier report</h2>
          <p className="mt-1 text-xs text-muted">Download sales counts, filled cylinders sold, empty cylinders returned, and purchase orders by supplier.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="text-xs font-semibold text-slate-600">Report period
            <select className="field mt-1.5 sm:min-w-36" value={reportPeriod} onChange={(event) => setReportPeriod(event.target.value)}>
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">Date in period
            <input className="field mt-1.5" type="date" required value={reportDate} onChange={(event) => setReportDate(event.target.value)} />
          </label>
          <button type="button" onClick={exportReport} disabled={exporting || !reportDate} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-xs font-semibold text-white hover:bg-[#12584a] disabled:cursor-not-allowed disabled:opacity-60">
            <Download size={15} /> {exporting ? "Preparing report…" : "Download PDF"}
          </button>
        </div>
        {reportError && <p role="alert" className="mt-3 text-sm text-red-700">{reportError}</p>}
      </section>
      {reportPeriod === "day" && (
        <form onSubmit={saveDailyClosing} className="mt-5 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-soft sm:p-6">
          <div className="mb-4">
            <h2 className="text-sm font-bold">Daily closing worksheet</h2>
            <p className="mt-1 text-xs text-muted">Deposits, cash count, floor stock, and sign-off are saved for {reportDate} and included in that day’s PDF.</p>
          </div>
          {closingError && <div role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{closingError}</div>}
          {closingNotice && <div role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{closingNotice}</div>}
          {closingLoading || !closing ? (
            <p className="py-6 text-center text-sm text-muted">Loading closing worksheet…</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-xs font-semibold text-slate-600">Other cash label
                  <input className="field mt-1.5" maxLength={120} value={closing.additional_cash_label} onChange={(event) => setClosing({ ...closing, additional_cash_label: event.target.value })} placeholder="e.g. Cash adjustment" />
                </label>
                <label className="text-xs font-semibold text-slate-600">Other cash amount
                  <input className="field mt-1.5" type="number" min="0" step="0.01" value={closing.additional_cash_amount} onChange={(event) => setClosing({ ...closing, additional_cash_amount: event.target.value })} />
                </label>
                <label className="text-xs font-semibold text-slate-600">Actual cash counted
                  <input className="field mt-1.5" type="number" min="0" step="0.01" required value={closing.actual_cash_count} onChange={(event) => setClosing({ ...closing, actual_cash_count: event.target.value })} />
                </label>
                <label className="text-xs font-semibold text-slate-600">Crates
                  <input className="field mt-1.5" type="number" min="0" step="1" required value={closing.crate_count} onChange={(event) => setClosing({ ...closing, crate_count: event.target.value })} />
                </label>
                <label className="text-xs font-semibold text-slate-600">Overall cans
                  <input className="field mt-1.5" type="number" min="0" step="1" required value={closing.floor_cans_count} onChange={(event) => setClosing({ ...closing, floor_cans_count: event.target.value })} />
                </label>
                <label className="text-xs font-semibold text-slate-600">Prepared by
                  <input className="field mt-1.5" maxLength={160} value={closing.prepared_by_name} onChange={(event) => setClosing({ ...closing, prepared_by_name: event.target.value })} />
                </label>
                <label className="text-xs font-semibold text-slate-600">Checked by
                  <input className="field mt-1.5" maxLength={160} value={closing.checked_by_name} onChange={(event) => setClosing({ ...closing, checked_by_name: event.target.value })} />
                </label>
              </div>

              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-xs font-bold">Other floor stock</h3>
                  <button type="button" onClick={() => setClosing({ ...closing, floor_stocks: [...closing.floor_stocks, { label: "", quantity: "" }] })} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Add floor stock</button>
                </div>
                <div className="space-y-2">
                  {closing.floor_stocks.map((stock, index) => (
                    <div key={index} className="grid gap-2 sm:grid-cols-[1fr_200px_auto]">
                      <input className="field" aria-label="Floor stock label" placeholder="e.g. LJ crates" required value={stock.label} onChange={(event) => setClosing({ ...closing, floor_stocks: closing.floor_stocks.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) })} />
                      <input className="field" aria-label="Floor stock quantity" type="number" min="0" step="1" required value={stock.quantity} onChange={(event) => setClosing({ ...closing, floor_stocks: closing.floor_stocks.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: event.target.value } : item) })} />
                      <button type="button" onClick={() => setClosing({ ...closing, floor_stocks: closing.floor_stocks.filter((_, itemIndex) => itemIndex !== index) })} className="rounded-lg px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50">Remove</button>
                    </div>
                  ))}
                  {!closing.floor_stocks.length && <p className="text-xs text-muted">No additional floor stock recorded.</p>}
                </div>
              </div>

              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-xs font-bold">Cash deposits by account</h3>
                  <button type="button" onClick={() => setClosing({ ...closing, deposits: [...closing.deposits, { account_name: "", amount: "" }] })} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Add deposit</button>
                </div>
                <div className="space-y-2">
                  {closing.deposits.map((deposit, index) => (
                    <div key={index} className="grid gap-2 sm:grid-cols-[1fr_200px_auto]">
                      <input className="field" aria-label="Deposit account" placeholder="Account / customer" required value={deposit.account_name} onChange={(event) => setClosing({ ...closing, deposits: closing.deposits.map((item, itemIndex) => itemIndex === index ? { ...item, account_name: event.target.value } : item) })} />
                      <input className="field" aria-label="Deposit amount" type="number" min="0.01" step="0.01" placeholder="Amount" required value={deposit.amount} onChange={(event) => setClosing({ ...closing, deposits: closing.deposits.map((item, itemIndex) => itemIndex === index ? { ...item, amount: event.target.value } : item) })} />
                      <button type="button" onClick={() => setClosing({ ...closing, deposits: closing.deposits.filter((_, itemIndex) => itemIndex !== index) })} className="rounded-lg px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50">Remove</button>
                    </div>
                  ))}
                  {!closing.deposits.length && <p className="text-xs text-muted">No cash deposits recorded.</p>}
                </div>
              </div>

              <div className="mt-5">
                <h3 className="mb-2 text-xs font-bold">End-of-day stock by SKU</h3>
                {products.length ? (
                  <div className="overflow-x-auto rounded-xl border border-slate-100">
                    <table className="w-full min-w-[500px] text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-2.5">SKU / product</th><th className="px-3 py-2.5">Filled</th><th className="px-3 py-2.5">Empty</th></tr></thead>
                      <tbody>{closing.stock_counts.map((count, index) => (
                        <tr key={count.product} className="border-t border-slate-100">
                          <td className="px-3 py-2.5 font-medium">{count.sku} · {count.product_name}</td>
                          <td className="px-3 py-2.5"><input className="field max-w-32" aria-label={`Filled stock for ${count.product_name}`} type="number" min="0" step="1" required value={count.filled_quantity} onChange={(event) => setClosing({ ...closing, stock_counts: closing.stock_counts.map((item, itemIndex) => itemIndex === index ? { ...item, filled_quantity: event.target.value } : item) })} /></td>
                          <td className="px-3 py-2.5"><input className="field max-w-32" aria-label={`Empty stock for ${count.product_name}`} type="number" min="0" step="1" required value={count.empty_quantity} onChange={(event) => setClosing({ ...closing, stock_counts: closing.stock_counts.map((item, itemIndex) => itemIndex === index ? { ...item, empty_quantity: event.target.value } : item) })} /></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : <p className="text-xs text-muted">Add products before recording stock counts.</p>}
              </div>
              <label className="mt-4 block text-xs font-semibold text-slate-600">Notes
                <textarea className="field mt-1.5 min-h-20" value={closing.notes} onChange={(event) => setClosing({ ...closing, notes: event.target.value })} />
              </label>
              <div className="mt-5 flex justify-end">
                <button disabled={savingClosing} className="rounded-xl bg-brand px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#12584a] disabled:opacity-60">{savingClosing ? "Saving…" : "Save daily closing"}</button>
              </div>
            </>
          )}
        </form>
      )}
      <section className="mt-5 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-soft sm:p-6">
        <h2 className="text-sm font-bold">Daily sales</h2>
        <p className="mt-1 text-xs text-muted">Sales totals for the last seven days</p>
        <div className="mt-5 h-[320px]">
          {data ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.sales_chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs><linearGradient id="reportSalesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#176b5b" stopOpacity={0.2} /><stop offset="95%" stopColor="#176b5b" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid vertical={false} stroke="#edf1f5" />
                <XAxis dataKey="date" tickFormatter={(value) => new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })} axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis tickFormatter={(value) => value === 0 ? "0" : `${Math.round(value / 1000)}k`} axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} width={40} />
                <Tooltip formatter={(value) => money.format(Number(value || 0))} />
                <Area type="monotone" dataKey="sales" stroke="#176b5b" strokeWidth={2.5} fill="url(#reportSalesFill)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <div className="grid h-full place-items-center text-sm text-muted">Loading report…</div>}
        </div>
      </section>
    </AppShell>
  );
}
