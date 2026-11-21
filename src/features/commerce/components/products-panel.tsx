"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BadgeCheck,
  Boxes,
  Check,
  CheckCircle2,
  ChevronLeft,
  ImagePlus,
  Info,
  Loader2,
  Lock,
  Package,
  PackagePlus,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sliders,
  Sparkles,
  Star,
  Trash2,
  TrendingUp,
  UploadCloud,
  Video,
  X,
} from "lucide-react";
import { Modal, StatusPill } from "../../shared/components/ui";
import { AdminTab, AdminTabBar } from "../../shared/components/admin-tab-bar";
import { FullSizeImageViewer, type ViewerImage } from "../../shared/components/full-size-image-viewer";
import { formatCurrency } from "../lib/format";
import { prepareSmartImage } from "../../shared/lib/smart-image-upload";
import type {
  ProductBenefit,
  ProductClinicalClaim,
  ProductIngredient,
  ProductMedia,
  ProductRecord,
  ProductStatus,
  ProductSupplyPlan,
  ProductUsageStep,
  StockMovement,
} from "../types";

type ProductFormState = {
  name: string;
  category: string;
  description: string;
  status: ProductStatus;
  price: number;
  mrp: number;
  unitCost: number;
  stock: number;
  sku: string;
  rootCauses: string[];
  supplyPlans: ProductSupplyPlan[];
  benefits: ProductBenefit[];
  ingredients: ProductIngredient[];
  usageSteps: ProductUsageStep[];
  clinicalClaims: ProductClinicalClaim[];
  benefitsText: string;
  ingredientsText: string;
  usageStepsText: string;
  clinicalClaimsText: string;
  media: ProductMedia[];
};

interface PreviewMedia extends ProductMedia {
  url: string;
}

type StagedProductImage = { localId: string; file: File };

function generateUniqueSku(prefix = "DRH"): string {
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${randomNum}`;
}

function createInventoryIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID();
  if (!cryptoApi?.getRandomValues) throw new Error("Secure inventory submission is unavailable in this browser.");
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  return `inv-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

const newPlan = (defaults?: Partial<ProductSupplyPlan>): ProductSupplyPlan => ({
  id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  title: "1 Month Supply",
  subtitle: "Standard Pack",
  sku: generateUniqueSku(),
  price: 0,
  mrp: 0,
  unitCost: 0,
  stock: 0,
  lowStockThreshold: 10,
  badge: "",
  shippingProfile: { weightKg: 0, lengthCm: 0, breadthCm: 0, heightCm: 0 },
  ...defaults,
});

function getPlans(product: ProductRecord): ProductSupplyPlan[] {
  if (product.supplyPlans?.length) {
    return product.supplyPlans.map((plan) => ({
      ...plan,
      stock: Number.isFinite(Number(plan.stock)) ? Math.max(0, Number(plan.stock)) : 0,
      lowStockThreshold: Number.isFinite(Number(plan.lowStockThreshold))
        ? Math.max(0, Number(plan.lowStockThreshold))
        : 0,
      shippingProfile: {
        weightKg: Number.isFinite(Number(plan.shippingProfile?.weightKg)) ? Number(plan.shippingProfile?.weightKg) : 0,
        lengthCm: Number.isFinite(Number(plan.shippingProfile?.lengthCm)) ? Number(plan.shippingProfile?.lengthCm) : 0,
        breadthCm: Number.isFinite(Number(plan.shippingProfile?.breadthCm)) ? Number(plan.shippingProfile?.breadthCm) : 0,
        heightCm: Number.isFinite(Number(plan.shippingProfile?.heightCm)) ? Number(plan.shippingProfile?.heightCm) : 0,
      },
    }));
  }
  return [
    {
      id: `${product.id}-default`,
      title: "1 Month Supply",
      subtitle: product.name,
      sku: product.sku || generateUniqueSku(),
      price: product.price || 0,
      mrp: product.compareAtPrice || product.price || 0,
      unitCost: product.unitCost || 0,
      stock: product.stock ?? 0,
      lowStockThreshold: 10,
      badge: "",
      shippingProfile: { weightKg: 0, lengthCm: 0, breadthCm: 0, heightCm: 0 },
    },
  ];
}

function featuredPlan(plans: ProductSupplyPlan[]) {
  return plans.find((plan) => plan.badge.toLowerCase().includes("popular")) ?? plans[0];
}

function productStock(product: ProductRecord) {
  const stock = Number(product.stock);
  return Number.isFinite(stock) ? Math.max(0, stock) : 0;
}

function asLines<T>(items: T[] | undefined, render: (item: T) => string) {
  return (items ?? []).map(render).join("\n");
}

function parseLines(text: string, parts: number) {
  return text
    .split("\n")
    .map((line) => line.split("|").map((part) => part.trim()))
    .filter((line) => line.some(Boolean))
    .map((line) => Array.from({ length: parts }, (_, index) => line[index] ?? ""));
}

function formFor(product: ProductRecord | null): ProductFormState {
  if (!product) {
    const initialSku = generateUniqueSku("DRH");
    return {
      name: "",
      category: "",
      description: "",
      status: "Active",
      price: 0,
      mrp: 0,
      unitCost: 0,
      stock: 0,
      sku: initialSku,
      rootCauses: [],
      supplyPlans: [newPlan({ sku: initialSku, stock: 0 })],
      benefits: [],
      ingredients: [],
      usageSteps: [],
      clinicalClaims: [],
      benefitsText: "",
      ingredientsText: "",
      usageStepsText: "",
      clinicalClaimsText: "",
      media: [],
    };
  }

  const plans = getPlans(product);
  const primary = featuredPlan(plans);
  const mediaItems: ProductMedia[] = product.media?.length
    ? product.media
    : (product.images || []).map((img, idx) => ({
        name: img,
        url: img,
        kind: "image" as const,
        isPrimary: idx === 0,
      }));

  const benefits = product.benefits || [];
  const ingredients = product.ingredients || [];
  const usageSteps = product.usageSteps || [];
  const clinicalClaims = product.clinicalClaims || [];

  return {
    name: product.name,
    category: product.category,
    description: product.description,
    status: product.status,
    price: primary.price || product.price || 0,
    mrp: primary.mrp || product.compareAtPrice || primary.price || product.price || 0,
    unitCost: primary.unitCost || product.unitCost || 0,
    stock: productStock(product),
    sku: primary.sku || product.sku || generateUniqueSku(),
    rootCauses: product.rootCauses ?? [],
    supplyPlans: plans,
    benefits,
    ingredients,
    usageSteps,
    clinicalClaims,
    benefitsText: asLines<ProductBenefit>(benefits, (item) => `${item.title} | ${item.description}`),
    ingredientsText: asLines<ProductIngredient>(ingredients, (item) => `${item.name} | ${item.concentration} | ${item.purpose}`),
    usageStepsText: asLines<ProductUsageStep>(usageSteps, (item) => `${item.title} | ${item.description}`),
    clinicalClaimsText: asLines<ProductClinicalClaim>(clinicalClaims, (item) => `${item.percentage} | ${item.claim} | ${item.source}`),
    media: mediaItems,
  };
}

function stockLabel(product: ProductRecord) {
  const stock = productStock(product);
  if (stock === 0) return { label: "Out of stock", low: true };
  if (stock <= 10) return { label: "Low stock", low: true };
  return { label: `${stock} units`, low: false };
}

export function ProductsPanel({
  products,
  onProductsChange,
  createProductOpen,
  onCreateHandled,
  onToast,
  onRefresh,
}: {
  products: ProductRecord[];
  onProductsChange: (updater: (current: ProductRecord[]) => ProductRecord[]) => void;
  createProductOpen: boolean;
  onCreateHandled: () => void;
  onToast: (message: string) => void;
  onRefresh?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All status");
  const [editorProduct, setEditorProduct] = useState<ProductRecord | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [detailProduct, setDetailProduct] = useState<ProductRecord | null>(null);
  const [archiveProduct, setArchiveProduct] = useState<ProductRecord | null>(null);
  const [stockProduct, setStockProduct] = useState<ProductRecord | null>(null);
  const [deleteProduct, setDeleteProduct] = useState<ProductRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const categoryOptions = useMemo(() => [...new Set(products.map((product) => product.category.trim()).filter(Boolean))].sort(), [products]);
  const rootCauseOptions = useMemo(() => [...new Set(products.flatMap((product) => product.rootCauses ?? []).map((item) => item.trim()).filter(Boolean))].sort(), [products]);

  const visibleProducts = products.filter(
    (product) =>
      `${product.name} ${product.sku} ${product.category} ${(product.rootCauses ?? []).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (statusFilter === "All status" || product.status?.toLowerCase() === statusFilter.toLowerCase())
  );
  const lowStockCount = products.filter((product) => productStock(product) <= 10).length;

  const saveProduct = async (form: ProductFormState, existing: ProductRecord | null, stagedImages: StagedProductImage[]): Promise<boolean> => {
    const rawPrice = Number(form.price);
    if (!form.name.trim()) {
      throw new Error("Product / medicine name is required.");
    }
    if (!form.category.trim()) {
      throw new Error("Please select or enter a product category.");
    }
    if (!Number.isFinite(rawPrice) || rawPrice <= 0) {
      throw new Error("Selling price must be greater than ₹0.");
    }
    if (form.rootCauses.length === 0) {
      throw new Error("Add at least one concern tag so patients can discover this product in the app.");
    }
    if (form.supplyPlans.length === 0 || form.supplyPlans.some((plan) => {
      const profile = plan.shippingProfile;
      return [profile?.weightKg, profile?.lengthCm, profile?.breadthCm, profile?.heightCm]
        .some((value) => !Number.isFinite(Number(value)) || Number(value) <= 0);
    })) {
      throw new Error("Enter confirmed weight and parcel dimensions for every supply plan before saving.");
    }

    const sellingPrice = Math.round(rawPrice);
    const retailMrp = form.mrp && Number(form.mrp) >= sellingPrice ? Math.round(Number(form.mrp)) : sellingPrice;

    // Sync lead plan with primary pricing and ensure valid parcel dimensions
    const plans = form.supplyPlans.map((plan, idx) => {
      const isLead = idx === 0;
      const planPrice = isLead ? sellingPrice : Math.max(1, Math.round(Number(plan.price)) || sellingPrice);
      const planMrp = isLead
        ? retailMrp
        : Math.max(planPrice, Math.round(Number(plan.mrp)) || planPrice);

      const profile = plan.shippingProfile;
      const weightKg = Number(profile?.weightKg);
      const lengthCm = Number(profile?.lengthCm);
      const breadthCm = Number(profile?.breadthCm);
      const heightCm = Number(profile?.heightCm);

      return {
        ...plan,
        title: (plan.title.trim() || (isLead ? "1 Month Supply" : `Pack ${idx + 1}`)),
        subtitle: plan.subtitle.trim(),
        sku: (plan.sku.trim() || form.sku.trim() || generateUniqueSku()).toUpperCase(),
        price: planPrice,
        mrp: planMrp,
        compareAtPrice: planMrp,
        unitCost: isLead ? Math.round(Number(form.unitCost)) : Math.round(Number(plan.unitCost)),
        // Inventory is tracked at product level by the backend, not by supply plan.
        stock: 0,
        lowStockThreshold: Math.max(0, Math.floor(Number(plan.lowStockThreshold))),
        shippingProfile: {
          weightKg,
          lengthCm,
          breadthCm,
          heightCm,
        },
        shipping_profile: {
          weight_kg: weightKg,
          length_cm: lengthCm,
          breadth_cm: breadthCm,
          height_cm: heightCm,
        },
        badge: plan.badge.trim(),
      };
    });

    const primary = featuredPlan(plans);

    // Resolve benefits: structured array preferred, fallback to parsed text
    const benefits = form.benefits && form.benefits.length > 0
      ? form.benefits.filter((b) => b.title.trim())
      : parseLines(form.benefitsText || "", 2).map(([title, description]) => ({ title, description }));

    // Resolve ingredients: structured array preferred, fallback to parsed text
    const ingredients = form.ingredients && form.ingredients.length > 0
      ? form.ingredients.filter((i) => i.name.trim())
      : parseLines(form.ingredientsText || "", 3).map(([name, concentration, purpose]) => ({
          name,
          concentration,
          purpose,
        }));

    // Resolve usage steps: structured array preferred, fallback to parsed text
    const usageSteps = form.usageSteps && form.usageSteps.length > 0
      ? form.usageSteps.filter((u) => u.title.trim() || u.description.trim())
      : parseLines(form.usageStepsText || "", 2).map(([title, description]) => ({ title, description }));

    // Resolve clinical claims: structured array preferred, fallback to parsed text
    const clinicalClaims = form.clinicalClaims && form.clinicalClaims.length > 0
      ? form.clinicalClaims.filter((c) => c.claim.trim())
      : parseLines(form.clinicalClaimsText || "", 3).map(([percentage, claim, source]) => ({
          percentage,
          claim,
          source,
        }));

    // Place starred primary cover image first so patient apps and catalog feeds display it
    const primaryMediaItem = form.media.find((m) => m.isPrimary && m.kind === "image");
    const otherMediaItems = form.media.filter((m) => m !== primaryMediaItem);
    const orderedMedia = primaryMediaItem ? [primaryMediaItem, ...otherMediaItems] : form.media;

    const imageUrls = orderedMedia
      .filter((m) => m.kind === "image")
      .map((m) =>
        m.url && m.url.startsWith("http")
          ? m.url
          : m.name && m.name.startsWith("http")
          ? m.name
          : null
      )
      .filter(Boolean) as string[];

    const stagedById = new Map(stagedImages.map((item) => [item.localId, item.file]));
    const files: File[] = [];
    const mediaForSave = orderedMedia.map((media) => {
      const stagedFile = media.localId ? stagedById.get(media.localId) : undefined;
      if (stagedFile) {
        const uploadIndex = files.push(stagedFile) - 1;
        return {
          kind: "image" as const,
          altText: media.altText || stagedFile.name.replace(/\.[^/.]+$/, ""),
          isPrimary: media.isPrimary === true,
          pending_upload: true,
          upload_index: uploadIndex,
        };
      }
      const retained = { ...media };
      delete retained.localId;
      return retained;
    });

    const details = {
      name: form.name.trim(),
      sku: form.sku.trim().toUpperCase() || primary.sku,
      category: form.category.trim(),
      description: form.description.trim(),
      price: sellingPrice,
      compareAtPrice: retailMrp,
      compare_at_price: retailMrp,
      unitCost: Math.round(Number(form.unitCost)),
      unit_cost: Math.round(Number(form.unitCost)),
      stock: Math.max(0, Math.floor(Number(form.stock) || 0)),
      status: form.status,
      media: mediaForSave,
      images: imageUrls,
      rootCauses: form.rootCauses,
      root_causes: form.rootCauses,
      supplyPlans: plans,
      supply_plans: plans,
      benefits,
      ingredients,
      usageSteps,
      usage_steps: usageSteps,
      clinicalClaims,
      clinical_claims: clinicalClaims,
      clinical_metrics: clinicalClaims,
      updated: "Just now",
    };

    const productId = existing?.id ?? `prd-${Date.now()}`;
    const sendProduct = async (path: string, method: "POST" | "PATCH", product: Record<string, unknown>) => {
      const body = new FormData();
      body.set("product", JSON.stringify(product));
      for (const file of files) body.append("files", file, file.name);
      const response = await fetch(path, { method, body, cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "Product could not be saved.");
      return result;
    };

    if (existing) {
      const body = await sendProduct(`/api/admin/products/${encodeURIComponent(existing.id)}`, "PATCH", details);
      const updated = (body?.data?.product || body?.data || {}) as Partial<ProductRecord>;

      const savedStock = Math.max(0, Math.floor(Number(form.stock) || 0));
      onProductsChange((current) =>
        current.map((product) =>
          product.id === existing.id
            ? {
                ...product,
                ...details,
                stock: Number.isFinite(Number(updated?.stock)) ? Number(updated.stock) : savedStock,
                ...updated,
              }
            : product
        )
      );
      onToast("Product details saved to catalog.");
      onRefresh?.();
      return true;
    } else {
      const payload = { id: productId, ...details, unitsSold: 0, revenue: 0 };
      const body = await sendProduct("/api/admin/products", "POST", payload);

      const created = (body?.data?.product || body?.data || payload) as ProductRecord;
      onProductsChange((current) => [{ ...payload, ...created }, ...current]);
      onToast("Product added to catalog successfully.");
      onRefresh?.();
      return true;
    }
  };

  const applyStockAdjustment = async (product: ProductRecord, delta: number, reason: string, idempotencyKey: string): Promise<boolean> => {
    if (!Number.isSafeInteger(delta) || delta === 0 || !reason.trim()) {
      onToast("Choose a valid stock change and reason.");
      return false;
    }
    try {
      const response = await fetch(`/api/admin/products/${encodeURIComponent(product.id)}/inventory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta, notes: reason.trim(), idempotency_key: idempotencyKey }),
      });
      const body = await response.json().catch(() => null) as { message?: string; data?: { newStock?: unknown } } | null;
      if (!response.ok) throw new Error(body?.message || "Inventory adjustment could not be saved.");
      const newStock = Number(body?.data?.newStock);
      if (!Number.isFinite(newStock) || newStock < 0) throw new Error("Inventory service returned an invalid stock balance.");
      onProductsChange((current) => current.map((item) =>
        item.id === product.id ? { ...item, stock: newStock, updated: "Just now" } : item
      ));
      onToast(`Inventory updated to ${newStock} units.`);
      onRefresh?.();
      return true;
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Inventory adjustment could not be saved.");
      return false;
    }
  };

  const archive = () => {
    if (!archiveProduct) return;
    onProductsChange((current) =>
      current.map((item) =>
        item.id === archiveProduct.id ? { ...item, status: "Archived", updated: "Just now" } : item
      )
    );
    fetch(`/api/admin/products/${encodeURIComponent(archiveProduct.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    }).catch(() => {});
    onToast(`${archiveProduct.name} archived. Its past order history is preserved.`);
    setArchiveProduct(null);
  };

  const confirmDelete = async () => {
    if (!deleteProduct) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/admin/products/${encodeURIComponent(deleteProduct.id)}`, {
        method: "DELETE",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || "Failed to delete product from database.");
      }
      onProductsChange((current) => current.filter((p) => p.id !== deleteProduct.id));
      onToast(`"${deleteProduct.name}" permanently deleted from database.`);
      setDeleteProduct(null);
      if (detailProduct?.id === deleteProduct.id) {
        setDetailProduct(null);
      }
      onRefresh?.();
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Error deleting product from database.");
    } finally {
      setIsDeleting(false);
    }
  };

  const selectedDetail = detailProduct
    ? products.find((item) => item.id === detailProduct.id) ?? detailProduct
    : null;
  const selectedStock = stockProduct
    ? products.find((item) => item.id === stockProduct.id) ?? stockProduct
    : null;

  return (
    <>
      <div className="commerce-toolbar products-toolbar">
        <div>
          <h2 className="commerce-section-title">Product catalog</h2>
          <p className="card-note">Manage app content, pricing, inventory, and publishing across mobile apps</p>
        </div>
        <div className="commerce-inline-actions">
          <label className="input-search">
            <Search size={14} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search product, SKU, or category"
            />
          </label>
          <select
            className="period-select"
            aria-label="Filter products by status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option>All status</option>
            <option>Active</option>
            <option>Draft</option>
            <option>Archived</option>
          </select>
          <button
            type="button"
            className="button button-primary button-small inline-flex items-center gap-1.5 shrink-0"
            onClick={() => {
              setEditorProduct(null);
              setIsCreatingNew(true);
            }}
          >
            <Plus size={14} />
            <span>Add product</span>
          </button>
        </div>
      </div>

      <div className="commerce-mini-stats product-inventory-summary">
        <span>
          <Package size={14} />
          {products.length} products
        </span>
        <span>
          <BadgeCheck size={14} />
          {products.filter((product) => product.status?.toLowerCase() === "active").length} live in app
        </span>
        <span className={lowStockCount ? "stock-low" : ""}>
          <Boxes size={14} />
          {lowStockCount} products below 11 units
        </span>
        <span>
          <ImagePlus size={14} />
          {products.reduce((sum, product) => sum + (product.media?.length || 0), 0)} media assets
        </span>
      </div>

      <section className="card commerce-list-card">
        <div className="product-mobile-list" aria-label="Products">
          {visibleProducts.map((product) => {
            const lead = featuredPlan(getPlans(product));
            const displayPrice = lead.price || product.price || 0;
            const stock = stockLabel(product);
            return <article className="product-mobile-card" key={product.id}>
              <button type="button" className="product-mobile-main" onClick={() => setDetailProduct(product)}>
                <span className="product-table-icon"><Package size={15} /></span>
                <span className="product-mobile-copy"><strong>{product.name}</strong><small>{product.category} · {product.sku || lead.sku}</small></span>
                <span className="product-mobile-price">{formatCurrency(displayPrice)}</span>
              </button>
              <div className="product-mobile-meta">
                <span className={stock.low ? "stock-low" : ""}>{stock.label}</span>
                <StatusPill status={product.status} />
                <span>{product.unitsSold.toLocaleString("en-IN")} sold</span>
              </div>
              <div className="product-mobile-actions">
                <button type="button" className="button button-secondary button-small" onClick={() => setDetailProduct(product)}>Details</button>
                <button type="button" className="button button-secondary button-small" onClick={() => setStockProduct(product)}><PackagePlus size={13} />Stock</button>
                <button type="button" className="button button-secondary button-small" onClick={() => setEditorProduct(product)}><Pencil size={13} />Edit</button>
                {product.status !== "Archived" && <button type="button" className="button button-secondary button-small" onClick={() => setArchiveProduct(product)}><Archive size={13} />Archive</button>}
                <button type="button" className="button button-danger button-small" onClick={() => setDeleteProduct(product)}><Trash2 size={13} />Delete</button>
              </div>
            </article>;
          })}
          {visibleProducts.length === 0 && (
            <div className="empty-state flex flex-col items-center justify-center py-8 px-4 text-center">
              <Package size={28} className="text-slate-300 mb-2" />
              <p className="text-xs font-semibold text-slate-700 m-0">No products match this search</p>
              <button
                type="button"
                className="button button-primary button-small inline-flex items-center gap-1.5 mt-3"
                onClick={() => {
                  setEditorProduct(null);
                  setIsCreatingNew(true);
                }}
              >
                <Plus size={13} />
                <span>Add new product</span>
              </button>
            </div>
          )}
        </div>
        <div className="table-wrap">
          <table className="commerce-table products-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>Price / MRP</th>
                <th>Margin</th>
                <th>Units sold</th>
                <th>Net sales</th>
                <th>Inventory</th>
                <th>Store</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleProducts.map((product) => {
                const plans = getPlans(product);
                const lead = featuredPlan(plans);
                const displayPrice = lead.price || product.price || 0;
                const displayMrp = lead.mrp || product.compareAtPrice || 0;
                const displayCost = lead.unitCost || product.unitCost || 0;
                const margin = displayPrice ? ((displayPrice - displayCost) / displayPrice) * 100 : 0;
                const stock = stockLabel(product);
                const leadImage =
                  (product.images && product.images.length > 0 ? product.images[0] : null) ||
                  product.media?.find((m) => m.isPrimary && (m.url || m.name))?.url ||
                  product.media?.find((m) => m.isPrimary && (m.url || m.name))?.name ||
                  product.media?.[0]?.url ||
                  (product.media?.[0]?.name?.startsWith("http") ? product.media[0].name : null);

                return (
                  <tr key={product.id}>
                    <td>
                      <button className="product-title-button" onClick={() => setDetailProduct(product)}>
                        <span className="product-table-icon">
                          {leadImage && (leadImage.startsWith("http://") || leadImage.startsWith("https://")) ? (
                            <img
                              src={leadImage}
                              alt={product.name}
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          ) : (
                            <Package size={15} />
                          )}
                        </span>
                        <span>
                          <strong>{product.name}</strong>
                          <small>
                            {product.category} · {(product.rootCauses ?? []).join(", ") || "General"}
                          </small>
                        </span>
                      </button>
                    </td>
                    <td>
                      <span className="font-mono text-xs font-medium text-slate-700">{product.sku || lead.sku}</span>
                    </td>
                    <td>
                      <strong>{formatCurrency(displayPrice)}</strong>
                      {displayMrp > displayPrice && (
                        <small className="strike-price block text-[11px] text-slate-400">
                          MRP {formatCurrency(displayMrp)}
                        </small>
                      )}
                    </td>
                    <td>
                      <span className="margin-pill">{margin.toFixed(0)}%</span>
                    </td>
                    <td>{product.unitsSold.toLocaleString("en-IN")}</td>
                    <td>
                      <strong>{formatCurrency(product.revenue)}</strong>
                    </td>
                    <td>
                      <span className={stock.low ? "stock-low" : ""}>{stock.label}</span>
                    </td>
                    <td>
                      <StatusPill status={product.status} />
                    </td>
                    <td className="text-right">
                      <div className="table-actions justify-end">
                        <button
                          className="row-action"
                          aria-label={`View ${product.name}`}
                          title="View details"
                          onClick={() => setDetailProduct(product)}
                        >
                          <Package size={14} />
                        </button>
                        <button
                          className="row-action"
                          aria-label={`Adjust ${product.name} stock`}
                          title="Adjust inventory"
                          onClick={() => setStockProduct(product)}
                        >
                          <PackagePlus size={14} />
                        </button>
                        <button
                          className="row-action"
                          aria-label={`Edit ${product.name}`}
                          title="Edit product"
                          onClick={() => setEditorProduct(product)}
                        >
                          <Pencil size={14} />
                        </button>
                        {product.status !== "Archived" && (
                          <button
                            className="row-action"
                            aria-label={`Archive ${product.name}`}
                            title="Archive product"
                            onClick={() => setArchiveProduct(product)}
                          >
                            <Archive size={14} />
                          </button>
                        )}
                        <button
                          className="row-action danger-action"
                          aria-label={`Delete ${product.name} permanently`}
                          title="Delete product permanently from database"
                          onClick={() => setDeleteProduct(product)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visibleProducts.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-state flex flex-col items-center justify-center py-10 px-4 text-center">
                      <Package size={32} className="text-slate-300 mb-2" />
                      <p className="text-sm font-semibold text-slate-700 m-0">No products found in catalog</p>
                      <p className="text-xs text-slate-400 mt-1 mb-3">
                        {query || statusFilter !== "All status"
                          ? "Try clearing filters or search terms."
                          : "Start building your clinical product catalog."}
                      </p>
                      <button
                        type="button"
                        className="button button-primary button-small inline-flex items-center gap-1.5"
                        onClick={() => {
                          setEditorProduct(null);
                          setIsCreatingNew(true);
                        }}
                      >
                        <Plus size={13} />
                        <span>Add new product</span>
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span>
            Showing {visibleProducts.length} of {products.length} products
          </span>
          <span>Synchronized live with Dr. Hair production backend</span>
        </div>
      </section>

      <div className="notice commerce-media-note">
        <ImagePlus size={14} />
        <span>
          Product catalog is connected to live Cloudflare R2 storage and database APIs. Uploaded images sync directly to
          patient mobile apps.
        </span>
      </div>

      {(editorProduct !== null || createProductOpen || isCreatingNew) && (
        <ProductEditor
          product={editorProduct}
          categoryOptions={categoryOptions}
          rootCauseOptions={rootCauseOptions}
          onClose={() => {
            setEditorProduct(null);
            setIsCreatingNew(false);
            onCreateHandled();
          }}
          onSave={saveProduct}
          onToast={onToast}
        />
      )}

      {selectedDetail && (
        <ProductDetails
          product={selectedDetail}
          onClose={() => setDetailProduct(null)}
          onEdit={() => {
            setEditorProduct(selectedDetail);
            setDetailProduct(null);
          }}
          onAdjustStock={() => setStockProduct(selectedDetail)}
          onDelete={() => {
            setDeleteProduct(selectedDetail);
            setDetailProduct(null);
          }}
        />
      )}

      {selectedStock && (
        <StockAdjustmentDialog
          product={selectedStock}
          onClose={() => setStockProduct(null)}
          onSave={async (delta, reason, idempotencyKey) => {
            const ok = await applyStockAdjustment(selectedStock, delta, reason, idempotencyKey);
            if (ok) setStockProduct(null);
            return ok;
          }}
        />
      )}

      {archiveProduct && (
        <Modal
          title="Archive this product?"
          description="The product will leave the shop but remain in historic order records."
          submitLabel="Archive product"
          onClose={() => setArchiveProduct(null)}
          onSubmit={archive}
        >
          <div className="archive-confirm">
            <Archive size={17} />
            <span>
              <strong>{archiveProduct.name}</strong>
              <small>You can still find it by filtering for Archived products.</small>
            </span>
          </div>
        </Modal>
      )}

      {deleteProduct && (
        <Modal
          title="Delete product permanently?"
          description="This will permanently delete this medicine from the catalog and remove any unreferenced product images from R2."
          submitLabel="Delete from database"
          submitLoading={isDeleting}
          submitDisabled={isDeleting}
          submitVariant="danger"
          onClose={() => {
            if (!isDeleting) setDeleteProduct(null);
          }}
          onSubmit={confirmDelete}
        >
          <div className="flex items-start gap-3 p-3.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-900 text-xs">
            <Trash2 size={20} className="text-rose-600 shrink-0 mt-0.5" />
            <div className="grid gap-1">
              <strong className="text-sm font-semibold">{deleteProduct.name}</strong>
              <p className="text-rose-700">
                SKU: <span className="font-mono font-medium">{deleteProduct.sku}</span> · ID:{" "}
                <span className="font-mono">{deleteProduct.id}</span>
              </p>
              <p className="text-[11px] text-rose-600 mt-1">
                Warning: This action permanently deletes the medicine from the database. It cannot be undone.
              </p>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

const PRESET_CATEGORIES = [
  "Scalp Serum",
  "Anti-Hairfall Shampoo",
  "Hair Growth Tablets",
  "Nourishing Hair Oil",
  "Conditioner",
  "Scalp Roller & Tools",
  "Clinical Regimen Kit",
  "Anti-Dandruff Solution",
];

const PRESET_ROOT_CAUSES = [
  "DHT Sensitivity",
  "Hair Thinning",
  "Dandruff & Flaking",
  "Receding Hairline",
  "Nutritional Deficiency",
  "Scalp Inflammation",
  "Stress / Telogen Effluvium",
  "Postpartum Shedding",
  "Thyroid Related",
  "PCOS Hair Loss",
];

const SHIPPING_PRESETS = [
  {
    name: "Serum / Dropper Bottle",
    desc: "Standard 60ml dropper",
    profile: { weightKg: 0.25, lengthCm: 15, breadthCm: 10, heightCm: 5 },
  },
  {
    name: "Shampoo / Cleanser 250ml",
    desc: "Pump or flip bottle",
    profile: { weightKg: 0.4, lengthCm: 20, breadthCm: 10, heightCm: 7 },
  },
  {
    name: "Supplement Jar (60 Tabs)",
    desc: "Nutritional / DHT blockers",
    profile: { weightKg: 0.15, lengthCm: 12, breadthCm: 8, heightCm: 5 },
  },
  {
    name: "Clinical Regimen Kit Box",
    desc: "Complete treatment bundle",
    profile: { weightKg: 0.75, lengthCm: 25, breadthCm: 18, heightCm: 10 },
  },
];

const INGREDIENT_SUGGESTIONS: ProductIngredient[] = [
  { name: "Redensyl", concentration: "", purpose: "" },
  { name: "Procapil", concentration: "", purpose: "" },
  { name: "Anagain", concentration: "", purpose: "" },
  { name: "Biotin", concentration: "", purpose: "" },
  { name: "Rosemary Extract", concentration: "", purpose: "" },
  { name: "Saw Palmetto", concentration: "", purpose: "" },
  { name: "Salicylic Acid", concentration: "", purpose: "" },
];

function ProductEditor({
  product,
  categoryOptions,
  rootCauseOptions,
  onClose,
  onSave,
  onToast,
}: {
  product: ProductRecord | null;
  categoryOptions: string[];
  rootCauseOptions: string[];
  onClose: () => void;
  onSave: (form: ProductFormState, existing: ProductRecord | null, stagedImages: StagedProductImage[]) => Promise<boolean>;
  onToast: (message: string) => void;
}) {
  type EditorTab = "general" | "pricing" | "media" | "clinical";
  type UploadStatus = "uploading" | "ready" | "error";
  interface MediaItemMeta {
    status: UploadStatus;
    error?: string;
    file?: File;
    progress?: number;
  }

  const [activeTab, setActiveTab] = useState<EditorTab>("general");
  const [form, setForm] = useState<ProductFormState>(() => formFor(product));
  const [previews, setPreviews] = useState<PreviewMedia[]>(() => {
    if (!product) return [];
    const initialMedia = product.media?.length
      ? product.media
      : (product.images || []).map((img, idx) => ({
          name: img,
          url: img,
          kind: "image" as const,
          isPrimary: idx === 0,
        }));
    return initialMedia.map((m) => ({ ...m, url: m.url || m.name }));
  });
  const [imageToView, setImageToView] = useState<ViewerImage | null>(null);
  const [uploadMeta, setUploadMeta] = useState<Record<string, MediaItemMeta>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [errorTab, setErrorTab] = useState<EditorTab | null>(null);
  const [showAdvancedPlans, setShowAdvancedPlans] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isGeneratingSku, setIsGeneratingSku] = useState(false);
  const [rootCauseDraft, setRootCauseDraft] = useState("");
  const [rawTextMode, setRawTextMode] = useState(false);
  const [activeShippingPreset, setActiveShippingPreset] = useState<string | null>(null);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});
  const formErrorRef = useRef<HTMLDivElement>(null);
  const isStep1Valid = Boolean(form.name.trim() && form.category.trim() && form.rootCauses.length > 0);
  const isStep2Valid = form.price > 0 && form.supplyPlans.length > 0 && form.supplyPlans.every((plan) => {
    const profile = plan.shippingProfile;
    return [profile?.weightKg, profile?.lengthCm, profile?.breadthCm, profile?.heightCm]
      .every((value) => Number.isFinite(Number(value)) && Number(value) > 0);
  });

  const markTouched = (fieldName: string) =>
    setTouchedFields((prev) => (prev[fieldName] ? prev : { ...prev, [fieldName]: true }));

  const activeUrls = useRef<string[]>([]);
  const stagedFiles = useRef(new Map<string, File>());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const setField = <K extends keyof ProductFormState>(key: K, value: ProductFormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const reportSubmitError = (message: string, tab: EditorTab) => {
    setActiveTab(tab);
    setErrorTab(tab);
    setFormError(message);
    requestAnimationFrame(() => {
      const modalBody = formErrorRef.current?.closest<HTMLElement>(".modal-body");
      modalBody?.scrollTo({ top: 0, behavior: "smooth" });
      formErrorRef.current?.focus({ preventScroll: true });
    });
  };

  const mergedCategories = useMemo(() => {
    return [...new Set([...PRESET_CATEGORIES, ...categoryOptions])].sort();
  }, [categoryOptions]);

  const allRootCauses = useMemo(() => {
    return [...new Set([...PRESET_ROOT_CAUSES, ...rootCauseOptions, ...form.rootCauses])];
  }, [rootCauseOptions, form.rootCauses]);

  const addRootCause = () => {
    const value = rootCauseDraft.trim();
    if (!value || form.rootCauses.some((item) => item.toLowerCase() === value.toLowerCase())) return;
    setField("rootCauses", [...form.rootCauses, value]);
    setRootCauseDraft("");
  };

  const toggleRootCause = (tag: string) => {
    setField(
      "rootCauses",
      form.rootCauses.includes(tag)
        ? form.rootCauses.filter((item) => item !== tag)
        : [...form.rootCauses, tag]
    );
  };

  useEffect(() => () => activeUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const uploadingCount = Object.values(uploadMeta).filter((m) => m.status === "uploading").length;
  const isUploading = uploadingCount > 0;

  const progressPercent =
    activeTab === "general" ? 25 : activeTab === "pricing" ? 50 : activeTab === "media" ? 75 : 100;

  const updatePrimaryPricing = (field: "price" | "mrp" | "unitCost" | "stock" | "sku", val: number | string) => {
    setForm((prev) => {
      const numVal = typeof val === "number" ? val : Number(val) || 0;
      const updatedPlans = prev.supplyPlans.map((plan, idx) => {
        if (idx === 0) {
          return {
            ...plan,
            [field]: typeof val === "string" ? val.toUpperCase() : numVal,
          };
        }
        return plan;
      });
      return {
        ...prev,
        [field]: typeof val === "string" ? val.toUpperCase() : numVal,
        supplyPlans: updatedPlans,
      };
    });
  };

  const applyShippingPreset = (preset: (typeof SHIPPING_PRESETS)[number]) => {
    setActiveShippingPreset(preset.name);
    setForm((prev) => ({
      ...prev,
      supplyPlans: prev.supplyPlans.map((plan, idx) =>
        idx === 0 ? { ...plan, shippingProfile: { ...preset.profile } } : plan
      ),
    }));
    onToast(`Applied ${preset.name} parcel profile (${preset.profile.weightKg} kg).`);
  };

  const generateSkuWithAnimation = () => {
    setIsGeneratingSku(true);
    const newSku = generateUniqueSku("DRH");
    updatePrimaryPricing("sku", newSku);
    setTimeout(() => setIsGeneratingSku(false), 380);
  };

  // Validate and optimize locally. Files are sent only with the final product
  // create/update FormData request, so a canceled editor never leaves R2 orphans.
  const prepareSingleMediaFile = async (file: File, tempId: string) => {
    setUploadMeta((prev) => ({
      ...prev,
      [tempId]: { status: "uploading", file },
    }));

    try {
      const prepared = await prepareSmartImage(file);
      // Retain the source if the browser cannot safely create an optimized
      // variant (for example HEIC on browsers without a decoder).
      stagedFiles.current.set(tempId, prepared.variants[0]?.file ?? prepared.original);
      setUploadMeta((prev) => ({ ...prev, [tempId]: { status: "ready", file } }));
      setForm((prev) => ({
        ...prev,
        media: prev.media.map((media) => media.localId === tempId
          ? { ...media, processingStatus: prepared.processingStatus }
          : media),
      }));
      onToast(`${file.name} is ready. It will upload when you save the product.`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : `Could not prepare ${file.name}.`;
      setUploadMeta((prev) => ({
        ...prev,
        [tempId]: { status: "error", error: errMsg, file },
      }));
      onToast(errMsg);
    }
  };

  // Process selected / dropped files concurrently
  const processFiles = async (files: File[]) => {
    if (files.length === 0) return;

    const validFiles: { file: File; kind: "image"; tempId: string; localUrl: string }[] = [];
    let remainingImageSlots = Math.max(0, 10 - form.media.filter((media) => media.kind === "image").length);
    let remainingBytes = Math.max(0, 80 * 1024 * 1024 - [...stagedFiles.current.values()].reduce((sum, file) => sum + file.size, 0));

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (remainingImageSlots <= 0) {
        onToast("A product can include up to 10 images. Remove an image before adding another.");
        break;
      }

      if (file.size > 25 * 1024 * 1024) {
        onToast(`"${file.name}" exceeds the 25 MiB limit. Choose a smaller image.`);
        continue;
      }

      const mime = (file.type || "").toLowerCase();
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const isSupportedMime = [
        "image/jpeg",
        "image/jpg",
        "image/pjpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "image/avif",
        "image/heic",
        "image/heif",
      ].includes(mime);
      const isSupportedExt = ["jpg", "jpeg", "png", "webp", "gif", "avif", "heic", "heif"].includes(ext);
      const isImage = isSupportedMime || isSupportedExt;

      if (!isImage) {
        onToast(`"${file.name}" is not supported. Choose a JPG, PNG, WebP, AVIF, HEIC, HEIF, or GIF image.`);
        continue;
      }

      if (file.size > remainingBytes) {
        onToast(`"${file.name}" would exceed the 80 MiB total upload limit. Remove another new image or choose a smaller file.`);
        continue;
      }
      remainingBytes -= file.size;
      remainingImageSlots -= 1;

      const kind = "image" as const;
      const tempId = `temp-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`;
      const localUrl = URL.createObjectURL(file);
      activeUrls.current.push(localUrl);

      validFiles.push({ file, kind, tempId, localUrl });
    }

    if (validFiles.length === 0) return;

    setPreviews((current) => [
      ...current,
      ...validFiles.map((v) => ({ name: v.tempId, url: v.localUrl, kind: v.kind })),
    ]);

    setForm((prev) => {
      let isFirstImage = !prev.media.some((m) => m.kind === "image");
      const newMediaItems: ProductMedia[] = validFiles.map((v) => {
        const primary = isFirstImage;
        if (isFirstImage && v.kind === "image") isFirstImage = false;
        return {
          name: v.file.name,
          url: v.localUrl,
          localId: v.tempId,
          kind: v.kind,
          isPrimary: primary,
          altText: v.file.name.replace(/\.[^/.]+$/, ""),
        };
      });

      return {
        ...prev,
        media: [...prev.media, ...newMediaItems],
      };
    });

    await Promise.allSettled(
      validFiles.map((v) => prepareSingleMediaFile(v.file, v.tempId))
    );
  };

  const pickMedia = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    await processFiles(files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingOver) setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    await processFiles(files);
  };

  const retryUpload = async (tempId: string) => {
    const meta = uploadMeta[tempId];
    if (!meta || !meta.file) {
      onToast("Original file is no longer in memory. Please select it again.");
      return;
    }
    await prepareSingleMediaFile(meta.file, tempId);
  };

  const handleClose = () => {
    if (isUploading || isSaving) {
      onToast("Wait for the current upload or save to finish before closing.");
      return;
    }
    stagedFiles.current.clear();
    onClose();
  };

  const updatePlan = (index: number, field: keyof ProductSupplyPlan, value: string) =>
    setForm((current) => ({
      ...current,
      supplyPlans: current.supplyPlans.map((plan, planIndex) =>
        planIndex === index
          ? {
              ...plan,
              [field]: ["price", "mrp", "unitCost", "stock", "lowStockThreshold"].includes(field)
                ? Number(value) || 0
                : value,
            }
          : plan
      ),
    }));

  const updatePlanShippingProfile = (
    index: number,
    field: keyof NonNullable<ProductSupplyPlan["shippingProfile"]>,
    value: string,
  ) => setForm((current) => ({
    ...current,
    supplyPlans: current.supplyPlans.map((plan, planIndex) => planIndex === index
      ? {
        ...plan,
        shippingProfile: {
          weightKg: 0,
          lengthCm: 0,
          breadthCm: 0,
          heightCm: 0,
          ...plan.shippingProfile,
          [field]: Number(value) || 0,
        },
      }
      : plan),
  }));

  const updateMedia = (index: number, patch: Partial<ProductMedia>) =>
    setField(
      "media",
      form.media.map((media, mediaIndex) => (mediaIndex === index ? { ...media, ...patch } : media))
    );

  const moveMedia = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= form.media.length) return;
    const media = [...form.media];
    [media[index], media[nextIndex]] = [media[nextIndex], media[index]];
    setField("media", media);
  };

  const removeMedia = (index: number) => {
    const removed = form.media[index];
    setField(
      "media",
      form.media.filter((_, mediaIndex) => mediaIndex !== index)
    );
    const preview = previews.find((item) => item.name === removed.name || item.url === removed.url);
    if (preview) {
      URL.revokeObjectURL(preview.url);
      activeUrls.current = activeUrls.current.filter((url) => url !== preview.url);
      setPreviews((current) => current.filter((item) => item.url !== preview.url));
    }
    setUploadMeta((prev) => {
      const next = { ...prev };
      if (removed.localId) delete next[removed.localId];
      delete next[removed.name];
      if (removed.url) delete next[removed.url];
      return next;
    });
    if (removed.localId) stagedFiles.current.delete(removed.localId);
  };

  // Structured Clinical Builders State Helpers
  const addBenefitItem = (item: ProductBenefit = { title: "", description: "" }) => {
    setForm((prev) => ({
      ...prev,
      benefits: [...(prev.benefits || []), item],
    }));
  };

  const updateBenefitItem = (index: number, field: keyof ProductBenefit, value: string) => {
    setForm((prev) => ({
      ...prev,
      benefits: (prev.benefits || []).map((b, i) => (i === index ? { ...b, [field]: value } : b)),
    }));
  };

  const removeBenefitItem = (index: number) => {
    setForm((prev) => ({
      ...prev,
      benefits: (prev.benefits || []).filter((_, i) => i !== index),
    }));
  };

  const addIngredientItem = (item: ProductIngredient = { name: "", concentration: "", purpose: "" }) => {
    setForm((prev) => ({
      ...prev,
      ingredients: [...(prev.ingredients || []), item],
    }));
  };

  const updateIngredientItem = (index: number, field: keyof ProductIngredient, value: string) => {
    setForm((prev) => ({
      ...prev,
      ingredients: (prev.ingredients || []).map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    }));
  };

  const removeIngredientItem = (index: number) => {
    setForm((prev) => ({
      ...prev,
      ingredients: (prev.ingredients || []).filter((_, i) => i !== index),
    }));
  };

  const addUsageStepItem = (step: ProductUsageStep = { title: `Step ${(form.usageSteps?.length || 0) + 1}`, description: "" }) => {
    setForm((prev) => ({
      ...prev,
      usageSteps: [...(prev.usageSteps || []), step],
    }));
  };

  const updateUsageStepItem = (index: number, field: keyof ProductUsageStep, value: string) => {
    setForm((prev) => ({
      ...prev,
      usageSteps: (prev.usageSteps || []).map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    }));
  };

  const removeUsageStepItem = (index: number) => {
    setForm((prev) => ({
      ...prev,
      usageSteps: (prev.usageSteps || []).filter((_, i) => i !== index),
    }));
  };

  const addClinicalClaimItem = (claim: ProductClinicalClaim = { percentage: "", claim: "", source: "" }) => {
    setForm((prev) => ({
      ...prev,
      clinicalClaims: [...(prev.clinicalClaims || []), claim],
    }));
  };

  const updateClinicalClaimItem = (index: number, field: keyof ProductClinicalClaim, value: string) => {
    setForm((prev) => ({
      ...prev,
      clinicalClaims: (prev.clinicalClaims || []).map((c, i) => (i === index ? { ...c, [field]: value } : c)),
    }));
  };

  const removeClinicalClaimItem = (index: number) => {
    setForm((prev) => ({
      ...prev,
      clinicalClaims: (prev.clinicalClaims || []).filter((_, i) => i !== index),
    }));
  };

  const validateBeforeContinue = (currentTab: EditorTab): boolean => {
    setFormError("");
    setErrorTab(null);

    if (currentTab === "general") {
      if (!form.name.trim()) {
        setHasAttemptedSubmit(true);
        markTouched("name");
        setFormError("Product / medicine name is required.");
        setErrorTab("general");
        return false;
      }
      if (!form.category.trim()) {
        setHasAttemptedSubmit(true);
        markTouched("category");
        setFormError("Please select or enter a shop category.");
        setErrorTab("general");
        return false;
      }
      if (form.rootCauses.length === 0) {
        setHasAttemptedSubmit(true);
        setFormError("Select at least one clinical concern tag so patients can find this medicine.");
        setErrorTab("general");
        return false;
      }
    } else if (currentTab === "pricing") {
      if (!form.price || Number(form.price) <= 0) {
        setHasAttemptedSubmit(true);
        markTouched("price");
        setFormError("Selling price must be greater than ₹0.");
        setErrorTab("pricing");
        return false;
      }
    }
    return true;
  };

  const handleNextTab = () => {
    if (!validateBeforeContinue(activeTab)) return;

    if (activeTab === "general") setActiveTab("pricing");
    else if (activeTab === "pricing") setActiveTab("media");
    else if (activeTab === "media") setActiveTab("clinical");
  };

  const handleSubmit = async () => {
    if (isSaving) return;
    setHasAttemptedSubmit(true);
    setFormError("");
    setErrorTab(null);

    if (!form.name.trim()) {
      markTouched("name");
      reportSubmitError("Product / medicine name is required before publishing.", "general");
      return;
    }
    if (!form.category.trim()) {
      markTouched("category");
      reportSubmitError("Product category is required before publishing.", "general");
      return;
    }
    if (form.rootCauses.length === 0) {
      reportSubmitError("Select at least one clinical concern tag before publishing.", "general");
      return;
    }
    if (!form.price || Number(form.price) <= 0) {
      markTouched("price");
      reportSubmitError("Selling price must be greater than ₹0.", "pricing");
      return;
    }

    if (!isStep2Valid) {
      reportSubmitError(
        "Complete the packed parcel weight and all three dimensions in Pricing & Shipping before publishing.",
        "pricing",
      );
      return;
    }

    if (isUploading) {
      reportSubmitError(
        `Wait for ${uploadingCount} image preparation${uploadingCount > 1 ? "s" : ""} to finish before publishing.`,
        "media",
      );
      return;
    }

    setIsSaving(true);
    try {
      const orderedStagedImages = form.media.flatMap((media) => {
        if (!media.localId) return [];
        const file = stagedFiles.current.get(media.localId);
        return file ? [{ localId: media.localId, file }] : [];
      });
      const missingStaged = form.media.some((media) => media.localId && !stagedFiles.current.has(media.localId));
      if (missingStaged) {
        reportSubmitError("A selected image is no longer available. Remove it and choose it again before publishing.", "media");
        return;
      }
      const success = await onSave(form, product, orderedStagedImages);
      if (success) {
        onClose();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save product to database.";
      const lower = message.toLowerCase();
      const tab: EditorTab = /name|category|concern|root cause/.test(lower)
        ? "general"
        : /price|mrp|parcel|shipping|dimension|weight|plan|sku/.test(lower)
        ? "pricing"
        : /image|file|media|upload/.test(lower)
        ? "media"
        : activeTab;
      reportSubmitError(message, tab);
    } finally {
      setIsSaving(false);
    }
  };

  // Margin / discount calculation
  const leadPlan = form.supplyPlans[0] ?? newPlan();
  const leadPrice = Number(form.price) || 0;
  const leadMrp = Number(form.mrp) || 0;
  const discountPercent = leadMrp > leadPrice && leadPrice > 0
    ? Math.round(((leadMrp - leadPrice) / leadMrp) * 100)
    : null;
  const savingsAmount = leadMrp > leadPrice ? leadMrp - leadPrice : 0;

  return (
    <>
      <Modal
        className="product-editor-modal"
        hideFooter={true}
        title={
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <h2 className="text-sm sm:text-base font-bold text-slate-800 m-0 tracking-tight flex items-center gap-1.5 sm:gap-2">
              <span className="p-1 rounded-lg bg-teal-50 text-teal-700 border border-teal-200/80">
                <Package size={15} />
              </span>
              <span>{product ? `Edit · ${product.name || "Medicine"}` : "Add Medicine / Product"}</span>
            </h2>
            <span className="inline-flex items-center text-[10px] font-semibold text-teal-800 bg-teal-50 border border-teal-200/80 rounded-full px-2 py-0.5">
              {form.category || "Hair Care"}
            </span>
            {leadPrice > 0 && (
              <span className="inline-flex items-center text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                ₹{leadPrice}
              </span>
            )}
            {form.media.length > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-medium text-slate-600 bg-slate-100 rounded-full px-2 py-0.5">
                <ImagePlus size={11} className="text-teal-600" />
                {form.media.length} photo{form.media.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
        }
        description={
          <p className="text-[11px] text-slate-500 m-0 hidden sm:block">
            Configure product clinical classification, real-time inventory, pricing, courier shipping parcel, and high-resolution Cloudflare R2 media.
          </p>
        }
        onClose={handleClose}
        onSubmit={() => void handleSubmit()}
      >
        {/* Step-by-Step Stepper Navigation */}
        <div className="product-stepper-container">
          <AdminTabBar activeKey={activeTab} className="product-editor-nav admin-tab-bar--wide" label="Product wizard steps">
            <AdminTab label="01 · Basics & Category" icon={Package} aria-selected={activeTab === "general"} className="product-editor-tab admin-tab--grow" onClick={() => setActiveTab("general")} suffix={isStep1Valid ? <span className="tab-badge" title="Basics completed">✓</span> : <span className="admin-tab-required-dot" title="Required fields needed" />} />
            <AdminTab label="02 · Pricing & Shipping" icon={Boxes} aria-selected={activeTab === "pricing"} className="product-editor-tab admin-tab--grow" onClick={() => setActiveTab("pricing")} suffix={isStep2Valid ? <span className="tab-badge" title="Pricing completed">₹{leadPrice}</span> : <span className="admin-tab-required-dot" title="Required pricing needed" />} />
            <AdminTab label="03 · Photos & Gallery" icon={ImagePlus} aria-selected={activeTab === "media"} className="product-editor-tab admin-tab--grow" onClick={() => setActiveTab("media")} suffix={<span className="tab-badge">{isUploading ? <Loader2 size={10} className="animate-spin" /> : form.media.length}</span>} />
            <AdminTab label="04 · Clinical & How to Use" icon={BadgeCheck} aria-selected={activeTab === "clinical"} className="product-editor-tab admin-tab--grow" onClick={() => setActiveTab("clinical")} suffix={((form.benefits?.length || 0) + (form.ingredients?.length || 0)) > 0 ? <span className="tab-badge">{(form.benefits?.length || 0) + (form.ingredients?.length || 0)}</span> : undefined} />
          </AdminTabBar>

          {/* Animated Stepper Progress Bar */}
          <div className="product-stepper-progress-bg">
            <div
              className="product-stepper-progress-fill"
              style={{ width: `${progressPercent}%` }}
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>

        {/* Global Error Banner with Instant Jump-to-Field */}
        {formError && (
          <div
            ref={formErrorRef}
            className="wizard-error-banner rounded-xl border border-rose-200 bg-rose-50/95 p-3 text-xs text-rose-800 flex items-center justify-between gap-3 shadow-xs mb-3"
            role="alert"
            aria-live="assertive"
            tabIndex={-1}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-rose-600 shrink-0" />
              <span className="font-semibold">{formError}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {errorTab && errorTab !== activeTab && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-100 hover:bg-rose-200 px-2 py-1 rounded-md transition-colors"
                  onClick={() => {
                    setActiveTab(errorTab);
                    setErrorTab(null);
                  }}
                >
                  <span>Fix in Step {errorTab === "general" ? "1" : errorTab === "pricing" ? "2" : errorTab === "media" ? "3" : "4"}</span>
                  <ArrowRight size={11} />
                </button>
              )}
              <button
                type="button"
                className="text-rose-600 hover:text-rose-800 p-1 rounded hover:bg-rose-100"
                onClick={() => setFormError("")}
                aria-label="Dismiss error"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 1: BASICS & CATEGORY */}
        {activeTab === "general" && (
          <div className="product-editor-section wizard-step-panel">
            <div className="product-editor-section-head">
              <div>
                <h3 className="flex items-center gap-2">
                  <span>Store listing & patient classification</span>
                  {isStep1Valid ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                      <CheckCircle2 size={11} className="text-emerald-600" /> Step Completed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-2 py-0.5">
                      {3 - ((form.name.trim() ? 1 : 0) + (form.category.trim() ? 1 : 0) + (form.rootCauses.length > 0 ? 1 : 0))} fields required
                    </span>
                  )}
                </h3>
                <p>Define product name, category, patient app live status, and concern tags for the recommendation engine.</p>
              </div>
              <span className="product-section-number">01</span>
            </div>

            <div className="product-form-grid">
              {/* Product System ID (Immutable in edit mode) */}
              {product && (
                <div className="field field-span">
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="product-system-id" className="flex items-center gap-1.5 font-semibold text-slate-700">
                      <Lock size={12} className="text-slate-400" />
                      <span>Product System ID</span>
                      <span className="field-badge-optional bg-slate-100 text-slate-600 border border-slate-200">
                        Locked / Immutable
                      </span>
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono">ID: {product.id}</span>
                  </div>
                  <input
                    id="product-system-id"
                    value={product.id}
                    readOnly
                    disabled
                    className="bg-slate-100 text-slate-500 font-mono text-xs cursor-not-allowed border-slate-200 select-all"
                    title="Product ID is permanent and cannot be modified."
                  />
                  <span className="text-[10px] text-slate-400 mt-1">
                    Permanent system identifier tied to database records, cart checkout, and patient prescriptions.
                  </span>
                </div>
              )}

              {/* Product Name */}
              <div className="field">
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="product-name" className="flex items-center gap-1.5 font-semibold text-slate-700">
                    <span>Product / Medicine name</span>
                    <span className="field-badge-required">Required *</span>
                  </label>
                  {form.name.trim() ? (
                    <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                      <Check size={11} /> Valid
                    </span>
                  ) : null}
                </div>
                <input
                  id="product-name"
                  value={form.name}
                  onChange={(event) => setField("name", event.target.value)}
                  onBlur={() => markTouched("name")}
                  placeholder="e.g. Daily Scalp Nourishing Serum 60ml"
                  className={!form.name.trim() && (hasAttemptedSubmit || touchedFields["name"]) ? "border-rose-300 ring-2 ring-rose-100" : ""}
                  required
                />
                {!form.name.trim() && (hasAttemptedSubmit || touchedFields["name"]) ? (
                  <p className="text-[11px] text-rose-600 mt-1 flex items-center gap-1 font-medium">
                    <AlertTriangle size={12} className="shrink-0" />
                    <span>Please enter the medicine or product name.</span>
                  </p>
                ) : (
                  <span className="text-[10px] text-slate-400 mt-1">Displayed as the primary product title across the Dr. Hair mobile app.</span>
                )}
              </div>

              {/* Shop Category with Quick Preset Chips */}
              <div className="field">
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="product-category" className="flex items-center gap-1.5 font-semibold text-slate-700">
                    <span>Shop category</span>
                    <span className="field-badge-required">Required *</span>
                  </label>
                  {form.category.trim() ? (
                    <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                      <Check size={11} /> Selected
                    </span>
                  ) : null}
                </div>
                <input
                  id="product-category"
                  list="product-category-options"
                  value={form.category}
                  onChange={(event) => setField("category", event.target.value)}
                  onBlur={() => markTouched("category")}
                  placeholder="Choose or enter custom category"
                  className={!form.category.trim() && (hasAttemptedSubmit || touchedFields["category"]) ? "border-rose-300 ring-2 ring-rose-100" : ""}
                  required
                />
                <datalist id="product-category-options">
                  {mergedCategories.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
                {!form.category.trim() && (hasAttemptedSubmit || touchedFields["category"]) ? (
                  <p className="text-[11px] text-rose-600 mt-1 flex items-center gap-1 font-medium">
                    <AlertTriangle size={12} className="shrink-0" />
                    <span>Please select or enter a shop category.</span>
                  </p>
                ) : null}

                {/* 1-Click Category Preset Chips */}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="text-[10px] text-slate-400 font-medium self-center mr-1">Quick choose:</span>
                  {PRESET_CATEGORIES.slice(0, 5).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      className={`quick-select-chip ${form.category === cat ? "selected" : ""}`}
                      onClick={() => {
                        setField("category", cat);
                        markTouched("category");
                      }}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Store Status */}
              <div className="field">
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="product-status" className="flex items-center gap-1.5 font-semibold text-slate-700">
                    <span>Publishing status</span>
                    <span className="field-badge-optional">Optional</span>
                  </label>
                </div>
                <select
                  id="product-status"
                  value={form.status}
                  onChange={(event) => setField("status", event.target.value as ProductStatus)}
                  className="bg-white"
                >
                  <option value="Active">🟢 Active (Immediately live in patient app)</option>
                  <option value="Draft">🟡 Draft (Saved in catalog, hidden from shop)</option>
                  <option value="Archived">⚪ Archived (Discontinued from new orders)</option>
                </select>
              </div>

              {/* Clinical Concern Tags */}
              <div className="field field-span">
                <div className="flex items-center justify-between mb-1">
                  <span className="flex items-center gap-1.5 font-semibold text-slate-700 text-xs">
                    <span>Clinical concern tags (Patient matching & filters)</span>
                    <span className="field-badge-required">Required *</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">
                    {form.rootCauses.length} concern{form.rootCauses.length === 1 ? "" : "s"} selected
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mb-2">
                  Patients taking the hair assessment will receive recommendations based on these tags:
                </p>

                {/* Preset Concern Chips */}
                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  {allRootCauses.map((tag) => {
                    const isSelected = form.rootCauses.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        className={`quick-select-chip ${isSelected ? "selected" : ""}`}
                        onClick={() => toggleRootCause(tag)}
                      >
                        {isSelected && <Check size={11} className="text-teal-700" />}
                        <span>{tag}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Add Custom Concern Tag */}
                <div className="flex items-center gap-2 max-w-md">
                  <input
                    aria-label="Add a custom concern tag"
                    value={rootCauseDraft}
                    onChange={(event) => setRootCauseDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addRootCause();
                      }
                    }}
                    placeholder="Add custom concern tag (e.g. Scalp Psoriasis)..."
                    className="text-xs"
                  />
                  <button
                    type="button"
                    className="button button-secondary button-small shrink-0"
                    onClick={addRootCause}
                    disabled={!rootCauseDraft.trim()}
                  >
                    <Plus size={13} />
                    <span>Add</span>
                  </button>
                </div>

                {form.rootCauses.length === 0 && hasAttemptedSubmit && (
                  <p className="text-[11px] text-rose-600 mt-2 flex items-center gap-1 font-medium">
                    <AlertTriangle size={12} className="shrink-0" />
                    <span>Please select at least one clinical concern tag for patient matching.</span>
                  </p>
                )}
              </div>

              {/* Product Description */}
              <div className="field field-span">
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="product-description" className="flex items-center gap-1.5 font-semibold text-slate-700">
                    <span>Shop description</span>
                    <span className="field-badge-optional">Optional</span>
                  </label>
                  <span className="text-[10px] text-slate-400">
                    {form.description.length} characters
                  </span>
                </div>
                <textarea
                  id="product-description"
                  className="product-description-input"
                  rows={3}
                  value={form.description}
                  onChange={(event) => setField("description", event.target.value)}
                  placeholder="Describe key benefits, hair formulation, and patient expectations..."
                />
              </div>
            </div>

            {/* Step 1 Footer */}
            <div className="product-step-footer">
              <button
                type="button"
                className="button button-secondary button-small w-full sm:w-auto"
                onClick={handleClose}
              >
                Cancel
              </button>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <span className="w-2 h-2 rounded-full bg-teal-600" />
                <span className="w-2 h-2 rounded-full bg-slate-200" />
                <span className="w-2 h-2 rounded-full bg-slate-200" />
                <span className="w-2 h-2 rounded-full bg-slate-200" />
                <span className="ml-1 text-[11px]">Step 1 of 4</span>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                {product && isStep1Valid && (
                  <button
                    type="button"
                    className="button button-secondary button-small text-teal-700 hover:text-teal-800 border-teal-200 inline-flex items-center justify-center gap-1"
                    onClick={() => void handleSubmit()}
                    disabled={isUploading || isSaving}
                    title="Quick save changes"
                  >
                    {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    <span>Quick save</span>
                  </button>
                )}
                <button
                  type="button"
                  className="button button-primary button-small inline-flex items-center justify-center gap-1.5"
                  onClick={handleNextTab}
                >
                  <span>Continue to Pricing</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: PRICING & SHIPPING */}
        {activeTab === "pricing" && (
          <div className="product-editor-section wizard-step-panel">
            <div className="product-editor-section-head">
              <div>
                <h3 className="flex items-center gap-2">
                  <span>Pricing, inventory & courier parcel</span>
                  {isStep2Valid ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                      <CheckCircle2 size={11} className="text-emerald-600" /> Pricing Configured
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-2 py-0.5">
                      Selling price required
                    </span>
                  )}
                </h3>
                <p>Set selling price, retail MRP, inventory stock, SKU, and parcel measurements for courier quotes.</p>
              </div>
              <span className="product-section-number">02</span>
            </div>

            {/* Live Pricing & Margin Insight Pill */}
            {leadPrice > 0 && (
              <div className="flex flex-wrap items-center gap-3 text-xs bg-gradient-to-r from-teal-50/80 to-slate-50 border border-teal-200/80 rounded-xl p-3 shadow-2xs mb-2">
                <div className="flex items-center gap-1.5 font-bold text-teal-900">
                  <TrendingUp size={15} className="text-teal-600 shrink-0" />
                  <span>Selling Price: ₹{leadPrice}</span>
                </div>
                {discountPercent !== null && discountPercent > 0 && (
                  <span className="inline-flex items-center text-[10px] font-bold text-emerald-800 bg-emerald-100/80 border border-emerald-200 rounded-full px-2.5 py-0.5">
                    {discountPercent}% OFF MRP (₹{savingsAmount} saved per patient)
                  </span>
                )}
                <span className="text-[11px] font-medium text-slate-500 ml-auto">
                  Available Stock: <strong className="text-slate-700">{form.stock} units</strong>
                </span>
              </div>
            )}

            <div className="product-form-grid">
              {/* Selling Price */}
              <div className="field">
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="product-price" className="flex items-center gap-1.5 font-semibold text-slate-700">
                    <span>Selling price (₹)</span>
                    <span className="field-badge-required">Required *</span>
                  </label>
                  {leadPrice > 0 ? (
                    <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                      <Check size={11} /> Valid
                    </span>
                  ) : null}
                </div>
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-slate-400 font-semibold text-xs">₹</span>
                  <input
                    id="product-price"
                    type="number"
                    min="1"
                    value={form.price || ""}
                    onChange={(e) => updatePrimaryPricing("price", e.target.value)}
                    onBlur={() => markTouched("price")}
                    placeholder="499"
                    className={`pl-7 ${(!form.price || Number(form.price) <= 0) && (hasAttemptedSubmit || touchedFields["price"]) ? "border-rose-300 ring-2 ring-rose-100" : ""}`}
                    required
                  />
                </div>
                {(!form.price || Number(form.price) <= 0) && (hasAttemptedSubmit || touchedFields["price"]) ? (
                  <p className="text-[11px] text-rose-600 mt-1 flex items-center gap-1 font-medium">
                    <AlertTriangle size={12} className="shrink-0" />
                    <span>Selling price must be greater than ₹0.</span>
                  </p>
                ) : (
                  <span className="text-[10px] text-slate-400 mt-1">Final amount charged to patient at checkout.</span>
                )}
              </div>

              {/* Retail MRP */}
              <div className="field">
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="product-mrp" className="flex items-center gap-1.5 font-semibold text-slate-700">
                    <span>Retail MRP (₹)</span>
                    <span className="field-badge-optional">Optional</span>
                  </label>
                  {leadMrp > 0 && leadMrp < leadPrice && (
                    <span className="text-[10px] text-amber-600 font-medium">
                      MRP is lower than price
                    </span>
                  )}
                </div>
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-slate-400 font-semibold text-xs">₹</span>
                  <input
                    id="product-mrp"
                    type="number"
                    min="0"
                    value={form.mrp || ""}
                    onChange={(e) => updatePrimaryPricing("mrp", e.target.value)}
                    placeholder="699"
                    className="pl-7"
                  />
                </div>
                <span className="text-[10px] text-slate-400 mt-1">Leave empty to match selling price automatically.</span>
              </div>

              {/* Available Stock */}
              <div className="field">
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="product-stock" className="flex items-center gap-1.5 font-semibold text-slate-700">
                    <span>{product ? "Available stock inventory (units)" : "Initial stock (units)"}</span>
                    <span className="field-badge-required">Required *</span>
                  </label>
                  {product && (
                    <span className="text-[10px] text-teal-600 font-medium">Editable</span>
                  )}
                </div>
                <input
                  id="product-stock"
                  type="number"
                  min="0"
                  step="1"
                  value={form.stock}
                  onChange={(e) => updatePrimaryPricing("stock", e.target.value)}
                  placeholder="100"
                  aria-describedby="product-stock-help"
                  required
                />
                <span id="product-stock-help" className="text-[10px] text-slate-400 mt-1">
                  {product
                    ? "Directly update stock availability count. Saved immediately to catalog."
                    : "Opening inventory available for ordering."}
                </span>
              </div>

              {/* SKU Generator (Locked in edit mode) */}
              <div className="field">
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="product-sku" className="flex items-center gap-1.5 font-semibold text-slate-700">
                    {product && <Lock size={12} className="text-slate-400" />}
                    <span>Product SKU</span>
                    {product ? (
                      <span className="field-badge-optional bg-slate-100 text-slate-600 border border-slate-200">
                        Locked in edit mode
                      </span>
                    ) : (
                      <span className="field-badge-required">Required *</span>
                    )}
                  </label>
                </div>
                <div className="relative flex items-center">
                  <input
                    id="product-sku"
                    value={form.sku}
                    onChange={(e) => !product && updatePrimaryPricing("sku", e.target.value.toUpperCase())}
                    placeholder="DRH-SERUM-01"
                    readOnly={Boolean(product)}
                    disabled={Boolean(product)}
                    className={product ? "bg-slate-100 text-slate-500 font-mono cursor-not-allowed border-slate-200" : "pr-16"}
                    required
                  />
                  {!product && (
                    <button
                      type="button"
                      className="absolute right-1.5 button button-secondary button-small text-[10px] py-1 px-2 h-7 inline-flex items-center gap-1"
                      onClick={generateSkuWithAnimation}
                      title="Generate unique random SKU"
                    >
                      <RefreshCw size={11} className={isGeneratingSku ? "animate-spin text-teal-600" : ""} />
                      <span>Auto</span>
                    </button>
                  )}
                </div>
                <span className="text-[10px] text-slate-400 mt-1">
                  {product
                    ? "Unique stock keeping identifier. Locked to preserve warehouse & order history."
                    : "Unique stock keeping identifier."}
                </span>
              </div>
            </div>

            {/* Parcel & Shipping Dimensions Section */}
            <div className="mt-4 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 m-0 flex items-center gap-1.5">
                    <Boxes size={14} className="text-teal-600" />
                    <span>Packed parcel measurements for courier shipping</span>
                    <span className="field-badge-required">Required for quotes</span>
                  </h4>
                  <p className="text-[11px] text-slate-500 m-0 mt-0.5">
                    Click a 1-click preset or customize weight and box dimensions for Shiprocket courier rates:
                  </p>
                </div>
              </div>

              {/* 1-Click Shipping Presets */}
              <div className="shipping-preset-grid">
                {SHIPPING_PRESETS.map((preset) => {
                  const isMatch = activeShippingPreset === preset.name || (
                    leadPlan.shippingProfile?.weightKg === preset.profile.weightKg &&
                    leadPlan.shippingProfile?.lengthCm === preset.profile.lengthCm &&
                    leadPlan.shippingProfile?.breadthCm === preset.profile.breadthCm &&
                    leadPlan.shippingProfile?.heightCm === preset.profile.heightCm
                  );
                  return (
                    <button
                      key={preset.name}
                      type="button"
                      className={`shipping-preset-btn ${isMatch ? "active" : ""}`}
                      onClick={() => applyShippingPreset(preset)}
                    >
                      <div className="flex items-center justify-between w-full">
                        <strong>{preset.name}</strong>
                        {isMatch && <Check size={12} className="text-teal-600" />}
                      </div>
                      <small>{preset.desc}</small>
                      <span className="text-[10px] text-teal-700 font-semibold mt-1">
                        {preset.profile.weightKg} kg · {preset.profile.lengthCm}×{preset.profile.breadthCm}×{preset.profile.heightCm} cm
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Exact Parcel Dimensions Inputs */}
              {hasAttemptedSubmit && !isStep2Valid && (
                <p id="shipping-dimensions-guidance" role="alert" className="mb-2 text-xs font-semibold text-rose-700">
                  Required to publish: enter a parcel weight, length, breadth, and height, or choose a shipping preset above.
                </p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-slate-50/80 p-3 rounded-xl border border-slate-200/80">
                <div className="field">
                  <label className="text-[10px] font-semibold text-slate-600">Weight (kg) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    aria-invalid={hasAttemptedSubmit && Number(leadPlan.shippingProfile?.weightKg) <= 0}
                    aria-describedby={hasAttemptedSubmit && !isStep2Valid ? "shipping-dimensions-guidance" : undefined}
                    className={hasAttemptedSubmit && Number(leadPlan.shippingProfile?.weightKg) <= 0 ? "border-rose-300 ring-2 ring-rose-100" : ""}
                    value={leadPlan.shippingProfile?.weightKg ?? ""}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      setForm((prev) => ({
                        ...prev,
                        supplyPlans: prev.supplyPlans.map((plan, idx) =>
                          idx === 0
                            ? { ...plan, shippingProfile: { ...plan.shippingProfile, weightKg: val } }
                            : plan
                        ),
                      }));
                    }}
                    required
                  />
                </div>
                <div className="field">
                  <label className="text-[10px] font-semibold text-slate-600">Length (cm) *</label>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    aria-invalid={hasAttemptedSubmit && Number(leadPlan.shippingProfile?.lengthCm) <= 0}
                    aria-describedby={hasAttemptedSubmit && !isStep2Valid ? "shipping-dimensions-guidance" : undefined}
                    className={hasAttemptedSubmit && Number(leadPlan.shippingProfile?.lengthCm) <= 0 ? "border-rose-300 ring-2 ring-rose-100" : ""}
                    value={leadPlan.shippingProfile?.lengthCm ?? ""}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      setForm((prev) => ({
                        ...prev,
                        supplyPlans: prev.supplyPlans.map((plan, idx) =>
                          idx === 0
                            ? { ...plan, shippingProfile: { ...plan.shippingProfile, lengthCm: val } }
                            : plan
                        ),
                      }));
                    }}
                    required
                  />
                </div>
                <div className="field">
                  <label className="text-[10px] font-semibold text-slate-600">Breadth (cm) *</label>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    aria-invalid={hasAttemptedSubmit && Number(leadPlan.shippingProfile?.breadthCm) <= 0}
                    aria-describedby={hasAttemptedSubmit && !isStep2Valid ? "shipping-dimensions-guidance" : undefined}
                    className={hasAttemptedSubmit && Number(leadPlan.shippingProfile?.breadthCm) <= 0 ? "border-rose-300 ring-2 ring-rose-100" : ""}
                    value={leadPlan.shippingProfile?.breadthCm ?? ""}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      setForm((prev) => ({
                        ...prev,
                        supplyPlans: prev.supplyPlans.map((plan, idx) =>
                          idx === 0
                            ? { ...plan, shippingProfile: { ...plan.shippingProfile, breadthCm: val } }
                            : plan
                        ),
                      }));
                    }}
                    required
                  />
                </div>
                <div className="field">
                  <label className="text-[10px] font-semibold text-slate-600">Height (cm) *</label>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    aria-invalid={hasAttemptedSubmit && Number(leadPlan.shippingProfile?.heightCm) <= 0}
                    aria-describedby={hasAttemptedSubmit && !isStep2Valid ? "shipping-dimensions-guidance" : undefined}
                    className={hasAttemptedSubmit && Number(leadPlan.shippingProfile?.heightCm) <= 0 ? "border-rose-300 ring-2 ring-rose-100" : ""}
                    value={leadPlan.shippingProfile?.heightCm ?? ""}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      setForm((prev) => ({
                        ...prev,
                        supplyPlans: prev.supplyPlans.map((plan, idx) =>
                          idx === 0
                            ? { ...plan, shippingProfile: { ...plan.shippingProfile, heightCm: val } }
                            : plan
                        ),
                      }));
                    }}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Optional Multi-Month Supply Plans Toggle */}
            <div className="mt-4 pt-3 border-t border-slate-100">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-800 transition-colors"
                onClick={() => setShowAdvancedPlans(!showAdvancedPlans)}
              >
                <PackagePlus size={14} />
                <span>{showAdvancedPlans ? "Hide additional supply plans" : "Add multi-month supply bundle plans (e.g. 3-Month Kit)"}</span>
              </button>

              {showAdvancedPlans && (
                <div className="mt-3 space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-500 m-0">
                      Offer patients duration discounts (e.g. 3-month course pack with a &quot;Recommended&quot; badge).
                    </p>
                    <button
                      type="button"
                      className="button button-secondary button-small"
                      onClick={() =>
                        setField("supplyPlans", [
                          ...form.supplyPlans,
                          newPlan({
                            title: `${form.supplyPlans.length + 1} Month Supply`,
                            price: Math.round(leadPrice * 0.9 * (form.supplyPlans.length + 1)),
                            mrp: Math.round((leadMrp || leadPrice) * (form.supplyPlans.length + 1)),
                          }),
                        ])
                      }
                    >
                      <Plus size={13} />
                      <span>Add bundle plan</span>
                    </button>
                  </div>

                  <div className="supply-plan-list">
                    {form.supplyPlans.map((plan, index) => (
                      <article className="supply-plan-card" key={plan.id}>
                        <div className="supply-plan-heading">
                          <span className="plan-index">Plan {String(index + 1).padStart(2, "0")} · {index === 0 ? "Default Plan" : "Bundle Option"}</span>
                          {form.supplyPlans.length > 1 && (
                            <button
                              type="button"
                              className="row-action danger-action"
                              aria-label={`Remove ${plan.title}`}
                              onClick={() =>
                                setField(
                                  "supplyPlans",
                                  form.supplyPlans.filter((_, planIndex) => planIndex !== index)
                                )
                              }
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                        <div className="product-form-grid">
                          <div className="field">
                            <label>Plan title *</label>
                            <input
                              value={plan.title}
                              onChange={(e) => updatePlan(index, "title", e.target.value)}
                              placeholder="3 Month Supply"
                              required
                            />
                          </div>
                          <div className="field">
                            <label>Subtitle or highlight</label>
                            <input
                              value={plan.subtitle}
                              onChange={(e) => updatePlan(index, "subtitle", e.target.value)}
                              placeholder="Free Scalp Roller included"
                            />
                          </div>
                          <div className="field">
                            <label>SKU *</label>
                            <input
                              value={plan.sku}
                              onChange={(e) => updatePlan(index, "sku", e.target.value.toUpperCase())}
                              placeholder="DRH-SER-3M"
                              required
                            />
                          </div>
                          <div className="field">
                            <label>Badge pill</label>
                            <input
                              value={plan.badge}
                              onChange={(e) => updatePlan(index, "badge", e.target.value)}
                              placeholder="Most Popular"
                            />
                          </div>
                          <div className="field">
                            <label>Selling price (₹) *</label>
                            <input
                              type="number"
                              min="1"
                              value={plan.price || ""}
                              onChange={(e) => updatePlan(index, "price", e.target.value)}
                              required
                            />
                          </div>
                          <div className="field">
                            <label>MRP (₹)</label>
                            <input
                              type="number"
                              min="0"
                              value={plan.mrp || ""}
                              onChange={(e) => updatePlan(index, "mrp", e.target.value)}
                            />
                          </div>
                        </div>
                        {index > 0 && (
                          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <p className="mb-2 text-[10px] font-semibold text-slate-600">Confirmed parcel dimensions for this bundle</p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              {([
                                ["weightKg", "Weight (kg)"],
                                ["lengthCm", "Length (cm)"],
                                ["breadthCm", "Breadth (cm)"],
                                ["heightCm", "Height (cm)"],
                              ] as const).map(([field, label]) => (
                                <label key={field} className="field text-[10px]">
                                  {label} *
                                  <input
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    value={plan.shippingProfile?.[field] ?? ""}
                                    onChange={(event) => updatePlanShippingProfile(index, field, event.target.value)}
                                    required
                                  />
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Step 2 Footer */}
            <div className="product-step-footer">
              <button
                type="button"
                className="button button-secondary button-small inline-flex items-center justify-center gap-1.5 w-full sm:w-auto"
                onClick={() => setActiveTab("general")}
              >
                <ChevronLeft size={13} />
                <span>Back to Basics</span>
              </button>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="w-2 h-2 rounded-full bg-teal-600" />
                <span className="w-2 h-2 rounded-full bg-slate-200" />
                <span className="w-2 h-2 rounded-full bg-slate-200" />
                <span className="ml-1 text-[11px]">Step 2 of 4</span>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                {product && isStep1Valid && isStep2Valid && (
                  <button
                    type="button"
                    className="button button-secondary button-small text-teal-700 hover:text-teal-800 border-teal-200 inline-flex items-center justify-center gap-1"
                    onClick={() => void handleSubmit()}
                    disabled={isUploading || isSaving}
                    title="Quick save changes"
                  >
                    {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    <span>Quick save</span>
                  </button>
                )}
                <button
                  type="button"
                  className="button button-primary button-small inline-flex items-center justify-center gap-1.5"
                  onClick={handleNextTab}
                >
                  <span>Continue to Media</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: MEDIA (CLOUDFLARE R2) */}
        {activeTab === "media" && (
          <div className="product-editor-section wizard-step-panel">
            <div className="product-editor-section-head">
              <div>
                <h3 className="flex items-center gap-2">
                  <span>Product photos & mobile gallery</span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-teal-800 bg-teal-50 border border-teal-200 rounded-full px-2 py-0.5">
                    Cloudflare R2 High-Speed Storage
                  </span>
                </h3>
                <p>Choose JPG, PNG, WebP, GIF, AVIF, HEIC, or HEIF images up to 25 MB. Changes upload together when you save; removing a saved photo takes effect on save.</p>
              </div>
              <span className="product-section-number">03</span>
            </div>

            {isUploading && (
              <div className="flex items-center gap-2.5 rounded-xl border border-teal-200 bg-teal-50/90 px-3.5 py-2.5 text-xs text-teal-800 shadow-sm animate-pulse mb-3">
                <Loader2 size={16} className="animate-spin text-teal-600 shrink-0" />
                <span className="font-semibold">
                  Preparing {uploadingCount} image{uploadingCount > 1 ? "s" : ""} locally...
                </span>
              </div>
            )}

            {/* Interactive Drag & Drop Area */}
            <div className="mb-3">
              <div
                className={`media-dropzone ${isDraggingOver ? "is-dragging" : ""}`}
                onDragOver={handleDragOver}
                onDragEnter={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={pickMedia}
                  className="hidden"
                />
                <span className="media-drop-icon">
                  <UploadCloud size={20} />
                </span>
                <div>
                  <strong>{isDraggingOver ? "Drop product images here" : "Upload product photos from device"}</strong>
                  <small>Drag & drop or browse JPG, PNG, WebP, GIF, AVIF, HEIC, or HEIF photos (up to 25 MB each). Images are optimized on this device when supported.</small>
                </div>
                <button
                  type="button"
                  className="button button-secondary button-small shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                >
                  Browse photos
                </button>
              </div>
            </div>

            {/* Media Manager Gallery List */}
            <div className="product-media-manager">
              {form.media.map((media, index) => {
                const meta = (media.localId ? uploadMeta[media.localId] : undefined) || uploadMeta[media.name] || (media.url ? uploadMeta[media.url] : undefined);
                const isTemp = Boolean(media.localId) || media.name.startsWith("temp-") || (media.url && media.url.startsWith("blob:"));
                const status: UploadStatus = meta?.status || (isTemp ? "uploading" : "ready");
                const displayUrl =
                  (media.url && (media.url.startsWith("http") || media.url.startsWith("blob:"))
                    ? media.url
                    : media.name && (media.name.startsWith("http") || media.name.startsWith("blob:"))
                    ? media.name
                    : null) ||
                  previews.find((item) => item.name === media.name || item.url === media.url)?.url;
                const Icon = media.kind === "video" ? Video : Package;
                const isR2 = displayUrl?.includes("/api/v1/media/assets/drhair/images/");

                return (
                  <div
                    className={`product-media-row ${status === "uploading" ? "is-uploading" : status === "error" ? "is-error" : ""}`}
                    key={`${media.name}-${index}`}
                  >
                    {/* Thumbnail with full-size viewer */}
                    <button
                      type="button"
                      className="product-media-thumb"
                      aria-label={`View ${media.name} full size`}
                      disabled={media.kind !== "image" || !displayUrl}
                      onClick={() =>
                        displayUrl &&
                        setImageToView({
                          src: displayUrl,
                          alt: media.altText || media.name,
                          fileName: media.name,
                          caption: "Product image preview",
                        })
                      }
                      title="Click to view full size"
                    >
                      {displayUrl && media.kind === "image" ? (
                        <img src={displayUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Icon size={15} />
                      )}
                    </button>

                    {/* Meta info & badges */}
                    <span className="product-media-name" title={media.url || media.name}>
                      <span className="flex items-center gap-1.5 font-medium truncate">
                        {media.isPrimary && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 shadow-2xs">
                            <Star size={10} className="fill-amber-500 text-amber-500" /> Primary Cover
                          </span>
                        )}
                        {status === "uploading" ? (
                          <span className="inline-flex items-center gap-1 text-[8px] font-semibold text-teal-800 bg-teal-100/80 rounded px-1.5 py-0.5">
                            <Loader2 size={9} className="animate-spin text-teal-600" /> {meta?.progress == null ? "Preparing…" : `Uploading ${meta.progress}%`}
                          </span>
                        ) : status === "error" ? (
                          <span className="inline-flex items-center gap-1 text-[8px] font-bold text-rose-700 bg-rose-100 rounded px-1.5 py-0.5">
                            <AlertTriangle size={9} className="text-rose-600" /> Upload failed
                          </span>
                        ) : isR2 ? (
                          <span className="inline-flex items-center text-[8px] font-bold text-emerald-800 bg-emerald-100 rounded px-1.5 py-0.5">
                            Cloudflare R2
                          </span>
                        ) : null}
                        <span className="truncate">{media.name}</span>
                      </span>
                      <small>
                        {media.kind} ·{" "}
                        {status === "uploading"
                          ? "Uploading to Cloudflare R2..."
                          : status === "error"
                          ? meta?.error || "Error uploading"
                          : media.localId
                          ? "Ready to upload with product save"
                          : displayUrl
                          ? "Ready for app"
                          : "Local"}
                      </small>
                    </span>

                    {/* Alt Text Input */}
                    <input
                      aria-label={`Alt text for ${media.name}`}
                      value={media.altText ?? ""}
                      onChange={(event) => updateMedia(index, { altText: event.target.value })}
                      placeholder="Alt caption (e.g. Front bottle view)"
                    />

                    {/* Primary Star Action */}
                    <button
                      type="button"
                      className={`row-action ${media.isPrimary ? "primary-media-selected" : ""}`}
                      aria-label={media.isPrimary ? "Primary cover image" : `Set as primary cover`}
                      onClick={() =>
                        setField(
                          "media",
                          form.media.map((item, mediaIndex) => ({
                            ...item,
                            isPrimary: mediaIndex === index && item.kind === "image",
                          }))
                        )
                      }
                      disabled={media.kind !== "image"}
                      title={media.isPrimary ? "Primary cover image (Shown first in app)" : "Set as primary cover"}
                    >
                      <Star size={14} className={media.isPrimary ? "fill-amber-500 text-amber-500" : ""} />
                    </button>

                    {/* Move Up */}
                    <button
                      type="button"
                      className="row-action"
                      aria-label={`Move ${media.name} up`}
                      disabled={index === 0}
                      onClick={() => moveMedia(index, -1)}
                      title="Move up"
                    >
                      <ArrowUp size={14} />
                    </button>

                    {/* Move Down */}
                    <button
                      type="button"
                      className="row-action"
                      aria-label={`Move ${media.name} down`}
                      disabled={index === form.media.length - 1}
                      onClick={() => moveMedia(index, 1)}
                      title="Move down"
                    >
                      <ArrowDown size={14} />
                    </button>

                    {/* Retry (if error) or Remove */}
                    {status === "error" ? (
                      <button
                        type="button"
                        className="row-action"
                        aria-label={`Retry uploading ${media.name}`}
                        onClick={() => retryUpload(media.localId || media.name)}
                        title="Retry upload"
                      >
                        <RotateCcw size={14} className="text-teal-600" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="row-action danger-action"
                        aria-label={`Remove ${media.name}`}
                        onClick={() => removeMedia(index)}
                        disabled={status === "uploading"}
                        title="Remove"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                );
              })}

              {form.media.length === 0 && (
                <div className="product-media-empty">
                  <ImagePlus size={26} className="mx-auto mb-2 text-slate-300" />
                  <p className="text-xs font-semibold text-slate-700 m-0">No medicine photos uploaded yet.</p>
                  <p className="text-[11px] text-slate-400 mt-1 mb-0">Drag and drop photos above or browse from your computer.</p>
                </div>
              )}
            </div>

            {/* Step 3 Footer */}
            <div className="product-step-footer">
              <button
                type="button"
                className="button button-secondary button-small inline-flex items-center justify-center gap-1.5 w-full sm:w-auto"
                onClick={() => setActiveTab("pricing")}
              >
                <ChevronLeft size={13} />
                <span>Back to Pricing</span>
              </button>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="w-2 h-2 rounded-full bg-teal-600" />
                <span className="w-2 h-2 rounded-full bg-slate-200" />
                <span className="ml-1 text-[11px]">Step 3 of 4</span>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                {isStep1Valid && isStep2Valid && (
                  <button
                    type="button"
                    className="button button-secondary button-small text-teal-700 hover:text-teal-800 border-teal-200 inline-flex items-center justify-center gap-1"
                    onClick={() => void handleSubmit()}
                    disabled={isUploading || isSaving}
                    title="Publish directly"
                  >
                    {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    <span>{product ? "Save now" : "Publish now"}</span>
                  </button>
                )}
                <button
                  type="button"
                  className="button button-primary button-small inline-flex items-center justify-center gap-1.5"
                  onClick={handleNextTab}
                >
                  <span>Continue to Clinical</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: CLINICAL DETAILS & USAGE (VISUAL CARD BUILDERS) */}
        {activeTab === "clinical" && (
          <div className="product-editor-section wizard-step-panel">
            <div className="product-editor-section-head">
              <div>
                <h3 className="flex items-center gap-2">
                  <span>Product clinical details & usage guidelines</span>
                  <span className="field-badge-optional">Optional enhancements</span>
                </h3>
                <p>Add scientific benefits, key ingredients, usage instructions, and clinical claims displayed to patients in the app.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="button button-secondary button-small text-[10px]"
                  onClick={() => setRawTextMode(!rawTextMode)}
                >
                  <Sliders size={12} />
                  <span>{rawTextMode ? "Switch to Visual Card Builder" : "Switch to Raw Text Mode"}</span>
                </button>
                <span className="product-section-number">04</span>
              </div>
            </div>

            {!rawTextMode ? (
              <div className="space-y-5">
                {/* 1. Benefits Builder */}
                <div className="border border-slate-200/90 rounded-xl p-3.5 bg-slate-50/50">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 m-0 flex items-center gap-1.5">
                        <Sparkles size={14} className="text-teal-600" />
                        <span>Key Clinical Benefits ({form.benefits?.length || 0})</span>
                      </h4>
                      <p className="text-[11px] text-slate-500 m-0">Highlights shown in bullet points on the patient product screen.</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        className="button button-secondary button-small text-[10px] py-1 px-2"
                        onClick={() => addBenefitItem()}
                      >
                        <Plus size={11} />
                        <span>Add Benefit</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {(form.benefits || []).map((benefit, index) => (
                      <div key={index} className="clinical-builder-card">
                        <div className="flex items-center gap-2">
                          <input
                            value={benefit.title}
                            onChange={(e) => updateBenefitItem(index, "title", e.target.value)}
                            placeholder="Benefit title from approved product information"
                            className="text-xs font-semibold flex-1"
                          />
                          <button
                            type="button"
                            className="row-action danger-action"
                            onClick={() => removeBenefitItem(index)}
                            aria-label={`Remove benefit ${index + 1}`}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <input
                          value={benefit.description}
                          onChange={(e) => updateBenefitItem(index, "description", e.target.value)}
                          placeholder="Benefit wording supported by approved product information"
                          className="text-xs text-slate-600"
                        />
                      </div>
                    ))}

                    {(!form.benefits || form.benefits.length === 0) && (
                      <p className="text-xs text-slate-400 italic text-center py-2 m-0">
                        No benefits added yet. Add only product benefits supported by approved product information.
                      </p>
                    )}
                  </div>
                </div>

                {/* 2. Key Ingredients Builder */}
                <div className="border border-slate-200/90 rounded-xl p-3.5 bg-slate-50/50">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 m-0 flex items-center gap-1.5">
                        <BadgeCheck size={14} className="text-teal-600" />
                        <span>Active Ingredients ({form.ingredients?.length || 0})</span>
                      </h4>
                      <p className="text-[11px] text-slate-500 m-0">Active compounds, concentrations, and mechanisms of action.</p>
                    </div>
                    <button
                      type="button"
                      className="button button-secondary button-small text-[10px] py-1 px-2"
                      onClick={() => addIngredientItem()}
                    >
                      <Plus size={11} />
                      <span>Add Ingredient</span>
                    </button>
                  </div>

                  {/* 1-Click Common Ingredient Chips */}
                  <div className="flex flex-wrap gap-1.5 mb-2.5">
                    <span className="text-[10px] text-slate-400 font-medium self-center mr-1">Quick add:</span>
                    {INGREDIENT_SUGGESTIONS.map((ing) => (
                      <button
                        key={ing.name}
                        type="button"
                        className="quick-select-chip text-[10px] py-0.5 px-2"
                        onClick={() => {
                          if (!(form.ingredients || []).some((item) => item.name.toLowerCase() === ing.name.toLowerCase())) {
                            addIngredientItem(ing);
                          }
                        }}
                      >
                        <Plus size={10} className="text-teal-600" />
                        <span>{ing.name}</span>
                      </button>
                    ))}
                  </div>

                  <div className="space-y-2">
                    {(form.ingredients || []).map((ing, index) => (
                      <div key={index} className="clinical-builder-card">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
                          <input
                            value={ing.name}
                            onChange={(e) => updateIngredientItem(index, "name", e.target.value)}
                            placeholder="Ingredient name (e.g. Redensyl)"
                            className="text-xs font-semibold"
                          />
                          <input
                            value={ing.concentration}
                            onChange={(e) => updateIngredientItem(index, "concentration", e.target.value)}
                            placeholder="Concentration (e.g. 3%)"
                            className="text-xs"
                          />
                          <div className="flex items-center gap-2">
                            <input
                              value={ing.purpose}
                              onChange={(e) => updateIngredientItem(index, "purpose", e.target.value)}
                              placeholder="Purpose from approved product information"
                              className="text-xs flex-1"
                            />
                            <button
                              type="button"
                              className="row-action danger-action shrink-0"
                              onClick={() => removeIngredientItem(index)}
                              aria-label={`Remove ingredient ${index + 1}`}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}

                    {(!form.ingredients || form.ingredients.length === 0) && (
                      <p className="text-xs text-slate-400 italic text-center py-2 m-0">
                        No active ingredients added yet. Click &quot;Add Ingredient&quot; or choose from quick chips above.
                      </p>
                    )}
                  </div>
                </div>

                {/* 3. Usage Steps Builder */}
                <div className="border border-slate-200/90 rounded-xl p-3.5 bg-slate-50/50">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 m-0 flex items-center gap-1.5">
                        <Info size={14} className="text-teal-600" />
                        <span>How to Use / Patient Instructions ({form.usageSteps?.length || 0})</span>
                      </h4>
                      <p className="text-[11px] text-slate-500 m-0">Use instructions exactly as stated on the approved product label.</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        className="button button-secondary button-small text-[10px] py-1 px-2"
                        onClick={() => addUsageStepItem()}
                      >
                        <Plus size={11} />
                        <span>Add Step</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {(form.usageSteps || []).map((step, index) => (
                      <div key={index} className="clinical-builder-card">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-teal-800 bg-teal-100 rounded px-1.5 py-0.5 shrink-0">
                            Step {index + 1}
                          </span>
                          <input
                            value={step.title}
                            onChange={(e) => updateUsageStepItem(index, "title", e.target.value)}
                            placeholder="Step title from the approved product label"
                            className="text-xs font-semibold flex-1"
                          />
                          <button
                            type="button"
                            className="row-action danger-action"
                            onClick={() => removeUsageStepItem(index)}
                            aria-label={`Remove step ${index + 1}`}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <input
                          value={step.description}
                          onChange={(e) => updateUsageStepItem(index, "description", e.target.value)}
                          placeholder="Instruction exactly as stated on the approved product label"
                          className="text-xs text-slate-600"
                        />
                      </div>
                    ))}

                    {(!form.usageSteps || form.usageSteps.length === 0) && (
                      <p className="text-xs text-slate-400 italic text-center py-2 m-0">
                        No usage steps configured yet.
                      </p>
                    )}
                  </div>
                </div>

                {/* 4. Clinical Claims & Evidence */}
                <div className="border border-slate-200/90 rounded-xl p-3.5 bg-slate-50/50">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 m-0 flex items-center gap-1.5">
                        <TrendingUp size={14} className="text-teal-600" />
                        <span>Clinical Trial Claims & Metrics ({form.clinicalClaims?.length || 0})</span>
                      </h4>
                      <p className="text-[11px] text-slate-500 m-0">Enter claims only when supported by a verified source; the source is required for review.</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        className="button button-secondary button-small text-[10px] py-1 px-2"
                        onClick={() => addClinicalClaimItem()}
                      >
                        <Plus size={11} />
                        <span>Add Claim</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {(form.clinicalClaims || []).map((claim, index) => (
                      <div key={index} className="clinical-builder-card">
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
                          <input
                            value={claim.percentage}
                            onChange={(e) => updateClinicalClaimItem(index, "percentage", e.target.value)}
                            placeholder="Verified metric, if applicable"
                            className="text-xs font-bold text-teal-700"
                          />
                          <input
                            value={claim.claim}
                            onChange={(e) => updateClinicalClaimItem(index, "claim", e.target.value)}
                            placeholder="Claim exactly as stated by the source"
                            className="text-xs sm:col-span-2 font-medium"
                          />
                          <div className="flex items-center gap-2">
                            <input
                              value={claim.source}
                              onChange={(e) => updateClinicalClaimItem(index, "source", e.target.value)}
                              placeholder="Publication, study, or approved evidence reference"
                              className="text-xs flex-1 text-slate-500"
                            />
                            <button
                              type="button"
                              className="row-action danger-action shrink-0"
                              onClick={() => removeClinicalClaimItem(index)}
                              aria-label={`Remove claim ${index + 1}`}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}

                    {(!form.clinicalClaims || form.clinicalClaims.length === 0) && (
                      <p className="text-xs text-slate-400 italic text-center py-2 m-0">
                        No clinical metrics added yet.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* Raw Pipe-Delimited Mode for Bulk Editors */
              <div className="product-content-grid">
                <div className="field">
                  <label htmlFor="product-benefits">Benefits · title | description</label>
                  <textarea
                    id="product-benefits"
                    className="product-description-input"
                    value={form.benefitsText}
                    onChange={(event) => {
                      setField("benefitsText", event.target.value);
                      const parsed = parseLines(event.target.value, 2).map(([title, description]) => ({ title, description }));
                      setField("benefits", parsed);
                    }}
                    placeholder={"[benefit from approved product information] | [description supported by approved product information]"}
                  />
                </div>
                <div className="field">
                  <label htmlFor="product-ingredients">Ingredients · name | concentration | purpose</label>
                  <textarea
                    id="product-ingredients"
                    className="product-description-input"
                    value={form.ingredientsText}
                    onChange={(event) => {
                      setField("ingredientsText", event.target.value);
                      const parsed = parseLines(event.target.value, 3).map(([name, concentration, purpose]) => ({ name, concentration, purpose }));
                      setField("ingredients", parsed);
                    }}
                    placeholder={"[ingredient name] | [label concentration] | [approved purpose]"}
                  />
                </div>
                <div className="field">
                  <label htmlFor="product-usage">How to use · title | instructions</label>
                  <textarea
                    id="product-usage"
                    className="product-description-input"
                    value={form.usageStepsText}
                    onChange={(event) => {
                      setField("usageStepsText", event.target.value);
                      const parsed = parseLines(event.target.value, 2).map(([title, description]) => ({ title, description }));
                      setField("usageSteps", parsed);
                    }}
                    placeholder={"[step title from approved label] | [instruction exactly as stated on approved label]"}
                  />
                </div>
                <div className="field">
                  <label htmlFor="product-claims">Clinical claims · % | claim | source</label>
                  <textarea
                    id="product-claims"
                    className="product-description-input"
                    value={form.clinicalClaimsText}
                    onChange={(event) => {
                      setField("clinicalClaimsText", event.target.value);
                      const parsed = parseLines(event.target.value, 3).map(([percentage, claim, source]) => ({ percentage, claim, source }));
                      setField("clinicalClaims", parsed);
                    }}
                    placeholder={"[verified metric] | [claim exactly as supported] | [source reference]"}
                  />
                </div>
              </div>
            )}

            {/* Step 4 Footer */}
            <div className="product-step-footer">
              <button
                type="button"
                className="button button-secondary button-small inline-flex items-center justify-center gap-1.5 w-full sm:w-auto"
                onClick={() => setActiveTab("media")}
              >
                <ChevronLeft size={13} />
                <span>Back to Media</span>
              </button>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="w-2 h-2 rounded-full bg-teal-600" />
                <span className="ml-1 text-[11px]">Step 4 of 4</span>
              </div>
              {isUploading && (
                <span className="text-[11px] text-teal-700" role="status" aria-live="polite">
                  Preparing images before upload…
                </span>
              )}
              <button
                type="button"
                className="button button-primary button-small inline-flex items-center justify-center gap-1.5 w-full sm:w-auto"
                onClick={() => void handleSubmit()}
                disabled={isUploading || isSaving}
                aria-busy={isSaving}
                title={isUploading ? "Wait for image preparation to finish before publishing." : undefined}
              >
                {isSaving ? <Loader2 size={13} className="animate-spin text-white" /> : <Check size={13} />}
                <span>{isSaving ? (product ? "Saving product…" : "Publishing product…") : product ? "Save product changes" : "Publish product to catalog"}</span>
              </button>
            </div>
          </div>
        )}
      </Modal>

      <FullSizeImageViewer image={imageToView} onClose={() => setImageToView(null)} />
    </>
  );
}

function ProductDetails({
  product,
  onClose,
  onEdit,
  onAdjustStock,
  onDelete,
}: {
  product: ProductRecord;
  onClose: () => void;
  onEdit: () => void;
  onAdjustStock: () => void;
  onDelete: () => void;
}) {
  const plans = getPlans(product);
  const [ledgerMovements, setLedgerMovements] = useState<StockMovement[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [ledgerError, setLedgerError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return;
      setLedgerLoading(true);
      setLedgerError("");
      return fetch(`/api/admin/products/${encodeURIComponent(product.id)}/inventory?limit=5`, {
        cache: "no-store",
        signal: controller.signal,
      }).then(async (response) => {
        const value = await response.json().catch(() => null) as { message?: string; data?: { items?: unknown } } | null;
        if (!response.ok) throw new Error(value?.message || "Inventory history could not be loaded.");
        const items = value?.data?.items;
        if (!Array.isArray(items)) throw new Error("Inventory history service returned an invalid response.");
        if (controller.signal.aborted) return;
        setLedgerMovements(items.map((item, index) => {
          const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
          return {
            id: String(row.id || `${product.id}-movement-${index}`),
            productId: product.id,
            variantId: "product",
            variantTitle: "Product inventory",
            quantityChange: Number(row.quantity ?? 0),
            reason: String(row.notes || row.reference_type || "Inventory adjustment"),
            createdAt: String(row.created_at || ""),
          };
        }));
      }).catch((error: unknown) => {
        if (!controller.signal.aborted) setLedgerError(error instanceof Error ? error.message : "Inventory history could not be loaded.");
      }).finally(() => {
        if (!controller.signal.aborted) setLedgerLoading(false);
      });
    });
    return () => controller.abort();
  }, [product.id, product.stock]);

  return (
    <Modal
      className="product-details-modal"
      title={product.name}
      description={`${product.id} · ${product.category} · ${(product.rootCauses ?? []).join(", ") || "General"}`}
      submitLabel="Edit product"
      onClose={onClose}
      onSubmit={onEdit}
    >
      <div className="product-detail-toolbar">
        <StatusPill status={product.status} />
        <div className="flex items-center gap-2">
          <button className="button button-secondary button-small" onClick={onAdjustStock}>
            <PackagePlus size={13} />
            Adjust stock
          </button>
          <button className="button button-secondary button-small" onClick={onEdit}>
            <Pencil size={13} />
            Edit listing
          </button>
          <button className="button button-danger button-small" onClick={onDelete}>
            <Trash2 size={13} />
            Delete
          </button>
        </div>
      </div>
      <p className="product-detail-copy">{product.description || "No product description added yet."}</p>
      <section className="product-detail-section">
        <h3>Supply plan pricing</h3>
        {plans.map((plan) => (
          <div className="product-plan-detail" key={plan.id}>
            <span>
              <strong>{plan.title}</strong>
              <small>
                {plan.subtitle} · {plan.sku}
              </small>
            </span>
            <span>
              <strong>{formatCurrency(plan.price)}</strong>
              <small>MRP {plan.mrp ? formatCurrency(plan.mrp) : "—"}</small>
            </span>
                          <span>
                            <strong>{plan.shippingProfile?.weightKg ? `${plan.shippingProfile.weightKg} kg` : "Parcel setup needed"}</strong>
                            <small>{plan.shippingProfile?.lengthCm && plan.shippingProfile?.breadthCm && plan.shippingProfile?.heightCm
                              ? `${plan.shippingProfile.lengthCm} × ${plan.shippingProfile.breadthCm} × ${plan.shippingProfile.heightCm} cm`
                              : "Set dimensions before shipping"}</small>
                          </span>
          </div>
        ))}
      </section>
      <section className="product-detail-section">
        <h3>Product inventory</h3>
        <strong className={productStock(product) <= 10 ? "stock-low" : ""}>{productStock(product)} units</strong>
        <p className="card-note">Inventory is managed for the catalog product and shared across its supply plans.</p>
      </section>
      {product.benefits?.length ||
      product.ingredients?.length ||
      product.usageSteps?.length ||
      product.clinicalClaims?.length ? (
        <section className="product-detail-section product-app-detail-grid">
          {product.benefits?.length ? (
            <DetailList
              title="Benefits"
              items={product.benefits.map((item) => `${item.title} — ${item.description}`)}
            />
          ) : null}
          {product.ingredients?.length ? (
            <DetailList
              title="Ingredients"
              items={product.ingredients.map((item) => `${item.name} · ${item.concentration} · ${item.purpose}`)}
            />
          ) : null}
          {product.usageSteps?.length ? (
            <DetailList
              title="Usage"
              items={product.usageSteps.map((item) => `${item.title} — ${item.description}`)}
            />
          ) : null}
          {product.clinicalClaims?.length ? (
            <DetailList
              title="Claims & sources"
              items={product.clinicalClaims.map(
                (item) => `${item.percentage ? `${item.percentage} · ` : ""}${item.claim} — ${item.source}`
              )}
            />
          ) : null}
        </section>
      ) : null}
      <section className="product-detail-section">
        <h3>Media gallery · {product.media?.length ?? 0}</h3>
        <div className="flex flex-wrap gap-2.5">
          {(product.media || []).map((media, index) => {
            const displayUrl =
              media.url && media.url.startsWith("http")
                ? media.url
                : media.name && media.name.startsWith("http")
                ? media.name
                : null;
            return (
              <div
                key={`${media.name}-${index}`}
                className="flex items-center gap-2 border border-slate-200 rounded-lg p-1.5 bg-slate-50 text-xs"
              >
                {displayUrl && media.kind === "image" ? (
                  <img src={displayUrl} alt="" className="w-8 h-8 rounded object-cover" />
                ) : media.kind === "video" ? (
                  <Video size={16} className="text-slate-500 ml-1" />
                ) : (
                  <Package size={16} className="text-slate-500 ml-1" />
                )}
                <span className="max-w-[120px] truncate text-[11px] font-medium">{media.altText || media.name}</span>
                {media.isPrimary && (
                  <span className="text-[9px] bg-amber-100 text-amber-800 font-semibold px-1 rounded">Primary Cover</span>
                )}
              </div>
            );
          })}
        </div>
      </section>
      <section className="product-detail-section">
        <h3>Recent inventory changes</h3>
        {ledgerLoading ? <p className="card-note">Loading inventory history…</p> : ledgerError ? (
          <p className="card-note">{ledgerError}</p>
        ) : ledgerMovements.length ? (
          <div className="stock-movement-list">
            {ledgerMovements.slice(0, 5).map((movement) => (
              <div key={movement.id}>
                <span>
                  <strong>{movement.variantTitle}</strong>
                  <small>
                    {movement.reason} · {new Date(movement.createdAt).toLocaleString()}
                  </small>
                </span>
                <strong className={movement.quantityChange > 0 ? "stock-increase" : "stock-decrease"}>
                  {movement.quantityChange > 0 ? "+" : ""}
                  {movement.quantityChange}
                </strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="card-note">No inventory movements recorded yet.</p>
        )}
      </section>
      <section className="product-detail-section product-performance-detail">
        <h3>Sales performance</h3>
        <div className="product-detail-grid">
          <DetailItem label="Units sold" value={product.unitsSold.toLocaleString("en-IN")} />
          <DetailItem label="Net sales" value={formatCurrency(product.revenue)} />
          <DetailItem label="Last updated" value={product.updated} />
        </div>
      </section>
    </Modal>
  );
}

function StockAdjustmentDialog({
  product,
  onClose,
  onSave,
}: {
  product: ProductRecord;
  onClose: () => void;
  onSave: (delta: number, reason: string, idempotencyKey: string) => Promise<boolean>;
}) {
  const [quantity, setQuantity] = useState("1");
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [reason, setReason] = useState("Stock received");
  const [saving, setSaving] = useState(false);
  const [submissionError, setSubmissionError] = useState("");
  const idempotencyKeyRef = useRef<string | null>(null);
  const delta = (direction === "add" ? 1 : -1) * Math.abs(Math.floor(Number(quantity)) || 0);

  return (
    <Modal
      title="Adjust inventory"
      description={`${product.name} · Changes are recorded in stock history and synced to the database.`}
      submitLabel="Save adjustment"
      submitLoading={saving}
      submitDisabled={!Number.isSafeInteger(delta) || delta === 0 || saving}
      onClose={onClose}
      onSubmit={() => {
        setSaving(true);
        try {
          idempotencyKeyRef.current ??= createInventoryIdempotencyKey();
          setSubmissionError("");
          void onSave(delta, reason, idempotencyKeyRef.current).finally(() => setSaving(false));
        } catch (error) {
          setSubmissionError(error instanceof Error ? error.message : "Could not securely prepare this inventory request.");
          setSaving(false);
        }
      }}
    >
      <div className="form-grid-two">
        <div className="field">
          <label htmlFor="stock-direction">Adjustment</label>
          <select
            id="stock-direction"
            value={direction}
            onChange={(event) => {
              idempotencyKeyRef.current = null;
              setDirection(event.target.value as "add" | "remove");
            }}
          >
            <option value="add">Receive stock</option>
            <option value="remove">Remove stock</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="stock-quantity">Units</label>
          <input
            id="stock-quantity"
            type="number"
            min="1"
            step="1"
            value={quantity}
            onChange={(event) => {
              idempotencyKeyRef.current = null;
              setQuantity(event.target.value);
            }}
          />
        </div>
        <div className="field field-span">
          <label htmlFor="stock-reason">Reason</label>
          <select id="stock-reason" value={reason} onChange={(event) => {
            idempotencyKeyRef.current = null;
            setReason(event.target.value);
          }}>
            {["Stock received", "Damaged or expired", "Manual count correction", "Return restocked", "Other"].map(
              (item) => (
                <option key={item}>{item}</option>
              )
            )}
          </select>
        </div>
      </div>
      {submissionError && <p className="text-xs text-rose-700" role="alert">{submissionError}</p>}
      <div className="stock-adjustment-preview">
        <Boxes size={15} />
        <span>
          Current stock: <strong>{productStock(product)}</strong>
        </span>
        <span>
          Change:{" "}
          <strong>
            {delta > 0 ? "+" : ""}
            {delta}
          </strong>
        </span>
      </div>
    </Modal>
  );
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="product-app-detail">
      <h4>{title}</h4>
      {items.map((item, index) => (
        <p key={`${title}-${index}`}>{item}</p>
      ))}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
