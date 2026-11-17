"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowRight, BadgeIndianRupee, Boxes, Check, CreditCard, Download,
  Filter, MapPin, PackageCheck, ShieldAlert, Truck, Undo2, UserRound,
} from "lucide-react";
import { Avatar, Modal, StatusPill, TableToolbar } from "../../shared/components/ui";
import { SlidingTabList } from "../../shared/components/sliding-tab-list";
import { formatCurrency } from "../../commerce/lib/format";
import type { OrderFulfillmentStatus, OrderPaymentStatus, OrderRecord } from "../../shared/types";
import { ReceivedPaymentsPanel } from "./received-payments-panel";

type QueueTab = "All orders" | "New" | "Preparing" | "Shipped" | "Needs attention" | "Returns" | "Delivered" | "Cancelled & refunded";
type OrderDateFilter = "All dates" | "Last 7 days" | "Last 30 days";
const queueTabs: QueueTab[] = ["All orders", "New", "Preparing", "Shipped", "Needs attention", "Returns", "Delivered", "Cancelled & refunded"];

interface BackendOrder {
  order_id?: string;
  id?: string;
  customer?: { name?: string; email?: string; phone?: string };
  items?: Array<{ title?: string; name?: string; quantity?: number; price?: number }>;
  pricing?: { total?: number; subtotal?: number; discount?: number; delivery_fee?: number; tax?: number; coupon_code?: string };
  shipping_address?: { name?: string; phone?: string; house_number?: string; street?: string; city?: string; state?: string; pincode?: string; formattedAddress?: string };
  payment?: { payment_status?: string; gateway?: string; gateway_status?: string; transaction_id?: string; refund_amount?: number; refund_id?: string; refund_status?: "pending" | "processed" | "failed" | ""; refund_pending_amount?: number; refunds?: Array<{ id?: string; amount?: number; currency?: string; status?: "pending" | "processed" | "failed"; updated_at?: string }>; payment_attempts?: Array<{ payment_id?: string; amount?: number; currency?: string; method?: string; status?: string; failure_code?: string; attempted_at?: string }>; last_failure_code?: string };
  fulfillment?: { status?: string; courier?: string; tracking_number?: string; tracking_url?: string; shiprocket_status?: string; shiprocket_shipment_id?: string; shiprocket_return_shipment_id?: string; shiprocket_return_awb?: string; shiprocket_pickup_status?: string; shiprocket_rate?: number; shiprocket_eta?: string; shiprocket_label_url?: string; shiprocket_manifest_url?: string; cancellation_reason?: string; return_reason?: string };
  timeline?: Array<{ label?: string; timestamp?: string; done?: boolean }>;
  created_at?: string;
  date?: string;
  total?: number;
  status?: string;
  payment_status?: string;
}

interface LiveTrackingEvent {
  date: string;
  status: string;
  activity: string;
  location: string;
}

interface LiveTrackingData {
  awb_code: string;
  courier: string;
  current_status: string;
  estimated_delivery: string;
  origin: string;
  destination: string;
  track_url: string;
  updated_at: string;
  events: LiveTrackingEvent[];
  tracking_mode?: "shiprocket" | "external" | "webhook";
  is_stale_provider_fallback?: boolean;
}

function mapBackendOrder(apiOrder: BackendOrder): OrderRecord {
  const primaryItem = apiOrder.items?.[0]?.title || apiOrder.items?.[0]?.name || "Product";
  const extraItemsCount = (apiOrder.items?.length || 1) - 1;
  const itemSummary = extraItemsCount > 0 ? `${primaryItem} + ${extraItemsCount} more` : primaryItem;
  const total = apiOrder.pricing?.total ?? apiOrder.total ?? 0;
  const addr = apiOrder.shipping_address;
  const formattedAddr = addr?.formattedAddress || (addr ? `${addr.house_number || ""}, ${addr.street || ""}, ${addr.city || ""}` : "");
  const providerState = `${apiOrder.fulfillment?.shiprocket_status || ""} ${apiOrder.fulfillment?.shiprocket_pickup_status || ""}`;
  const needsAttention = apiOrder.payment?.refund_status === "failed" || apiOrder.payment?.refund_status === "pending" ||
    (apiOrder.payment?.gateway_status === "failed_attempt" && apiOrder.payment?.payment_status === "Pending") ||
    /needs_review|processing|fail|error|exception/i.test(providerState);

  return {
    id: apiOrder.order_id || apiOrder.id || "",
    customer: apiOrder.customer?.name || "Patient",
    customerEmail: apiOrder.customer?.email || "",
    customerPhone: apiOrder.customer?.phone || "",
    item: itemSummary,
    date: apiOrder.created_at || apiOrder.date || new Date().toISOString(),
    amount: `₹${total.toLocaleString("en-IN")}`,
    totalAmount: total,
    status: needsAttention ? "Needs attention" : (apiOrder.fulfillment?.status || apiOrder.status || "New") as OrderFulfillmentStatus,
    paymentStatus: (apiOrder.payment?.payment_status || apiOrder.payment_status || "Pending") as OrderPaymentStatus,
    paymentMethod: apiOrder.payment?.gateway === "razorpay"
      ? "Online Gateway"
      : apiOrder.payment?.gateway === "cod"
        ? "Cash on Delivery"
        : "Offline payment",
    couponCode: apiOrder.pricing?.coupon_code,
    courier: apiOrder.fulfillment?.courier || "",
    trackingNumber: apiOrder.fulfillment?.tracking_number || "",
    trackingUrl: apiOrder.fulfillment?.tracking_url || "",
    shiprocketStatus: apiOrder.fulfillment?.shiprocket_status || "",
    shiprocketShipmentId: apiOrder.fulfillment?.shiprocket_shipment_id || "",
    shiprocketPickupStatus: apiOrder.fulfillment?.shiprocket_pickup_status || "",
    shiprocketRate: apiOrder.fulfillment?.shiprocket_rate ?? 0,
    shiprocketEta: apiOrder.fulfillment?.shiprocket_eta || "",
    shiprocketLabelUrl: apiOrder.fulfillment?.shiprocket_label_url || "",
    shiprocketManifestUrl: apiOrder.fulfillment?.shiprocket_manifest_url || "",
    shiprocketReturnShipmentId: apiOrder.fulfillment?.shiprocket_return_shipment_id || "",
    shiprocketReturnAwb: apiOrder.fulfillment?.shiprocket_return_awb || "",
    refundAmount: apiOrder.payment?.refund_amount ?? 0,
    refundPendingAmount: apiOrder.payment?.refund_pending_amount ?? 0,
    refundStatus: apiOrder.payment?.refund_status ?? "",
    paymentReference: apiOrder.payment?.transaction_id || "",
    refundReference: apiOrder.payment?.refund_id || "",
    refundHistory: (apiOrder.payment?.refunds || []).map((refund) => ({
      id: String(refund.id || ""),
      amount: Number(refund.amount) || 0,
      currency: String(refund.currency || "INR"),
      status: refund.status || "pending",
      updatedAt: refund.updated_at,
    })),
    paymentAttempts: (apiOrder.payment?.payment_attempts || []).map((attempt) => ({
      id: String(attempt.payment_id || ""),
      amount: Number(attempt.amount) || 0,
      currency: String(attempt.currency || "INR"),
      method: attempt.method,
      status: String(attempt.status || "unknown"),
      failureCode: attempt.failure_code,
      attemptedAt: attempt.attempted_at,
    })),
    gatewayAttemptStatus: apiOrder.payment?.gateway_status || "",
    gatewayFailureCode: apiOrder.payment?.last_failure_code || "",
    refundReason: "",
    cancellationReason: apiOrder.fulfillment?.cancellation_reason || "",
    returnReason: apiOrder.fulfillment?.return_reason || "",
    subtotal: apiOrder.pricing?.subtotal ?? total,
    discount: apiOrder.pricing?.discount ?? 0,
    shipping: apiOrder.pricing?.delivery_fee ?? 0,
    tax: apiOrder.pricing?.tax ?? 0,
    shippingAddress: formattedAddr,
    items: Array.isArray(apiOrder.items)
      ? apiOrder.items.map((i) => ({
          name: i.title || i.name || "Item",
          quantity: i.quantity || 1,
          unitPrice: i.price || 0,
        }))
      : [],
    timeline: Array.isArray(apiOrder.timeline)
      ? apiOrder.timeline.map((t) => ({
          label: t.label || "",
          date: t.timestamp ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(t.timestamp)) : "",
          done: Boolean(t.done),
        }))
      : [],
  };
}

function parseAmount(order: OrderRecord) {
  return order.totalAmount ?? (Number(order.amount.replace(/[^0-9.]/g, "")) || 0);
}

function normalizeOrder(order: OrderRecord): OrderRecord {
  const oldStatus = order.status as string;
  const status: OrderFulfillmentStatus = oldStatus === "Pending" ? "New" : oldStatus === "Review" ? "Needs attention" : oldStatus === "Completed" ? "Delivered" : oldStatus as OrderFulfillmentStatus;
  return { ...order, status, totalAmount: parseAmount(order), timeline: order.timeline ?? [] };
}

function dateFromOrder(order: OrderRecord) {
  const parsed = new Date(order.date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function requireSuccess(res: Response) {
  if (res.ok) return;
  const body = await res.json().catch(() => ({}));
  throw new Error(body.message || "Order service could not save this change.");
}

function progressFor(order: OrderRecord): string {
  switch (order.status) {
    case "New": return "Payment received · awaiting fulfilment";
    case "Preparing": return "Being packed for dispatch";
    case "Shipped": return order.trackingNumber ? `${order.courier ?? "Courier"} · ${order.trackingNumber}` : "In transit";
    case "Needs attention": return "Resolve the flagged order issue";
    case "Return requested": return order.returnReason ? `Return · ${order.returnReason}` : "Return request received";
    case "Delivered": return "Delivery complete";
    case "Cancelled": return order.cancellationReason ?? "Order cancelled";
    case "Refunded": return "Refund recorded";
  }
}

function nextAction(order: OrderRecord) {
  if ((order.status === "New" || order.status === "Needs attention") && order.paymentStatus === "Paid") return order.status === "New" ? "Start preparing" : "Resume fulfilment";
  if (order.status === "Preparing") return order.shiprocketShipmentId ? "Confirm courier pickup" : "Add tracking & ship";
  if (order.status === "Shipped") return "Mark delivered";
  return "Close details";
}

function canCancel(order: OrderRecord) {
  return ["New", "Preparing", "Needs attention"].includes(order.status)
    && !order.shiprocketShipmentId
    && !order.trackingNumber;
}

function canRefund(order: OrderRecord) {
  return (order.paymentStatus === "Paid" || order.paymentStatus === "Partially refunded")
    && order.paymentMethod === "Online Gateway"
    && order.refundStatus !== "pending"
    && (order.refundPendingAmount ?? 0) <= 0;
}

function canStartPreparing(order: OrderRecord) {
  return (order.status === "New" || order.status === "Needs attention") && (order.paymentStatus === "Paid" || order.paymentMethod === "Cash on Delivery");
}

export function OrdersPage({ globalSearch, onToast, onAudit = () => {}, canExport = false }: { globalSearch: string; onToast: (message: string) => void; onAudit?: (action: string, target: string) => void; canExport?: boolean }) {
  const [topTab, setTopTab] = useState<"orders" | "payments">("orders");
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [tab, setTab] = useState<QueueTab>("All orders");
  const [query, setQuery] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("Any payment");
  const [dateFilter, setDateFilter] = useState<OrderDateFilter>("All dates");
  const [dateCutoff, setDateCutoff] = useState<number | null>(null);
  const [productFilter, setProductFilter] = useState("All products");
  const [couponFilter, setCouponFilter] = useState("All coupons");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [trackingState, setTrackingState] = useState<{ orderId: string; data: LiveTrackingData | null; loading: boolean; error: string }>({ orderId: "", data: null, loading: false, error: "" });
  const [trackingRefreshKey, setTrackingRefreshKey] = useState(0);
  const [dispatchByOrder, setDispatchByOrder] = useState<Record<string, { courier: string; trackingNumber: string; trackingUrl: string }>>({});
  const [shiprocketLoading, setShiprocketLoading] = useState(false);
  const [cancelOrder, setCancelOrder] = useState<OrderRecord | null>(null);
  const [cancelReason, setCancelReason] = useState("Customer requested cancellation");
  const [refundOrder, setRefundOrder] = useState<OrderRecord | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("Customer return");
  const [restockReturnedItems, setRestockReturnedItems] = useState(false);
  const [returnOrder, setReturnOrder] = useState<OrderRecord | null>(null);
  const [returnReason, setReturnReason] = useState("Changed my mind");

  const reloadOrders = async () => {
    try {
      const res = await fetch("/api/admin/orders");
      if (res.ok) {
        const json = await res.json();
        const items = json.data?.items || json.items || [];
        if (Array.isArray(items)) {
          setOrders(items.map(mapBackendOrder));
        }
      }
    } catch {
      // Keep existing orders on error
    }
  };

  useEffect(() => {
    let ignore = false;
    const fetchOrders = async () => {
      try {
        const res = await fetch("/api/admin/orders");
        if (res.ok && !ignore) {
          const json = await res.json();
          const items = json.data?.items || json.items || [];
          if (Array.isArray(items)) {
            setOrders(items.map(mapBackendOrder));
          }
        }
      } catch {
        // Keep existing orders on error
      }
    };
    void fetchOrders();
    return () => {
      ignore = true;
    };
  }, []);

  const normalizedOrders = useMemo(() => orders.map(normalizeOrder), [orders]);
  const selectedOrder = normalizedOrders.find((order) => order.id === selectedOrderId) ?? null;
  const dispatchDetails = selectedOrder ? dispatchByOrder[selectedOrder.id] ?? { courier: selectedOrder.courier ?? "", trackingNumber: selectedOrder.trackingNumber ?? "", trackingUrl: selectedOrder.trackingUrl ?? "" } : { courier: "", trackingNumber: "", trackingUrl: "" };
  const search = `${globalSearch} ${query}`.trim().toLowerCase();
  const productOptions = [...new Set(normalizedOrders.map((order) => order.item))].sort();
  const couponOptions = [...new Set(normalizedOrders.map((order) => order.couponCode).filter((code): code is string => Boolean(code)))].sort();
  const filteredOrders = useMemo(() => normalizedOrders.filter((order) => {
    const text = `${order.id} ${order.customer} ${order.customerEmail ?? ""} ${order.item} ${order.couponCode ?? ""} ${order.trackingNumber ?? ""}`.toLowerCase();
    const matchesTab = tab === "All orders" || (tab === "Cancelled & refunded" ? ["Cancelled", "Refunded"].includes(order.status) : tab === "Returns" ? order.status === "Return requested" : order.status === tab);
    const matchesPayment = paymentFilter === "Any payment" || order.paymentStatus === paymentFilter;
    const matchesProduct = productFilter === "All products" || order.item === productFilter;
    const matchesCoupon = couponFilter === "All coupons" || order.couponCode === couponFilter;
    const date = dateFromOrder(order);
    const matchesDate = !dateCutoff || !date || date.getTime() >= dateCutoff;
    return text.includes(search) && matchesTab && matchesPayment && matchesProduct && matchesCoupon && matchesDate;
  }), [normalizedOrders, tab, search, paymentFilter, productFilter, couponFilter, dateCutoff]);
  const eligibleSelected = filteredOrders.filter((order) => selectedIds.includes(order.id) && canStartPreparing(order));

  useEffect(() => {
    const orderId = selectedOrder?.id;
    const shipmentId = selectedOrder?.shiprocketShipmentId;
    const hasManualTracking = Boolean(selectedOrder?.trackingNumber && selectedOrder?.trackingUrl);
    const hasReturnTracking = Boolean(selectedOrder?.shiprocketReturnAwb);
    if (!orderId || (!shipmentId && !hasManualTracking && !hasReturnTracking)) return;

    let ignore = false;
    const loadTracking = async () => {
      setTrackingState({ orderId, data: null, loading: true, error: "" });
      try {
        const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/tracking`, { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.message || "Tracking updates could not be loaded.");
        if (!ignore) {
          setTrackingState({ orderId, data: json.data ?? json, loading: false, error: "" });
        }
      } catch (error) {
        if (!ignore) setTrackingState({ orderId, data: null, loading: false, error: error instanceof Error ? error.message : "Tracking updates could not be loaded." });
      } finally {
        if (!ignore) setTrackingState((current) => current.orderId === orderId ? { ...current, loading: false } : current);
      }
    };

    void loadTracking();
    const timer = window.setInterval(() => void loadTracking(), 60_000);
    return () => {
      ignore = true;
      window.clearInterval(timer);
    };
  }, [selectedOrder?.id, selectedOrder?.shiprocketShipmentId, selectedOrder?.shiprocketReturnAwb, selectedOrder?.trackingNumber, selectedOrder?.trackingUrl, trackingRefreshKey]);

  const selectedTracking = trackingState.orderId === selectedOrder?.id ? trackingState : null;

  const startPreparation = async (order: OrderRecord) => {
    if (!canStartPreparing(order)) {
      onToast("Payment must be confirmed before fulfilment can start.");
      return;
    }
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/fulfillment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Preparing" }),
      });
      await requireSuccess(res);
      await reloadOrders();
      onAudit("started fulfilment for", order.id);
      onToast(`${order.id} moved to Preparing.`);
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Could not start fulfilment.");
    }
  };

  const createShiprocketShipment = async (order: OrderRecord) => {
    if (!order.shiprocketShipmentId && !window.confirm(`Create a Shiprocket shipment for ${order.id} and request a pickup? Shiprocket may charge your wallet.`)) return;
    if (order.shiprocketShipmentId || order.shiprocketStatus === "needs_review" || order.shiprocketStatus === "processing") {
      onToast("Check Shiprocket for this order before attempting another shipment.");
      return;
    }
    setShiprocketLoading(true);
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(order.id)}/shiprocket`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "Shiprocket shipment could not be created.");
      await reloadOrders();
      onAudit("created Shiprocket shipment for", order.id);
      onToast(`Shiprocket shipment created. Pickup requested; awaiting courier handoff. AWB: ${json.data?.fulfillment?.awb_code || json.data?.fulfillment?.tracking_number || "created"}.`);
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Shiprocket shipment could not be created.");
      await reloadOrders();
    } finally {
      setShiprocketLoading(false);
    }
  };

  const retryShiprocketPickup = async (order: OrderRecord) => {
    setShiprocketLoading(true);
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(order.id)}/shiprocket/pickup/retry`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "Pickup retry failed.");
      await reloadOrders();
      onAudit("retried Shiprocket pickup for", order.id);
      onToast("Pickup retry sent. Check the Shiprocket response and manifest before handoff.");
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Pickup retry failed.");
      await reloadOrders();
    } finally { setShiprocketLoading(false); }
  };

  const handlePrimaryAction = async () => {
    if (!selectedOrder) return;
    if (selectedOrder.status === "New" || selectedOrder.status === "Needs attention") {
      await startPreparation(selectedOrder);
      return;
    }
    if (selectedOrder.status === "Preparing") {
      if (!dispatchDetails.courier.trim() || !dispatchDetails.trackingNumber.trim()) {
        onToast("Add a courier and tracking number before marking this order shipped.");
        return;
      }
      try {
        const res = await fetch(`/api/admin/orders/${selectedOrder.id}/fulfillment`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "Shipped",
            courier: dispatchDetails.courier.trim(),
            tracking_number: dispatchDetails.trackingNumber.trim(),
            tracking_url: dispatchDetails.trackingUrl.trim(),
          }),
        });
        await requireSuccess(res);
        await reloadOrders();
        onAudit("shipped order", selectedOrder.id);
        onToast(selectedOrder.shiprocketShipmentId
          ? `${selectedOrder.id} pickup confirmed and marked as shipped.`
          : `${selectedOrder.id} marked as shipped.`);
      } catch (error) {
        onToast(error instanceof Error ? error.message : "Could not ship order.");
      }
      return;
    }
    if (selectedOrder.status === "Shipped") {
      try {
        const res = await fetch(`/api/admin/orders/${selectedOrder.id}/fulfillment`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "Delivered" }),
        });
        await requireSuccess(res);
        await reloadOrders();
        onAudit("marked order delivered", selectedOrder.id);
        onToast(`${selectedOrder.id} marked delivered.`);
      } catch (error) {
        onToast(error instanceof Error ? error.message : "Could not mark order delivered.");
      }
      return;
    }
    setSelectedOrderId(null);
  };

  const confirmCancellation = async () => {
    if (!cancelOrder) return;
    try {
      const res = await fetch(`/api/admin/orders/${cancelOrder.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason }),
      });
      await requireSuccess(res);
      await reloadOrders();
      onAudit("cancelled order", `${cancelOrder.id} · ${cancelReason}`);
      onToast("Order cancelled and inventory released.");
      setCancelOrder(null);
      setSelectedOrderId(null);
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Could not cancel order.");
    }
  };

  const confirmReturn = async () => {
    if (!returnOrder) return;
    try {
      const res = await fetch(`/api/admin/orders/${returnOrder.id}/fulfillment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Return requested", return_reason: returnReason }),
      });
      await requireSuccess(res);
      await reloadOrders();
      onAudit("recorded return request", `${returnOrder.id} · ${returnReason}`);
      onToast("Return request saved.");
      setReturnOrder(null);
      setSelectedOrderId(null);
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Could not save return request.");
    }
  };

  const createReversePickup = async (order: OrderRecord) => {
    if (!window.confirm(`Create a reverse pickup from the patient for order ${order.id}? Shiprocket may charge your wallet.`)) return;
    setShiprocketLoading(true);
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(order.id)}/shiprocket/return`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "Reverse pickup could not be created.");
      await reloadOrders();
      onAudit("created Shiprocket reverse pickup for", order.id);
      onToast(`Reverse pickup created. AWB: ${json.data?.fulfillment?.shiprocket_return_awb || "created"}.`);
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Reverse pickup could not be created.");
      await reloadOrders();
    } finally { setShiprocketLoading(false); }
  };

  const confirmRefund = async () => {
    if (!refundOrder) return;
    const amount = Math.round(Number(refundAmount));
    const previousRefund = refundOrder.refundAmount ?? 0;
    const pendingRefund = refundOrder.refundPendingAmount ?? 0;
    const remaining = parseAmount(refundOrder) - previousRefund - pendingRefund;
    if (!Number.isFinite(amount) || amount <= 0 || amount > remaining || !refundReason.trim()) {
      onToast(`Enter a refund between ₹1 and ${formatCurrency(remaining)} and add a reason.`);
      return;
    }
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(refundOrder.id)}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, reason: refundReason, restock_inventory: restockReturnedItems }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.message || "Razorpay refund could not be requested.");
      await reloadOrders();
      const refundStatus = result.data?.payment?.refund_status;
      onAudit(refundStatus === "processed" ? "processed Razorpay refund for" : "requested Razorpay refund for", `${refundOrder.id} · ${formatCurrency(amount)}`);
      onToast(refundStatus === "processed"
        ? `Razorpay confirmed the ${formatCurrency(amount)} refund${restockReturnedItems ? "; returned items restocked" : ""}.`
        : `Razorpay accepted the ${formatCurrency(amount)} refund request. It is pending provider confirmation.`);
      setRefundOrder(null);
      setSelectedOrderId(null);
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Could not process refund.");
    }
  };

  const moveSelectedToPreparing = async () => {
    const selected = eligibleSelected.map((order) => order.id);
    if (!selected.length) return;
    const results = await Promise.allSettled(selected.map(async (id) => {
      const res = await fetch(`/api/admin/orders/${id}/fulfillment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Preparing" }),
      });
      await requireSuccess(res);
    }));
    const saved = selected.filter((_, index) => results[index].status === "fulfilled");
    await reloadOrders();
    if (saved.length) onAudit("started bulk fulfilment for", `${saved.length} orders`);
    setSelectedIds((current) => current.filter((id) => !saved.includes(id)));
    onToast(`${saved.length} of ${selected.length} orders moved to Preparing.`);
  };

  const exportCsv = () => {
    if (!canExport) {
      onToast("This admin account does not have commerce export access.");
      return;
    }
    const header = ["Order ID", "Customer", "Email", "Date", "Items", "Total", "Payment status", "Fulfilment status", "Coupon", "Courier", "Tracking"];
    const rows = filteredOrders.map((order) => [order.id, order.customer, order.customerEmail ?? "", order.date, order.item, String(parseAmount(order)), order.paymentStatus ?? "", order.status, order.couponCode ?? "", order.courier ?? "", order.trackingNumber ?? ""]);
    const csv = [header, ...rows].map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "dr-hair-orders.csv"; link.click(); URL.revokeObjectURL(url);
    onToast(`Exported ${filteredOrders.length} filtered orders.`);
  };

  const changeDateFilter = (value: OrderDateFilter) => {
    setDateFilter(value);
    const days = value === "Last 7 days" ? 7 : value === "Last 30 days" ? 30 : 0;
    setDateCutoff(days ? Date.now() - days * 24 * 60 * 60 * 1000 : null);
  };
  const clearFilters = () => { setQuery(""); setPaymentFilter("Any payment"); setDateFilter("All dates"); setDateCutoff(null); setProductFilter("All products"); setCouponFilter("All coupons"); setTab("All orders"); setSelectedIds([]); };
  const setRefundTarget = (order: OrderRecord) => { setRefundOrder(order); setRefundAmount(String(Math.max(0, parseAmount(order) - (order.refundAmount ?? 0) - (order.refundPendingAmount ?? 0)))); setRefundReason("Customer return"); setRestockReturnedItems(false); };
  const toggleSelection = (id: string, checked: boolean) => setSelectedIds((current) => checked ? [...new Set([...current, id])] : current.filter((item) => item !== id));
  const selectableVisible = filteredOrders.filter(canStartPreparing).map((order) => order.id);
  const allVisibleSelected = selectableVisible.length > 0 && selectableVisible.every((id) => selectedIds.includes(id));

  const counts: Record<QueueTab, number> = {
    "All orders": normalizedOrders.length,
    New: normalizedOrders.filter((order) => order.status === "New").length,
    Preparing: normalizedOrders.filter((order) => order.status === "Preparing").length,
    Shipped: normalizedOrders.filter((order) => order.status === "Shipped").length,
    "Needs attention": normalizedOrders.filter((order) => order.status === "Needs attention").length,
    Returns: normalizedOrders.filter((order) => order.status === "Return requested").length,
    Delivered: normalizedOrders.filter((order) => order.status === "Delivered").length,
    "Cancelled & refunded": normalizedOrders.filter((order) => ["Cancelled", "Refunded"].includes(order.status)).length,
  };

  return <div className="page-wrap w-full min-w-0">
    <div className="order-tab-toolbar">
      <SlidingTabList activeKey={topTab} indicatorVariant="underline" className="order-main-tabs" label="Order workspaces">
      <button
        type="button"
        role="tab"
        aria-selected={topTab === "orders"}
        aria-controls="orders-fulfilment-panel"
        className="order-main-tab"
        onClick={() => setTopTab("orders")}
      >
        <PackageCheck size={15} /><span>Orders &amp; Fulfilment</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={topTab === "payments"}
        aria-controls="orders-payments-panel"
        className="order-main-tab"
        onClick={() => setTopTab("payments")}
      >
        <CreditCard size={15} /><span>Received Payments (Razorpay)</span>
      </button>
      </SlidingTabList>
      {canExport && topTab === "orders" && <button className="button button-secondary order-export-button" onClick={exportCsv}><Download size={14} />Export filtered CSV</button>}
    </div>

    <div key={topTab} id={topTab === "orders" ? "orders-fulfilment-panel" : "orders-payments-panel"} role="tabpanel" aria-label={topTab === "orders" ? "Orders and fulfilment" : "Received payments"} className="tab-panel-transition">
    {topTab === "payments" ? (
      <ReceivedPaymentsPanel onToast={onToast} />
    ) : (
      <>

        <div className="kpi-grid order-queue-metrics grid grid-cols-2 gap-3 lg:grid-cols-4">
          <QueueMetric icon={<PackageCheck size={15} />} label="New · paid" value={String(normalizedOrders.filter((order) => order.status === "New" && order.paymentStatus === "Paid").length)} foot="Ready to begin fulfilment" tone="blue" />
          <QueueMetric icon={<Boxes size={15} />} label="Preparing" value={String(counts.Preparing)} foot="Pack and assign dispatch" tone="violet" />
          <QueueMetric icon={<Truck size={15} />} label="In transit" value={String(counts.Shipped)} foot="Orders with courier tracking" tone="teal" />
          <QueueMetric icon={<ShieldAlert size={15} />} label="Needs attention" value={String(counts["Needs attention"])} foot="Resolve before fulfilment" tone="amber" />
        </div>

        <section className="card order-workspace-card">
          <div className="order-workspace-heading"><div><h2 className="card-title">Fulfilment queue</h2><p className="card-note">Select a queue to focus the work that needs doing next.</p></div><span className="small-caption">{normalizedOrders.length} orders</span></div>
          <div className="order-queue-tabs" role="tablist" aria-label="Filter orders by fulfilment status">{queueTabs.map((queue) => <button key={queue} role="tab" aria-selected={tab === queue} className={tab === queue ? "selected" : ""} onClick={() => setTab(queue)}>{queue}<span>{counts[queue]}</span></button>)}</div>
          <TableToolbar value={query} onChange={setQuery} placeholder="Search order, customer, product, coupon, or tracking..." right={<div className="order-filter-controls">
            <select className="period-select" aria-label="Filter by payment" value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)}><option>Any payment</option><option>Paid</option><option>Pending</option><option>Failed</option><option>Partially refunded</option><option>Refunded</option></select>
            <select className="period-select" aria-label="Filter orders by date" value={dateFilter} onChange={(event) => changeDateFilter(event.target.value as OrderDateFilter)}><option>All dates</option><option>Last 7 days</option><option>Last 30 days</option></select>
            <select className="period-select order-product-filter" aria-label="Filter by product" value={productFilter} onChange={(event) => setProductFilter(event.target.value)}><option>All products</option>{productOptions.map((product) => <option key={product}>{product}</option>)}</select>
            <select className="period-select" aria-label="Filter by coupon" value={couponFilter} onChange={(event) => setCouponFilter(event.target.value)}><option>All coupons</option>{couponOptions.map((coupon) => <option key={coupon}>{coupon}</option>)}</select>
            <button className="filter-button" onClick={clearFilters}><Filter size={13} />Reset</button>
          </div>} />

          {eligibleSelected.length > 0 && <div className="order-bulk-toolbar"><span><Check size={14} />{eligibleSelected.length} selected paid order{eligibleSelected.length === 1 ? "" : "s"} can start fulfilment</span><button className="button button-secondary button-small" onClick={moveSelectedToPreparing}>Move to preparing <ArrowRight size={13} /></button></div>}

          <div className="table-wrap"><table className="orders-workflow-table"><thead><tr><th><input type="checkbox" aria-label="Select all paid orders ready for fulfilment" checked={allVisibleSelected} onChange={(event) => {
            const eligible = new Set(selectableVisible);
            setSelectedIds((current) => event.target.checked ? [...new Set([...current, ...eligible])] : current.filter((id) => !eligible.has(id)));
          }} /></th><th>Order</th><th>Customer</th><th>Placed</th><th>Total</th><th>Payment</th><th>Fulfilment</th><th>Next step</th><th /></tr></thead><tbody>
            {filteredOrders.map((order) => <tr key={order.id}>
              <td><input type="checkbox" aria-label={`Select order ${order.id}`} checked={selectedIds.includes(order.id)} disabled={!canStartPreparing(order)} onChange={(event) => toggleSelection(order.id, event.target.checked)} /></td>
              <td><div className="person order-person"><span className="activity-icon"><PackageCheck size={14} /></span><div><div className="person-name">{order.id}</div><div className="person-sub">{order.item}{order.couponCode ? ` · ${order.couponCode}` : ""}</div></div></div></td>
              <td><div className="order-customer-cell"><Avatar initials={order.customer.split(" ").map((part) => part[0]).join("")} /><span><strong>{order.customer}</strong><small>{order.customerEmail ?? "Email not recorded"}</small></span></div></td>
              <td>{order.date}</td><td><strong>{formatCurrency(parseAmount(order))}</strong></td>
              <td><div className="order-payment-cell"><StatusPill status={order.paymentStatus ?? "Pending"} />{order.paymentMethod && <small>{order.paymentMethod}</small>}</div></td>
              <td><div className="order-fulfillment-cell"><StatusPill status={order.status} /><small>{progressFor(order)}</small></div></td>
              <td><span className={`order-next-step ${order.status === "Needs attention" ? "attention" : ""}`}>{nextAction(order)}</span></td>
              <td><button className="row-action" aria-label={`Open order ${order.id}`} onClick={() => setSelectedOrderId(order.id)}><ArrowRight size={15} /></button></td>
            </tr>)}
            {filteredOrders.length === 0 && <tr><td colSpan={9}><div className="empty-state">No orders match these filters. Try a different queue or reset the filters.</div></td></tr>}
          </tbody></table></div>
          <div className="table-footer"><span>{filteredOrders.length} orders · live order queue</span><span>Page 1 of 1</span></div>
        </section>

        {selectedOrder && <Modal className="order-details-modal order-workflow-modal" title={`Order ${selectedOrder.id}`} description={`${selectedOrder.customer} · ${selectedOrder.date}`} submitLabel={nextAction(selectedOrder)} onClose={() => setSelectedOrderId(null)} onSubmit={handlePrimaryAction}>
          <OrderDetails order={selectedOrder} relatedOrders={normalizedOrders.filter((order) => order.customerEmail && order.customerEmail === selectedOrder.customerEmail && order.id !== selectedOrder.id).slice(0, 4)} />
          {(selectedOrder.shiprocketShipmentId || selectedOrder.shiprocketReturnAwb || (selectedOrder.trackingNumber && selectedOrder.trackingUrl)) && <LiveTrackingPanel tracking={selectedTracking?.data ?? null} loading={selectedTracking?.loading ?? false} error={selectedTracking?.error ?? ""} onRefresh={() => setTrackingRefreshKey((key) => key + 1)} />}
          {selectedOrder.shiprocketShipmentId && <div className="order-action-notice"><Truck size={14} /><span>Shiprocket {selectedOrder.shiprocketStatus || "shipment created"}{selectedOrder.shiprocketPickupStatus ? ` · pickup ${selectedOrder.shiprocketPickupStatus}` : " · pickup pending"}{selectedOrder.shiprocketRate ? ` · quoted ₹${selectedOrder.shiprocketRate}` : ""}{selectedOrder.shiprocketEta ? ` · ETA ${selectedOrder.shiprocketEta}` : ""}</span>{selectedOrder.shiprocketLabelUrl && <a href={selectedOrder.shiprocketLabelUrl} target="_blank" rel="noreferrer">Label</a>}{selectedOrder.shiprocketManifestUrl && <a href={selectedOrder.shiprocketManifestUrl} target="_blank" rel="noreferrer">Manifest</a>}</div>}
          {selectedOrder.status === "Preparing" && <div className="shipping-entry"><div className="field-heading"><Truck size={14} />Dispatch details</div>{selectedOrder.shiprocketShipmentId ? <><p className="form-help">Shiprocket shipment {selectedOrder.shiprocketShipmentId} · AWB {selectedOrder.trackingNumber || "pending"}. Confirm pickup only after the courier has collected the parcel.</p>{/fail|error|exception/i.test(`${selectedOrder.shiprocketPickupStatus} ${selectedOrder.shiprocketStatus}`) && <button className="button button-secondary" type="button" disabled={shiprocketLoading} onClick={() => void retryShiprocketPickup(selectedOrder)}>{shiprocketLoading ? "Retrying pickup…" : "Retry failed pickup"}</button>}</> : selectedOrder.shiprocketStatus === "needs_review" || selectedOrder.shiprocketStatus === "processing" ? <div className="order-action-notice"><ShieldAlert size={14} /><span>Shiprocket request needs reconciliation in the Shiprocket panel before retrying.</span></div> : <button className="button button-secondary" type="button" disabled={shiprocketLoading} onClick={() => void createShiprocketShipment(selectedOrder)}><Truck size={13} />{shiprocketLoading ? "Creating Shiprocket shipment…" : "Create Shiprocket shipment & request pickup"}</button>}<div className="form-grid-two"><div className="field"><label htmlFor="order-courier">Courier</label><input id="order-courier" value={dispatchDetails.courier} onChange={(event) => setDispatchByOrder((current) => ({ ...current, [selectedOrder.id]: { ...dispatchDetails, courier: event.target.value } }))} placeholder="e.g. Delhivery" /></div><div className="field"><label htmlFor="order-tracking">Tracking / AWB number</label><input id="order-tracking" value={dispatchDetails.trackingNumber} onChange={(event) => setDispatchByOrder((current) => ({ ...current, [selectedOrder.id]: { ...dispatchDetails, trackingNumber: event.target.value } }))} placeholder="Enter courier tracking number" /></div></div>{!selectedOrder.shiprocketShipmentId && <div className="field"><label htmlFor="order-tracking-url">Courier tracking link (HTTPS, optional)</label><input id="order-tracking-url" type="url" value={dispatchDetails.trackingUrl} onChange={(event) => setDispatchByOrder((current) => ({ ...current, [selectedOrder.id]: { ...dispatchDetails, trackingUrl: event.target.value } }))} placeholder="https://courier.example/track/…" /></div>}<p className="form-help">Use Shiprocket to create a shipment and request pickup, or enter courier details manually. Manual links are shown as an external tracking option.</p></div>}
          {selectedOrder.paymentStatus !== "Paid" && selectedOrder.paymentMethod !== "Cash on Delivery" && ["New", "Needs attention"].includes(selectedOrder.status) && <div className="order-action-notice"><ShieldAlert size={14} /><span>Payment is {selectedOrder.paymentStatus?.toLowerCase() ?? "not confirmed"}. Confirm payment before starting fulfilment.</span></div>}
          <div className="order-modal-actions">{canCancel(selectedOrder) && <button className="button button-secondary danger-button" onClick={() => { setCancelOrder(selectedOrder); setCancelReason("Customer requested cancellation"); }}>Cancel order</button>}{canRefund(selectedOrder) && <button className="button button-secondary" onClick={() => setRefundTarget(selectedOrder)}><Undo2 size={13} />Record refund</button>}</div>
          {selectedOrder.status === "Delivered" && <div className="order-modal-actions"><button className="button button-secondary" onClick={() => { setReturnOrder(selectedOrder); setReturnReason("Changed my mind"); }}>Log a return request</button></div>}
          {selectedOrder.status === "Return requested" && <div className="order-action-notice"><Truck size={14} /><span>Return review · {selectedOrder.returnReason || "Reason not recorded"}{selectedOrder.shiprocketReturnAwb ? ` · Reverse AWB ${selectedOrder.shiprocketReturnAwb}` : ""}</span>{!selectedOrder.shiprocketReturnAwb && <button className="button button-secondary" type="button" disabled={shiprocketLoading || selectedOrder.shiprocketStatus === "return_needs_review" || selectedOrder.shiprocketStatus === "return_processing"} onClick={() => void createReversePickup(selectedOrder)}>{shiprocketLoading ? "Creating reverse pickup…" : "Create reverse pickup"}</button>}</div>}
          <p className="form-help order-demo-footnote">Actions sync with backend API and live patient order timeline.</p>
        </Modal>}

        {cancelOrder && <Modal title="Cancel order" description={`${cancelOrder.id} · ${cancelOrder.customer}`} submitLabel="Record cancellation" onClose={() => setCancelOrder(null)} onSubmit={confirmCancellation}><div className="field"><label htmlFor="cancel-reason">Cancellation reason</label><select id="cancel-reason" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)}>{["Customer requested cancellation", "Payment issue", "Item unavailable", "Address issue", "Other"].map((reason) => <option key={reason}>{reason}</option>)}</select></div><div className="order-action-notice"><ShieldAlert size={14} /><span>Cancellation does not refund a captured payment automatically. Record the refund separately after confirming it with the payment provider.</span></div></Modal>}
        {returnOrder && <Modal title="Log a return request" description={`${returnOrder.id} · ${returnOrder.customer}`} submitLabel="Save return request" onClose={() => setReturnOrder(null)} onSubmit={confirmReturn}><div className="field"><label htmlFor="return-reason">Return reason</label><select id="return-reason" value={returnReason} onChange={(event) => setReturnReason(event.target.value)}>{["Changed my mind", "Damaged item", "Wrong item sent", "Product quality issue", "Other"].map((reason) => <option key={reason}>{reason}</option>)}</select></div><div className="order-action-notice"><Truck size={14} /><span>This creates a return review task for the operations team.</span></div></Modal>}
        {refundOrder && <Modal title="Request Razorpay refund" description={`${refundOrder.id} · ${refundOrder.customer}`} submitLabel="Submit refund request" onClose={() => setRefundOrder(null)} onSubmit={confirmRefund}><div className="order-refund-context"><BadgeIndianRupee size={16} /><span>Remaining refundable amount<strong>{formatCurrency(Math.max(0, parseAmount(refundOrder) - (refundOrder.refundAmount ?? 0) - (refundOrder.refundPendingAmount ?? 0)))}</strong></span></div><div className="form-grid-two"><div className="field"><label htmlFor="refund-amount">Refund amount (₹)</label><input id="refund-amount" type="number" min="1" step="1" max={Math.max(0, parseAmount(refundOrder) - (refundOrder.refundAmount ?? 0) - (refundOrder.refundPendingAmount ?? 0))} value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} /></div><div className="field"><label htmlFor="refund-reason">Reason</label><select id="refund-reason" value={refundReason} onChange={(event) => setRefundReason(event.target.value)}>{["Customer return", "Damaged item", "Wrong item sent", "Partial order issue", "Customer goodwill", "Other"].map((reason) => <option key={reason}>{reason}</option>)}</select></div></div><label className="order-action-notice"><input type="checkbox" checked={restockReturnedItems} disabled={Number(refundAmount) + (refundOrder.refundAmount ?? 0) < parseAmount(refundOrder)} onChange={(event) => setRestockReturnedItems(event.target.checked)} /><span>Restock all returned items after Razorpay confirms a full refund. Partial refunds cannot restock the whole order.</span></label><div className="order-action-notice"><ShieldAlert size={14} /><span>The refund is sent to Razorpay. The order will show pending until Razorpay confirms processing.</span></div></Modal>}
      </>
    )}
    </div>
  </div>;
}

function OrderDetails({ order, relatedOrders }: { order: OrderRecord; relatedOrders: OrderRecord[] }) {
  return <>
    <div className="order-customer-card"><span className="activity-icon"><UserRound size={16} /></span><div><strong>{order.customer}</strong><span>{order.customerEmail ?? "Customer email unavailable"}{order.customerPhone ? ` · ${order.customerPhone}` : ""}</span></div><StatusPill status={order.paymentStatus ?? "Pending"} /></div>
    {relatedOrders.length > 0 && <div className="order-customer-history"><div className="field-heading"><UserRound size={14} />Recent customer orders</div>{relatedOrders.map((related) => <div key={related.id}><span><strong>{related.id}</strong><small>{related.date} · {related.item}</small></span><span><StatusPill status={related.status} /><strong>{formatCurrency(parseAmount(related))}</strong></span></div>)}</div>}
    <div className="order-detail-block"><div className="field-heading"><PackageCheck size={14} />Items ordered</div>{(order.items ?? [{ name: order.item, quantity: 1, unitPrice: 0 }]).map((item, index) => <div className="order-line-item" key={`${item.name}-${index}`}><div><strong>{item.name}</strong><span>Qty {item.quantity}</span></div><strong>{formatCurrency(item.unitPrice * item.quantity)}</strong></div>)}</div>
    <div className="order-total-card"><MoneyLine label="Subtotal" amount={order.subtotal ?? 0} /><MoneyLine label="Discount" amount={-(order.discount ?? 0)} />{order.couponCode && <MoneyLine label="Coupon code" text={order.couponCode} />}<MoneyLine label="Shipping" amount={order.shipping ?? 0} /><MoneyLine label="Tax" amount={order.tax ?? 0} /><MoneyLine label="Order total" amount={0} totalText={formatCurrency(parseAmount(order))} />{(order.refundAmount ?? 0) > 0 && <MoneyLine label="Refunded" amount={-(order.refundAmount ?? 0)} />}</div>
    <div className="order-detail-grid"><div className="detail-item"><span>Payment method</span><strong>{order.paymentMethod ?? "Not recorded"}</strong></div><div className="detail-item"><span>Payment state</span><StatusPill status={order.paymentStatus ?? "Pending"} /></div>{order.paymentReference && <div className="detail-item"><span>Razorpay payment reference</span><strong>{order.paymentReference}</strong></div>}{order.gatewayAttemptStatus === "failed_attempt" && <div className="detail-item"><span>Latest payment attempt</span><strong>Failed{order.gatewayFailureCode ? ` · ${order.gatewayFailureCode}` : ""}{order.paymentStatus === "Pending" ? "; customer may retry payment" : "; saved order payment state is unchanged"}</strong></div>}{order.refundStatus && <div className="detail-item"><span>Razorpay refund</span><strong>{order.refundStatus === "pending" ? `Pending · ${formatCurrency(order.refundPendingAmount ?? 0)}` : order.refundStatus}</strong></div>}{order.refundReference && <div className="detail-item"><span>Latest refund reference</span><strong>{order.refundReference}</strong></div>}<div className="detail-item"><span>Fulfilment</span><StatusPill status={order.status} /></div><div className="detail-item"><span>Courier & tracking</span><strong>{order.courier ? `${order.courier} · ${order.trackingNumber ?? "No tracking number"}` : "Not dispatched"}</strong></div><div className="detail-item order-address"><span><MapPin size={12} /> Delivery address</span><strong>{order.shippingAddress ?? "Not recorded"}</strong></div>{order.refundReason && <div className="detail-item"><span>Last refund reason</span><strong>{order.refundReason}</strong></div>}{order.cancellationReason && <div className="detail-item"><span>Cancellation reason</span><strong>{order.cancellationReason}</strong></div>}{order.returnReason && <div className="detail-item"><span>Return reason</span><strong>{order.returnReason}</strong></div>}</div>
    {!!order.refundHistory?.length && <div className="order-detail-block"><div className="field-heading"><Undo2 size={14} />Refund history</div>{order.refundHistory.map((refund) => <div className="order-line-item" key={refund.id}><div><strong>{refund.id}</strong><span>{refund.status}{refund.updatedAt ? ` · ${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(refund.updatedAt))}` : ""}</span></div><strong>{formatCurrency(refund.amount)}</strong></div>)}</div>}
    {!!order.paymentAttempts?.length && <div className="order-detail-block"><div className="field-heading"><CreditCard size={14} />Payment attempts</div>{order.paymentAttempts.map((attempt) => <div className="order-line-item" key={attempt.id}><div><strong>{attempt.id}</strong><span>{attempt.status}{attempt.method ? ` · ${attempt.method}` : ""}{attempt.failureCode ? ` · ${attempt.failureCode}` : ""}{attempt.attemptedAt ? ` · ${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(attempt.attemptedAt))}` : ""}</span></div><strong>{formatCurrency(attempt.amount)}</strong></div>)}</div>}
    <div className="order-detail-block"><div className="field-heading"><Activity size={14} />Order history</div><div className="order-timeline">{(order.timeline ?? []).map((event, index) => <div className="order-timeline-item" key={`${event.label}-${index}`}><span className={event.done ? "done" : ""}>{event.done ? <Check size={11} /> : <span />}</span><div><strong>{event.label}</strong><small>{event.date}</small></div></div>)}</div></div>
  </>;
}

function LiveTrackingPanel({ tracking, loading, error, onRefresh }: { tracking: LiveTrackingData | null; loading: boolean; error: string; onRefresh: () => void }) {
  const lastUpdated = tracking?.updated_at ? new Date(tracking.updated_at) : null;
  const formattedUpdate = lastUpdated && !Number.isNaN(lastUpdated.getTime())
    ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(lastUpdated)
    : tracking?.updated_at;

  return <section className="order-detail-block" aria-label="Live shipment tracking">
    <div className="field-heading"><Truck size={14} />Live shipment tracking
      <button className="button button-secondary" type="button" disabled={loading} onClick={onRefresh} style={{ marginLeft: "auto", minHeight: 32 }}>
        {loading ? "Refreshing…" : "Refresh"}
      </button>
    </div>
    {error && <p className="form-help" role="status">{error}</p>}
    {tracking && <>
      <div className="detail-item"><span>Current status</span><strong>{tracking.current_status || "Waiting for the courier’s first scan"}</strong></div>
      <div className="detail-item"><span>Courier · AWB</span><strong>{[tracking.courier, tracking.awb_code].filter(Boolean).join(" · ") || "Tracking details pending"}</strong></div>
      {tracking.estimated_delivery && <div className="detail-item"><span>Estimated delivery</span><strong>{tracking.estimated_delivery}</strong></div>}
      {formattedUpdate && <p className="form-help">Last courier update: {formattedUpdate}</p>}
      {tracking.is_stale_provider_fallback && <p className="form-help">Showing the latest saved carrier event while live tracking is unavailable.</p>}
      {tracking.events.length > 0
        ? <div className="order-timeline">{tracking.events.map((event, index) => <div className="order-timeline-item" key={`${event.date}-${event.activity}-${index}`}>
            <span className={index === 0 ? "done" : ""}>{index === 0 ? <Check size={11} /> : <span />}</span>
            <div><strong>{event.activity || event.status || "Shipment update"}</strong><small>{[event.location, event.date].filter(Boolean).join(" · ")}</small></div>
          </div>)}</div>
        : <p className="form-help">{tracking.tracking_mode === "external" ? "Use the external courier page to view tracking scans." : "No courier scan has been received yet."}</p>}
      {tracking.track_url && <a href={tracking.track_url} target="_blank" rel="noreferrer" className="form-help">Open carrier tracking</a>}
    </>}
    {!tracking && !loading && !error && <p className="form-help">Tracking refreshes automatically while this order is open.</p>}
  </section>;
}

function QueueMetric({ icon, label, value, foot, tone }: { icon: React.ReactNode; label: string; value: string; foot: string; tone: string }) {
  return <article className="card kpi-card commerce-metric"><div className="kpi-top"><span className="kpi-label">{label}</span><span className={`kpi-icon ${tone}`}>{icon}</span></div><div className="kpi-value">{value}</div><div className="kpi-foot">{foot}</div></article>;
}

function MoneyLine({ label, amount, totalText, text }: { label: string; amount?: number; totalText?: string; text?: string }) {
  const value = text ?? totalText ?? `${(amount ?? 0) < 0 ? "−" : ""}${formatCurrency(Math.abs(amount ?? 0))}`;
  return <div className={`money-line ${totalText ? "total" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}
