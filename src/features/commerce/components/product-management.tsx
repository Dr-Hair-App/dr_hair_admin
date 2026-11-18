"use client";

import { BadgePercent, Package, ShoppingBag, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "../../shared/components/ui";
import { SlidingTabList } from "../../shared/components/sliding-tab-list";
import type { CouponRecord, ProductRecord, ProductStatus, ProductBenefit, ProductIngredient, ProductUsageStep, ProductClinicalClaim } from "../types";
import { CouponsPanel } from "./coupons-panel";
import { CommerceOverview } from "./commerce-overview";
import { ProductsPanel } from "./products-panel";
import { OrdersPage } from "../../operations/components/orders-page";
import type { AdminPermissionId } from "../../shared/types";
import type { PanelFeatureAccess } from "../../shared/lib/permissions";

type CommerceTab = "overview" | "products" | "orders" | "coupons";
const nonNegativeNumber = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
};
const tabs: { id: CommerceTab; label: string; icon: typeof Package }[] = [
  { id: "overview", label: "Overview", icon: TrendingUp },
  { id: "products", label: "Products", icon: Package },
  { id: "orders", label: "Orders", icon: ShoppingBag },
  { id: "coupons", label: "Coupons", icon: BadgePercent },
];

export function ProductManagement({ onToast, permissions, panelAccess, globalSearch, onAudit }: { onToast: (message: string) => void; permissions: AdminPermissionId[]; panelAccess: PanelFeatureAccess; globalSearch: string; onAudit: (action: string, target: string) => void }) {
  const [activeTab, setActiveTab] = useState<CommerceTab>("overview");
  const [createProductOpen, setCreateProductOpen] = useState(false);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [coupons, setCoupons] = useState<CouponRecord[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState("");
  const [couponsError, setCouponsError] = useState("");
  const [couponsLoading, setCouponsLoading] = useState(true);
  const [couponLoadAttempt, setCouponLoadAttempt] = useState(0);
  const productsRequestRef = useRef<AbortController | null>(null);
  const canManageProducts = permissions.includes("products.manage") && panelAccess.catalog !== false;
  const canManageOrders = permissions.includes("orders.manage") && panelAccess.orders !== false;
  const canManagePromotions = permissions.includes("promotions.manage") && panelAccess.catalog !== false;
  const canViewCommerceReports = permissions.includes("orders.manage");
  const availableTabs = useMemo(() => tabs.filter((tab) => tab.id === "overview" ? canViewCommerceReports
    : tab.id === "products" ? canManageProducts
    : tab.id === "orders" ? canManageOrders
    : canManagePromotions), [canManageOrders, canManageProducts, canManagePromotions, canViewCommerceReports]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return;
      setCouponsError("");
      setCouponsLoading(true);
      return fetch("/api/admin/coupons", { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof body.message === "string" ? body.message : "Coupon records could not be loaded.");
        const items = body?.data?.coupons || body?.data;
        if (Array.isArray(items)) {
          if (!controller.signal.aborted) setCoupons(items);
        } else throw new Error("The coupon service returned an invalid response.");
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setCouponsError(error instanceof Error ? error.message : "Coupon records could not be loaded.");
      })
      .finally(() => { if (!controller.signal.aborted) setCouponsLoading(false); });
    });
    return () => controller.abort();
  }, [couponLoadAttempt]);

  const refreshProducts = useCallback(() => {
    productsRequestRef.current?.abort();
    const controller = new AbortController();
    productsRequestRef.current = controller;
    setProductsLoading(true);
    setProductsError("");
    return fetch("/api/admin/products?limit=100&status=all", { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof body.message === "string" ? body.message : "Products could not be loaded.");
        const items = body?.data?.items || body?.data;
        if (Array.isArray(items)) {
          const normalized: ProductRecord[] = items.map((raw: Record<string, unknown>) => {
            const rawStatus = String(raw.status || "active").toLowerCase();
            const status: ProductStatus =
              rawStatus === "archived"
                ? "Archived"
                : rawStatus === "draft"
                ? "Draft"
                : "Active";

            const rawImages = Array.isArray(raw.images) ? (raw.images as string[]) : [];

            return {
              id: String(raw.id),
              name: String(raw.name || "Untitled Product"),
              sku: String(raw.sku || "DRH-001"),
              category: String(raw.category || "Hair"),
              description: String(raw.description || raw.subtitle || ""),
              price: Number(raw.price) || 0,
              compareAtPrice: Number(raw.compareAtPrice || raw.compare_at_price) || 0,
              unitCost: Number(raw.unitCost || raw.unit_cost) || 0,
              stock: nonNegativeNumber(raw.stock ?? 0),
              unitsSold: Number(raw.unitsSold || raw.units_sold) || 0,
              revenue: Number(raw.revenue) || 0,
              status,
              images: rawImages,
              media: Array.isArray(raw.media) && raw.media.length > 0
                ? (raw.media as ProductRecord["media"])
                : rawImages.map((img: string) => ({ name: img, url: img, kind: "image" as const })),
              rootCauses: Array.isArray(raw.rootCauses || raw.root_causes)
                ? ((raw.rootCauses || raw.root_causes) as string[])
                : [String(raw.rootCause || raw.root_cause || "Hair")],
              supplyPlans: Array.isArray(raw.supplyPlans || raw.supply_plans)
                ? ((raw.supplyPlans || raw.supply_plans) as Array<Record<string, unknown>>).map((plan) => ({
                    ...plan,
                    stock: nonNegativeNumber(plan.stock),
                    lowStockThreshold: nonNegativeNumber(plan.lowStockThreshold ?? plan.low_stock_threshold, 10),
                    shippingProfile: {
                      weightKg: Number((plan.shipping_profile as Record<string, unknown> | undefined)?.weight_kg ?? (plan.shippingProfile as Record<string, unknown> | undefined)?.weightKg) || 0,
                      lengthCm: Number((plan.shipping_profile as Record<string, unknown> | undefined)?.length_cm ?? (plan.shippingProfile as Record<string, unknown> | undefined)?.lengthCm) || 0,
                      breadthCm: Number((plan.shipping_profile as Record<string, unknown> | undefined)?.breadth_cm ?? (plan.shippingProfile as Record<string, unknown> | undefined)?.breadthCm) || 0,
                      heightCm: Number((plan.shipping_profile as Record<string, unknown> | undefined)?.height_cm ?? (plan.shippingProfile as Record<string, unknown> | undefined)?.heightCm) || 0,
                    },
                  })) as ProductRecord["supplyPlans"]
                : [],
              benefits: Array.isArray(raw.benefits)
                ? (raw.benefits as Array<ProductBenefit | string>).map((b) =>
                    typeof b === "string" ? { title: b, description: "" } : b
                  )
                : undefined,
              ingredients: Array.isArray(raw.ingredients)
                ? (raw.ingredients as Array<ProductIngredient | string>).map((i) =>
                    typeof i === "string" ? { name: i, concentration: "", purpose: "" } : i
                  )
                : undefined,
              usageSteps: Array.isArray(raw.usageSteps || raw.usage_steps)
                ? ((raw.usageSteps || raw.usage_steps) as Array<ProductUsageStep | string>).map((s) =>
                    typeof s === "string" ? { title: s, description: "" } : s
                  )
                : undefined,
              clinicalClaims: Array.isArray(raw.clinicalClaims || raw.clinical_metrics)
                ? ((raw.clinicalClaims || raw.clinical_metrics) as Array<ProductClinicalClaim | string>).map((c) =>
                    typeof c === "string" ? { percentage: "", claim: c, source: "" } : c
                  )
                : undefined,
              updated: String(raw.updated || "Recently"),
            };
          });

          // Show only uploaded products from the database
          if (!controller.signal.aborted) setProducts(normalized);
        } else throw new Error("The product service returned an invalid response.");
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setProductsError(error instanceof Error ? error.message : "Products could not be loaded.");
      })
      .finally(() => { if (!controller.signal.aborted) setProductsLoading(false); });
  }, [setProducts]);

  useEffect(() => {
    void Promise.resolve().then(() => refreshProducts());
    return () => productsRequestRef.current?.abort();
  }, [refreshProducts]);

  const resolvedActiveTab = availableTabs.some((tab) => tab.id === activeTab) ? activeTab : availableTabs[0]?.id ?? "products";
  const tabLabel = tabs.find((tab) => tab.id === resolvedActiveTab)?.label ?? "Commerce";
  const selectTab = (tab: CommerceTab) => {
    if (!availableTabs.some((item) => item.id === tab)) {
      onToast("This admin account does not have access to that commerce section.");
      return;
    }
    setActiveTab(tab);
  };

  return <div className="page-wrap workspace-page product-workspace-page w-full min-w-0">
    <PageHeader
      eyebrow={resolvedActiveTab === "orders" ? "Commerce · Fulfilment & Payments" : "Commerce"}
      title={resolvedActiveTab === "overview" ? "Commerce Overview" : resolvedActiveTab === "orders" ? "Orders & Payments" : resolvedActiveTab === "coupons" ? "Offers" : "Products"}
      description={resolvedActiveTab === "overview" ? "Revenue, orders, inventory health, and store analytics." : resolvedActiveTab === "orders" ? "Work through paid orders, shipping updates, customer refunds, and live Razorpay transactions." : resolvedActiveTab === "coupons" ? "Manage checkout promotions." : "Manage the product catalog."}
      action={resolvedActiveTab === "products" && canManageProducts ? <button className="button button-primary" onClick={() => setCreateProductOpen(true)}><Package size={14} />Add product</button> : undefined}
    />
    <SlidingTabList activeKey={resolvedActiveTab} className="commerce-tabs" label="Commerce sections">
      {availableTabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" aria-selected={resolvedActiveTab === id} className={`commerce-tab ${resolvedActiveTab === id ? "selected" : ""}`} onClick={() => selectTab(id)}><Icon size={15} />{label}{id === "products" && <span>{products.length}</span>}</button>)}
    </SlidingTabList>
    {resolvedActiveTab === "products" && productsError && <div className="notice" role="alert">{productsError} <button type="button" className="text-action" onClick={() => void refreshProducts()}>Retry</button></div>}
    {resolvedActiveTab === "products" && productsLoading && products.length === 0 && <div className="notice" role="status">Loading products from the catalog…</div>}
    {resolvedActiveTab === "coupons" && couponsLoading && coupons.length === 0 && <div className="notice" role="status">Loading coupons…</div>}
    {resolvedActiveTab === "coupons" && couponsError && <div className="notice" role="alert">{couponsError} <button type="button" className="text-action" onClick={() => setCouponLoadAttempt((attempt) => attempt + 1)}>Retry</button></div>}
    <div key={resolvedActiveTab} className="commerce-content tab-panel-transition" aria-label={`${tabLabel} section`}>
      {availableTabs.length === 0 && <div className="empty-state">No commerce sections are available for this account.</div>}
      {resolvedActiveTab === "overview" && canViewCommerceReports && <CommerceOverview products={products} coupons={coupons} onNavigate={selectTab} />}
      {resolvedActiveTab === "products" && canManageProducts && <ProductsPanel products={products} onProductsChange={(updater) => { setProducts(updater); onAudit("updated product catalog", "Product records"); }} createProductOpen={createProductOpen} onCreateHandled={() => setCreateProductOpen(false)} onToast={onToast} onRefresh={refreshProducts} />}
      {resolvedActiveTab === "orders" && canManageOrders && <OrdersPage globalSearch={globalSearch} onToast={onToast} onAudit={onAudit} canExport={permissions.includes("commerce.export")} />}
      {resolvedActiveTab === "coupons" && canManagePromotions && <CouponsPanel coupons={coupons} products={products} onCouponsChange={(updater) => { setCoupons(updater); onAudit("updated commerce promotions", "Coupon records"); }} onToast={onToast} />}
    </div>
  </div>;
}
