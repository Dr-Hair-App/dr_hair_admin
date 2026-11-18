"use client";

import {
  Activity,
  ArrowRight,
  BellRing,
  CalendarCheck2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileText,
  HeartPulse,
  Mail,
  MapPin,
  PackageCheck,
  Phone,
  Search,
  UsersRound,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { StatusPill } from "../../shared/components/ui";
import type { AdminRecord, AuditEventRecord, PageKey, Role } from "../../shared/types";
import type { BookingRecord } from "../../shared/types";

type RegisteredPatient = {
  id: string;
  patientCode: string;
  name: string;
  initials: string;
  email: string;
  phone: string;
  age: number | null;
  gender: string;
  city: string;
  createdAt: string;
};

export function Dashboard({ role, onNavigate, onOpenPatient, permissions = [], onAudit = () => {}, onToast = () => {}, anchor = "" }: {
  role: Role;
  userName: string;
  onNavigate: (page: PageKey, options?: { bookingDate?: string; anchor?: string }) => void;
  onOpenPatient: (patientId: string) => void;
  permissions?: string[];
  events?: AuditEventRecord[];
  admins?: AdminRecord[];
  onAudit?: (action: string, target: string) => void;
  onToast?: (message: string) => void;
  anchor?: string;
}) {
  const isSuper = role === "super-admin";
  const [clinicHolidays, setClinicHolidays] = useState<string[]>([]);
  const [clinicClosedWeekdays, setClinicClosedWeekdays] = useState<number[]>([]);
  const [selectedAppointmentDate, setSelectedAppointmentDate] = useState(() => startOfToday());
  const [selectedBooking, setSelectedBooking] = useState<BookingRecord | null>(null);
  const [serverSummary, setServerSummary] = useState<{
    patients?: { total?: number };
    appointments?: { total?: number; today?: number; pending?: number; confirmed?: number; completed?: number };
    assessments?: { total?: number; pending?: number };
    reports?: { total?: number; shared?: number };
    catalog?: { totalProducts?: number; lowStockProducts?: number };
    recentActivity?: Array<{ id: string; who: string; action: string; target: string; type: string; time: string }>;
  } | null>(null);
  const [registeredPatients, setRegisteredPatients] = useState<RegisteredPatient[]>([]);
  const [registeredPatientTotal, setRegisteredPatientTotal] = useState(0);
  const [registeredPatientsState, setRegisteredPatientsState] = useState<"loading" | "ready" | "error">("loading");
  const [liveBookings, setLiveBookings] = useState<BookingRecord[]>([]);
  const [clinicDoctorName, setClinicDoctorName] = useState("");
  const [liveBookingsLoaded, setLiveBookingsLoaded] = useState(false);
  const effectiveBookings = liveBookingsLoaded ? liveBookings : [];
  const today = new Date().toDateString();
  const todayKey = localDateKey(startOfToday());
  const appointmentsToday = effectiveBookings.filter((booking) => (booking.startsAt ? new Date(booking.startsAt).toDateString() === today : booking.date.toLowerCase().includes("today")) && !["Cancelled", "No show"].includes(booking.status));
  const selectedDateKey = localDateKey(selectedAppointmentDate);
  const selectedDateAppointments = effectiveBookings
    .filter((booking) => !["Cancelled", "No show"].includes(booking.status))
    .filter((booking) => {
      const date = appointmentDate(booking);
      return date !== null && localDateKey(date) === selectedDateKey;
    })
    .sort((left, right) => (appointmentDate(left)?.getTime() ?? 0) - (appointmentDate(right)?.getTime() ?? 0));
  const permitted = (permission: string) => isSuper || permissions.includes(permission);
  const canViewPatients = permitted("patients.view");
  useEffect(() => {
    const targetAnchor = anchor || window.location.hash.slice(1);
    if (!targetAnchor) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(decodeURIComponent(targetAnchor))?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [anchor]);

  useEffect(() => {
    const controller = new AbortController();
    const loadSummary = async () => {
      try {
        const response = await fetch("/api/admin/dashboard/summary", { cache: "no-store", signal: controller.signal });
        const result = await response.json().catch(() => ({}));
        if (response.ok && result?.data) {
          setServerSummary(result.data);
        }
      } catch {
        // Live metrics remain unavailable until the backend responds.
      }
    };
    void loadSummary();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/appointments/schedule", { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => {
        if (!controller.signal.aborted && result?.data && typeof result.data === "object") {
          if (typeof result.data.doctor_name === "string") setClinicDoctorName(result.data.doctor_name);
          const closedWeekdays = result.data.weekly_closed_weekdays;
          if (Array.isArray(closedWeekdays)) {
            setClinicClosedWeekdays(closedWeekdays.map(Number).filter((weekday: number) => Number.isInteger(weekday) && weekday >= 1 && weekday <= 7));
          }
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/appointments/closed-dates", { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => {
        const items = result?.data?.items;
        if (!controller.signal.aborted && Array.isArray(items)) {
          setClinicHolidays(items.flatMap((item: unknown) => {
            if (!item || typeof item !== "object") return [];
            const date = (item as Record<string, unknown>).date;
            return typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? [date] : [];
          }));
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/appointments", { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          setLiveBookingsLoaded(true);
          return;
        }
        const result = await res.json().catch(() => ({}));
        const data = result?.data && typeof result.data === "object" ? result.data : {};
        const items = Array.isArray(data.items) ? data.items : [];
        setLiveBookings(items.map((item: Record<string, unknown>) => ({
          id: String(item.id ?? ""),
          customer: String(item.customer || item.name || "Patient"),
          patientId: String(item.patientId || item.patient_code || item.userId || ""),
          patientCode: typeof item.patient_code === "string" ? item.patient_code : undefined,
          service: String(item.service || item.reason || ""),
          date: String(item.date || ""),
          startsAt: typeof item.startsAt === "string" ? item.startsAt : (typeof item.starts_at === "string" ? item.starts_at : undefined),
          status: (item.status || item.opdStatus || "Requested") as BookingRecord["status"],
          source: (item.source || "App") as BookingRecord["source"],
          doctorName: String(item.doctorName || item.doctor_name || ""),
          room: typeof item.room === "string" ? item.room : "",
          tokenNumber: typeof item.tokenNumber === "string" ? item.tokenNumber : (typeof item.opd_token === "string" ? item.opd_token : undefined),
          opdStatus: (item.opdStatus || item.status || "Confirmed") as BookingRecord["opdStatus"],
          consultationFee: typeof item.consultationFee === "number" ? item.consultationFee : (typeof item.consultation_fee === "number" ? item.consultation_fee : undefined),
          paymentStatus: typeof item.paymentStatus === "string" ? item.paymentStatus : (typeof item.payment_status === "string" ? item.payment_status : "Pending"),
          paymentMethod: typeof item.paymentMethod === "string" ? item.paymentMethod : (typeof item.payment_method === "string" ? item.payment_method : "UPI"),
          paymentTransactionId: typeof item.paymentTransactionId === "string" ? item.paymentTransactionId : (typeof item.payment_transaction_id === "string" ? item.payment_transaction_id : undefined),
        })));
        setLiveBookingsLoaded(true);
      })
      .catch(() => {
        setLiveBookingsLoaded(true);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!canViewPatients) return;
    const controller = new AbortController();
    const loadRegisteredPatients = async () => {
      setRegisteredPatientsState("loading");
      try {
        const response = await fetch("/api/admin/users?page=1&limit=50", { cache: "no-store", signal: controller.signal });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error("Registered patients could not be loaded.");
        const items: unknown[] = Array.isArray(result?.data?.items) ? result.data.items : [];
        setRegisteredPatients(items.flatMap((item): RegisteredPatient[] => {
          if (!item || typeof item !== "object") return [];
          const user = item as Record<string, unknown>;
          const name = typeof user.name === "string" && user.name.trim() ? user.name.trim() : "Unnamed patient";
          return [{
            id: String(user.id ?? ""),
            patientCode: String(user.patient_code ?? ""),
            name,
            initials: name.split(/\s+/).map((part) => part[0] || "").join("").slice(0, 2).toUpperCase(),
            email: typeof user.email === "string" ? user.email : "",
            phone: typeof user.phone === "string" ? user.phone : "",
            age: typeof user.age === "number" ? user.age : null,
            gender: typeof user.gender === "string" ? user.gender : "",
            city: typeof user.city === "string" ? user.city : "",
            createdAt: typeof user.created_at === "string" ? user.created_at : "",
          }];
        }));
        setRegisteredPatientTotal(typeof result?.data?.total === "number" ? result.data.total : items.length);
        setRegisteredPatientsState("ready");
      } catch {
        if (!controller.signal.aborted) {
          setRegisteredPatientTotal(0);
          setRegisteredPatientsState("error");
        }
      }
    };
    void loadRegisteredPatients();
    return () => controller.abort();
  }, [canViewPatients]);

  const advanceAppointment = async (booking: BookingRecord) => {
    const action = nextAppointmentAction(booking);
    if (!action) return;
    try {
      const response = await fetch(`/api/admin/appointments/${encodeURIComponent(booking.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: action.opdStatus }),
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        onToast(result.message || "Could not update appointment status.");
        return;
      }
      const updated: BookingRecord = {
        ...booking,
        opdStatus: action.opdStatus,
        status: action.opdStatus === "Completed" ? "Completed" : "Active",
      };
      setLiveBookings((current) => current.map((item) => item.id === booking.id ? updated : item));
      setSelectedBooking(updated);
      onAudit(`updated OPD status to ${action.opdStatus}`, `${booking.id} · ${booking.customer}`);
      onToast(`Appointment updated: ${action.opdStatus}`);
    } catch {
      onToast("Network error updating appointment status.");
    }
  };

  const activityRows = (serverSummary?.recentActivity ?? []).slice(0, 4);
  const queueBars = [
    ...(permitted("assessments.review") && serverSummary?.assessments?.pending !== undefined ? [{ label: "Assessments to review", count: serverSummary.assessments.pending, tone: "teal" }] : []),
    ...(permitted("bookings.manage") ? [{ label: "Clinic visits today", count: serverSummary?.appointments?.today ?? appointmentsToday.length, tone: "violet" }] : []),
    ...(permitted("products.manage") && serverSummary?.catalog?.lowStockProducts !== undefined ? [{ label: "Low stock products", count: serverSummary.catalog.lowStockProducts, tone: "amber" }] : []),
  ];
  const largestQueue = Math.max(1, ...queueBars.map((item) => item.count));
  return <div className="page-wrap dashboard-bento w-full min-w-0">
    {/* Metric KPI Grid */}
    <section className="kpi-grid mb-5 grid grid-cols-2 gap-3.5 sm:gap-4 lg:grid-cols-4" aria-label="Overview metrics">
      <Kpi
        icon={<UsersRound size={18} />}
        tone="teal"
        label="Patient records"
        value={
          !permitted("patients.view")
            ? "—"
            : serverSummary?.patients?.total !== undefined
            ? String(serverSummary.patients.total)
            : registeredPatientsState === "ready"
            ? String(registeredPatientTotal)
            : registeredPatientsState === "loading"
            ? "…"
            : "—"
        }
        trend={permitted("patients.view") ? (serverSummary ? "Live API" : "Directory") : "No access"}
        foot={
          permitted("patients.view")
            ? registeredPatientsState === "error"
              ? "directory unavailable"
              : "registered patients"
            : "patient access off"
        }
        onClick={permitted("patients.view") ? () => onNavigate("patients", { anchor: "registered-patients" }) : undefined}
      />
      <Kpi
        icon={<ClipboardCheck size={18} />}
        tone="amber"
        label="Assessments to review"
        value={
          permitted("assessments.review")
            ? (serverSummary?.assessments?.pending !== undefined ? String(serverSummary.assessments.pending) : "—")
            : "—"
        }
        trend={permitted("assessments.review") ? (serverSummary ? "Server queue" : "Unavailable") : "No access"}
        foot={
          permitted("assessments.review")
            ? serverSummary
              ? "live assessments"
              : "summary unavailable"
            : "assessment access off"
        }
        onClick={permitted("assessments.review") ? () => onNavigate("patients", { anchor: "registered-patients" }) : undefined}
      />
      <Kpi
        icon={<CalendarCheck2 size={18} />}
        tone="indigo"
        label="Clinic visits today"
        value={
          permitted("bookings.manage")
            ? String(serverSummary?.appointments?.today ?? appointmentsToday.length)
            : "—"
        }
        trend={permitted("bookings.manage") ? (clinicDoctorName || "Clinic schedule") : "No access"}
        foot={
          permitted("bookings.manage")
            ? serverSummary
              ? "confirmed & pending"
              : "today's schedule"
            : "booking access off"
        }
        onClick={permitted("bookings.manage") ? () => onNavigate("bookings", { bookingDate: todayKey }) : undefined}
      />
      <Kpi
        icon={isSuper ? <HeartPulse size={18} /> : <PackageCheck size={18} />}
        tone="violet"
        label={isSuper ? "Reports shared" : "Catalog products"}
        value={
          permitted(isSuper ? "reports.share" : "products.manage")
            ? (isSuper
                ? (serverSummary?.reports?.shared !== undefined ? String(serverSummary.reports.shared) : "—")
                : (serverSummary?.catalog?.totalProducts !== undefined ? String(serverSummary.catalog.totalProducts) : "—"))
            : "—"
        }
        trend={permitted(isSuper ? "reports.share" : "products.manage") ? (serverSummary ? "Live API" : "Unavailable") : "No access"}
        foot={
          permitted(isSuper ? "reports.share" : "products.manage")
            ? serverSummary
              ? (isSuper ? "shared with patients" : "listed products")
              : "summary unavailable"
            : "restricted access"
        }
        onClick={!isSuper && permitted("products.manage") ? () => onNavigate("catalog") : undefined}
      />
    </section>

    <section className="mb-4 grid grid-cols-1 items-stretch gap-4 lg:grid-cols-12" aria-label="Appointments by date">
      <AppointmentCalendar
        bookings={permitted("bookings.manage") ? effectiveBookings : []}
        selectedDate={selectedAppointmentDate}
        onSelectDate={setSelectedAppointmentDate}
        clinicHolidays={clinicHolidays}
        clinicClosedWeekdays={clinicClosedWeekdays}
      />
      <SelectedDateAppointments
        bookings={permitted("bookings.manage") ? selectedDateAppointments : []}
        date={selectedAppointmentDate}
        onNavigate={() => onNavigate("bookings", { bookingDate: selectedDateKey })}
        onOpenAppointment={setSelectedBooking}
      />
    </section>

    {canViewPatients && <RegisteredPatients patients={registeredPatients} totalCount={registeredPatientTotal} loadState={registeredPatientsState} onOpenPatient={onOpenPatient} />}

    <section className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-12" aria-label="Clinic operations">
      <article className="card overflow-hidden rounded-[28px] lg:col-span-5">
        <div className="card-head"><div><span className="eyebrow">Care operations</span><h2 className="card-title">Clinic work queues</h2><p className="card-note">Current counts from the clinic API</p></div></div>
        {queueBars.length > 0 ? <div className="dashboard-queue-list">{queueBars.map((item) => <div className="dashboard-queue-row" key={item.label}>
          <div className="dashboard-queue-heading"><span>{item.label}</span><strong>{item.count}</strong></div>
          <div className="dashboard-queue-track"><span className={`dashboard-queue-fill ${item.tone}`} style={{ width: `${Math.max(item.count ? 9 : 0, item.count / largestQueue * 100)}%` }} /></div>
        </div>)}</div> : <div className="empty-state">No operational access is assigned to this account.</div>}
        {queueBars.length > 0 && <div className="chart-foot"><span><i className="legend-dot" />Queue size</span></div>}
      </article>
      <div className="grid grid-cols-1 gap-4 lg:col-span-7">
      <article className="card overflow-hidden rounded-[28px]">
        <div className="card-head"><div><h2 className="card-title">Recent activity</h2><p className="card-note">Latest recorded backend activity</p></div></div>
        {activityRows.length ? <div className="activity-list">{activityRows.map((event, index) => {
          const Icon = event.type === "Orders" || event.type === "Commerce" ? PackageCheck : event.type === "Bookings" ? CalendarCheck2 : event.type === "Testing" ? FileText : event.type === "Access" ? UsersRound : event.type === "Feature" ? BellRing : Activity;
          return <div className="activity-row" key={`${event.who}-${event.time}-${index}`}><div className="activity-icon"><Icon size={14} /></div><div className="activity-copy"><div className="activity-text"><strong>{event.who}</strong> {event.action} <strong>{event.target}</strong></div><div className="activity-time">{event.time} · {event.type}</div></div></div>;
        })}</div> : <div className="empty-state">No recorded activity yet.</div>}
      </article>
      </div>
    </section>

    {selectedBooking && <AppointmentDetailsDialog
      booking={selectedBooking}
      patient={registeredPatients.find((patient) => patient.id === selectedBooking.patientId || patient.patientCode === selectedBooking.patientId)
        ?? registeredPatients.find((patient) => normalizePatientName(patient.name) === normalizePatientName(selectedBooking.customer))}
      onClose={() => setSelectedBooking(null)}
      onOpenPatient={onOpenPatient}
      onAdvance={() => advanceAppointment(selectedBooking)}
      onManage={() => { const date = appointmentDate(selectedBooking); setSelectedBooking(null); onNavigate("bookings", { bookingDate: date ? localDateKey(date) : undefined }); }}
    />}

  </div>;
}

function Kpi({
  icon,
  label,
  value,
  trend,
  foot,
  onClick,
  tone = "teal",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  trend: string;
  foot: string;
  onClick?: () => void;
  tone?: "teal" | "amber" | "indigo" | "violet" | "emerald";
}) {
  const toneStyles = {
    teal: {
      bg: "bg-teal-50/80 border-teal-100/80 text-teal-700",
      pill: "bg-teal-50 text-teal-700 border-teal-200/60",
      accent: "group-hover:text-teal-600",
    },
    amber: {
      bg: "bg-amber-50/80 border-amber-100/80 text-amber-700",
      pill: "bg-amber-50 text-amber-700 border-amber-200/60",
      accent: "group-hover:text-amber-600",
    },
    indigo: {
      bg: "bg-indigo-50/80 border-indigo-100/80 text-indigo-700",
      pill: "bg-indigo-50 text-indigo-700 border-indigo-200/60",
      accent: "group-hover:text-indigo-600",
    },
    violet: {
      bg: "bg-violet-50/80 border-violet-100/80 text-violet-700",
      pill: "bg-violet-50 text-violet-700 border-violet-200/60",
      accent: "group-hover:text-violet-600",
    },
    emerald: {
      bg: "bg-emerald-50/80 border-emerald-100/80 text-emerald-700",
      pill: "bg-emerald-50 text-emerald-700 border-emerald-200/60",
      accent: "group-hover:text-emerald-600",
    },
  }[tone];

  const content = (
    <div className="flex h-full flex-col justify-between">
      <div className="flex items-start justify-between gap-2">
        <span className="kpi-label min-w-0 text-[11px] font-bold uppercase tracking-[.08em] leading-snug text-slate-500 line-clamp-2">{label}</span>
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl border ${toneStyles.bg} shadow-xs`}>
          {icon}
        </span>
      </div>
      <div className="my-2.5">
        <span className={`text-3xl font-extrabold tracking-tight text-slate-800 transition-colors ${toneStyles.accent}`}>
          {value}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-1.5 border-t border-slate-100 pt-2 text-[11px]">
        <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 font-semibold text-[10px] ${toneStyles.pill}`}>
          {trend}
        </span>
        <span className="text-slate-400 truncate text-[11px] font-medium">{foot}</span>
      </div>
    </div>
  );

  if (!onClick) {
    return <article className="group card rounded-2xl bg-white p-4 sm:p-5 shadow-xs border border-slate-200/80">{content}</article>;
  }

  return (
    <button
      type="button"
      className="group card rounded-2xl bg-white p-4 sm:p-5 text-left shadow-xs border border-slate-200/80 transition-all duration-200 hover:-translate-y-1 hover:border-slate-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0D9488]"
      onClick={onClick}
      aria-label={`${label}: ${value}. ${foot}. Open related section.`}
    >
      {content}
    </button>
  );
}

function AppointmentCalendar({ bookings, selectedDate, onSelectDate, clinicHolidays, clinicClosedWeekdays }: {
  bookings: BookingRecord[];
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  clinicHolidays: string[];
  clinicClosedWeekdays: number[];
}) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const monthTitle = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(month);
  const offset = (month.getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const dayCells = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];
  const bookingsByDate = useMemo(() => {
    const byDate = new Map<string, BookingRecord[]>();
    bookings.filter((booking) => !["Cancelled", "No show"].includes(booking.status)).forEach((booking) => {
      const date = appointmentDate(booking);
      if (!date) return;
      const key = localDateKey(date);
      byDate.set(key, [...(byDate.get(key) ?? []), booking]);
    });
    return byDate;
  }, [bookings]);
  const selectedKey = localDateKey(selectedDate);
  const todayKey = localDateKey(new Date());
  const datesInMonth = dayCells.filter((day): day is number => day !== null).map((day) => new Date(month.getFullYear(), month.getMonth(), day));
  const bookedDateCount = datesInMonth.filter((date) => (bookingsByDate.get(localDateKey(date))?.length ?? 0) > 0).length;
  const closedDateCount = datesInMonth.filter((date) => {
    const weekday = ((date.getDay() + 6) % 7) + 1;
    const key = localDateKey(date);
    return clinicHolidays.includes(key) || clinicClosedWeekdays.includes(weekday);
  }).length;

  const moveMonth = (change: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + change, 1);
    setMonth(next);
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    onSelectDate(new Date(next.getFullYear(), next.getMonth(), Math.min(selectedDate.getDate(), lastDay)));
  };

  const returnToToday = () => {
    const today = startOfToday();
    setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    onSelectDate(today);
  };

  return <article className="clinic-calendar min-w-0 overflow-hidden lg:col-span-5 xl:col-span-4" aria-label="Appointment calendar">
    <div>
      <div className="clinic-calendar-header">
        <div>
          <span className="clinic-calendar-eyebrow">OPD schedule</span>
          <h2>Clinic appointments</h2>
        </div>
        <div className="clinic-calendar-controls">
          <button type="button" onClick={returnToToday} className="clinic-calendar-today">Today</button>
          <div className="clinic-calendar-month-nav">
            <button type="button" onClick={() => moveMonth(-1)} aria-label="Previous month"><ChevronLeft size={16} /></button>
            <span aria-live="polite">{monthTitle}</span>
            <button type="button" onClick={() => moveMonth(1)} aria-label="Next month"><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>

      <div className="clinic-calendar-weekdays" aria-hidden="true">
        {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
      </div>
      <div className="clinic-calendar-days">
        {dayCells.map((day, index) => {
          if (day === null) return <span aria-hidden="true" key={`blank-${index}`} className="clinic-calendar-day-empty" />;
          const date = new Date(month.getFullYear(), month.getMonth(), day);
          const key = localDateKey(date);
          const count = bookingsByDate.get(key)?.length ?? 0;
          const isSelected = key === selectedKey;
          const isToday = key === todayKey;
          const isPast = key < todayKey;
          const weekday = ((date.getDay() + 6) % 7) + 1;
          const isClosed = clinicHolidays.includes(key) || clinicClosedWeekdays.includes(weekday);
          const statusLabel = isClosed ? ", clinic closed" : "";
          return <button
            key={key}
            type="button"
            aria-label={`${formatFullDate(date)}${count ? `, ${count} appointment${count === 1 ? "" : "s"}` : ", no appointments"}${statusLabel}`}
            aria-pressed={isSelected}
            aria-current={isToday ? "date" : undefined}
            onClick={() => onSelectDate(date)}
            className={`clinic-calendar-day${isSelected ? " is-selected" : ""}${isClosed ? " is-closed" : ""}${count > 0 ? " has-bookings" : ""}${isToday ? " is-today" : ""}${isPast ? " is-past" : ""}`}
          >
            <span>{day}</span>
            {count > 0 && <i aria-hidden="true">{count > 9 ? "9+" : count}</i>}
          </button>;
        })}
      </div>
    </div>

    {/* Calendar Legend for immediate visual clarity */}
    <div className="clinic-calendar-summary" aria-live="polite">
      <span><strong>{bookedDateCount}</strong> booked date{bookedDateCount === 1 ? "" : "s"}</span>
      <span aria-hidden="true">·</span>
      <span><strong>{closedDateCount}</strong> closed date{closedDateCount === 1 ? "" : "s"}</span>
    </div>
    <div className="clinic-calendar-legend" aria-label="Calendar legend">
      <div>
        <span className="legend-selected" />
        <span>Selected</span>
      </div>
      <div>
        <span className="legend-booked" />
        <span>Booked</span>
      </div>
      <div>
        <span className="legend-closed" />
        <span>Closed</span>
      </div>
      <div>
        <span className="legend-today" />
        <span>Today</span>
      </div>
    </div>
  </article>;
}

function SelectedDateAppointments({ bookings, date, onNavigate, onOpenAppointment }: {
  bookings: BookingRecord[];
  date: Date;
  onNavigate: () => void;
  onOpenAppointment: (booking: BookingRecord) => void;
}) {
  const isToday = localDateKey(date) === localDateKey(new Date());
  const title = isToday ? "Today’s appointments" : `Appointments · ${formatShortDate(date)}`;
  const confirmedCount = bookings.filter((b) => b.opdStatus === "Confirmed" || b.status === "Active").length;
  const completedCount = bookings.filter((b) => b.opdStatus === "Completed" || b.status === "Completed").length;

  return <article className="card overflow-hidden rounded-[28px] lg:col-span-7 xl:col-span-8 flex flex-col justify-between" aria-live="polite" aria-label={title}>
    <div>
      <div className="section-row border-b border-slate-100">
        <div>
          <span className="eyebrow">Selected date</span>
          <div className="flex items-center gap-2.5">
            <h2 className="card-title">{title}</h2>
            {bookings.length > 0 && (
              <span className="rounded-full bg-teal-50 border border-teal-100/80 px-2.5 py-0.5 text-xs font-bold text-teal-700">
                {bookings.length} {bookings.length === 1 ? "booking" : "bookings"}
              </span>
            )}
          </div>
          <p className="card-note">
            {bookings.length > 0
              ? `${completedCount} completed · ${confirmedCount} confirmed OPD visits on schedule`
              : "Select a date on the calendar to view scheduled consultations"}
          </p>
        </div>
        <button type="button" className="button button-secondary button-small" onClick={onNavigate}>
          All bookings <ArrowRight size={13} />
        </button>
      </div>

      {bookings.length ? (
        <div className="p-4 sm:p-5">
          <div className="space-y-3">
            <div className="space-y-3">
              {bookings.map((booking) => (
                <AppointmentPatientCard key={booking.id} booking={booking} onClick={() => onOpenAppointment(booking)} />
              ))}
            </div>

          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center p-6 sm:p-10 text-center m-4 sm:m-5 rounded-2xl bg-[#F7F9FC]/80 border border-slate-100">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#0D9488] shadow-sm mb-3">
            <CalendarCheck2 size={22} />
          </div>
          <h3 className="text-sm font-bold text-[#1A365D]">No appointments for this date</h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm">
            No OPD consultations or scalp scans are scheduled for this day. You can view all clinic bookings or select another date on the calendar.
          </p>
          <button
            type="button"
            onClick={onNavigate}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-[#1A365D] border border-slate-200 text-xs font-semibold hover:bg-slate-50 transition shadow-xs"
          >
            <span>View all bookings</span>
            <ArrowRight size={13} />
          </button>
        </div>
      )}
    </div>
  </article>;
}

function AppointmentPatientCard({ booking, onClick }: {
  booking: BookingRecord;
  onClick: () => void;
}) {
  const content = (
    <div className="flex w-full min-w-0 flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 min-w-0">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700 border border-teal-100/80 shadow-xs">
          <CalendarCheck2 size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-bold text-[#1A365D] group-hover:text-teal-700 transition-colors">
              {booking.customer}
            </span>
            {booking.patientId && (
              <span className="font-mono text-[10px] font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200/60">
                {booking.patientId}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-500">{booking.service}</p>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
            <span>{booking.doctorName || "Clinic team"}</span>
            <span>·</span>
            <span>{booking.room || "Location pending"}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2 sm:border-0 sm:pt-0 sm:flex-col sm:items-end">
        <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-[#1A365D] border border-slate-200/60">
          {formatBookingTime(booking)}
        </span>
        <StatusPill status={booking.status} />
      </div>
    </div>
  );

  return (
    <button
      type="button"
      className="group flex w-full min-w-0 items-center rounded-2xl border border-slate-200/80 bg-white p-3.5 text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0D9488]"
      onClick={onClick}
      aria-label={`Open appointment details for ${booking.customer}`}
    >
      {content}
    </button>
  );
}

function RegisteredPatients({ patients, totalCount, loadState, onOpenPatient }: {
  patients: RegisteredPatient[];
  totalCount: number;
  loadState: "loading" | "ready" | "error";
  onOpenPatient: (patientId: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredPatients = useMemo(() => {
    if (!searchQuery.trim()) return patients;
    const query = searchQuery.trim().toLowerCase();
    return patients.filter((patient) =>
      patient.name.toLowerCase().includes(query) ||
      patient.patientCode.toLowerCase().includes(query) ||
      patient.email.toLowerCase().includes(query) ||
      patient.phone.includes(query) ||
      patient.city.toLowerCase().includes(query)
    );
  }, [patients, searchQuery]);

  return (
    <section id="registered-patients" className="card mb-5 overflow-hidden rounded-[28px] border border-slate-200/80 shadow-xs" aria-labelledby="registered-patients-title">
      <div className="section-row border-b border-slate-100">
        <div>
          <span className="eyebrow">Patient directory</span>
          <h2 id="registered-patients-title" className="card-title">Registered patients</h2>
          <p className="card-note">Search and select a patient to open their comprehensive clinical profile.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Client-side Live Search Filter */}
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, ID, phone…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-1.5 pl-9 pr-8 text-xs text-slate-800 placeholder:text-slate-400 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>
          {loadState === "ready" && (
            <span className="rounded-full bg-slate-100 border border-slate-200 px-3 py-1 text-xs font-bold text-[#1A365D]">
              {totalCount} {totalCount === 1 ? "patient" : "patients"}
            </span>
          )}
        </div>
      </div>

      {loadState === "loading" ? (
        <div className="flex items-center justify-center p-12 text-slate-500 text-xs">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-teal-600 border-t-transparent mr-2.5"></div>
          Loading registered patients registry…
        </div>
      ) : loadState === "error" ? (
        <div className="p-8 text-center text-xs text-rose-600 bg-rose-50/50 m-4 rounded-xl border border-rose-100">
          Patient directory is currently unavailable from the server.
        </div>
      ) : filteredPatients.length ? (
        <div className="table-wrap">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4 w-[28%]">Patient</th>
                <th className="py-3 px-4 w-[24%]">Contact</th>
                <th className="py-3 px-4 w-[16%]">Demographics</th>
                <th className="py-3 px-4 w-[14%]">City</th>
                <th className="py-3 px-4 w-[14%]">Registered</th>
                <th className="py-3 px-4 w-[4%]" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPatients.map((patient) => (
                <tr key={patient.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4">
                    <button
                      type="button"
                      className="group flex items-center gap-3 text-left w-full focus:outline-none"
                      onClick={() => onOpenPatient(patient.patientCode || patient.id)}
                      aria-label={`Open ${patient.name} patient profile`}
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#1A365D] to-[#2E486D] text-white text-[11px] font-bold shadow-xs">
                        {patient.initials}
                      </span>
                      <div className="min-w-0">
                        <span className="block truncate text-xs font-bold text-[#1A365D] group-hover:text-teal-600 transition-colors">
                          {patient.name}
                        </span>
                        <span className="mt-0.5 inline-block font-mono text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200/60">
                          {patient.patientCode || patient.id}
                        </span>
                      </div>
                    </button>
                  </td>
                  <td className="py-3 px-4 text-xs">
                    <div className="flex items-center gap-1.5 text-slate-700">
                      <Mail size={12} className="text-slate-400 shrink-0" />
                      <span className="truncate">{patient.email || "No email"}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-500 mt-1 text-[11px]">
                      <Phone size={12} className="text-slate-400 shrink-0" />
                      <span>{patient.phone || "No phone"}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center rounded-full bg-blue-50 border border-blue-100/70 px-2.5 py-0.5 text-[11px] font-semibold text-[#1A365D]">
                      {[patient.age ? `${patient.age} yrs` : "", patient.gender].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-600">
                    <div className="flex items-center gap-1">
                      <MapPin size={12} className="text-slate-400 shrink-0" />
                      <span>{patient.city || "—"}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-500 font-medium">
                    {formatRegistrationDate(patient.createdAt)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-teal-600 transition"
                      aria-label={`Open ${patient.name}`}
                      onClick={() => onOpenPatient(patient.patientCode || patient.id)}
                    >
                      <ArrowRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-8 text-center text-xs text-slate-500">
          {searchQuery ? (
            <div>
              <p>No registered patients matching &quot;{searchQuery}&quot;.</p>
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="mt-2 text-teal-600 hover:underline font-semibold"
              >
                Clear search filter
              </button>
            </div>
          ) : (
            "No registered patients in the directory."
          )}
        </div>
      )}
    </section>
  );
}

function AppointmentDetailsDialog({ booking, patient, onClose, onOpenPatient, onAdvance, onManage }: {
  booking: BookingRecord;
  patient?: RegisteredPatient;
  onClose: () => void;
  onOpenPatient: (patientId: string) => void;
  onAdvance: () => void;
  onManage: () => void;
}) {
  const [isClosing, setIsClosing] = useState(false);
  const closingRef = useRef(false);

  const requestClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setIsClosing(true);
    const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      onClose();
    } else {
      window.setTimeout(() => {
        onClose();
      }, 160);
    }
  };

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const appointmentDateValue = appointmentDate(booking);
  const action = nextAppointmentAction(booking);
  const details = [
    ["Date", appointmentDateValue ? formatFullDate(appointmentDateValue) : booking.date],
    ["Time", formatBookingTime(booking)],
    ["Doctor", booking.doctorName || "Not assigned"],
    ["Visit type", booking.type || "Clinic visit"],
    ["Room", booking.room || "Not assigned"],
    ["Booking source", booking.source || "Not recorded"],
    ["OPD token", booking.tokenNumber || "Not assigned"],
    ["OPD status", booking.opdStatus || booking.status],
    ["Consultation fee", `₹${booking.consultationFee ?? 500}`],
    ["Payment", `${booking.paymentStatus ?? "Pending"}${booking.paymentMethod ? ` · ${booking.paymentMethod}` : ""}`],
  ] as const;

  if (typeof document === "undefined") return null;
  return createPortal(<div className={`modal-backdrop ${isClosing ? "is-closing" : ""}`} onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
    <section className={`modal max-w-xl overflow-y-auto ${isClosing ? "is-closing" : ""}`} style={{ maxHeight: "calc(100dvh - 40px)" }} role="dialog" aria-modal="true" aria-labelledby="appointment-detail-title">
      <div className="modal-head">
        <div>
          <span className="eyebrow">Appointment details</span>
          <h2 id="appointment-detail-title">{booking.customer}</h2>
          <p>{booking.service}</p>
        </div>
        <button type="button" className="row-action" aria-label="Close appointment details" onClick={requestClose}><X size={17} /></button>
      </div>
      <div className="modal-body">
        <div className="flex items-center justify-between gap-3 rounded-xl bg-[#F7F9FC] p-3">
          <div><span className="person-sub">Booking reference</span><p className="person-name mt-1">{booking.id}</p></div>
          <StatusPill status={booking.status} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {details.map(([label, value]) => <div key={label} className="rounded-xl border border-slate-100 p-3">
            <p className="person-sub">{label}</p><p className="mt-1 text-sm font-medium text-[#1A365D]">{value}</p>
          </div>)}
        </div>
        {patient ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dcebe8] bg-[#f4faf9] p-3">
          <div><p className="text-xs font-semibold text-[#1A365D]">Linked registered profile</p><p className="person-sub mt-1">{patient.name} · {patient.patientCode || patient.id}</p></div>
          <button type="button" className="button button-primary button-small" onClick={() => onOpenPatient(patient.patientCode || patient.id)}>Open patient profile <ArrowRight size={13} /></button>
        </div> : <p className="rounded-xl bg-[#F7F9FC] p-3 text-xs leading-5 text-slate-500">No registered patient profile is linked to this appointment yet.</p>}
      </div>
      <div className="modal-actions flex-col sm:flex-row">
        {action && <button type="button" className="button button-primary" onClick={onAdvance}>{action.label}<ArrowRight size={14} /></button>}
        <button type="button" className="button button-secondary" onClick={onManage}><CalendarCheck2 size={14} />Manage booking</button>
      </div>
    </section>
  </div>, document.body);
}

function normalizePatientName(name: string) {
  return name.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function nextAppointmentAction(booking: BookingRecord) {
  const opdStatus = booking.opdStatus;
  if (["Completed", "Cancelled", "No show"].includes(booking.status) || opdStatus === "Completed" || opdStatus === "No show") return null;
  if (opdStatus === "Requested" || booking.status === "Pending" && !opdStatus) return { label: "Confirm appointment", opdStatus: "Confirmed" as const };
  const appointment = appointmentDate(booking);
  if (appointment && localDateKey(appointment) > localDateKey(startOfToday())) return null;
  if (opdStatus === "Arrived") return { label: "Start consultation", opdStatus: "In Consultation" as const };
  if (opdStatus === "In Consultation") return { label: "Complete consultation", opdStatus: "Completed" as const };
  if (opdStatus === "Confirmed" || booking.status === "Pending") return { label: "Mark patient arrived", opdStatus: "Arrived" as const };
  return { label: "Mark patient arrived", opdStatus: "Arrived" as const };
}

function formatRegistrationDate(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(date);
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function appointmentDate(booking: BookingRecord): Date | null {
  if (booking.startsAt) {
    const fromTimestamp = new Date(booking.startsAt);
    return Number.isNaN(fromTimestamp.getTime()) ? null : fromTimestamp;
  }
  const label = booking.date.toLowerCase();
  const date = startOfToday();
  if (label.includes("tomorrow")) date.setDate(date.getDate() + 1);
  else if (label.includes("today")) return date;
  else {
    const parsed = new Date(booking.date);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return date;
}

function formatFullDate(date: Date) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function formatBookingTime(booking: BookingRecord) {
  if (!booking.startsAt) return booking.date.split("·")[1]?.trim() || "Time not set";
  const date = new Date(booking.startsAt);
  return Number.isNaN(date.getTime()) ? "Time not set" : new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(date);
}
