"use client";

import { BellRing, Megaphone, RefreshCw, ShieldCheck, SlidersHorizontal, Video, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AdminPermissionId, FeatureRecord, Role } from "../../shared/types";
import type { PanelFeatureAccess } from "../../shared/lib/permissions";
import type { CouponRecord } from "../../commerce/types";
import { PageHeader } from "../../shared/components/ui";
import { AdminTab, AdminTabBar } from "../../shared/components/admin-tab-bar";
import { ContentManagement } from "../../content/components/content-management";
import { FeatureControls } from "../../feature-controls/components/feature-controls";
import { AppUpdatesPanel } from "./app-updates-panel";
import { NotificationsPanel } from "./notifications-panel";
import { StorePoliciesPanel } from "./store-policies-panel";

type AppManagementTab = "content" | "home" | "notifications" | "updates" | "features" | "policies";
const tabMeta: { id: AppManagementTab; label: string; icon: LucideIcon; description: string }[] = [
  { id: "content", label: "Content & media", icon: Video, description: "Educational videos and approved patient stories." },
  { id: "home", label: "Home screen", icon: Megaphone, description: "Control banners, placements, and app destinations." },
  { id: "notifications", label: "Notifications", icon: BellRing, description: "Draft and schedule privacy-safe app messages." },
  { id: "updates", label: "App updates", icon: RefreshCw, description: "Manage Android and iOS release policies." },
  { id: "features", label: "Feature availability", icon: SlidersHorizontal, description: "Control app and admin-panel feature access." },
  { id: "policies", label: "Play Store & Legal", icon: ShieldCheck, description: "Official Google Play & App Store links: Privacy Policy, Terms, Data Deletion, and Support." },
];

export function AppManagement({
  role, onToast, permissions, onAudit, features, onFeaturesChange, panelAccess, onPanelAccessChange,
}: {
  role: Role;
  onToast: (message: string) => void;
  permissions: AdminPermissionId[];
  onAudit: (action: string, target: string) => void;
  features: FeatureRecord[];
  onFeaturesChange: (features: FeatureRecord[]) => void;
  panelAccess: PanelFeatureAccess;
  onPanelAccessChange: (id: string, enabled: boolean) => void;
}) {
  const canManageContent = role === "super-admin" || permissions.some((permission) => ["content.edit", "media.upload", "content.publish"].includes(permission));
  const canManageNotifications = permissions.includes("notifications.manage");
  const appFeatures = useMemo(() => features.filter((feature) => feature.id !== "booking"), [features]);
  const availableTabs = useMemo(() => tabMeta.filter(({ id }) => {
    if (id === "content" || id === "home") return canManageContent;
    if (id === "notifications") return canManageNotifications;
    if (id === "policies") return true;
    return role === "super-admin";
  }), [canManageContent, canManageNotifications, role]);
  const [activeTab, setActiveTab] = useState<AppManagementTab>(availableTabs[0]?.id ?? "content");
  const [coupons, setCoupons] = useState<CouponRecord[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/coupons", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) return;
        const items = body?.data?.coupons || body?.data;
        if (!Array.isArray(items)) return;
        setCoupons(items.map((raw: Record<string, unknown>) => {
          const rawStatus = String(raw.status || "active").toLowerCase();
          const status = rawStatus === "expired" ? "Expired" : rawStatus === "scheduled" ? "Scheduled" : "Active";
          return {
            id: String(raw.id || raw._id || raw.code || ""),
            code: String(raw.code || ""),
            discountType: String(raw.discountType || raw.discount_type || "fixed").toLowerCase() === "percent" ? "percent" : "fixed",
            discountValue: Number(raw.discountValue ?? raw.discount_value ?? 0),
            appliesTo: String(raw.appliesTo || raw.applies_to || "All products"),
            minimumOrder: Number(raw.minimumOrder ?? raw.minimum_spend ?? raw.min_order_amount ?? 0),
            uses: Number(raw.uses ?? raw.used_count ?? 0),
            maxUses: Number(raw.maxUses ?? raw.max_uses ?? 0),
            expiresOn: String(raw.expiresOn || raw.expires_at || ""),
            status,
          } satisfies CouponRecord;
        }));
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const resolvedTab = availableTabs.some((tab) => tab.id === activeTab) ? activeTab : availableTabs[0]?.id;

  const selectedMeta = tabMeta.find((tab) => tab.id === resolvedTab);
  return <div className="page-wrap workspace-page app-management-page w-full min-w-0">
    <PageHeader eyebrow="Dr. Hair · App experience" title="App Management" description="Manage what patients see, receive, and need to access the Dr. Hair app." />
    <AdminTabBar activeKey={resolvedTab ?? ""} className="app-management-tabs admin-tab-bar--wide" label="App management sections">
      {availableTabs.map(({ id, label, icon: Icon }) => <AdminTab key={id} label={label} icon={Icon} aria-selected={resolvedTab === id} onClick={() => setActiveTab(id)} className="admin-tab--grow" />)}
    </AdminTabBar>
    {selectedMeta && <div className="app-section-context" aria-live="polite"><span className="app-section-context-mark" /><p>{selectedMeta.description}</p></div>}
    <section key={resolvedTab} className="tab-panel-transition" aria-label={selectedMeta?.label ?? "App management"}>
      {resolvedTab === "content" && <ContentManagement mode="content" scope="content" embedded onToast={onToast} permissions={permissions} onAudit={onAudit} />}
      {resolvedTab === "home" && <ContentManagement mode="content" scope="home" embedded availableOffers={coupons} onToast={onToast} permissions={permissions} onAudit={onAudit} />}
      {resolvedTab === "notifications" && <NotificationsPanel onToast={onToast} onAudit={onAudit} />}
      {resolvedTab === "updates" && role === "super-admin" && <AppUpdatesPanel onToast={onToast} onAudit={onAudit} />}
      {resolvedTab === "features" && role === "super-admin" && <FeatureControls onToast={onToast} features={appFeatures} onFeaturesChange={onFeaturesChange} panelAccess={panelAccess} onPanelAccessChange={onPanelAccessChange} onAudit={onAudit} />}
      {resolvedTab === "policies" && <StorePoliciesPanel onToast={onToast} />}
      {!resolvedTab && <div className="card empty-state">Your account does not have access to an App Management section.</div>}
    </section>
  </div>;
}
