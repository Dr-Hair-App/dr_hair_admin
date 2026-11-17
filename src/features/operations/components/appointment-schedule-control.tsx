"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Plus, RefreshCw, Save, Trash2 } from "lucide-react";

type Session = { label: string; opens_at: string; closes_at: string };
type Schedule = {
  timezone: string;
  booking_window_days: number | null;
  slot_interval_minutes: number | null;
  weekly_closed_weekdays: number[];
  sessions: Session[];
  clinic_name: string;
  clinic_address: string;
  doctor_name: string;
  room: string;
  appointment_duration_minutes: number | null;
  appointment_services: string[];
  is_configured: boolean;
};

const emptySchedule = (): Schedule => ({ timezone: "Asia/Kolkata", booking_window_days: null, slot_interval_minutes: null, weekly_closed_weekdays: [], sessions: [], clinic_name: "", clinic_address: "", doctor_name: "", room: "", appointment_duration_minutes: null, appointment_services: [], is_configured: false });
const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function AppointmentScheduleControl({ onToast, onAudit = () => {}, onUpdated = () => {} }: { onToast: (message: string) => void; onAudit?: (action: string, target: string) => void; onUpdated?: () => void }) {
  const [schedule, setSchedule] = useState<Schedule>(emptySchedule);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/appointments/schedule", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message || "Clinic schedule could not be loaded.");
        return body.data || {};
      })
      .then((data) => {
        if (!active) return;
        setSchedule({
          timezone: String(data.timezone || "Asia/Kolkata"),
          booking_window_days: typeof data.booking_window_days === "number" ? data.booking_window_days : null,
          slot_interval_minutes: typeof data.slot_interval_minutes === "number" ? data.slot_interval_minutes : null,
          weekly_closed_weekdays: Array.isArray(data.weekly_closed_weekdays) ? data.weekly_closed_weekdays.map(Number) : [],
          sessions: Array.isArray(data.sessions) ? data.sessions.map((item: Session) => ({ label: String(item.label || ""), opens_at: String(item.opens_at || ""), closes_at: String(item.closes_at || "") })) : [],
          clinic_name: String(data.clinic_name || ""),
          clinic_address: String(data.clinic_address || ""),
          doctor_name: String(data.doctor_name || ""),
          room: String(data.room || ""),
          appointment_duration_minutes: typeof data.appointment_duration_minutes === "number" ? data.appointment_duration_minutes : null,
          appointment_services: Array.isArray(data.appointment_services) ? data.appointment_services.map(String) : [],
          is_configured: Boolean(data.is_configured),
        });
      })
      .catch((error) => { if (active) onToast(error instanceof Error ? error.message : "Clinic schedule could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [onToast]);

  const update = (patch: Partial<Schedule>) => setSchedule((current) => ({ ...current, ...patch }));
  const updateSession = (index: number, patch: Partial<Session>) => update({ sessions: schedule.sessions.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
  const toggleWeekday = (weekday: number) => update({ weekly_closed_weekdays: schedule.weekly_closed_weekdays.includes(weekday) ? schedule.weekly_closed_weekdays.filter((day) => day !== weekday) : [...schedule.weekly_closed_weekdays, weekday].sort((a, b) => a - b) });

  const save = async () => {
    if (!schedule.booking_window_days || !schedule.slot_interval_minutes || !schedule.appointment_duration_minutes || schedule.sessions.length === 0 || schedule.appointment_services.length === 0) {
      onToast("Set the booking window, slot interval, visit duration, services, and at least one clinic session.");
      return;
    }
    if (schedule.slot_interval_minutes < schedule.appointment_duration_minutes) {
      onToast("Slot interval must be at least as long as the visit duration so appointments cannot overlap.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/admin/appointments/schedule", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(schedule),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "Clinic schedule could not be saved.");
      const data = body.data || {};
      setSchedule({ ...schedule, ...data, is_configured: true });
      onAudit("updated clinic availability schedule", "Clinic schedule");
      onUpdated();
      onToast("Clinic schedule saved. Patient availability now uses these settings.");
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Clinic schedule could not be saved.");
    } finally { setSaving(false); }
  };

  return <details className="group rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
      <span className="flex min-w-0 items-center gap-3"><span className="rounded-lg bg-teal-50 p-1.5 text-teal-700"><CalendarClock size={16} /></span><span><strong className="block text-sm text-slate-800">Clinic hours & booking window</strong><small className="mt-1 block text-xs text-slate-500">{loading ? "Loading schedule…" : schedule.is_configured ? "Patient calendar is using this saved schedule." : "Set clinic hours before accepting patient bookings."}</small></span></span>
      <span className="shrink-0 text-xs font-semibold text-teal-700">{schedule.is_configured ? "Edit schedule" : "Configure"}</span>
    </summary>
    <div className="appointment-schedule-fields space-y-4 pt-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field">Clinic timezone (IANA name)<input required maxLength={80} value={schedule.timezone} onChange={(event) => update({ timezone: event.target.value })} placeholder="Asia/Kolkata" /></label>
        <label className="field">Booking window (days)<input type="number" min={1} max={365} value={schedule.booking_window_days ?? ""} onChange={(event) => update({ booking_window_days: Number(event.target.value) || null })} placeholder="Set number of days" /></label>
        <label className="field">Slot interval (minutes)<input type="number" min={5} max={60} step={5} value={schedule.slot_interval_minutes ?? ""} onChange={(event) => update({ slot_interval_minutes: Number(event.target.value) || null })} placeholder="Set slot length" /></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field">Clinic name<input maxLength={120} value={schedule.clinic_name} onChange={(event) => update({ clinic_name: event.target.value })} placeholder="Clinic name shown to patients" /></label>
        <label className="field">Doctor / clinician<input maxLength={120} value={schedule.doctor_name} onChange={(event) => update({ doctor_name: event.target.value })} placeholder="Clinician name" /></label>
        <label className="field">Room / location<input maxLength={120} value={schedule.room} onChange={(event) => update({ room: event.target.value })} placeholder="Room or chamber" /></label>
        <label className="field">Visit duration (minutes)<input type="number" min={5} max={240} value={schedule.appointment_duration_minutes ?? ""} onChange={(event) => update({ appointment_duration_minutes: Number(event.target.value) || null })} placeholder="Set visit duration" /></label>
        <label className="field sm:col-span-2">Clinic address<input maxLength={300} value={schedule.clinic_address} onChange={(event) => update({ clinic_address: event.target.value })} placeholder="Address shown for appointment and calendar" /></label>
        <label className="field sm:col-span-2">Appointment services (one per line)<textarea rows={3} maxLength={3000} value={schedule.appointment_services.join("\n")} onChange={(event) => update({ appointment_services: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} placeholder="Consultation\nFollow-up" /></label>
      </div>
      <fieldset className="rounded-xl border border-slate-200 p-3"><legend className="px-1 text-xs font-semibold text-slate-700">Weekly closed days</legend><div className="flex flex-wrap gap-x-4 gap-y-2">{weekdays.map((day, index) => <label key={day} className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={schedule.weekly_closed_weekdays.includes(index + 1)} onChange={() => toggleWeekday(index + 1)} />{day}</label>)}</div></fieldset>
      <div className="space-y-2"><div className="flex items-center justify-between"><strong className="text-xs text-slate-700">Clinic sessions</strong><button type="button" className="button button-secondary button-small" onClick={() => update({ sessions: [...schedule.sessions, { label: "", opens_at: "", closes_at: "" }] })}><Plus size={13} />Add session</button></div>
        {schedule.sessions.map((session, index) => <div key={`session-${index}`} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_130px_130px_auto] sm:items-end"><label className="field">Session name<input maxLength={50} value={session.label} onChange={(event) => updateSession(index, { label: event.target.value })} placeholder="e.g. Morning clinic" /></label><label className="field">Opens<input type="time" value={session.opens_at} onChange={(event) => updateSession(index, { opens_at: event.target.value })} /></label><label className="field">Closes<input type="time" value={session.closes_at} onChange={(event) => updateSession(index, { closes_at: event.target.value })} /></label><button type="button" className="button button-secondary button-small" aria-label={`Remove session ${index + 1}`} onClick={() => update({ sessions: schedule.sessions.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 size={13} /></button></div>)}
      </div>
      <div className="flex justify-end border-t border-slate-100 pt-3"><button type="button" className="button button-primary" disabled={saving || loading} onClick={() => void save()}>{saving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}{saving ? "Saving…" : "Save schedule"}</button></div>
    </div>
  </details>;
}
