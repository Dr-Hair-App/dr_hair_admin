"use client";

import { ArrowRight, BadgePercent, CircleDollarSign, Package, RefreshCw, ShoppingBag, Sparkles, TrendingDown } from "lucide-react";
import { useEffect, useState } from "react";
import { formatCompactCurrency } from "../lib/format";
import type { CommercePeriod, CouponRecord, ProductRecord } from "../types";

type SalesBucket = { key: string; label: string; order_count: number; gross_sales: number; refunds: number; net_sales: number };
type SalesReport = { period: CommercePeriod; currency: string; totals: { order_count: number; gross_sales: number; refunds: number; net_sales: number }; buckets: SalesBucket[] };

export function CommerceOverview({ products, coupons, onNavigate }: {
  products: ProductRecord[];
  coupons: CouponRecord[];
  onNavigate: (tab: "overview" | "products" | "coupons") => void;
}) {
  const [period, setPeriod] = useState<CommercePeriod>("month");
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ period: CommercePeriod; message: string } | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/admin/commerce/sales-report?period=${period}`, { cache: "no-store", signal: abort.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.message || "Sales reporting is unavailable.");
        const value = body?.data;
        if (!value || !Array.isArray(value.buckets) || !value.totals) throw new Error("Sales data is temporarily unavailable.");
        setReport(value as SalesReport);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!abort.signal.aborted) setError({ period, message: reason instanceof Error ? reason.message : "Sales reporting is unavailable." });
      })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [period, retryCount]);

  const topProducts = [...products].sort((a, b) => b.revenue - a.revenue).slice(0, 4);
  const activeCoupons = coupons.filter((coupon) => coupon.status === "Active").length;
  const maxSales = Math.max(1, ...(report?.buckets.map((bucket) => bucket.net_sales) || []));
  const averageOrder = report?.totals.order_count ? report.totals.net_sales / report.totals.order_count : 0;
  const isLoading = loading || (report?.period !== period && error?.period !== period);
  const visibleError = error?.period === period ? error.message : "";

  return <>
    <div className="commerce-toolbar">
      <div><h2 className="commerce-section-title">Store performance</h2><p className="card-note">Settled orders, net of provider-confirmed refunds.</p></div>
      <div className="segmented-control" aria-label="Choose reporting period">
        {(["week", "month", "year"] as CommercePeriod[]).map((value) => <button key={value} type="button" className={period === value ? "active" : ""} aria-pressed={period === value} onClick={() => setPeriod(value)}>{value === "week" ? "This week" : value === "month" ? "This month" : "This year"}</button>)}
      </div>
    </div>
    <div className="kpi-grid commerce-metrics grid grid-cols-2 gap-3 lg:grid-cols-4">
      <CommerceMetric icon={<CircleDollarSign size={16} />} label="Net sales" value={isLoading ? "—" : formatCompactCurrency(report?.totals.net_sales || 0)} foot="Paid orders less processed refunds" tone="teal" />
      <CommerceMetric icon={<ShoppingBag size={16} />} label="Paid orders" value={isLoading ? "—" : (report?.totals.order_count || 0).toLocaleString("en-IN")} foot="In selected period" tone="blue" />
      <CommerceMetric icon={<TrendingDown size={16} />} label="Refunded" value={isLoading ? "—" : formatCompactCurrency(report?.totals.refunds || 0)} foot="Provider-confirmed refund total" tone="amber" />
      <CommerceMetric icon={<CircleDollarSign size={16} />} label="Average order" value={isLoading ? "—" : formatCompactCurrency(averageOrder)} foot="Net sales per paid order" tone="violet" />
    </div>
    <div className="commerce-overview-grid">
      <section className="card commerce-chart-card" aria-busy={isLoading}>
        <div className="section-row"><div><h2 className="card-title">Sales trend</h2><p className="card-note">Net paid sales · {period === "week" ? "this week" : period === "month" ? "this month" : "this year"}</p></div></div>
        {visibleError ? <div className="empty-state flex min-h-36 flex-col items-center justify-center gap-2" role="alert"><span>{visibleError}</span><button type="button" className="text-action" onClick={() => { setLoading(true); setError(null); setRetryCount((count) => count + 1); }}>Try again <RefreshCw size={13} /></button></div> : isLoading ? <div className="empty-state">Loading sales report…</div> : report && <>
          <div className="sales-chart" role="img" aria-label={`Net sales chart for this ${period}`}>
            <div className="sales-axis"><span>{formatCompactCurrency(maxSales)}</span><span>{formatCompactCurrency(maxSales * .66)}</span><span>{formatCompactCurrency(maxSales * .33)}</span><span>₹0</span></div>
            <div className="sales-plot">{report.buckets.map((bucket, index) => <div className="sales-bar-wrap" key={bucket.key} title={`${bucket.key}: ${formatCompactCurrency(bucket.net_sales)} · ${bucket.order_count} paid orders`}><div className={`sales-bar ${index === report.buckets.length - 1 ? "highlight" : ""}`} style={{ height: `${Math.max(4, (bucket.net_sales / maxSales) * 100)}%` }} /><span>{bucket.label}</span></div>)}</div>
          </div>
          <div className="chart-foot"><span><i className="legend-dot" /> Net paid sales</span><span>{report.totals.order_count} orders · {formatCompactCurrency(report.totals.gross_sales)} gross</span></div>
        </>}
      </section>
      <section className="card top-products-card"><div className="section-row"><div><h2 className="card-title">Top products</h2><p className="card-note">By recorded lifetime net sales</p></div><button className="text-action" onClick={() => onNavigate("products")}>View products <ArrowRight size={13} /></button></div>
        {topProducts.length ? <div className="top-product-list">{topProducts.map((product, index) => <div className="top-product-row" key={product.id}><span className="top-product-rank">0{index + 1}</span><span className="activity-icon"><Package size={14} /></span><div className="top-product-copy"><strong>{product.name}</strong><span>{product.unitsSold.toLocaleString("en-IN")} units · {product.category}</span></div><strong className="top-product-sales">{formatCompactCurrency(product.revenue)}</strong></div>)}</div> : <div className="empty-state">No product performance data is available.</div>}
      </section>
    </div>
    <section className="commerce-quick-links"><div className="commerce-quick-copy"><span className="commerce-quick-icon"><Sparkles size={17} /></span><div><strong>Store setup</strong><span>{activeCoupons} active coupon codes available.</span></div></div><div className="commerce-quick-actions"><button className="button button-secondary" onClick={() => onNavigate("coupons")}><BadgePercent size={14} />Manage coupons</button><button className="button button-secondary" onClick={() => onNavigate("products")}><ArrowRight size={14} />View products</button></div></section>
  </>;
}

function CommerceMetric({ icon, label, value, foot, tone }: { icon: React.ReactNode; label: string; value: string; foot: string; tone: string }) {
  return <article className="card kpi-card commerce-metric"><div className="kpi-top"><span className="kpi-label">{label}</span><span className={`kpi-icon ${tone}`}>{icon}</span></div><div className="kpi-value">{value}</div><div className="kpi-foot"><span>{foot}</span></div></article>;
}
