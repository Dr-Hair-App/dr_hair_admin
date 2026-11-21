"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, BellRing, CalendarDays, CheckCheck, ChevronRight, FileText, PackageCheck, UsersRound } from "lucide-react";
import { PageHeader } from "../../shared/components/ui";
import { useSessionState } from "../../shared/lib/use-session-state";
import { cachedFetch, TTL_PROFILES } from "../../shared/lib/api-cache";
import type { AuditEventRecord, PageKey, Role } from "../../shared/types";

type NotificationCategory = "Appointments" | "Patients" | "Reports" | "Orders" | "Activity";
type NotificationFilter = "All" | "Unread" | NotificationCategory;
type NavigateOptions = { bookingDate?: string; anchor?: string };
type DashboardNotification = {
  id: string;
  category: NotificationCategory;
  title: string;
  detail: string;
  time: string;
  page: PageKey;
  bookingDate?: string;
  anchor?: string;
  unreadTone: string;
};

const filters: NotificationFilter[] = ["All", "Unread", "Appointments", "Patients", "Reports", "Orders", "Activity"];
type ApiRecord = Record<string, unknown>;
type LiveNotificationData = {
  appointments: ApiRecord[];
  orders: ApiRecord[];
  hairTests: ApiRecord[];
  reports: ApiRecord[];
  auditEvents: ApiRecord[];
};
const emptyLiveData: LiveNotificationData = {
  appointments: [], orders: [], hairTests: [], reports: [], auditEvents: [],
};

export function NotificationCenter({
  role,
  userName,
  permissions,
  onNavigate,
}: {
  role: Role;
  userName: string;
  permissions: string[];
  events?: AuditEventRecord[];
  onNavigate: (page: PageKey, options?: NavigateOptions) => void;
}) {
  const [liveData, setLiveData] = useState<LiveNotificationData>(emptyLiveData);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [readIds, setReadIds] = useSessionState<string[]>("drhair-admin-notification-read", []);
  const [filter, setFilter] = useState<NotificationFilter>("All");

  useEffect(() => {
    const controller = new AbortController();
    const sources: [keyof LiveNotificationData, string][] = [];
    if (hasPermission(role, permissions, "bookings.manage")) sources.push(["appointments", "/api/admin/appointments?limit=100"]);
    if (hasPermission(role, permissions, "orders.manage")) sources.push(["orders", "/api/admin/orders?limit=100"]);
    if (hasPermission(role, permissions, "hair-tests.view")) sources.push(["hairTests", "/api/admin/hair-tests?limit=100"]);
    if (hasPermission(role, permissions, "reports.share")) sources.push(["reports", "/api/admin/reports?limit=100"]);
    if (hasPermission(role, permissions, "audit.view")) sources.push(["auditEvents", "/api/admin/audit-logs?limit=100"]);
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return [];
      setIsLoading(true);
      setLoadError("");
      return Promise.all(sources.map(async ([key, url]) => {
      try {
        const response = await cachedFetch(
          url,
          { cache: "no-store" },
          TTL_PROFILES.navigationShort,
          { forceRefresh: reloadKey > 0 },
        );
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : "A notification source could not be loaded.");
        const data = body.data && typeof body.data === "object" ? body.data : {};
        const items = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];
        return { key, items: items.filter((item: unknown): item is ApiRecord => Boolean(item) && typeof item === "object"), error: "" };
      } catch (error) {
        return { key, items: [], error: error instanceof Error ? error.message : "A notification source could not be loaded." };
      }
      }));
    }).then((results) => {
      if (controller.signal.aborted) return;
      const next = { ...emptyLiveData };
      for (const result of results) next[result.key] = result.items;
      setLiveData(next);
      setLoadError(results.find((result) => result.error)?.error ?? "");
      setIsLoading(false);
    });
    return () => controller.abort();
  }, [permissions, reloadKey, role]);

  const visibleEvents = useMemo(() => liveData.auditEvents
    .map(toAuditEvent)
    .filter((event): event is AuditEventRecord => event !== null)
    .filter((event) => role === "super-admin" || event.who === userName), [liveData.auditEvents, role, userName]);

  const notifications = useMemo(() => {
    const createdAppointmentIds = new Set(visibleEvents
      .filter((event) => /created clinic appointment/i.test(event.action))
      .map((event) => event.target.split("·")[0].trim()));

    const appointmentItems: DashboardNotification[] = visibleEvents
      .filter((event) => event.type === "Bookings" && hasPermission(role, permissions, "bookings.manage"))
      .map((event, index) => {
        const bookingId = event.target.split("·")[0].trim();
        const booking = liveData.appointments.find((item) => String(item.id ?? item._id ?? "") === bookingId);
        const created = /created clinic appointment/i.test(event.action);
        const customer = booking ? recordText(booking, "customer", "name", "patient_name") : event.target;
        const service = booking ? recordText(booking, "service", "reason") : event.action;
        const startsAt = booking ? recordText(booking, "starts_at", "startsAt", "date") : "";
        return {
          id: `event:${event.type}:${event.who}:${event.time}:${event.target}:${index}`,
          category: "Appointments",
          title: created ? "New clinic appointment" : "Appointment updated",
          detail: `${customer} · ${service}`,
          time: event.time,
          page: "bookings",
          bookingDate: startsAt ? dateKey(startsAt) : undefined,
          unreadTone: "bg-[#E6F4F1] text-[#237A70]",
        };
      });

    liveData.appointments.filter((booking) => ["requested", "pending"].includes(recordText(booking, "status", "opd_status").toLowerCase()) && !createdAppointmentIds.has(recordText(booking, "id", "_id"))).forEach((booking) => {
      const id = recordText(booking, "id", "_id");
      const startsAt = recordText(booking, "starts_at", "startsAt", "date");
      appointmentItems.push({
        id: `booking-request:${id}`,
        category: "Appointments",
        title: "Appointment needs confirmation",
        detail: `${recordText(booking, "customer", "name", "patient_name")} · ${recordText(booking, "service", "reason")}`,
        time: startsAt ? formatDateTime(startsAt) : "",
        page: "bookings",
        bookingDate: startsAt ? dateKey(startsAt) : undefined,
        unreadTone: "bg-[#E6F4F1] text-[#237A70]",
      });
    });

    const patientItems: DashboardNotification[] = liveData.hairTests
      .filter((test) => ["submitted", "review", "in_review", "under_review", "pending"].includes(recordText(test, "status").toLowerCase()))
      .map((test) => {
        const patientName = recordText(test, "full_name", "patient_name", "name");
        const concern = recordText(test, "main_concern", "hair_loss_stage", "primary_concern");
        const detail = [patientName, concern]
          .filter((value) => value !== "Details unavailable")
          .join(" · ") || "Hair assessment submitted";
        return {
        id: `patient-review:${recordText(test, "reference_no", "referenceNo", "id")}`,
        category: "Patients",
        title: "Patient assessment needs review",
        detail,
        time: recordText(test, "created_at", "submitted_at", "date"),
        page: "patients",
        anchor: "patient-reviews",
        unreadTone: "bg-[#EEF4FF] text-[#436693]",
      };
      });

    const reportItems: DashboardNotification[] = liveData.reports
      .filter((report) => ["draft", "in review", "pending", "ready"].includes(recordText(report, "status").toLowerCase()))
      .map((report) => ({
        id: `report:${recordText(report, "id", "_id")}`,
        category: "Reports",
        title: recordText(report, "status").toLowerCase() === "ready" ? "Patient report is ready to share" : "Patient report needs review",
        detail: `${recordText(report, "title", "file_name")} · ${recordText(report, "patient_code", "user_id")}`,
        time: recordText(report, "created_at", "uploaded_at", "date"),
        page: "patients",
        anchor: "patient-reviews",
        unreadTone: "bg-[#F2EEFF] text-[#6757A6]",
      }));

    const orderItems: DashboardNotification[] = liveData.orders
      .filter((order) => ["new", "pending", "needs attention"].includes(recordText(order, "fulfillment_status", "status").toLowerCase()))
      .map((order) => ({
        id: `order-action:${recordText(order, "id", "_id")}`,
        category: "Orders",
        title: recordText(order, "fulfillment_status", "status").toLowerCase() === "needs attention" ? "Order needs attention" : "Order needs fulfilment",
        detail: `${recordText(order, "order_number", "id", "_id")} · ${recordText(order, "customer_name", "customer")} · ${recordText(order, "item_summary", "product_name")}`,
        time: recordText(order, "created_at", "date"),
        page: "orders",
        unreadTone: "bg-[#FFF4E3] text-[#966218]",
      }));

    const activityItems: DashboardNotification[] = visibleEvents
      .filter((event) => event.type !== "Bookings")
      .slice(0, 12)
      .map((event, index) => {
        const category = event.type === "Orders" || event.type === "Commerce" ? "Orders"
          : event.type === "Testing" ? "Reports"
          : event.type === "Clinical" ? "Patients" : "Activity";
        return {
          id: `activity:${event.type}:${event.who}:${event.time}:${event.target}:${index}`,
          category,
          title: activityTitle(event),
          detail: `${event.who} · ${event.target}`,
          time: event.time,
          page: pageForEvent(event, role),
          anchor: category === "Patients" ? "patient-reviews" : undefined,
          unreadTone: categoryTone(category),
        };
      });

    return [...appointmentItems, ...patientItems, ...reportItems, ...orderItems, ...activityItems];
  }, [liveData, role, permissions, visibleEvents]);

  const unreadCount = notifications.filter((item) => !readIds.includes(item.id)).length;
  const appointmentCount = notifications.filter((item) => item.category === "Appointments" && !readIds.includes(item.id)).length;
  const needsAttentionCount = notifications.filter((item) => item.category !== "Activity" && !readIds.includes(item.id)).length;
  const visibleNotifications = notifications.filter((item) => {
    if (filter === "Unread" && readIds.includes(item.id)) return false;
    return filter === "All" || filter === "Unread" || item.category === filter;
  });

  const markRead = (id: string) => setReadIds((current) => current.includes(id) ? current : [id, ...current].slice(0, 500));
  const markAllRead = () => setReadIds((current) => [...new Set([...current, ...notifications.map((item) => item.id)])].slice(0, 500));
  const openNotification = (item: DashboardNotification) => {
    markRead(item.id);
    if (item.page === "bookings") onNavigate("bookings", { bookingDate: item.bookingDate });
    else if (item.page === "patients") onNavigate("patients", { anchor: item.anchor });
    else onNavigate(item.page);
  };

  return <div className="page-wrap w-full min-w-0">
    <PageHeader
      eyebrow="Clinic updates"
      title="Notifications"
      description="Appointment requests, patient reviews, reports, orders, and recent admin activity."
      action={<button type="button" className="button button-secondary w-full sm:w-auto" onClick={markAllRead} disabled={!unreadCount}><CheckCheck size={15} />Mark all as read</button>}
    />

    {(isLoading || loadError) && <div className={"notice mb-4 flex items-center gap-2.5 " + (loadError ? "notice-warning" : "")} role="status">
      <BellRing size={15} className="shrink-0" />
      <span className="flex-1">{isLoading ? "Loading live updates from clinic services…" : loadError}</span>
      {!isLoading && loadError && <button type="button" className="button button-secondary button-small" onClick={() => setReloadKey((value) => value + 1)}>Retry</button>}
    </div>}

    <section className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Notification summary">
      <NotificationSummary label="Unread updates" value={unreadCount} icon={<BellRing size={16} />} tone="teal" />
      <NotificationSummary label="Appointment updates" value={appointmentCount} icon={<CalendarDays size={16} />} tone="blue" />
      <NotificationSummary label="Needs attention" value={needsAttentionCount} icon={<Activity size={16} />} tone="amber" />
    </section>

    <section className="card overflow-hidden rounded-[24px]" aria-label="Notification inbox">
      <div className="section-row flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <h2 className="card-title">Your inbox</h2>
          <p className="card-note">Choose an update to open the related workspace.</p>
        </div>
        <div className="flex w-full gap-1 overflow-x-auto rounded-xl bg-slate-50 p-1 sm:w-auto" role="group" aria-label="Filter notifications">
          {filters.map((value) => <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={`min-h-9 shrink-0 rounded-lg px-3 text-xs font-semibold transition ${filter === value ? "bg-white text-[#1A365D] shadow-sm" : "text-slate-500 hover:text-[#1A365D]"}`}
          >{value}{value === "Unread" && unreadCount > 0 ? ` (${unreadCount})` : ""}</button>)}
        </div>
      </div>

      {visibleNotifications.length ? <div className="grid gap-2 p-3 pt-0 sm:p-4 sm:pt-0">
        {visibleNotifications.map((item) => {
          const unread = !readIds.includes(item.id);
          const Icon = iconForCategory(item.category);
          return <button
            key={item.id}
            type="button"
            onClick={() => openNotification(item)}
            aria-label={`${unread ? "Unread. " : "Read. "}${item.title}. ${item.detail}`}
            className={`group flex min-w-0 w-full items-start gap-3 rounded-2xl border p-3 text-left transition sm:items-center sm:p-4 ${unread ? "border-[#dcece8] bg-[#f6fbf9] hover:bg-[#eef8f5]" : "border-slate-100 bg-white hover:bg-slate-50"}`}
          >
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${item.unreadTone}`}><Icon size={17} /></span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-[#1A365D]">{item.title}</span>
                {unread && <span className="rounded-full bg-[#0D9488]/10 px-2 py-0.5 text-[10px] font-semibold text-[#0D7E74]">New</span>}
                <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-medium text-slate-500">{item.category}</span>
              </span>
              <span className="mt-1 block break-words text-xs leading-5 text-slate-500">{item.detail}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2 self-center text-right">
              <span className="hidden text-[11px] text-slate-400 sm:block">{item.time}</span>
              <ChevronRight size={16} className="text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-[#1A365D]" />
            </span>
          </button>;
        })}
      </div> : <div className="mx-3 mb-3 rounded-2xl bg-[#F7F9FC] px-5 py-10 text-center sm:mx-4 sm:mb-4">
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-white text-slate-400 shadow-sm"><BellRing size={18} /></span>
        <h3 className="mt-3 text-sm font-semibold text-[#1A365D]">{filter === "Unread" ? "You’re all caught up" : "No updates in this section"}</h3>
        <p className="mt-1 text-xs text-slate-500">Updates are generated from current appointments, patient assessments, reports, orders, and audit events.</p>
      </div>}
    </section>
  </div>;
}

function NotificationSummary({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: "teal" | "blue" | "amber" }) {
  const tones = {
    teal: "bg-[#E7F5F2] text-[#21786F]",
    blue: "bg-[#EDF3FB] text-[#496D99]",
    amber: "bg-[#FFF5E7] text-[#9A6A1D]",
  };
  return <article className="card flex min-w-0 items-center gap-3 rounded-[22px] p-4 sm:p-5">
    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tones[tone]}`}>{icon}</span>
    <span className="min-w-0"><span className="block text-xs font-medium text-slate-500">{label}</span><strong className="mt-1 block text-2xl font-bold tracking-tight text-[#1A365D]">{value}</strong></span>
  </article>;
}

function iconForCategory(category: NotificationCategory) {
  if (category === "Appointments") return CalendarDays;
  if (category === "Patients") return UsersRound;
  if (category === "Reports") return FileText;
  if (category === "Orders") return PackageCheck;
  return Activity;
}

function categoryTone(category: NotificationCategory) {
  if (category === "Appointments") return "bg-[#E6F4F1] text-[#237A70]";
  if (category === "Patients") return "bg-[#EEF4FF] text-[#436693]";
  if (category === "Reports") return "bg-[#F2EEFF] text-[#6757A6]";
  if (category === "Orders") return "bg-[#FFF4E3] text-[#966218]";
  return "bg-[#F1F4F8] text-[#5D6D80]";
}

function activityTitle(event: AuditEventRecord) {
  if (/created clinic appointment/i.test(event.action)) return "New clinic appointment";
  if (/rescheduled clinic appointment/i.test(event.action)) return "Appointment rescheduled";
  if (/updated opd status/i.test(event.action)) return "Appointment status changed";
  return `${event.action} ${event.target}`.replace(/\s+/g, " ").trim();
}

function pageForEvent(event: AuditEventRecord, role: Role): PageKey {
  if (event.type === "Bookings") return "bookings";
  if (event.type === "Orders") return "orders";
  if (event.type === "Commerce") return "catalog";
  if (event.type === "Content" || event.type === "Feature" || event.type === "App updates" || event.type === "Notifications") return "content";
  if (event.type === "Testing") return "tests";
  if (event.type === "Access" && role === "super-admin") return "team";
  if (event.type === "Clinical") return "patients";
  return "overview";
}

function recordText(record: ApiRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "Details unavailable";
}

function toAuditEvent(record: ApiRecord): AuditEventRecord | null {
  const action = recordText(record, "action");
  const target = recordText(record, "target");
  const who = recordText(record, "actor", "who", "actor_email");
  const timeValue = recordText(record, "created_at", "time");
  const typeValue = recordText(record, "targetType", "target_type", "type");
  const allowedTypes: AuditEventRecord["type"][] = ["Access", "Feature", "Content", "Notifications", "App updates", "Commerce", "Orders", "Clinical", "Testing", "Bookings"];
  const type = allowedTypes.find((item) => item.toLowerCase() === typeValue.toLowerCase()) ?? "Clinical";
  if (action === "Details unavailable" || target === "Details unavailable" || who === "Details unavailable") return null;
  return {
    who,
    initials: who.split(/\s+/).map((part) => part[0] ?? "").join("").slice(0, 2).toUpperCase(),
    action,
    target,
    time: timeValue === "Details unavailable" ? "" : timeValue,
    type,
  };
}

function dateKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Scheduled appointment" : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function hasPermission(role: Role, permissions: string[], permission: string) {
  return role === "super-admin" || permissions.includes(permission);
}
