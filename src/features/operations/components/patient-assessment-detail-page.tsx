"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertCircle,
  Archive,
  ArrowLeft,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Dna,
  Download,
  ExternalLink,
  HeartPulse,
  LoaderCircle,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  RotateCcw,
  Salad,
  Share2,
  Sparkles,
  Stethoscope,
  User,
  ZoomIn,
} from "lucide-react";
import { Modal } from "../../shared/components/ui";
import { FullSizeImageViewer, type ViewerImage } from "../../shared/components/full-size-image-viewer";
import type { AdminPermissionId } from "../../shared/types";

type ScalpPhoto = {
  file_name?: string;
  url?: string;
  angle?: string;
};

type Assessment = Record<string, unknown> & {
  id: number | string;
  reference_no?: string;
  status?: string;
  ai_assessment_status?: string;
  ai_assessment?: Record<string, unknown> | null;
  created_at?: string;
  scalp_photos?: ScalpPhoto[];
  stage?: string;
  hair_loss_stage?: string;
  primary_concern?: string;
  main_concern?: string;
  duration?: string;
};

type PatientInfo = {
  id?: string | number;
  name?: string;
  phone?: string;
  email?: string;
  patient_code?: string;
  city?: string;
  gender?: string;
  age?: number | string;
  created_at?: string;
};

const labels: Record<string, string> = {
  full_name: "Patient name",
  age: "Age",
  gender: "Gender",
  city: "City",
  occupation: "Occupation",
  primary_concern: "Main concern",
  main_concern: "Main concern",
  hair_loss_stage: "Stage selected",
  stage: "Stage selected",
  duration: "Duration",
  hair_fall_start: "Hair fall started",
  hair_fall_pattern: "Pattern noticed",
  daily_hair_fall: "Daily hair fall",
  hair_fall_increasing: "Hair fall increasing",
  dandruff: "Dandruff",
  scalp_condition: "Scalp condition",
  scalp_symptoms: "Scalp symptoms",
  hair_type: "Hair type",
  stress_level: "Stress level",
  gut_health: "Gut health",
  sleep_quality: "Sleep quality",
  diet_type: "Diet",
  protein_intake: "Protein intake",
  family_history: "Family history",
  medical_conditions: "Medical conditions",
  recent_events: "Recent events",
  allergy_status: "Allergy status",
  allergy_details: "Allergy details",
  current_medications_status: "Current medicines status",
  current_medications: "Current medicines and supplements",
  have_taken_treatment: "Previous treatment",
  previous_treatments: "Treatments tried",
  treatment_results: "Treatment results",
  looking_for: "Looking for",
};

const systemFields = new Set([
  "id", "userId", "reference_no", "status", "status_history", "created_at", "updated_at", "scalp_photos",
  "ai_assessment", "ai_assessment_status", "ai_assessment_error", "ai_assessment_updated_at", "ai_assessment_queued_at",
]);

const readable = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "Not provided";
  if (Array.isArray(value)) return value.map(readable).join(", ");
  if (typeof value === "object") return Object.entries(value as Record<string, unknown>).map(([key, item]) => `${key}: ${readable(item)}`).join(" · ");
  return String(value);
};

export function PatientAssessmentDetailPage({
  patientId,
  referenceNo,
  permissions,
  onToast,
  onAudit,
  onBack,
}: {
  patientId: string;
  referenceNo: string;
  permissions: AdminPermissionId[];
  onToast: (message: string) => void;
  onAudit: (action: string, target: string) => void;
  onBack?: () => void;
}) {
  const router = useRouter();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [confirmAction, setConfirmAction] = useState<"archive" | "restore" | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<ViewerImage | null>(null);
  const [activeCategory, setActiveCategory] = useState<"all" | "hair_loss" | "scalp" | "medical" | "lifestyle">("all");

  const canManage = permissions.includes("assessments.review") || permissions.includes("hair-tests.upload");

  useEffect(() => {
    const controller = new AbortController();
    let isSubscribed = true;

    async function loadAssessment() {
      setLoadState("loading");

      // 1. Direct assessment lookup by reference_no
      try {
        const hairTestRes = await fetch(`/api/admin/hair-tests/${encodeURIComponent(referenceNo)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (hairTestRes.ok) {
          const hairTestData = await hairTestRes.json().catch(() => ({}));
          const test = hairTestData?.data?.assessment;
          if (test && isSubscribed) {
            setAssessment(test);
            if (hairTestData?.data?.patient) {
              setPatient(hairTestData.data.patient as PatientInfo);
            }
            setLoadState("ready");
            return;
          }
        }
      } catch {
        // Fall back to patient lookup
      }

      // 2. Patient record lookup
      try {
        const userRes = await fetch(`/api/admin/users/${encodeURIComponent(patientId)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const userResult = await userRes.json().catch(() => ({}));
        if (!userRes.ok) throw new Error(userResult?.message || "Could not load this patient record.");
        const data = userResult?.data;
        if (data?.patient) setPatient(data.patient as PatientInfo);
        const match = (Array.isArray(data?.assessments) ? data.assessments : []).find(
          (item: Assessment) => String(item.reference_no) === referenceNo
        );
        if (!match) throw new Error(`Assessment ${referenceNo} was not found in patient record.`);
        if (!isSubscribed) return;
        setAssessment(match);
        setLoadState("ready");
      } catch (err) {
        if (!isSubscribed || controller.signal.aborted) return;
        setLoadState("error");
        onToast(err instanceof Error ? err.message : "Could not load this assessment.");
      }
    }

    void loadAssessment();
    return () => {
      isSubscribed = false;
      controller.abort();
    };
  }, [onToast, patientId, referenceNo]);

  const answers = useMemo(() => {
    if (!assessment) return [];
    return Object.entries(assessment)
      .filter(([key, value]) => !systemFields.has(key) && value !== null && value !== undefined && value !== "")
      .map(([key, value]) => ({
        key,
        label: labels[key] || key.replaceAll("_", " "),
        value: readable(value),
      }));
  }, [assessment]);

  const categorizedAnswers = useMemo(() => {
    const hairLossKeys = new Set([
      "primary_concern", "main_concern", "hair_loss_stage", "stage", "duration",
      "hair_fall_start", "hair_fall_pattern", "daily_hair_fall", "hair_fall_increasing", "looking_for"
    ]);
    const scalpKeys = new Set(["dandruff", "scalp_condition", "scalp_symptoms", "hair_type"]);
    const medicalKeys = new Set([
      "family_history", "medical_conditions", "recent_events", "allergy_status",
      "allergy_details", "current_medications_status", "current_medications",
      "have_taken_treatment", "previous_treatments", "treatment_results"
    ]);
    const lifestyleKeys = new Set(["stress_level", "gut_health", "sleep_quality", "diet_type", "protein_intake"]);

    return {
      hair_loss: answers.filter((a) => hairLossKeys.has(a.key)),
      scalp: answers.filter((a) => scalpKeys.has(a.key)),
      medical: answers.filter((a) => medicalKeys.has(a.key)),
      lifestyle: answers.filter((a) => lifestyleKeys.has(a.key)),
      other: answers.filter((a) => !hairLossKeys.has(a.key) && !scalpKeys.has(a.key) && !medicalKeys.has(a.key) && !lifestyleKeys.has(a.key)),
    };
  }, [answers]);

  const displayedAnswers = useMemo(() => {
    if (activeCategory === "all") return answers;
    return categorizedAnswers[activeCategory] || [];
  }, [activeCategory, answers, categorizedAnswers]);

  // AI Assessment parsing
  const aiData = assessment?.ai_assessment as Record<string, unknown> | null;
  const scalpScore = typeof aiData?.scalpHealthScore === "number"
    ? aiData.scalpHealthScore
    : typeof aiData?.scalp_health_score === "number"
    ? aiData.scalp_health_score
    : null;

  const stageClassification = typeof aiData?.stageClassification === "string"
    ? aiData.stageClassification
    : typeof aiData?.stage_classification === "string"
    ? aiData.stage_classification
    : (assessment?.stage || assessment?.hair_loss_stage || null);

  const aiSummary = typeof aiData?.summary === "string" ? aiData.summary : null;

  const rootCauses = useMemo(() => {
    const raw = aiData?.rootCauses || aiData?.root_causes;
    if (Array.isArray(raw)) {
      return raw.map((item) => {
        if (typeof item === "string") return { factor: item, severity: "Moderate", explanation: "" };
        if (item && typeof item === "object") {
          const m = item as Record<string, unknown>;
          return {
            factor: String(m.factor || m.title || "Contributing Factor"),
            severity: String(m.severity || "Moderate"),
            explanation: String(m.explanation || m.description || ""),
          };
        }
        return { factor: "Follicular Health", severity: "Moderate", explanation: "" };
      });
    }
    return [];
  }, [aiData]);

  const recommendedSteps = useMemo(() => {
    const reg = aiData?.recommendedRegimen || aiData?.recommended_regimen;
    if (reg && typeof reg === "object") {
      const steps = (reg as Record<string, unknown>).daily_steps || (reg as Record<string, unknown>).dailySteps;
      if (Array.isArray(steps)) {
        return steps.map((s) => {
          if (typeof s === "string") return { step: "Guidance", instruction: s };
          const m = s as Record<string, unknown>;
          return { step: String(m.step || "Daily Step"), instruction: String(m.instruction || "") };
        });
      }
    }
    return [];
  }, [aiData]);

  const dietPlan = useMemo(() => {
    const dp = aiData?.dietPlan || aiData?.diet_plan;
    if (dp && typeof dp === "object") {
      const m = dp as Record<string, unknown>;
      return {
        summary: String(m.summary || ""),
        foodsToEat: Array.isArray(m.foods_to_eat || m.foodsToEat) ? (m.foods_to_eat || m.foodsToEat) as string[] : [],
        foodsToAvoid: Array.isArray(m.foods_to_avoid || m.foodsToAvoid) ? (m.foods_to_avoid || m.foodsToAvoid) as string[] : [],
        hydrationTarget: String(m.hydration_target || m.hydrationTarget || ""),
      };
    }
    return null;
  }, [aiData]);

  const changeStatus = async () => {
    if (!assessment || !confirmAction || reason.trim().length < 8 || saving) return;
    const nextStatus = confirmAction === "archive" ? "archived" : "submitted";
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/hair-tests/${encodeURIComponent(referenceNo)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus, note: reason.trim() }),
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.message || "Assessment status could not be changed.");
      setAssessment((current) => (current ? { ...current, status: nextStatus } : current));
      onAudit(
        confirmAction === "archive" ? "archived patient assessment" : "restored patient assessment",
        `${patientId} · ${referenceNo}`
      );
      onToast(
        confirmAction === "archive"
          ? "Assessment archived; still visible in patient history."
          : "Assessment restored to active patient history."
      );
      setConfirmAction(null);
      setReason("");
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Assessment status could not be changed.");
    } finally {
      setSaving(false);
    }
  };

  const copyDirectUrl = () => {
    const url = `https://admin.drhairindia.com/patients/${encodeURIComponent(patientId)}/assessments/${encodeURIComponent(referenceNo)}`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(true);
      onToast("Assessment link copied to clipboard.");
      setTimeout(() => setCopiedLink(false), 2400);
    });
  };

  const shareOnWhatsApp = () => {
    const pName = patient?.name || "Patient";
    const directUrl = `https://admin.drhairindia.com/patients/${encodeURIComponent(patientId)}/assessments/${encodeURIComponent(referenceNo)}`;
    const phone = patient?.phone ? patient.phone.replace(/[^0-9]/g, "") : "";
    const cleanPhone = phone.startsWith("91") ? phone : phone ? `91${phone}` : "";
    const text = encodeURIComponent(
      `Hello ${pName},\n\nYour Dr. Hair AI Scalp Assessment (${referenceNo}) is available for review.\n\n📋 Reference: ${referenceNo}\n🔗 Record: ${directUrl}\n\nOur trichologists are ready to guide your care regimen.`
    );
    const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");
  };

  if (loadState === "loading") {
    return (
      <main className="page-wrap flex min-h-[50vh] flex-col items-center justify-center gap-3 text-slate-500">
        <LoaderCircle className="animate-spin text-teal-600" size={28} />
        <p className="text-sm font-semibold tracking-wide text-slate-600">Loading patient assessment...</p>
      </main>
    );
  }

  if (loadState === "error" || !assessment) {
    return (
      <main className="page-wrap w-full min-w-0 py-8">
        <section className="card rounded-3xl border border-rose-200 bg-rose-50/70 p-8 shadow-xs">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-100 font-bold text-rose-700">
              <AlertCircle size={24} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-rose-950">Assessment could not be loaded</h2>
              <p className="mt-1 text-sm text-rose-800">
                Assessment reference <span className="font-mono font-semibold">{referenceNo}</span> was not found in patient record <span className="font-mono font-semibold">{patientId}</span>, or may have been removed.
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-rose-200/80 pt-4">
            <button
              type="button"
              className="button button-primary button-small"
              onClick={() => (onBack ? onBack() : router.push(`/patients/${encodeURIComponent(patientId)}`))}
            >
              Back to Patient ({patientId})
            </button>
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={() => router.push("/tests")}
            >
              Hair Tests Directory
            </button>
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </div>
        </section>
      </main>
    );
  }

  const archived = assessment.status === "archived";
  const aiStatus = String(assessment.ai_assessment_status || (assessment.ai_assessment ? "ready" : "not_available"));
  const pName = patient?.name || (typeof assessment.full_name === "string" ? assessment.full_name : "Patient");
  const scalpPhotos = assessment.scalp_photos || [];

  return (
    <main className="page-wrap w-full min-w-0 space-y-6 pb-16">
      {/* Top Breadcrumb & Action Bar */}
      <nav className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" aria-label="Assessment Navigation">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="group flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-2xs transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
            onClick={() => (onBack ? onBack() : router.push(`/patients/${encodeURIComponent(patientId)}`))}
          >
            <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-0.5" />
            Back to Patient History
          </button>
          <span className="hidden text-xs text-slate-400 sm:inline">/</span>
          <span className="hidden font-mono text-xs font-semibold text-slate-500 sm:inline">
            {referenceNo}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={copyDirectUrl}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:border-teal-300 hover:bg-teal-50/50 hover:text-teal-900"
            title="Copy direct admin panel URL for this assessment"
          >
            {copiedLink ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} className="text-slate-500" />}
            {copiedLink ? "Link Copied!" : "Copy Admin Link"}
          </button>
          <button
            type="button"
            onClick={shareOnWhatsApp}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 shadow-2xs transition hover:bg-emerald-100 hover:text-emerald-900"
          >
            <MessageSquare size={14} className="text-emerald-600" />
            WhatsApp Share
          </button>
        </div>
      </nav>

      {/* Main Responsive Grid Layout (Desktop: 8 cols left, 4 cols right; Mobile: single col) */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* ======================================================== */}
        {/* LEFT COLUMN: Clinical Findings, Scalp Photos, Diagnosis   */}
        {/* ======================================================== */}
        <div className="space-y-6 lg:col-span-8">
          {/* 1. Clinical Hero Overview Card */}
          <section className="card overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs sm:p-7">
            <div className="flex flex-col gap-4 border-b border-slate-100 pb-6 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-bold tracking-wider text-teal-700 uppercase">
                  <Stethoscope size={14} />
                  <span>Trichology Assessment Record</span>
                </div>
                <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-[#1A365D] sm:text-3xl">
                  {pName}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span className="font-mono font-bold text-slate-700">Ref: {referenceNo}</span>
                  <span>•</span>
                  <span className="font-mono text-slate-600">Patient ID: {patientId}</span>
                  <span>•</span>
                  <span className="flex items-center gap-1 text-slate-500">
                    <Calendar size={13} />
                    {assessment.created_at ? new Date(assessment.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "N/A"}
                  </span>
                </div>
              </div>

              {/* Status Pills */}
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold capitalize ${
                    archived
                      ? "bg-slate-100 text-slate-700"
                      : assessment.status === "reviewed"
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      : "bg-blue-50 text-blue-800 border border-blue-200"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${archived ? "bg-slate-400" : assessment.status === "reviewed" ? "bg-emerald-500" : "bg-blue-500"}`} />
                  {String(assessment.status || "submitted").replaceAll("_", " ")}
                </span>

                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold ${
                    aiStatus === "ready"
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      : aiStatus === "failed"
                      ? "bg-rose-50 text-rose-800 border border-rose-200"
                      : "bg-amber-50 text-amber-800 border border-amber-200 animate-pulse"
                  }`}
                >
                  <Sparkles size={12} className={aiStatus === "ready" ? "text-emerald-600" : "text-amber-600"} />
                  AI: {aiStatus.replaceAll("_", " ")}
                </span>
              </div>
            </div>

            {/* Metric Highlights Strip */}
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {/* Scalp Score */}
              <div className="flex items-center gap-3.5 rounded-2xl border border-teal-100 bg-teal-50/40 p-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white font-extrabold text-base shadow-xs">
                  {scalpScore !== null ? `${scalpScore}` : "—"}
                </div>
                <div>
                  <p className="text-[11px] font-bold text-teal-800 uppercase tracking-wide">Scalp Health Score</p>
                  <p className="text-xs font-semibold text-teal-950">
                    {scalpScore !== null ? (scalpScore >= 75 ? "Good Vitality" : scalpScore >= 50 ? "Moderate Thinning" : "Needs Immediate Care") : "Pending Review"}
                  </p>
                </div>
              </div>

              {/* Stage Classification */}
              <div className="flex items-center gap-3.5 rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                  <Activity size={22} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-blue-800 uppercase tracking-wide">Stage & Pattern</p>
                  <p className="truncate text-xs font-bold text-blue-950">
                    {stageClassification || "Initial Consultation"}
                  </p>
                </div>
              </div>

              {/* Primary Concern */}
              <div className="flex items-center gap-3.5 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-700 text-white">
                  <HeartPulse size={22} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Primary Concern</p>
                  <p className="truncate text-xs font-bold text-slate-800">
                    {String(assessment.primary_concern || assessment.main_concern || "Hair loss & scalp care")}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 2. Scalp Photos Gallery with Lightbox Zoom */}
          <section className="card rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs sm:p-7">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                  <Camera size={16} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#1A365D]">Clinical Scalp Photos</h2>
                  <p className="text-xs text-slate-500">High-resolution diagnostic angles uploaded by patient</p>
                </div>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                {scalpPhotos.length} {scalpPhotos.length === 1 ? "Photo" : "Photos"}
              </span>
            </div>

            {scalpPhotos.length ? (
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                {scalpPhotos.map((photo, index) => {
                  const angleLabel = photo.angle || `Angle ${index + 1}`;
                  return (
                    <div
                      key={photo.file_name || index}
                      className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-900/5 transition hover:border-teal-400 hover:shadow-md"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedPhoto({
                            src: photo.url || "",
                            alt: `${pName} - ${angleLabel}`,
                            fileName: photo.file_name || `scalp-photo-${index + 1}.jpg`,
                            caption: `${angleLabel} · ${referenceNo}`,
                          })
                        }
                        className="block w-full cursor-zoom-in text-left focus:outline-hidden"
                      >
                        <div className="relative aspect-4/3 w-full overflow-hidden bg-slate-100">
                          {photo.url ? (
                            <Image
                              src={photo.url}
                              alt={`${angleLabel} scalp photo`}
                              fill
                              unoptimized
                              className="object-cover transition duration-300 group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                              Photo unavailable
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
                          <div className="absolute right-2 bottom-2 rounded-lg bg-black/60 p-1.5 text-white opacity-0 transition group-hover:opacity-100">
                            <ZoomIn size={14} />
                          </div>
                        </div>
                      </button>

                      <div className="flex items-center justify-between bg-white px-3.5 py-2.5">
                        <span className="text-xs font-bold text-slate-800 capitalize">{angleLabel}</span>
                        {photo.url && (
                          <a
                            href={photo.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] font-semibold text-teal-700 hover:underline inline-flex items-center gap-1"
                          >
                            Full View <ExternalLink size={10} />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center text-sm text-slate-500">
                <Camera size={28} className="mx-auto text-slate-400 mb-2" />
                No scalp photos were uploaded with this assessment submission.
              </div>
            )}
          </section>

          {/* 3. AI Trichology Diagnosis & Clinical Insights */}
          {aiData && (
            <section className="card overflow-hidden rounded-3xl border border-teal-200/90 bg-gradient-to-br from-teal-50/50 via-white to-white p-6 shadow-xs sm:p-7">
              <div className="flex items-center justify-between border-b border-teal-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-white shadow-2xs">
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-teal-950">AI Trichologist Analysis & Diagnosis</h2>
                    <p className="text-xs text-teal-700">Synthesized clinical assessment and care roadmap</p>
                  </div>
                </div>
                <span className="rounded-full bg-teal-100 px-3 py-1 text-xs font-bold text-teal-900">
                  AI Assessed
                </span>
              </div>

              {/* Summary Paragraph */}
              {aiSummary && (
                <div className="mt-5 rounded-2xl border border-teal-100 bg-white/90 p-4.5 shadow-2xs">
                  <p className="text-xs font-bold tracking-wide text-teal-800 uppercase">Clinical Summary</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">{aiSummary}</p>
                </div>
              )}

              {/* Identified Root Causes */}
              {rootCauses.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-xs font-bold tracking-wide text-slate-700 uppercase">Identified Root Causes</h3>
                  <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {rootCauses.map((rc, idx) => (
                      <div key={idx} className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900">{rc.factor}</span>
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                              rc.severity.toLowerCase() === "high"
                                ? "bg-rose-100 text-rose-800"
                                : rc.severity.toLowerCase() === "moderate"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-teal-100 text-teal-800"
                            }`}
                          >
                            {rc.severity}
                          </span>
                        </div>
                        {rc.explanation && <p className="mt-1 text-xs text-slate-600 leading-normal">{rc.explanation}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommended Regimen Steps */}
              {recommendedSteps.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-xs font-bold tracking-wide text-slate-700 uppercase">Recommended Daily Regimen</h3>
                  <div className="mt-2.5 space-y-2">
                    {recommendedSteps.map((step, idx) => (
                      <div key={idx} className="flex items-start gap-3 rounded-xl border border-teal-100 bg-white/80 p-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-teal-100 text-[11px] font-bold text-teal-900">
                          {idx + 1}
                        </span>
                        <div>
                          <p className="text-xs font-bold text-teal-950">{step.step}</p>
                          <p className="mt-0.5 text-xs text-slate-600">{step.instruction}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Diet & Lifestyle Guidance */}
              {dietPlan && (
                <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-900 uppercase">
                    <Salad size={14} className="text-emerald-700" />
                    <span>Dietary & Nutrition Plan</span>
                  </div>
                  {dietPlan.summary && <p className="mt-1.5 text-xs text-slate-700">{dietPlan.summary}</p>}
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {dietPlan.foodsToEat.length > 0 && (
                      <div className="rounded-xl border border-emerald-200/80 bg-white p-3">
                        <p className="text-[11px] font-bold text-emerald-800 uppercase">Foods to Incorporate</p>
                        <ul className="mt-1 space-y-1 text-xs text-slate-700">
                          {dietPlan.foodsToEat.map((food, i) => (
                            <li key={i} className="flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              {food}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {dietPlan.foodsToAvoid.length > 0 && (
                      <div className="rounded-xl border border-rose-200/80 bg-white p-3">
                        <p className="text-[11px] font-bold text-rose-800 uppercase">Foods to Limit</p>
                        <ul className="mt-1 space-y-1 text-xs text-slate-700">
                          {dietPlan.foodsToAvoid.map((food, i) => (
                            <li key={i} className="flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                              {food}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* 4. Categorized Patient Assessment Responses */}
          <section className="card rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs sm:p-7">
            <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-bold text-[#1A365D]">Patient Questionnaire Responses</h2>
                <p className="text-xs text-slate-500">Detailed answers submitted during online hair test</p>
              </div>

              {/* Category Filter Pills */}
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: "all", label: "All Questions" },
                  { id: "hair_loss", label: "Hair Loss" },
                  { id: "scalp", label: "Scalp Health" },
                  { id: "medical", label: "Medical & Family" },
                  { id: "lifestyle", label: "Lifestyle" },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActiveCategory(cat.id as typeof activeCategory)}
                    className={`rounded-xl px-2.5 py-1 text-xs font-bold transition ${
                      activeCategory === cat.id
                        ? "bg-[#1A365D] text-white shadow-2xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {displayedAnswers.length ? (
              <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {displayedAnswers.map((answer) => (
                  <div
                    key={answer.key}
                    className="flex flex-col justify-between rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 transition hover:border-slate-200 hover:bg-slate-50"
                  >
                    <dt className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      {answer.label}
                    </dt>
                    <dd className="mt-1.5 text-sm font-semibold text-slate-800 break-words">
                      {answer.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-xs text-slate-500">
                No questions recorded under this category.
              </div>
            )}
          </section>
        </div>

        {/* ======================================================== */}
        {/* RIGHT COLUMN: Patient Snapshot, Review Actions, WhatsApp */}
        {/* ======================================================== */}
        <div className="space-y-6 lg:col-span-4">
          {/* Patient Profile Snapshot Card */}
          <section className="card rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs">
            <div className="flex items-center gap-3.5 border-b border-slate-100 pb-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#1A365D] text-white font-extrabold text-base shadow-xs">
                {pName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Patient Profile</p>
                <h3 className="truncate text-base font-extrabold text-[#1A365D]">{pName}</h3>
                <p className="font-mono text-xs font-semibold text-slate-500">{patientId}</p>
              </div>
            </div>

            <div className="mt-4 space-y-2.5 text-xs text-slate-700">
              {patient?.gender && (
                <div className="flex items-center justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-400 font-medium">Gender</span>
                  <span className="font-semibold text-slate-800 capitalize">{patient.gender}</span>
                </div>
              )}
              {patient?.age && (
                <div className="flex items-center justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-400 font-medium">Age</span>
                  <span className="font-semibold text-slate-800">{patient.age} years</span>
                </div>
              )}
              {patient?.city && (
                <div className="flex items-center justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-400 font-medium flex items-center gap-1">
                    <MapPin size={12} /> City
                  </span>
                  <span className="font-semibold text-slate-800">{patient.city}</span>
                </div>
              )}
              {patient?.phone && (
                <div className="flex items-center justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-400 font-medium flex items-center gap-1">
                    <Phone size={12} /> Phone
                  </span>
                  <span className="font-mono font-semibold text-slate-800">{patient.phone}</span>
                </div>
              )}
              {patient?.email && (
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-400 font-medium flex items-center gap-1">
                    <Mail size={12} /> Email
                  </span>
                  <span className="truncate max-w-[170px] font-semibold text-slate-800" title={patient.email}>
                    {patient.email}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => (onBack ? onBack() : router.push(`/patients/${encodeURIComponent(patientId)}`))}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-bold text-slate-800 transition hover:bg-slate-200"
              >
                <User size={14} />
                Open Full Patient History
              </button>
            </div>
          </section>

          {/* Clinical Review Actions Card */}
          {canManage && (
            <section className="card rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <CheckCircle2 size={16} className="text-teal-600" />
                <h3 className="text-sm font-bold text-[#1A365D]">Clinical Review Controls</h3>
              </div>

              <div className="mt-4 space-y-3">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Manage patient review visibility, audit logs, and status records.
                </p>

                {archived ? (
                  <button
                    type="button"
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-xs font-bold text-teal-800 transition hover:bg-teal-100"
                    onClick={() => {
                      setReason("");
                      setConfirmAction("restore");
                    }}
                  >
                    <RotateCcw size={14} />
                    Restore Assessment to Active
                  </button>
                ) : (
                  <button
                    type="button"
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-800 transition hover:bg-rose-100"
                    onClick={() => {
                      setReason("");
                      setConfirmAction("archive");
                    }}
                  >
                    <Archive size={14} />
                    Archive This Assessment
                  </button>
                )}
              </div>
            </section>
          )}

          {/* Direct WhatsApp Patient Communication Card */}
          <section className="card rounded-3xl border border-emerald-200/90 bg-emerald-50/40 p-6 shadow-xs">
            <div className="flex items-center gap-2 border-b border-emerald-100 pb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white">
                <MessageSquare size={14} />
              </div>
              <h3 className="text-sm font-bold text-emerald-950">Patient WhatsApp Bridge</h3>
            </div>

            <div className="mt-3.5 space-y-3">
              <p className="text-xs text-emerald-900 leading-relaxed">
                Send the official assessment link to the patient with our customized Dr. Hair portal URL.
              </p>

              <div className="rounded-xl border border-emerald-200 bg-white p-3 text-[11px] text-slate-700 font-mono break-all leading-normal">
                https://admin.drhairindia.com/patients/{patientId}/assessments/{referenceNo}
              </div>

              <button
                type="button"
                onClick={shareOnWhatsApp}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700"
              >
                <MessageSquare size={14} />
                Send via WhatsApp
              </button>
            </div>
          </section>

          {/* Quick Shortcuts */}
          <section className="rounded-3xl border border-slate-200/80 bg-slate-50/70 p-5 text-xs text-slate-600">
            <p className="font-bold text-slate-700 uppercase tracking-wide text-[10px]">Clinic Shortcuts</p>
            <div className="mt-3 space-y-2">
              <button
                type="button"
                onClick={() => router.push("/bookings")}
                className="w-full flex items-center justify-between rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-left font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              >
                <span>Schedule Consultation</span>
                <ExternalLink size={12} className="text-slate-400" />
              </button>
              <button
                type="button"
                onClick={() => router.push("/orders")}
                className="w-full flex items-center justify-between rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-left font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              >
                <span>Fulfill Prescription Kit</span>
                <ExternalLink size={12} className="text-slate-400" />
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* Confirmation Modal for Archive / Restore */}
      {confirmAction && (
        <Modal
          title={confirmAction === "archive" ? "Archive this assessment?" : "Restore this assessment?"}
          description={
            confirmAction === "archive"
              ? "This hides the assessment from the patient's active mobile app view. Admins can still inspect it in patient history. Photos and reports remain intact."
              : "This makes the assessment visible in the patient's active history again."
          }
          submitLabel={saving ? "Saving…" : confirmAction === "archive" ? "Archive Assessment" : "Restore Assessment"}
          submitVariant={confirmAction === "archive" ? "danger" : "primary"}
          submitDisabled={saving || reason.trim().length < 8}
          onClose={() => !saving && setConfirmAction(null)}
          onSubmit={() => void changeStatus()}
        >
          <label className="block text-xs font-semibold text-slate-700">
            Audit Reason (minimum 8 characters)
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={300}
              className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-teal-500 focus:outline-hidden"
              placeholder="e.g. Duplicate assessment submission or requested by clinician"
            />
          </label>
          <p className="mt-2 text-xs text-slate-500">
            This action and reason will be permanently recorded in the admin audit log.
          </p>
        </Modal>
      )}

      {/* Full Size Image Viewer (Lightbox) for Scalp Photos */}
      {selectedPhoto && (
        <FullSizeImageViewer
          image={selectedPhoto}
          onClose={() => setSelectedPhoto(null)}
        />
      )}
    </main>
  );
}
