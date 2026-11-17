"use client";

// The project deliberately disables framework image optimization for direct R2/FCM image URLs.
/* eslint-disable @next/next/no-img-element */

import { BellRing, CalendarClock, ImageIcon, Link2, Send, X } from "lucide-react";
import { useEffect, useState } from "react";
import { StatusPill } from "../../shared/components/ui";

type NotificationStatus = "Sent" | "Queued" | "Scheduled" | "Cancelled";
type Audience = "All app users" | "Active patients" | "Patients with a shared report" | "Accounts & assessments" | "Product customers" | "Appointment & treatment patients";
const audienceOptions: { value: Audience; label: string; note: string }[] = [
  { value: "Accounts & assessments", label: "Accounts & assessments", note: "All registered patients; assessment status is tracked separately" },
  { value: "Product customers", label: "Active product customers", note: "Paid purchase + app login in the last 30 days; product use itself is not tracked" },
  { value: "Appointment & treatment patients", label: "Appointments & treatment", note: "Patients with a non-cancelled appointment and a treatment record" },
  { value: "Active patients", label: "Active patients", note: "Patients with assessment, appointment, or progress activity" },
  { value: "Patients with a shared report", label: "Shared clinical reports", note: "Patients with a report shared to their app" },
  { value: "All app users", label: "All app users", note: "Every registered or guest device token" },
];
type DeepLinkTarget = "clinic_appointment" | "product" | "hair_test" | "videos" | "orders" | "profile";

interface NotificationRecord {
  id: string;
  title: string;
  message: string;
  audience: string;
  status: NotificationStatus;
  createdAt: string;
  scheduledAt?: string;
  imageUrl?: string;
  destination?: {
    type: string;
    screen?: string;
    entityId?: string;
  };
}

export function NotificationsPanel({ onToast, onAudit }: { onToast: (message: string) => void; onAudit: (action: string, target: string) => void }) {
  const [records, setRecords] = useState<NotificationRecord[]>([]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [audiences, setAudiences] = useState<Audience[]>(["Accounts & assessments"]);
  const [deepLink, setDeepLink] = useState<DeepLinkTarget>("clinic_appointment");
  const [productId, setProductId] = useState("prod-anti-dandruff-shampoo");
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [liveAudienceCount, setLiveAudienceCount] = useState(0);
  const audienceKey = audiences.join("|");
  const toggleAudience = (value: Audience) => {
    setAudiences((current) => current.includes(value)
      ? (current.length > 1 ? current.filter((item) => item !== value) : current)
      : [...current, value]);
  };

  useEffect(() => {
    fetch(`/api/admin/notifications?action=audience-count&audience=${encodeURIComponent(audienceKey)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setLiveAudienceCount(Number(data?.data?.targetCount) || 0);
      })
      .catch(() => setLiveAudienceCount(0));
  }, [audienceKey]);

  useEffect(() => {
    fetch("/api/admin/notifications?page=1&limit=20")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.data?.items && Array.isArray(data.data.items)) {
          const mapped: NotificationRecord[] = data.data.items.map((item: Record<string, unknown>) => {
            const rawStatus = String(item.status || "Sent");
            const status: NotificationStatus =
              rawStatus.toLowerCase() === "scheduled" ? "Scheduled"
              : rawStatus.toLowerCase() === "cancelled" ? "Cancelled"
              : rawStatus.toLowerCase() === "failed" ? "Queued"
              : "Sent";

            return {
              id: String(item.id || (typeof item._id === "string" ? `NTF-${item._id.slice(-5)}` : "001")),
              title: String(item.title || ""),
              message: String(item.body || ""),
              audience: String(item.audience || "All app users").split("|").join(", "),
              status,
              createdAt: new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date((typeof item.created_at === "string" || typeof item.created_at === "number") ? item.created_at : Date.now())),
              scheduledAt: item.scheduledAt ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.scheduledAt as string)) : undefined,
              imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : (typeof item.image_url === "string" ? item.image_url : undefined),
              destination: typeof item.destination === "string" ? item.destination : undefined,
            };
          });
          setRecords(mapped);
        }
      })
      .catch(() => {});
  }, []);

  const submit = async () => {
    if (liveAudienceCount <= 0) {
      onToast("No eligible patients were found for this audience. Refresh the audience before sending.");
      return;
    }
    const cleanTitle = title.trim();
    const cleanMessage = message.trim();
    if (cleanTitle.length < 3 || cleanTitle.length > 60) {
      onToast("Enter a notification title between 3 and 60 characters.");
      return;
    }
    if (cleanMessage.length < 10 || cleanMessage.length > 160) {
      onToast("Keep the notification message between 10 and 160 characters.");
      return;
    }
    if (scheduleMode === "later" && (!scheduledAt || new Date(scheduledAt).getTime() <= Date.now())) {
      onToast("Choose a future date and time for the notification.");
      return;
    }

    const destinationPayload = deepLink === "product"
      ? { type: "product", entityId: productId.trim() }
      : { type: "screen", screen: deepLink };

    const cleanImageUrl = imageUrl.trim();

    const payload = {
      title: cleanTitle,
      body: cleanMessage,
      audiences,
      imageUrl: cleanImageUrl || null,
      destination: destinationPayload,
      scheduled_at: scheduleMode === "later" ? new Date(scheduledAt).toISOString() : null,
      data: {
        destination_type: destinationPayload.type,
        ...(deepLink === "product" ? { entity_id: productId.trim() } : { screen: deepLink }),
        ...(cleanImageUrl ? { image_url: cleanImageUrl, imageUrl: cleanImageUrl } : {}),
      },
    };

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        onToast(json?.message || "Could not process notification. Please try again.");
        return;
      }

      const campaign = json?.data?.campaign;
      const isScheduled = json?.data?.is_scheduled || scheduleMode === "later";
      const record: NotificationRecord = {
        id: campaign?.id || json?.data?.notification?.id || `NTF-${Date.now().toString().slice(-5)}`,
        title: cleanTitle,
        message: cleanMessage,
        audience: audiences.join(", "),
        status: isScheduled ? "Scheduled" : "Sent",
        createdAt: "Just now",
        scheduledAt: isScheduled && scheduledAt ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(scheduledAt)) : undefined,
        imageUrl: cleanImageUrl || undefined,
        destination: destinationPayload,
      };

      setRecords((current) => [record, ...current]);
      onAudit(isScheduled ? "scheduled push notification" : "sent push notification", cleanTitle);
      
      onToast(isScheduled
        ? "Notification campaign scheduled successfully."
        : (json?.data?.sent != null && json.data.sent > 0
          ? `Push notification sent to ${json.data.sent} device(s).`
          : "Push notification created and dispatched."));

      setTitle("");
      setMessage("");
      setImageUrl("");
      setScheduledAt("");
    } catch {
      onToast("Could not send notification. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const cancel = async (record: NotificationRecord) => {
    try {
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", campaign_id: record.id }),
      });
      if (!res.ok) throw new Error("Cancellation failed");
      setRecords((current) => current.map((item) => (item.id === record.id ? { ...item, status: "Cancelled" } : item)));
      onAudit("cancelled app notification", record.title);
      onToast("Scheduled notification cancelled.");
    } catch {
      onToast("Could not cancel notification. Please try again.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,.9fr)]">
        <section className="card p-4 sm:p-5">
          <div className="section-row !p-0 !pb-4">
            <div>
              <h2 className="card-title">Compose push notification</h2>
              <p className="card-note">Write a privacy-safe message with dynamic screen deep linking for Dr. Hair patients.</p>
            </div>
            <span className="module-symbol"><BellRing size={16} /></span>
          </div>

          <div className="grid gap-3">
            <label className="field">
              <span>Notification title</span>
              <input
                value={title}
                maxLength={60}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Scalp Health Checkup Available"
              />
              <small>{title.trim().length}/60 characters</small>
            </label>

            <label className="field">
              <span>Message</span>
              <textarea
                value={message}
                maxLength={160}
                rows={3}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Brief update. Sensitive medical details will be shown inside the app after login."
              />
              <small>{message.trim().length}/160 characters</small>
            </label>

            <label className="field">
              <span className="flex items-center gap-1.5"><ImageIcon size={13} /> Push Notification Image URL (Optional)</span>
              <input
                value={imageUrl}
                onChange={(event) => setImageUrl(event.target.value)}
                placeholder="https://... (e.g. Cloudflare R2 image banner URL)"
              />
              <small>Attached to FCM rich push notification and shown on patient lock screen</small>
            </label>
            {imageUrl.trim() && (
              <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-2 max-w-xs">
                <p className="text-[10px] font-semibold text-slate-500 mb-1">Image preview:</p>
                <img
                  src={imageUrl.trim()}
                  alt="Push notification preview"
                  className="h-24 w-full rounded-lg object-cover border border-slate-200/80"
                  onError={(e) => { (e.currentTarget as HTMLElement).style.display = "none"; }}
                />
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <fieldset className="field min-w-0">
                <legend>Patient groups</legend>
                <div className="grid gap-1.5">
                  {audienceOptions.map((option) => (
                    <label key={option.value} className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 px-3 py-2 transition-colors hover:bg-slate-50 has-[:checked]:border-teal-600/40 has-[:checked]:bg-teal-50/50">
                      <input
                        type="checkbox"
                        checked={audiences.includes(option.value)}
                        onChange={() => toggleAudience(option.value)}
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-teal-700"
                      />
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-slate-800">{option.label}</span>
                        <span className="mt-0.5 block text-[10px] leading-snug text-slate-500">{option.note}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <small aria-live="polite">{liveAudienceCount.toLocaleString("en-IN")} eligible device{liveAudienceCount === 1 ? "" : "s"} · groups are combined without duplicate devices</small>
              </fieldset>

              <label className="field">
                <span className="flex items-center gap-1"><Link2 size={12} /> App Deep Link Destination</span>
                <select value={deepLink} onChange={(event) => setDeepLink(event.target.value as DeepLinkTarget)}>
                  <option value="clinic_appointment">Clinic Appointment Booking</option>
                  <option value="product">Specific Product</option>
                  <option value="hair_test">Hair Assessment & Test</option>
                  <option value="videos">Patient Video Stories</option>
                  <option value="orders">Orders History</option>
                  <option value="profile">Patient Routine / Care Plan</option>
                </select>
                <small>Dynamic screen triggered upon tap</small>
              </label>
            </div>

            {deepLink === "product" && (
              <label className="field">
                <span>Product ID / Slug</span>
                <input
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  placeholder="e.g. prod-anti-dandruff-shampoo"
                />
                <small>App opens Product Details view directly for this item</small>
              </label>
            )}

            <fieldset className="grid gap-2 border-0 p-0">
              <legend className="mb-2 text-[11px] font-semibold text-slate-600">Delivery timing</legend>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`filter-button ${scheduleMode === "now" ? "selected" : ""}`}
                  onClick={() => setScheduleMode("now")}
                >
                  <Send size={13} /> Send Now
                </button>
                <button
                  type="button"
                  className={`filter-button ${scheduleMode === "later" ? "selected" : ""}`}
                  onClick={() => setScheduleMode("later")}
                >
                  <CalendarClock size={13} /> Schedule
                </button>
              </div>
            </fieldset>

            {scheduleMode === "later" && (
              <label className="field">
                <span>Scheduled date and time</span>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(event) => setScheduledAt(event.target.value)}
                />
                <small>Choose a future local date and time.</small>
              </label>
            )}

            <div className="flex justify-end pt-2">
              <button
                className="button button-primary"
                type="button"
                disabled={isSubmitting}
                onClick={submit}
              >
                <Send size={14} />
                {isSubmitting ? "Sending..." : scheduleMode === "later" ? "Save Schedule" : "Send Push Notification"}
              </button>
            </div>
          </div>
        </section>

        <section className="card p-4 sm:p-5">
          <div className="section-row !p-0 !pb-2">
            <div>
              <h2 className="card-title">Recent notification history</h2>
              <p className="card-note">Delivered FCM push notifications and in-app announcements.</p>
            </div>
            <span className="text-[10px] text-slate-400">{records.length} records</span>
          </div>

          <div className="divide-y divide-slate-100">
            {records.map((record) => (
              <article key={record.id} className="flex items-start gap-3 py-3.5">
                <span className="activity-icon mt-0.5"><BellRing size={14} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-xs text-slate-800">{record.title}</strong>
                    <StatusPill status={record.status} />
                    {record.destination?.screen && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">
                        ➔ {record.destination.screen}
                      </span>
                    )}
                  </div>
                  <p className="mb-1 mt-1 text-[11px] leading-5 text-slate-500">{record.message}</p>
                  {record.imageUrl && (
                    <div className="mb-1.5 mt-1">
                      <img
                        src={record.imageUrl}
                        alt="Notification attachment"
                        className="h-16 w-28 rounded-lg border border-slate-200/80 object-cover shadow-xs"
                        onError={(e) => { (e.currentTarget as HTMLElement).style.display = "none"; }}
                      />
                    </div>
                  )}
                  <div className="text-[10px] text-slate-400">
                    {record.audience} · {record.scheduledAt ?? record.createdAt}
                  </div>
                </div>
                {record.status === "Scheduled" && (
                  <button
                    className="row-action"
                    aria-label={`Cancel ${record.title}`}
                    title="Cancel schedule"
                    onClick={() => cancel(record)}
                  >
                    <X size={14} />
                  </button>
                )}
              </article>
            ))}
            {records.length === 0 && (
              <div className="empty-state">No notifications recorded yet.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
