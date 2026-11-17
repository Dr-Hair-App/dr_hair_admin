"use client";

import { AlertCircle, BellRing, CalendarDays, CheckCircle2, ClipboardCheck, FileCheck2, FileText, Home, LockKeyhole, Package, ShoppingBag, Star, UsersRound, Video } from "lucide-react";
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { FeatureRecord } from "../../shared/types";
import { Modal, ToggleSwitch } from "../../shared/components/ui";

const iconFor: Record<string, React.ComponentType<{ size?: number }>> = {
  shop: ShoppingBag,
  clinic_appointment: CalendarDays,
  assessment: ClipboardCheck,
  videos: Video,
  reviews: Star,
  routine: CheckCircle2,
  reminders: BellRing,
  reports: FileCheck2,
};
const panelModules = [
  { id: "patients", title: "Patients & assessments", description: "Patient profiles, assessment review, and treatment history.", enabled: true, admins: "Individual access in Admin users" },
  { id: "catalog", title: "Product catalog", description: "Product content, pricing, supply plans, and stock state.", enabled: true, admins: "Individual access in Admin users" },
  { id: "content", title: "App Management", description: "Content, home placements, and app-facing experiences.", enabled: true, admins: "Individual access in Admin users" },
  { id: "orders", title: "Orders", description: "Order list, fulfilment state, and customer details.", enabled: true, admins: "Individual access in Admin users" },
  { id: "bookings", title: "Clinic appointments", description: "Record appointments arranged with the single clinic doctor outside the app.", enabled: true, admins: "Individual access in Admin users" },
  { id: "tests", title: "Hair tests & reports", description: "Patient test uploads, clinical review, and report sharing workflow.", enabled: true, admins: "Individual access in Admin users" },
];

export function FeatureControls({
  onToast, features, onFeaturesChange, panelAccess, onPanelAccessChange, onAudit,
}: {
  onToast: (message: string) => void;
  features: FeatureRecord[];
  onFeaturesChange: Dispatch<SetStateAction<FeatureRecord[]>>;
  panelAccess: Record<string, boolean>;
  onPanelAccessChange: (id: string, enabled: boolean) => void;
  onAudit: (action: string, target: string) => void;
}) {
  const [tab, setTab] = useState<"app" | "panel">("app");
  const [target, setTarget] = useState<{ id: string; title: string; enabled: boolean; kind: "app" | "panel" } | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const panelState = panelModules.map((item) => ({ ...item, enabled: panelAccess[item.id] ?? item.enabled }));
  const grouped = useMemo(() => features.reduce<Record<string, FeatureRecord[]>>((acc, feature) => { (acc[feature.group] ??= []).push(feature); return acc; }, {}), [features]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/admin/features", { cache: "no-store" }),
      fetch("/api/admin/features?platform=admin", { cache: "no-store" }),
    ])
      .then(async ([appResponse, panelResponse]) => {
        if (!appResponse.ok || !panelResponse.ok) throw new Error("Feature settings could not be loaded.");
        return Promise.all([appResponse.json(), panelResponse.json()]);
      })
      .then(([appPayload, panelPayload]) => {
        if (!active) return;
        const appItems = Array.isArray(appPayload?.data?.items) ? appPayload.data.items : [];
        const panelItems = Array.isArray(panelPayload?.data?.items) ? panelPayload.data.items : [];
        const liveAppMap = new Map(appItems.filter((item: { platform?: string }) => item.platform !== "admin").map((item: { key: string }) => [item.key, item]));
        onFeaturesChange((current) => current.map((feature) => {
          const live = liveAppMap.get(feature.id);
          return live ? {
            ...feature,
            title: live.title || feature.title,
            description: live.description || feature.description,
            group: live.group || feature.group,
            enabled: typeof live.enabled === "boolean" ? live.enabled : feature.enabled,
          } : feature;
        }));
        const panelAccessMap = Object.fromEntries(panelItems
          .filter((item: { key?: string }) => typeof item.key === "string" && item.key.startsWith("admin_"))
          .map((item: { key: string; enabled?: boolean }) => [item.key.slice("admin_".length), item.enabled !== false]));
        if (Object.keys(panelAccessMap).length) {
          for (const [id, enabled] of Object.entries(panelAccessMap)) onPanelAccessChange(id, enabled);
        }
        setLoadError("");
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : "Feature settings could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, [onFeaturesChange, onPanelAccessChange]);

  const commitToggle = async () => {
    if (!target) return;
    const newEnabled = !target.enabled;
    setSaving(true);
    try {
      const key = target.kind === "panel" ? `admin_${target.id}` : target.id;
      const response = await fetch(`/api/admin/features/${encodeURIComponent(key)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newEnabled, ...(target.kind === "panel" ? { platform: "admin", group: "Admin panel access" } : {}) }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.status === "error") throw new Error(payload?.message || "Could not save this setting.");
      if (target.kind === "app") {
        onFeaturesChange((current) => current.map((item) => item.id === target.id ? { ...item, enabled: newEnabled } : item));
      } else {
        onPanelAccessChange(target.id, newEnabled);
      }
      onAudit(target.enabled ? "disabled" : "enabled", target.title);
      onToast(`${target.title} ${newEnabled ? "enabled" : "disabled"}.`);
      setTarget(null);
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Could not save this setting.");
    } finally {
      setSaving(false);
    }
  };

  return <section className="space-y-4">
    <div className="notice"><AlertCircle size={14} /><span>These are live global feature flags. Toggling a feature updates the mobile app configuration immediately, controlling what sections, buttons, and care flows are active for patients.</span></div>
    {loadError && <div className="notice" role="alert"><AlertCircle size={14} /><span>{loadError} Check your connection and reload this section before changing flags.</span></div>}
    <div style={{ display: "flex", gap: 8, borderBottom: "1px solid var(--line)", margin: "17px 0 12px" }}>
      <button className={`filter-button ${tab === "app" ? "selected" : ""}`} style={tab === "app" ? { borderColor: "#c7e2dd", color: "var(--teal)", background: "#f3faf8" } : { borderColor: "transparent" }} onClick={() => setTab("app")}><Home size={13} />App features</button>
      <button className={`filter-button ${tab === "panel" ? "selected" : ""}`} style={tab === "panel" ? { borderColor: "#c7e2dd", color: "var(--teal)", background: "#f3faf8" } : { borderColor: "transparent" }} onClick={() => setTab("panel")}><LockKeyhole size={13} />Admin panel access</button>
    </div>
    {tab === "app" ? <>
      {Object.entries(grouped).map(([group, items]) => <section key={group}>
        <div className="feature-top"><div><h2>{group}</h2><p>Control availability for customers using the Dr. Hair app.</p></div><span style={{ color: "#8490a0", fontSize: 10 }}>{items.filter((item) => item.enabled).length} of {items.length} enabled</span></div>
        <div className="module-grid grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => { const Icon = iconFor[item.id] ?? Package; return <article className="card module-card" key={item.id}>
          <div className="module-top"><span className="module-symbol"><Icon size={17} /></span><ToggleSwitch checked={item.enabled} label={`${item.enabled ? "Disable" : "Enable"} ${item.title}`} onChange={() => setTarget({ id: item.id, title: item.title, enabled: item.enabled, kind: "app" })} /></div>
          <h3 className="module-title">{item.title}</h3><p className="module-desc">{item.description}</p>
          <div className="module-foot"><span>{item.admins} can manage</span><span className={`status ${item.enabled ? "status-active" : "status-inactive"}`}>{item.enabled ? "Enabled" : "Disabled"}</span></div>
        </article>; })}</div>
      </section>)}
    </> : <>
      <div className="feature-top"><div><h2>Admin panel modules</h2><p>Choose which operational sections are available to Admin users.</p></div><span style={{ color: "#8490a0", fontSize: 10 }}>{panelState.filter((item) => item.enabled).length} of {panelState.length} enabled</span></div>
      <div className="module-grid grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{panelState.map((item) => { const Icon = item.id === "patients" ? ClipboardCheck : item.id === "catalog" ? Package : item.id === "orders" ? ShoppingBag : item.id === "bookings" ? UsersRound : item.id === "tests" ? FileCheck2 : FileText; return <article className="card module-card" key={item.id}>
        <div className="module-top"><span className="module-symbol"><Icon size={17} /></span><ToggleSwitch checked={item.enabled} label={`${item.enabled ? "Disable" : "Enable"} ${item.title}`} onChange={() => setTarget({ id: item.id, title: item.title, enabled: item.enabled, kind: "panel" })} /></div>
        <h3 className="module-title">{item.title}</h3><p className="module-desc">{item.description}</p><div className="module-foot"><span>Available to: {item.admins}</span><span className={`status ${item.enabled ? "status-active" : "status-inactive"}`}>{item.enabled ? "Enabled" : "Disabled"}</span></div>
      </article>; })}</div>
    </>}
    <div className="callout" style={{ marginTop: 17, display: "flex", gap: 12 }}><div className="callout-icon"><LockKeyhole size={16} /></div><div><h3>Admin navigation availability</h3><p>Panel flags are stored in the backend and control navigation visibility for staff. Backend APIs still enforce each admin account’s permissions. Super Admins retain access to this control center.</p></div></div>
    {target && <Modal title={`${target.enabled ? "Disable" : "Enable"} ${target.title}?`} description={target.enabled ? "This will hide the section from staff navigation. Existing records remain saved." : "This will show the section again for staff accounts with the required permissions."} submitLabel={saving ? "Saving…" : target.enabled ? "Disable feature" : "Enable feature"} onClose={() => !saving && setTarget(null)} onSubmit={commitToggle}><div className="notice"><AlertCircle size={14} /><span>This change is saved to the backend and applies to navigation visibility. User and data permissions remain enforced separately.</span></div></Modal>}
  </section>;
}
