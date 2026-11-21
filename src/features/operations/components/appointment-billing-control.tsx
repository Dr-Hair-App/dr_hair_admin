"use client";

import { useEffect, useState } from "react";
import { Building2, CreditCard, DollarSign, Info, RefreshCw, Save, Sparkles } from "lucide-react";
import { cachedFetch, invalidateCache, TTL_PROFILES } from "../../shared/lib/api-cache";

export function AppointmentBillingControl({
  onToast,
  onAudit = () => {},
}: {
  onToast: (message: string) => void;
  onAudit?: (action: string, target: string) => void;
}) {
  const [payAtClinicEnabled, setPayAtClinicEnabled] = useState(true);
  const [onlinePayEnabled, setOnlinePayEnabled] = useState(true);
  const [firstAppointmentFree, setFirstAppointmentFree] = useState(false);
  const [fee, setFee] = useState<number | null>(500);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    cachedFetch("/api/admin/appointments/billing", undefined, TTL_PROFILES.schedule)
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not load appointment billing settings.");
        return res.json();
      })
      .then((json) => {
        if (!active) return;
        const data = json.data || {};
        const payAtClinic = data.pay_at_clinic_enabled != null
          ? Boolean(data.pay_at_clinic_enabled)
          : (data.payment_required != null ? !data.payment_required : true);
        const onlinePay = data.online_pay_enabled != null
          ? Boolean(data.online_pay_enabled)
          : (data.payment_required != null ? Boolean(data.payment_required) : true);
        setPayAtClinicEnabled(payAtClinic || !onlinePay);
        setOnlinePayEnabled(onlinePay);
        setFirstAppointmentFree(Boolean(data.first_appointment_free));
        setFee(typeof data.consultation_fee === "number" && Number.isFinite(data.consultation_fee) ? data.consultation_fee : 500);
      })
      .catch(() => { if (active) onToast("Could not load appointment billing settings."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [onToast]);

  const handleSave = async () => {
    if (!payAtClinicEnabled && !onlinePayEnabled) {
      onToast("At least one payment option (Pay at Clinic or Online Payment) must be active.");
      return;
    }
    if (fee == null || !Number.isFinite(fee) || fee < 0) {
      onToast("Enter a valid consultation fee before saving appointment billing.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/appointments/billing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pay_at_clinic_enabled: payAtClinicEnabled,
          online_pay_enabled: onlinePayEnabled,
          payment_required: onlinePayEnabled && !payAtClinicEnabled,
          consultation_fee: fee,
          first_appointment_free: firstAppointmentFree,
        }),
      });

      if (res.ok) {
        invalidateCache("/api/admin/appointments/billing");
        const modeDesc = payAtClinicEnabled && onlinePayEnabled
          ? "Dual modes (Pay at Clinic & Online Pay active)"
          : onlinePayEnabled
          ? "Online Pay (Razorpay only)"
          : "Pay at Clinic only";
        onToast(`Appointment billing updated: ${modeDesc}, Fee ₹${fee}, 1st Visit ${firstAppointmentFree ? "FREE (ON)" : "Paid (OFF)"}.`);
        onAudit(
          `updated appointment payment modes (${modeDesc}, fee: ₹${fee}, 1st free: ${firstAppointmentFree})`,
          "Appointment Billing",
        );
      } else {
        const err = await res.json().catch(() => ({}));
        onToast(err.message || "Failed to save appointment billing.");
      }
    } catch {
      onToast("Network error saving appointment billing.");
    } finally {
      setSaving(false);
    }
  };

  const statusBadge = () => {
    if (loading) return null;
    if (payAtClinicEnabled && onlinePayEnabled) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
          <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
          Dual Modes Active (Clinic & Online) · ₹{fee ?? 500}
        </span>
      );
    }
    if (onlinePayEnabled) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          Online Pay Only (Razorpay) · ₹{fee ?? 500}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        Pay at Clinic Only (Desk) · ₹{fee ?? 500}
      </span>
    );
  };

  const summaryText = () => {
    if (loading) return "Loading billing policy…";
    const modes = [
      payAtClinicEnabled ? "Pay at clinic (Pending status)" : null,
      onlinePayEnabled ? "Online pay via Razorpay" : null,
    ].filter(Boolean).join(" & ");
    return `${modes || "No payment option"} · Consultation fee ₹${fee ?? 500}${firstAppointmentFree ? " · First visit free" : ""}`;
  };

  return (
    <details className="group bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 sm:p-5 transition-all">
      <summary className="flex cursor-pointer list-none flex-col gap-2 sm:flex-row sm:items-center sm:justify-between [&::-webkit-details-marker]:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-teal-50 text-teal-700 rounded-lg">
              <DollarSign size={16} />
            </span>
            <h3 className="text-sm font-bold text-slate-800">
              Appointment Payment Options & Consultation Fee
            </h3>
            {statusBadge()}
          </div>
          <p className="text-xs text-slate-500 mt-1">{summaryText()}</p>
        </div>
        <span className="text-xs font-semibold text-teal-700 hover:text-teal-800 transition-colors">Edit options</span>
      </summary>

      <div className="space-y-4 pt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          {/* Toggle Card 1: Pay at Clinic */}
          <div className={`p-4 rounded-xl border transition-all ${
            payAtClinicEnabled
              ? "border-teal-200/90 bg-teal-50/20"
              : "border-slate-200/80 bg-slate-50/50"
          } flex flex-col justify-between`}>
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800">
                  <Building2 size={14} className="text-teal-600" />
                  <span>Pay at Clinic</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={payAtClinicEnabled}
                    onChange={(e) => {
                      if (!e.target.checked && !onlinePayEnabled) {
                        onToast("At least one payment option must remain active.");
                        return;
                      }
                      setPayAtClinicEnabled(e.target.checked);
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-teal-600"></div>
                </label>
              </div>
              <div className="text-[11px] text-slate-500 leading-4">
                {payAtClinicEnabled
                  ? "Active: Patients can book slot and pay at clinic desk. Recorded as Pending in appointments list."
                  : "Inactive: Patients cannot choose clinic desk payment."}
              </div>
            </div>
            <div className="mt-2 text-[10px] font-semibold text-teal-700">
              {payAtClinicEnabled ? "Shows 'Payment Pending' in admin & patient app" : "OFF"}
            </div>
          </div>

          {/* Toggle Card 2: Online Pay via Razorpay */}
          <div className={`p-4 rounded-xl border transition-all ${
            onlinePayEnabled
              ? "border-blue-200/90 bg-blue-50/20"
              : "border-slate-200/80 bg-slate-50/50"
          } flex flex-col justify-between`}>
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800">
                  <CreditCard size={14} className="text-blue-600" />
                  <span>Online Pay (Razorpay)</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onlinePayEnabled}
                    onChange={(e) => {
                      if (!e.target.checked && !payAtClinicEnabled) {
                        onToast("At least one payment option must remain active.");
                        return;
                      }
                      setOnlinePayEnabled(e.target.checked);
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
              <div className="text-[11px] text-slate-500 leading-4">
                {onlinePayEnabled
                  ? "Active: Patients can pay online instantly via UPI, Cards, Netbanking."
                  : "Inactive: Online payment checkout is disabled."}
              </div>
            </div>
            <div className="mt-2 text-[10px] font-semibold text-blue-700">
              {onlinePayEnabled ? "Instant Verified Token with Razorpay" : "OFF"}
            </div>
          </div>

          {/* Toggle Card 3: First Appointment Free */}
          <div className={`p-4 rounded-xl border transition-all ${
            firstAppointmentFree
              ? "border-emerald-200/90 bg-emerald-50/20"
              : "border-slate-200/80 bg-slate-50/50"
          } flex flex-col justify-between`}>
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800">
                  <Sparkles size={14} className="text-emerald-600" />
                  <span>First Visit Free</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={firstAppointmentFree}
                    onChange={(e) => setFirstAppointmentFree(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>
              <div className="text-[11px] text-slate-500 leading-4">
                {firstAppointmentFree
                  ? "Active: 1st clinic consultation is ₹0 Free for all new patients."
                  : "Inactive: Standard consultation fee applies to first visit."}
              </div>
            </div>
            <div className="mt-2 text-[10px] font-semibold text-emerald-700">
              {firstAppointmentFree ? "100% Free 1st OPD Visit" : "Standard Fee Applies"}
            </div>
          </div>

          {/* Consultation Fee Card */}
          <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-xs text-slate-800">Consultation Fee (₹)</span>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-teal-700">₹</span>
                  <input
                    type="number"
                    min={0}
                    step={50}
                    value={fee ?? ""}
                    onChange={(e) => setFee(e.target.value === "" ? null : Math.max(0, Number(e.target.value)))}
                    className="w-20 px-2 py-1 text-xs font-bold border border-slate-300 rounded-lg text-right bg-white shadow-xs focus:outline-teal-600"
                    placeholder="500"
                  />
                </div>
              </div>
              <div className="text-[11px] text-slate-500 leading-4">
                Doctor consultation fee charged either online via Razorpay or collected at clinic reception.
              </div>
            </div>
            <div className="mt-2 text-[10px] font-semibold text-slate-600">
              Standard fee: ₹{fee ?? 500}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <span className="inline-flex items-center gap-2 text-[11px] text-slate-600">
            <Info size={14} />
            Both options can be active simultaneously so patients can choose to Pay at Clinic or Pay Online.
          </span>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading || fee == null || (!payAtClinicEnabled && !onlinePayEnabled)}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
          >
            {saving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
            <span>{saving ? "Saving…" : "Save payment options"}</span>
          </button>
        </div>
      </div>
    </details>
  );
}

