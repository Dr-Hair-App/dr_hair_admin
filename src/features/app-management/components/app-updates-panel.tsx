"use client";

import { AlertTriangle, Apple, CheckCircle2, ExternalLink, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import type { Platform } from "../types";
import { Modal, ToggleSwitch } from "../../shared/components/ui";

interface UpdatePolicy {
  latestVersion: string;
  latestBuild: string;
  minimumVersion: string;
  minimumBuild: string;
  storeUrl: string;
  updateMessage: string;
  releaseNotes: string;
  mode: "recommended" | "required";
  scheduledAt: string;
  enabled: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string;
}

type PlatformPolicies = Record<Platform, UpdatePolicy>;
type ApiPolicy = Record<string, unknown>;

const initialPolicy = (): UpdatePolicy => ({
  latestVersion: "1.0.0", latestBuild: "1", minimumVersion: "1.0.0", minimumBuild: "1",
  storeUrl: "", updateMessage: "A new Dr. Hair app update is available.", releaseNotes: "",
  mode: "recommended", scheduledAt: "", enabled: false, maintenanceMode: false,
  maintenanceMessage: "Dr. Hair is undergoing maintenance.",
});

const initialPolicies: PlatformPolicies = { android: initialPolicy(), ios: initialPolicy() };
const versionPattern = /^\d+\.\d+\.\d+$/;

function compareBuild(versionA: string, buildA: string, versionB: string, buildB: string) {
  const partsA = versionA.split(".").map(Number);
  const partsB = versionB.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (partsA[index] !== partsB[index]) return partsA[index] - partsB[index];
  }
  return Number(buildA) - Number(buildB);
}

function getValidationError(policy: UpdatePolicy) {
  if (!versionPattern.test(policy.latestVersion) || !versionPattern.test(policy.minimumVersion)) return "Use a semantic version such as 1.2.3 for both version fields.";
  if (!/^\d+$/.test(policy.latestBuild) || !/^\d+$/.test(policy.minimumBuild)) return "Build numbers must be whole numbers.";
  if (Number(policy.latestBuild) < 1 || Number(policy.minimumBuild) < 1) return "Build numbers must be at least 1.";
  if (compareBuild(policy.minimumVersion, policy.minimumBuild, policy.latestVersion, policy.latestBuild) > 0) return "Minimum supported version/build cannot be newer than the latest release.";
  if (policy.updateMessage.trim().length < 8 || policy.updateMessage.trim().length > 160) return "Update message must be between 8 and 160 characters.";
  if (policy.enabled && !policy.maintenanceMode) {
    try {
      if (new URL(policy.storeUrl).protocol !== "https:") return "Use a secure HTTPS store link before enabling updates.";
    } catch {
      return "Add a valid HTTPS store link before enabling updates.";
    }
  }
  if (policy.scheduledAt && new Date(policy.scheduledAt).getTime() <= Date.now()) return "Choose a future date and time, or clear the schedule to apply now.";
  if (policy.maintenanceMode && policy.maintenanceMessage.trim().length < 8) return "Add a clear maintenance message before enabling maintenance mode.";
  return "";
}

function toPolicy(value: ApiPolicy): UpdatePolicy {
  const scheduled = typeof value.scheduledAt === "string" ? new Date(value.scheduledAt) : null;
  const scheduledAt = scheduled && !Number.isNaN(scheduled.getTime())
    ? new Date(scheduled.getTime() - scheduled.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
    : "";
  return {
    latestVersion: String(value.latestVersion || "1.0.0"), latestBuild: String(value.latestBuild || "1"),
    minimumVersion: String(value.minVersion || "1.0.0"), minimumBuild: String(value.minBuild || "1"),
    storeUrl: String(value.downloadUrl || ""), updateMessage: String(value.updateMessage || "A new Dr. Hair app update is available."),
    releaseNotes: String(value.releaseNotes || ""), mode: value.forceUpdate ? "required" : "recommended",
    scheduledAt, enabled: value.enabled !== false, maintenanceMode: value.maintenanceMode === true,
    maintenanceMessage: String(value.maintenanceMessage || "Dr. Hair is undergoing maintenance."),
  };
}

export function AppUpdatesPanel({ onToast, onAudit }: { onToast: (message: string) => void; onAudit: (action: string, target: string) => void }) {
  const [policies, setPolicies] = useState<PlatformPolicies>(initialPolicies);
  const [confirming, setConfirming] = useState<{ platform: Platform; policy: UpdatePolicy } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState<Platform | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/releases", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.message || "Release policies could not be loaded.");
        const items: ApiPolicy[] = Array.isArray(payload?.data?.items) ? payload.data.items : [];
        setPolicies((current) => {
          const next = { ...current };
          for (const item of items) {
            if (item.platform === "android" || item.platform === "ios") next[item.platform] = toPolicy(item);
          }
          return next;
        });
        setLoadError("");
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "Release policies could not be loaded.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const save = (platform: Platform, policy: UpdatePolicy) => {
    const error = getValidationError(policy);
    if (error) return onToast(error);
    if (policy.enabled && policy.mode === "required") {
      setConfirming({ platform, policy });
      return;
    }
    void commitSave(platform, policy);
  };

  const commitSave = async (platform: Platform, policy: UpdatePolicy) => {
    setSaving(platform);
    try {
      const response = await fetch(`/api/admin/releases/${encodeURIComponent(platform)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          minVersion: policy.minimumVersion, minBuild: policy.minimumBuild,
          latestVersion: policy.latestVersion, latestBuild: policy.latestBuild,
          forceUpdate: policy.mode === "required" && policy.enabled,
          enabled: policy.enabled, scheduledAt: policy.scheduledAt ? new Date(policy.scheduledAt).toISOString() : null,
          maintenanceMode: policy.maintenanceMode, maintenanceMessage: policy.maintenanceMessage,
          downloadUrl: policy.storeUrl, updateMessage: policy.updateMessage, releaseNotes: policy.releaseNotes,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.status === "error") throw new Error(payload?.message || "Release policy could not be saved.");
      const saved = payload?.data?.data && typeof payload.data.data === "object" ? payload.data.data : payload?.data;
      setPolicies((current) => ({ ...current, [platform]: saved && typeof saved === "object" ? toPolicy(saved) : policy }));
      const target = `${platform === "android" ? "Android" : "iOS"} ${policy.mode} update · minimum ${policy.minimumVersion} (${policy.minimumBuild})`;
      onAudit(policy.scheduledAt ? "scheduled app release policy" : "updated app release policy", target);
      onToast(policy.enabled ? policy.scheduledAt ? `${platform === "android" ? "Android" : "iOS"} update policy scheduled.` : `${platform === "android" ? "Android" : "iOS"} update policy saved.` : `${platform === "android" ? "Android" : "iOS"} update policy disabled.`);
      setConfirming(null);
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Release policy could not be saved.");
    } finally {
      setSaving(null);
    }
  };

  return <div className="space-y-4">
    <div className="notice"><AlertTriangle size={14} /><span>Policies are loaded from and saved to the backend. Required updates apply only after their scheduled time; use the store link for the published release.</span></div>
    {loadError && <div className="notice" role="alert"><AlertTriangle size={14} /><span>{loadError} No settings were changed. Reload this section after connectivity is restored.</span></div>}
    {loading && <p className="card-note" role="status">Loading release policies…</p>}
    <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
      {(["android", "ios"] as Platform[]).map((platform) => <UpdatePolicyCard key={platform} platform={platform} value={policies[platform]} saving={saving === platform} onChange={(next) => setPolicies((current) => ({ ...current, [platform]: next }))} onSave={(next) => save(platform, next)} />)}
    </div>
    <div className="callout flex gap-3"><span className="callout-icon"><CheckCircle2 size={16} /></span><div><h3>Recommended and required updates</h3><p>Recommended updates can be dismissed. Required updates enforce the configured minimum version and build. App version and build checks are returned by the public app configuration endpoint.</p></div></div>
    {confirming && <Modal title={`Require the ${confirming.platform === "android" ? "Android" : "iOS"} update?`} description={`This would block app versions below ${confirming.policy.minimumVersion} build ${confirming.policy.minimumBuild} when the policy starts.`} submitLabel={saving ? "Saving…" : "Confirm required update"} onClose={() => !saving && setConfirming(null)} onSubmit={() => void commitSave(confirming.platform, confirming.policy)}><div className="notice"><AlertTriangle size={14} /><span>Review the minimum version and store link carefully. Existing users below this version will be asked to update before continuing.</span></div><p className="mt-3 text-xs text-slate-500">{confirming.platform === "android" ? "Play Store" : "App Store"} link: <a className="text-teal-700 underline" href={confirming.policy.storeUrl} target="_blank" rel="noreferrer">Open {confirming.platform === "android" ? "Play Store" : "App Store"} <ExternalLink className="inline" size={12} /></a></p></Modal>}
  </div>;
}

function UpdatePolicyCard({ platform, value: draft, saving, onChange, onSave }: { platform: Platform; value: UpdatePolicy; saving: boolean; onChange: (policy: UpdatePolicy) => void; onSave: (policy: UpdatePolicy) => void }) {
  const Icon = platform === "android" ? Smartphone : Apple;
  const update = <K extends keyof UpdatePolicy>(key: K, next: UpdatePolicy[K]) => onChange({ ...draft, [key]: next });
  const status = !draft.enabled ? "Disabled" : draft.scheduledAt ? "Scheduled" : draft.maintenanceMode ? "Maintenance active" : "Enabled";
  return <section className="card p-4 sm:p-5">
    <div className="section-row !p-0 !pb-4"><div className="flex items-center gap-3"><span className="module-symbol"><Icon size={17} /></span><div><h2 className="card-title">{platform === "android" ? "Android" : "iOS"} release policy</h2><p className="card-note">Set versions and behavior for this app platform.</p></div></div><ToggleSwitch checked={draft.enabled} label={`${draft.enabled ? "Disable" : "Enable"} ${platform} update policy`} onChange={() => update("enabled", !draft.enabled)} /></div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="field"><span>Latest version</span><input value={draft.latestVersion} onChange={(event) => update("latestVersion", event.target.value)} placeholder="1.2.0" /></label>
      <label className="field"><span>Latest build number</span><input inputMode="numeric" value={draft.latestBuild} onChange={(event) => update("latestBuild", event.target.value)} placeholder="42" /></label>
      <label className="field"><span>Minimum supported version</span><input value={draft.minimumVersion} onChange={(event) => update("minimumVersion", event.target.value)} placeholder="1.0.0" /></label>
      <label className="field"><span>Minimum supported build</span><input inputMode="numeric" value={draft.minimumBuild} onChange={(event) => update("minimumBuild", event.target.value)} placeholder="1" /></label>
      <label className="field sm:col-span-2"><span>{platform === "android" ? "Play Store link" : "App Store link"}</span><input type="url" value={draft.storeUrl} onChange={(event) => update("storeUrl", event.target.value)} placeholder={platform === "android" ? "https://play.google.com/store/apps/details?id=…" : "https://apps.apple.com/app/id…"} /></label>
      <label className="field sm:col-span-2"><span>Update message</span><input maxLength={160} value={draft.updateMessage} onChange={(event) => update("updateMessage", event.target.value)} /></label>
      <label className="field sm:col-span-2"><span>Release notes</span><textarea rows={2} maxLength={500} value={draft.releaseNotes} onChange={(event) => update("releaseNotes", event.target.value)} placeholder="What changed in this release?" /></label>
      <label className="field sm:col-span-2"><span>Update behavior</span><select value={draft.mode} onChange={(event) => update("mode", event.target.value as UpdatePolicy["mode"])}><option value="recommended">Recommended · dismissible</option><option value="required">Required · blocks old versions</option></select></label>
      <label className="field sm:col-span-2"><span>Schedule start (optional)</span><input type="datetime-local" value={draft.scheduledAt} onChange={(event) => update("scheduledAt", event.target.value)} /><small>Leave empty to apply immediately. The backend evaluates a future schedule at app-config request time.</small></label>
      <label className="field sm:col-span-2 flex-row items-center"><input type="checkbox" checked={draft.maintenanceMode} onChange={(event) => update("maintenanceMode", event.target.checked)} /><span>Enable maintenance mode</span></label>
      {draft.maintenanceMode && <label className="field sm:col-span-2"><span>Maintenance message</span><input maxLength={200} value={draft.maintenanceMessage} onChange={(event) => update("maintenanceMessage", event.target.value)} /></label>}
    </div>
    <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between"><span className={`status ${draft.enabled ? "status-active" : "status-inactive"}`}>{status}</span><button className="button button-primary" type="button" disabled={saving} onClick={() => onSave(draft)}>{saving ? "Saving…" : `Save ${draft.mode === "required" ? "required" : "recommended"} policy`}</button></div>
  </section>;
}
