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
  Edit2,
  Edit3,
  ExternalLink,
  FileText,
  HeartPulse,
  Info,
  LoaderCircle,
  Mail,
  MapPin,
  MessageSquare,
  Pill,
  Phone,
  Plus,
  RefreshCw,
  RotateCcw,
  Salad,
  Save,
  Share2,
  ShieldCheck,
  Sliders,
  Sparkles,
  Stethoscope,
  Trash2,
  User,
  UserCheck,
  Video,
  ZoomIn,
} from "lucide-react";
import { Modal } from "../../shared/components/ui";
import { FullSizeImageViewer, type ViewerImage } from "../../shared/components/full-size-image-viewer";
import type { AdminPermissionId } from "../../shared/types";
import { cachedFetch, TTL_PROFILES } from "../../shared/lib/api-cache";

type ScalpPhoto = {
  file_name?: string;
  url?: string;
  angle?: string;
};

type ClinicalNotes = {
  doctor_notes?: string;
  diagnosis_insights?: string;
  clinical_recommendations?: string;
  updated_at?: string;
  updated_by?: string;
};

type RecommendedProduct = {
  id?: string;
  catalog_id?: string;
  name: string;
  category?: string;
  dosage?: string;
  instructions?: string;
  duration?: string;
  price?: number;
};

type RecommendedAppointment = {
  recommended: boolean;
  type?: string;
  date?: string;
  time_slot?: string;
  notes?: string;
};

type RecommendedTreatments = {
  products?: RecommendedProduct[];
  appointment?: RecommendedAppointment | null;
  instructions?: string;
  updated_at?: string;
  updated_by?: string;
};

type AiAssessmentOverride = {
  hair_loss_stage?: string;
  scalp_score?: number | null;
  primary_concern?: string;
  prognosis?: string;
  notes?: string;
  overridden_by?: string;
  overridden_at?: string;
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
  clinical_notes?: ClinicalNotes | null;
  recommended_treatments?: RecommendedTreatments | null;
  ai_assessment_override?: AiAssessmentOverride | null;
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
  occupation?: string;
  medical_conditions?: string[];
  created_at?: string;
};

type CatalogProduct = {
  id: string | number;
  name: string;
  category?: string;
  price?: number;
  description?: string;
};

const COMMON_CONDITIONS = [
  "Thyroid Disorder",
  "PCOS / PCOD",
  "Diabetes",
  "Hypertension",
  "Chronic Stress / Anxiety",
  "Vitamin D Deficiency",
  "Vitamin B12 Deficiency",
  "Alopecia Areata",
  "Seborrheic Dermatitis",
  "Scalp Psoriasis",
];

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
  "clinical_notes", "recommended_treatments", "ai_assessment_override",
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

  // 1. Clinical Audit Notes state
  const [doctorNotes, setDoctorNotes] = useState("");
  const [diagnosisInsights, setDiagnosisInsights] = useState("");
  const [clinicalRecommendations, setClinicalRecommendations] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  // 2. Treatment Recommendations state
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<RecommendedProduct[]>([]);
  const [appointmentRec, setAppointmentRec] = useState<RecommendedAppointment>({
    recommended: false,
    type: "video_teleconsultation",
    date: "",
    time_slot: "10:00 AM - 10:30 AM",
    notes: "",
  });
  const [treatmentInstructions, setTreatmentInstructions] = useState("");
  const [selectedCatalogId, setSelectedCatalogId] = useState("");
  const [customProductName, setCustomProductName] = useState("");
  const [customDosage, setCustomDosage] = useState("Once daily");
  const [customInstructions, setCustomInstructions] = useState("Apply as directed");
  const [savingRecommendations, setSavingRecommendations] = useState(false);

  // 3. AI Result Overrides state
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideStage, setOverrideStage] = useState("");
  const [overrideScalpScore, setOverrideScalpScore] = useState("");
  const [overridePrimaryConcern, setOverridePrimaryConcern] = useState("");
  const [overridePrognosis, setOverridePrognosis] = useState("Good reversibility with consistent care");
  const [overrideNotes, setOverrideNotes] = useState("");
  const [savingOverride, setSavingOverride] = useState(false);

  // 4. Complete Patient Detail Update state
  const [patientModalOpen, setPatientModalOpen] = useState(false);
  const [patientForm, setPatientForm] = useState<{
    name: string;
    phone: string;
    email: string;
    gender: string;
    age: string;
    medical_conditions: string[];
    city: string;
    occupation: string;
  }>({
    name: "",
    phone: "",
    email: "",
    gender: "male",
    age: "",
    medical_conditions: [],
    city: "",
    occupation: "",
  });
  const [customConditionInput, setCustomConditionInput] = useState("");
  const [savingPatient, setSavingPatient] = useState(false);

  const canManage = permissions.includes("assessments.review") || permissions.includes("hair-tests.upload") || permissions.includes("care-plans.edit");

  // Fetch product catalog on mount (reuses cached products)
  useEffect(() => {
    const controller = new AbortController();
    cachedFetch("/api/admin/products", { signal: controller.signal }, TTL_PROFILES.products)
      .then(async (res) => {
        if (!res.ok) return;
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        const data = json.data;
        const payload = data && typeof data === "object" && !Array.isArray(data)
          ? data as Record<string, unknown>
          : {};
        const items = Array.isArray(payload.items) ? payload.items : Array.isArray(data) ? data : [];
        if (Array.isArray(items)) {
          setCatalogProducts(
            items
              .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === "object")
              .map((p) => ({
                id: String(p.id ?? p._id ?? ""),
                name: String(p.name || p.title || "Product"),
                category: String(p.category || p.type || "Trichology Care"),
                price: Number(p.price || 0),
                description: String(p.description || ""),
              }))
          );
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  // Sync state when assessment or patient loads
  const syncFormStates = (test: Assessment, pat?: PatientInfo | null) => {
    // Sync Clinical Notes
    if (test.clinical_notes) {
      setDoctorNotes(test.clinical_notes.doctor_notes || "");
      setDiagnosisInsights(test.clinical_notes.diagnosis_insights || "");
      setClinicalRecommendations(test.clinical_notes.clinical_recommendations || "");
    }

    // Sync Treatment Recommendations
    if (test.recommended_treatments) {
      setSelectedProducts(test.recommended_treatments.products || []);
      setAppointmentRec(
        test.recommended_treatments.appointment || {
          recommended: false,
          type: "video_teleconsultation",
          date: "",
          time_slot: "10:00 AM - 10:30 AM",
          notes: "",
        }
      );
      setTreatmentInstructions(test.recommended_treatments.instructions || "");
    }

    // Sync AI Overrides
    if (test.ai_assessment_override) {
      const ov = test.ai_assessment_override;
      setOverrideStage(ov.hair_loss_stage || "");
      setOverrideScalpScore(ov.scalp_score != null ? String(ov.scalp_score) : "");
      setOverridePrimaryConcern(ov.primary_concern || "");
      setOverridePrognosis(ov.prognosis || "Good reversibility with consistent care");
      setOverrideNotes(ov.notes || "");
    } else {
      setOverrideStage(String(test.hair_loss_stage || test.stage || "Stage 2"));
      setOverridePrimaryConcern(String(test.primary_concern || test.main_concern || "Hair loss & thinning"));
    }

    // Sync Patient Form
    const currentPat = pat || patient;
    if (currentPat) {
      setPatientForm({
        name: currentPat.name || String(test.full_name || ""),
        phone: currentPat.phone || String(test.phone || ""),
        email: currentPat.email || String(test.email || ""),
        gender: String(currentPat.gender || test.gender || "male").toLowerCase(),
        age: currentPat.age != null ? String(currentPat.age) : test.age != null ? String(test.age) : "",
        medical_conditions: Array.isArray(currentPat.medical_conditions)
          ? currentPat.medical_conditions
          : Array.isArray(test.medical_conditions)
          ? (test.medical_conditions as string[])
          : [],
        city: currentPat.city || String(test.city || ""),
        occupation: currentPat.occupation || String(test.occupation || ""),
      });
    }
  };

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
          const hairTestData = (await hairTestRes.json().catch(() => ({}))) as {
            data?: { assessment?: Assessment; patient?: PatientInfo };
          };
          const test = hairTestData?.data?.assessment;
          if (test && isSubscribed) {
            setAssessment(test);
            const pat = hairTestData?.data?.patient as PatientInfo | undefined;
            if (pat) setPatient(pat);
            syncFormStates(test, pat);
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
        const userResult = (await userRes.json().catch(() => ({}))) as {
          message?: string;
          data?: { patient?: PatientInfo; assessments?: Assessment[] };
        };
        if (!userRes.ok) throw new Error(userResult?.message || "Could not load this patient record.");
        const data = userResult?.data;
        const pat = data?.patient as PatientInfo | undefined;
        if (pat) setPatient(pat);
        const match = (Array.isArray(data?.assessments) ? data.assessments : []).find(
          (item: Assessment) => String(item.reference_no) === referenceNo
        );
        if (!match) throw new Error(`Assessment ${referenceNo} was not found in patient record.`);
        if (!isSubscribed) return;
        setAssessment(match);
        syncFormStates(match, pat);
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
  const rawScalpScore = typeof aiData?.scalpHealthScore === "number"
    ? aiData.scalpHealthScore
    : typeof aiData?.scalp_health_score === "number"
    ? aiData.scalp_health_score
    : null;

  const rawStageClassification = typeof aiData?.stageClassification === "string"
    ? aiData.stageClassification
    : typeof aiData?.stage_classification === "string"
    ? aiData.stage_classification
    : (assessment?.stage || assessment?.hair_loss_stage || null);

  const aiSummary = typeof aiData?.summary === "string" ? aiData.summary : null;

  // Active Override values
  const aiOverride = assessment?.ai_assessment_override;
  const isOverridden = Boolean(aiOverride && (aiOverride.hair_loss_stage || aiOverride.scalp_score != null || aiOverride.primary_concern));

  const effectiveScalpScore = aiOverride?.scalp_score != null ? aiOverride.scalp_score : rawScalpScore;
  const effectiveStage = aiOverride?.hair_loss_stage || rawStageClassification;
  const effectivePrimaryConcern = aiOverride?.primary_concern || String(assessment?.primary_concern || assessment?.main_concern || "Hair loss & scalp care");

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

  // Handler 1: Save Clinical Audit Notes
  const handleSaveClinicalNotes = async () => {
    if (!assessment || savingNotes) return;
    setSavingNotes(true);
    try {
      const response = await fetch(`/api/admin/hair-tests/${encodeURIComponent(referenceNo)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinical_notes: {
            doctor_notes: doctorNotes.trim(),
            diagnosis_insights: diagnosisInsights.trim(),
            clinical_recommendations: clinicalRecommendations.trim(),
          },
        }),
        cache: "no-store",
      });
      const result = (await response.json().catch(() => ({}))) as { message?: string; data?: Assessment };
      if (!response.ok) throw new Error(result?.message || "Could not save clinical audit notes.");

      setAssessment((prev) => (prev ? {
        ...prev,
        clinical_notes: {
          doctor_notes: doctorNotes.trim(),
          diagnosis_insights: diagnosisInsights.trim(),
          clinical_recommendations: clinicalRecommendations.trim(),
          updated_at: new Date().toISOString(),
          updated_by: "Doctor",
        },
      } : prev));

      onAudit("saved clinical notes", `Assessment ${referenceNo}`);
      onToast("Clinical audit notes saved successfully.");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to save clinical audit notes.");
    } finally {
      setSavingNotes(false);
    }
  };

  // Handler 2: Save Treatment Recommendations
  const handleSaveRecommendations = async () => {
    if (!assessment || savingRecommendations) return;
    setSavingRecommendations(true);
    try {
      const payload: RecommendedTreatments = {
        products: selectedProducts,
        appointment: appointmentRec.recommended ? appointmentRec : null,
        instructions: treatmentInstructions.trim(),
      };

      const response = await fetch(`/api/admin/hair-tests/${encodeURIComponent(referenceNo)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommended_treatments: payload }),
        cache: "no-store",
      });
      const result = (await response.json().catch(() => ({}))) as { message?: string; data?: Assessment };
      if (!response.ok) throw new Error(result?.message || "Could not save treatment recommendations.");

      setAssessment((prev) => (prev ? {
        ...prev,
        recommended_treatments: {
          ...payload,
          updated_at: new Date().toISOString(),
          updated_by: "Doctor",
        },
      } : prev));

      onAudit("saved treatment recommendations", `Assessment ${referenceNo}`);
      onToast("Treatment recommendations and products saved successfully.");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to save treatment recommendations.");
    } finally {
      setSavingRecommendations(false);
    }
  };

  const handleAddProductFromCatalog = () => {
    if (!selectedCatalogId) return;
    const prod = catalogProducts.find((p) => String(p.id) === selectedCatalogId);
    if (!prod) return;
    const exists = selectedProducts.some((p) => p.catalog_id === String(prod.id));
    if (exists) {
      onToast(`${prod.name} is already added to recommendations.`);
      return;
    }
    setSelectedProducts((prev) => [
      ...prev,
      {
        catalog_id: String(prod.id),
        name: prod.name,
        category: prod.category || "Trichology Care",
        dosage: customDosage || "Once daily",
        instructions: customInstructions || "Apply as directed",
        duration: "3 months",
        price: prod.price,
      },
    ]);
    setSelectedCatalogId("");
    onToast(`Added ${prod.name} to recommendations.`);
  };

  const handleAddCustomProduct = () => {
    if (!customProductName.trim()) return;
    setSelectedProducts((prev) => [
      ...prev,
      {
        name: customProductName.trim(),
        category: "Custom Formulation",
        dosage: customDosage || "Once daily",
        instructions: customInstructions || "Apply as directed",
        duration: "3 months",
      },
    ]);
    setCustomProductName("");
    onToast("Added custom product to recommendations.");
  };

  const handleRemoveProduct = (index: number) => {
    setSelectedProducts((prev) => prev.filter((_, i) => i !== index));
  };

  // Handler 3: Save AI Result Overrides
  const handleSaveAiOverride = async () => {
    if (!assessment || savingOverride) return;
    setSavingOverride(true);
    try {
      const parsedScore = overrideScalpScore.trim() ? Number(overrideScalpScore.trim()) : null;
      if (parsedScore !== null && (isNaN(parsedScore) || parsedScore < 0 || parsedScore > 100)) {
        throw new Error("Scalp score must be a number between 0 and 100.");
      }

      const overridePayload: AiAssessmentOverride = {
        hair_loss_stage: overrideStage.trim() || undefined,
        scalp_score: parsedScore,
        primary_concern: overridePrimaryConcern.trim() || undefined,
        prognosis: overridePrognosis.trim() || undefined,
        notes: overrideNotes.trim() || undefined,
      };

      const response = await fetch(`/api/admin/hair-tests/${encodeURIComponent(referenceNo)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ai_assessment_override: overridePayload }),
        cache: "no-store",
      });
      const result = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(result?.message || "Could not save AI overrides.");

      setAssessment((prev) => (prev ? {
        ...prev,
        ai_assessment_override: {
          ...overridePayload,
          overridden_by: "Doctor",
          overridden_at: new Date().toISOString(),
        },
      } : prev));

      onAudit("saved AI assessment override", `Assessment ${referenceNo}`);
      onToast("Doctor AI override applied and saved successfully.");
      setOverrideOpen(false);
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to save AI overrides.");
    } finally {
      setSavingOverride(false);
    }
  };

  const handleResetAiOverride = async () => {
    if (!assessment || savingOverride) return;
    setSavingOverride(true);
    try {
      const response = await fetch(`/api/admin/hair-tests/${encodeURIComponent(referenceNo)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ai_assessment_override: null }),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Could not reset AI overrides.");

      setAssessment((prev) => (prev ? { ...prev, ai_assessment_override: null } : prev));
      setOverrideStage(rawStageClassification || "Stage 2");
      setOverrideScalpScore(rawScalpScore != null ? String(rawScalpScore) : "");
      setOverridePrimaryConcern(String(assessment.primary_concern || assessment.main_concern || ""));
      setOverrideNotes("");

      onAudit("reset AI assessment override", `Assessment ${referenceNo}`);
      onToast("Assessment reset to standard automated AI results.");
      setOverrideOpen(false);
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to reset AI overrides.");
    } finally {
      setSavingOverride(false);
    }
  };

  // Handler 4: Complete Patient Detail Update
  const handleSavePatientDetails = async () => {
    if (savingPatient) return;
    if (!patientForm.name.trim()) {
      onToast("Patient name cannot be empty.");
      return;
    }
    const cleanPhone = patientForm.phone.replace(/\D/g, "");
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      onToast("Phone number must have between 10 and 15 digits.");
      return;
    }
    if (patientForm.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patientForm.email.trim())) {
      onToast("Please enter a valid email address.");
      return;
    }

    setSavingPatient(true);
    try {
      const updatePayload = {
        name: patientForm.name.trim(),
        phone: cleanPhone,
        email: patientForm.email.trim().toLowerCase() || null,
        gender: patientForm.gender.toLowerCase(),
        age: patientForm.age ? parseInt(patientForm.age, 10) : null,
        medical_conditions: patientForm.medical_conditions,
        city: patientForm.city.trim() || null,
        occupation: patientForm.occupation.trim() || null,
        confirm_contact_change: true,
      };

      const response = await fetch(`/api/admin/users/${encodeURIComponent(patientId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatePayload),
        cache: "no-store",
      });
      const result = (await response.json().catch(() => ({}))) as {
        message?: string;
        data?: Partial<PatientInfo>;
      };
      if (!response.ok) throw new Error(result?.message || "Patient profile could not be updated.");

      const updatedData = result?.data || updatePayload;
      setPatient((prev) => ({
        ...prev,
        ...updatedData,
        name: updatePayload.name,
        phone: updatePayload.phone,
        email: updatePayload.email || undefined,
        gender: updatePayload.gender,
        age: updatePayload.age ?? undefined,
        medical_conditions: updatePayload.medical_conditions,
        city: updatePayload.city || undefined,
        occupation: updatePayload.occupation || undefined,
      }));

      setPatientModalOpen(false);
      onAudit("updated patient profile details", `Patient ${patientId}`);
      onToast("Patient profile details updated successfully.");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to update patient profile.");
    } finally {
      setSavingPatient(false);
    }
  };

  const toggleCondition = (cond: string) => {
    setPatientForm((prev) => {
      const exists = prev.medical_conditions.includes(cond);
      return {
        ...prev,
        medical_conditions: exists
          ? prev.medical_conditions.filter((c) => c !== cond)
          : [...prev.medical_conditions, cond],
      };
    });
  };

  const addCustomCondition = () => {
    const val = customConditionInput.trim();
    if (!val) return;
    if (!patientForm.medical_conditions.includes(val)) {
      setPatientForm((prev) => ({ ...prev, medical_conditions: [...prev.medical_conditions, val] }));
    }
    setCustomConditionInput("");
  };

  // Status Change (Archive / Restore)
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
      const result = (await response.json().catch(() => ({}))) as { message?: string };
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
          {canManage && (
            <button
              type="button"
              onClick={() => setPatientModalOpen(true)}
              className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800 shadow-2xs transition hover:bg-blue-100 hover:text-blue-900"
            >
              <Edit2 size={13} className="text-blue-600" />
              Edit Patient Details
            </button>
          )}

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

              {/* Status & Override Pills */}
              <div className="flex flex-wrap items-center gap-2">
                {isOverridden && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-extrabold text-purple-800 shadow-2xs">
                    <ShieldCheck size={12} className="text-purple-600" />
                    Doctor Override Active
                  </span>
                )}

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
              <div className="flex items-center gap-3.5 rounded-2xl border border-teal-100 bg-teal-50/40 p-4 relative">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white font-extrabold text-base shadow-xs">
                  {effectiveScalpScore !== null ? `${effectiveScalpScore}` : "—"}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="text-[11px] font-bold text-teal-800 uppercase tracking-wide">Scalp Score</p>
                    {aiOverride?.scalp_score != null && (
                      <span className="text-[9px] font-extrabold text-purple-700 bg-purple-100 rounded-sm px-1">MD</span>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-teal-950 truncate">
                    {effectiveScalpScore !== null ? (effectiveScalpScore >= 75 ? "Good Vitality" : effectiveScalpScore >= 50 ? "Moderate Thinning" : "Needs Immediate Care") : "Pending Review"}
                  </p>
                </div>
              </div>

              {/* Stage Classification */}
              <div className="flex items-center gap-3.5 rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                  <Activity size={22} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="text-[11px] font-bold text-blue-800 uppercase tracking-wide">Stage & Pattern</p>
                    {aiOverride?.hair_loss_stage && (
                      <span className="text-[9px] font-extrabold text-purple-700 bg-purple-100 rounded-sm px-1">MD</span>
                    )}
                  </div>
                  <p className="truncate text-xs font-bold text-blue-950">
                    {effectiveStage || "Initial Consultation"}
                  </p>
                </div>
              </div>

              {/* Primary Concern */}
              <div className="flex items-center gap-3.5 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-700 text-white">
                  <HeartPulse size={22} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Primary Concern</p>
                    {aiOverride?.primary_concern && (
                      <span className="text-[9px] font-extrabold text-purple-700 bg-purple-100 rounded-sm px-1">MD</span>
                    )}
                  </div>
                  <p className="truncate text-xs font-bold text-slate-800">
                    {effectivePrimaryConcern}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 2. Clinical Audit Notes (Doctor Notes, Diagnosis Insights, Clinical Recommendations) */}
          <section className="card rounded-3xl border border-indigo-200/90 bg-gradient-to-br from-indigo-50/40 via-white to-white p-6 shadow-xs sm:p-7">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-indigo-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-2xs">
                  <FileText size={16} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-indigo-950">Clinical Audit Notes</h2>
                  <p className="text-xs text-indigo-700">Physician diagnosis insights, clinical observations & notes</p>
                </div>
              </div>
              {assessment.clinical_notes?.updated_at && (
                <div className="text-[11px] text-slate-500 font-medium">
                  Last updated by <span className="font-semibold text-slate-700">{assessment.clinical_notes.updated_by || "Doctor"}</span> on{" "}
                  {new Date(assessment.clinical_notes.updated_at).toLocaleDateString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </div>
              )}
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                  Doctor Notes & General Clinical Audit
                </label>
                <textarea
                  value={doctorNotes}
                  onChange={(e) => setDoctorNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-2xl border border-slate-200 p-3.5 text-xs text-slate-800 leading-relaxed shadow-2xs focus:border-indigo-500 focus:outline-hidden"
                  placeholder="Record doctor observations regarding patient history, lifestyle impact, hair fall timeline, or consultation discussion..."
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                    Diagnosis Insights
                  </label>
                  <textarea
                    value={diagnosisInsights}
                    onChange={(e) => setDiagnosisInsights(e.target.value)}
                    rows={3}
                    className="w-full rounded-2xl border border-slate-200 p-3.5 text-xs text-slate-800 leading-relaxed shadow-2xs focus:border-indigo-500 focus:outline-hidden"
                    placeholder="Specific clinical diagnosis (e.g. Androgenetic Alopecia Grade 2, Telogen Effluvium secondary to nutritional deficiency)..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                    Clinical Recommendations
                  </label>
                  <textarea
                    value={clinicalRecommendations}
                    onChange={(e) => setClinicalRecommendations(e.target.value)}
                    rows={3}
                    className="w-full rounded-2xl border border-slate-200 p-3.5 text-xs text-slate-800 leading-relaxed shadow-2xs focus:border-indigo-500 focus:outline-hidden"
                    placeholder="Dietary adjustments, wash frequency, lifestyle protocols, recommended investigations (e.g. Serum Ferritin, TSH)..."
                  />
                </div>
              </div>

              {canManage && (
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={handleSaveClinicalNotes}
                    disabled={savingNotes}
                    className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {savingNotes ? <LoaderCircle size={14} className="animate-spin" /> : <Save size={14} />}
                    {savingNotes ? "Saving Notes…" : "Save Clinical Notes"}
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* 3. Treatment Recommendations (Products Catalog & Appointments) */}
          <section className="card rounded-3xl border border-emerald-200/90 bg-gradient-to-br from-emerald-50/40 via-white to-white p-6 shadow-xs sm:p-7">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-emerald-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-2xs">
                  <Pill size={16} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-emerald-950">Treatment Recommendations</h2>
                  <p className="text-xs text-emerald-700">Assign products from catalog and schedule doctor appointments</p>
                </div>
              </div>
              {assessment.recommended_treatments?.updated_at && (
                <div className="text-[11px] text-slate-500 font-medium">
                  Last updated on{" "}
                  {new Date(assessment.recommended_treatments.updated_at).toLocaleDateString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </div>
              )}
            </div>

            {/* A. Recommended Products List */}
            <div className="mt-5 space-y-4">
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-2 flex items-center justify-between">
                  <span>Assigned Care Products ({selectedProducts.length})</span>
                </h3>

                {selectedProducts.length > 0 ? (
                  <div className="space-y-2.5">
                    {selectedProducts.map((prod, idx) => (
                      <div
                        key={idx}
                        className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900">{prod.name}</p>
                          <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-600">
                            <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800 border border-emerald-200">
                              Dosage: {prod.dosage || "As directed"}
                            </span>
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                              Duration: {prod.duration || "3 months"}
                            </span>
                            {prod.instructions && (
                              <span className="text-slate-500 italic">
                                &quot;{prod.instructions}&quot;
                              </span>
                            )}
                          </div>
                        </div>

                        {canManage && (
                          <button
                            type="button"
                            onClick={() => handleRemoveProduct(idx)}
                            className="self-end sm:self-center flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition"
                            title="Remove product"
                          >
                            <Trash2 size={13} />
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-5 text-center text-xs text-slate-500">
                    No products currently assigned to this patient assessment.
                  </div>
                )}
              </div>

              {/* Add Product from Catalog Dropdown */}
              {canManage && (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/30 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-900 mb-2.5">
                    Select Product from Catalog
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-12 items-end">
                    <div className="sm:col-span-5">
                      <label className="block text-[10px] font-bold text-slate-600 mb-1">Catalog Item</label>
                      <select
                        value={selectedCatalogId}
                        onChange={(e) => setSelectedCatalogId(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs font-medium text-slate-800 shadow-2xs focus:border-emerald-500 focus:outline-hidden"
                      >
                        <option value="">-- Choose from Catalog --</option>
                        {catalogProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} {p.price ? `(₹${p.price})` : ""} - {p.category}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-[10px] font-bold text-slate-600 mb-1">Dosage / Frequency</label>
                      <input
                        type="text"
                        value={customDosage}
                        onChange={(e) => setCustomDosage(e.target.value)}
                        placeholder="e.g. 1ml nightly"
                        className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-800 shadow-2xs focus:border-emerald-500 focus:outline-hidden"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-[10px] font-bold text-slate-600 mb-1">Instructions</label>
                      <input
                        type="text"
                        value={customInstructions}
                        onChange={(e) => setCustomInstructions(e.target.value)}
                        placeholder="e.g. After washing scalp"
                        className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-800 shadow-2xs focus:border-emerald-500 focus:outline-hidden"
                      />
                    </div>

                    <div className="sm:col-span-1">
                      <button
                        type="button"
                        onClick={handleAddProductFromCatalog}
                        disabled={!selectedCatalogId}
                        className="w-full flex items-center justify-center rounded-xl bg-emerald-600 p-2 text-white hover:bg-emerald-700 disabled:opacity-50 transition"
                        title="Add Product"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Or Custom Product Entry */}
                  <div className="mt-3 pt-3 border-t border-emerald-100/60 flex items-center gap-2">
                    <input
                      type="text"
                      value={customProductName}
                      onChange={(e) => setCustomProductName(e.target.value)}
                      placeholder="Or enter custom medicine / serum name..."
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 shadow-2xs focus:border-emerald-500 focus:outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomProduct}
                      disabled={!customProductName.trim()}
                      className="rounded-xl border border-emerald-200 bg-white px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50 transition"
                    >
                      Add Custom
                    </button>
                  </div>
                </div>
              )}

              {/* B. Doctor Appointment Recommendation */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar size={16} className="text-teal-600" />
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                      Doctor Consultation Recommendation
                    </span>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={appointmentRec.recommended}
                      onChange={(e) => setAppointmentRec((prev) => ({ ...prev, recommended: e.target.checked }))}
                      className="h-4 w-4 rounded-sm border-slate-300 text-teal-600 focus:ring-teal-500"
                    />
                    <span className="text-xs font-semibold text-slate-700">Recommend Appointment</span>
                  </label>
                </div>

                {appointmentRec.recommended && (
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 pt-3 border-t border-slate-100">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Appointment Type</label>
                      <select
                        value={appointmentRec.type}
                        onChange={(e) => setAppointmentRec((prev) => ({ ...prev, type: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-800 focus:border-teal-500 focus:outline-hidden"
                      >
                        <option value="video_teleconsultation">Video Teleconsultation</option>
                        <option value="in_clinic_visit">In-Clinic Trichology Visit</option>
                        <option value="scalp_biopsy_evaluation">Scalp Biopsy & Lab Review</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Recommended Date</label>
                      <input
                        type="date"
                        value={appointmentRec.date}
                        onChange={(e) => setAppointmentRec((prev) => ({ ...prev, date: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-800 focus:border-teal-500 focus:outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Time Window</label>
                      <select
                        value={appointmentRec.time_slot}
                        onChange={(e) => setAppointmentRec((prev) => ({ ...prev, time_slot: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-800 focus:border-teal-500 focus:outline-hidden"
                      >
                        <option value="10:00 AM - 10:30 AM">10:00 AM - 10:30 AM</option>
                        <option value="11:30 AM - 12:00 PM">11:30 AM - 12:00 PM</option>
                        <option value="02:00 PM - 02:30 PM">02:00 PM - 02:30 PM</option>
                        <option value="04:30 PM - 05:00 PM">04:30 PM - 05:00 PM</option>
                        <option value="06:00 PM - 06:30 PM">06:00 PM - 06:30 PM</option>
                      </select>
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Consultation Instructions for Patient</label>
                      <input
                        type="text"
                        value={appointmentRec.notes}
                        onChange={(e) => setAppointmentRec((prev) => ({ ...prev, notes: e.target.value }))}
                        placeholder="e.g. Wash hair 4 hours before consultation. Keep recent blood test reports handy."
                        className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-800 focus:border-teal-500 focus:outline-hidden"
                      />
                    </div>
                  </div>
                )}
              </div>

              {canManage && (
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={handleSaveRecommendations}
                    disabled={savingRecommendations}
                    className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {savingRecommendations ? <LoaderCircle size={14} className="animate-spin" /> : <Save size={14} />}
                    {savingRecommendations ? "Saving Recommendations…" : "Save Recommendations"}
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* 4. AI Trichology Diagnosis & Doctor Overrides */}
          <section className="card overflow-hidden rounded-3xl border border-teal-200/90 bg-gradient-to-br from-teal-50/50 via-white to-white p-6 shadow-xs sm:p-7">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-teal-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-white shadow-2xs">
                  <Sparkles size={16} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-teal-950">AI Trichologist Analysis & Diagnosis</h2>
                  <p className="text-xs text-teal-700">Synthesized clinical assessment and care roadmap</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setOverrideOpen((prev) => !prev)}
                    className="flex items-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-bold text-purple-900 shadow-2xs transition hover:bg-purple-100"
                  >
                    <Sliders size={13} className="text-purple-600" />
                    {overrideOpen ? "Hide Overrides" : isOverridden ? "Edit AI Overrides" : "Override AI Results"}
                  </button>
                )}
                <span className="rounded-full bg-teal-100 px-3 py-1 text-xs font-bold text-teal-900">
                  AI Assessed
                </span>
              </div>
            </div>

            {/* Doctor Override Form Panel (Collapsible / Editable) */}
            {overrideOpen && canManage && (
              <div className="mt-5 rounded-2xl border border-purple-200 bg-purple-50/60 p-5">
                <div className="flex items-center justify-between pb-3 border-b border-purple-200/80">
                  <div className="flex items-center gap-2 text-xs font-extrabold uppercase text-purple-900 tracking-wide">
                    <Sliders size={14} className="text-purple-700" />
                    <span>Doctor AI Assessment Override Controls</span>
                  </div>
                  {isOverridden && (
                    <button
                      type="button"
                      onClick={handleResetAiOverride}
                      disabled={savingOverride}
                      className="text-xs font-bold text-rose-600 hover:text-rose-800 flex items-center gap-1"
                    >
                      <RotateCcw size={12} /> Reset to Original AI
                    </button>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                      Hair Loss Stage Override
                    </label>
                    <select
                      value={overrideStage}
                      onChange={(e) => setOverrideStage(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-medium text-slate-800 focus:border-purple-500 focus:outline-hidden"
                    >
                      <option value="Stage 1 - Normal / Minimal Hair Loss">Stage 1 - Normal / Minimal Hair Loss</option>
                      <option value="Stage 2 - Early Temporal Receding">Stage 2 - Early Temporal Receding</option>
                      <option value="Stage 2A - Frontal Hairline Thinning">Stage 2A - Frontal Hairline Thinning</option>
                      <option value="Stage 3 - Deep Frontal Recession">Stage 3 - Deep Frontal Recession</option>
                      <option value="Stage 3 Vertex - Crown Thinning">Stage 3 Vertex - Crown Thinning</option>
                      <option value="Stage 4 - Frontal & Vertex Confluent">Stage 4 - Frontal & Vertex Confluent</option>
                      <option value="Stage 5 - Advanced Thinning">Stage 5 - Advanced Thinning</option>
                      <option value="Stage 6 - Severe Extensive Loss">Stage 6 - Severe Extensive Loss</option>
                      <option value="Diffuse Patterned Alopecia (DPA)">Diffuse Patterned Alopecia (DPA)</option>
                      <option value="Telogen Effluvium">Telogen Effluvium</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                      Scalp Health Score Override (0 - 100)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={overrideScalpScore}
                      onChange={(e) => setOverrideScalpScore(e.target.value)}
                      placeholder="e.g. 75"
                      className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-medium text-slate-800 focus:border-purple-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                      Primary Concern Override
                    </label>
                    <input
                      type="text"
                      value={overridePrimaryConcern}
                      onChange={(e) => setOverridePrimaryConcern(e.target.value)}
                      placeholder="e.g. Crown vertex thinning & high daily shedding"
                      className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-medium text-slate-800 focus:border-purple-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                      Prognosis & Expected Recovery
                    </label>
                    <select
                      value={overridePrognosis}
                      onChange={(e) => setOverridePrognosis(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-medium text-slate-800 focus:border-purple-500 focus:outline-hidden"
                    >
                      <option value="High Reversibility with consistent care (90%+ recovery)">High Reversibility with consistent care (90%+ recovery)</option>
                      <option value="Good Prognosis (Visible stabilization & regrowth in 90-120 days)">Good Prognosis (Visible stabilization & regrowth in 90-120 days)</option>
                      <option value="Moderate Prognosis (Requires sustained clinical stimulation)">Moderate Prognosis (Requires sustained clinical stimulation)</option>
                      <option value="Guarded Prognosis (Advanced miniaturization observed)">Guarded Prognosis (Advanced miniaturization observed)</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                      Doctor Clinical Rationale & Notes for Override
                    </label>
                    <textarea
                      value={overrideNotes}
                      onChange={(e) => setOverrideNotes(e.target.value)}
                      rows={2}
                      placeholder="Explain reason for overriding automated AI metrics (e.g. Dermatoscope exam showed perifollicular erythema not captured by standard lighting)..."
                      className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-800 focus:border-purple-500 focus:outline-hidden"
                    />
                  </div>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setOverrideOpen(false)}
                    className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveAiOverride}
                    disabled={savingOverride}
                    className="flex items-center gap-1.5 rounded-xl bg-purple-700 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-purple-800 transition disabled:opacity-60"
                  >
                    {savingOverride ? <LoaderCircle size={14} className="animate-spin" /> : <Save size={14} />}
                    {savingOverride ? "Saving Override…" : "Apply & Save AI Override"}
                  </button>
                </div>
              </div>
            )}

            {/* Display Active Override Banner if present */}
            {isOverridden && !overrideOpen && (
              <div className="mt-4 flex items-center justify-between rounded-2xl border border-purple-200 bg-purple-50 p-3.5">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={18} className="text-purple-700 shrink-0" />
                  <div className="text-xs">
                    <p className="font-bold text-purple-950">Doctor Clinical Override is active on this assessment</p>
                    {aiOverride?.notes && <p className="text-purple-800 mt-0.5 italic">&quot;{aiOverride.notes}&quot;</p>}
                  </div>
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setOverrideOpen(true)}
                    className="text-xs font-bold text-purple-700 hover:underline shrink-0"
                  >
                    Modify Override
                  </button>
                )}
              </div>
            )}

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

          {/* 5. Scalp Photos Gallery with Lightbox Zoom */}
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

          {/* 6. Categorized Patient Assessment Responses */}
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
          {/* Patient Profile Snapshot Card with Edit Ability */}
          <section className="card rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs">
            <div className="flex items-center gap-3.5 border-b border-slate-100 pb-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#1A365D] text-white font-extrabold text-base shadow-xs">
                {pName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Patient Profile</p>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => setPatientModalOpen(true)}
                      className="text-xs font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1"
                    >
                      <Edit3 size={13} /> Edit
                    </button>
                  )}
                </div>
                <h3 className="truncate text-base font-extrabold text-[#1A365D]">{pName}</h3>
                <p className="font-mono text-xs font-semibold text-slate-500">ID: {patientId}</p>
              </div>
            </div>

            <div className="mt-4 space-y-2.5 text-xs text-slate-700">
              <div className="flex items-center justify-between py-1 border-b border-slate-50">
                <span className="text-slate-400 font-medium">Gender</span>
                <span className="font-semibold text-slate-800 capitalize">{patient?.gender || "Not specified"}</span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-50">
                <span className="text-slate-400 font-medium">Age</span>
                <span className="font-semibold text-slate-800">{patient?.age ? `${patient.age} years` : "Not specified"}</span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-50">
                <span className="text-slate-400 font-medium flex items-center gap-1">
                  <MapPin size={12} /> City
                </span>
                <span className="font-semibold text-slate-800">{patient?.city || "Not specified"}</span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-50">
                <span className="text-slate-400 font-medium flex items-center gap-1">
                  <Phone size={12} /> Phone
                </span>
                <span className="font-mono font-semibold text-slate-800">{patient?.phone || "Not specified"}</span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-50">
                <span className="text-slate-400 font-medium flex items-center gap-1">
                  <Mail size={12} /> Email
                </span>
                <span className="truncate max-w-[170px] font-semibold text-slate-800" title={patient?.email}>
                  {patient?.email || "Not specified"}
                </span>
              </div>

              {/* Medical Conditions Pills */}
              <div className="py-1">
                <span className="text-slate-400 font-medium block mb-1.5">Medical Conditions:</span>
                {patient?.medical_conditions && patient.medical_conditions.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {patient.medical_conditions.map((cond, idx) => (
                      <span
                        key={idx}
                        className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800"
                      >
                        {cond}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-slate-400 italic text-[11px]">No conditions recorded</span>
                )}
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 flex flex-col gap-2">
              {canManage && (
                <button
                  type="button"
                  onClick={() => setPatientModalOpen(true)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50/70 px-4 py-2.5 text-xs font-bold text-teal-800 transition hover:bg-teal-100"
                >
                  <Edit2 size={13} />
                  Update Profile & Medical Details
                </button>
              )}

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

      {/* Complete Patient Details Edit Modal */}
      {patientModalOpen && (
        <Modal
          title="Update Patient Profile & Clinical Details"
          description={`Update demographic, contact, and medical conditions for patient ${patientId}.`}
          submitLabel={savingPatient ? "Saving…" : "Save Patient Profile"}
          submitDisabled={savingPatient || !patientForm.name.trim() || !patientForm.phone.trim()}
          onClose={() => !savingPatient && setPatientModalOpen(false)}
          onSubmit={() => void handleSavePatientDetails()}
        >
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={patientForm.name}
                  onChange={(e) => setPatientForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs font-medium text-slate-800 focus:border-teal-500 focus:outline-hidden"
                  placeholder="Patient full name"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Phone Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  value={patientForm.phone}
                  onChange={(e) => setPatientForm((prev) => ({ ...prev, phone: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs font-medium text-slate-800 focus:border-teal-500 focus:outline-hidden"
                  placeholder="10-digit mobile number"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={patientForm.email}
                  onChange={(e) => setPatientForm((prev) => ({ ...prev, email: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs font-medium text-slate-800 focus:border-teal-500 focus:outline-hidden"
                  placeholder="patient@example.com"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Gender</label>
                <select
                  value={patientForm.gender}
                  onChange={(e) => setPatientForm((prev) => ({ ...prev, gender: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-medium text-slate-800 focus:border-teal-500 focus:outline-hidden"
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Age (Years)</label>
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={patientForm.age}
                  onChange={(e) => setPatientForm((prev) => ({ ...prev, age: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs font-medium text-slate-800 focus:border-teal-500 focus:outline-hidden"
                  placeholder="e.g. 29"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">City</label>
                <input
                  type="text"
                  value={patientForm.city}
                  onChange={(e) => setPatientForm((prev) => ({ ...prev, city: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs font-medium text-slate-800 focus:border-teal-500 focus:outline-hidden"
                  placeholder="City of residence"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Occupation</label>
                <input
                  type="text"
                  value={patientForm.occupation}
                  onChange={(e) => setPatientForm((prev) => ({ ...prev, occupation: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs font-medium text-slate-800 focus:border-teal-500 focus:outline-hidden"
                  placeholder="e.g. Software Engineer"
                />
              </div>
            </div>

            {/* Medical Conditions Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Medical Conditions & Health Factors
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {COMMON_CONDITIONS.map((cond) => {
                  const active = patientForm.medical_conditions.includes(cond);
                  return (
                    <button
                      key={cond}
                      type="button"
                      onClick={() => toggleCondition(cond)}
                      className={`rounded-xl px-2.5 py-1 text-xs font-semibold transition ${
                        active
                          ? "bg-amber-600 text-white shadow-2xs"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      {active ? `✓ ${cond}` : `+ ${cond}`}
                    </button>
                  );
                })}
              </div>

              {/* Custom condition input */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={customConditionInput}
                  onChange={(e) => setCustomConditionInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomCondition();
                    }
                  }}
                  placeholder="Add custom health condition..."
                  className="flex-1 rounded-xl border border-slate-200 p-2 text-xs text-slate-800 focus:border-teal-500 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={addCustomCondition}
                  disabled={!customConditionInput.trim()}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  Add
                </button>
              </div>

              {patientForm.medical_conditions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
                  <span className="text-[11px] font-bold text-slate-400 self-center">Selected:</span>
                  {patientForm.medical_conditions.map((cond) => (
                    <span
                      key={cond}
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-900"
                    >
                      {cond}
                      <button
                        type="button"
                        onClick={() => toggleCondition(cond)}
                        className="text-amber-700 hover:text-amber-900 font-extrabold ml-0.5"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

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
