"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ClipboardCheck, EyeOff, FileCheck2, FileUp, Loader2, RefreshCw, Search, Share2 } from "lucide-react";
import { Modal, PageHeader, StatusPill, TableToolbar } from "../../shared/components/ui";
import type { AdminPermissionId, PatientRecord } from "../../shared/types";
import type { HairTestRecord, HairTestStatus } from "../types";

const permissionLabels: Record<HairTestStatus, string> = {
  Draft: "Draft",
  "In review": "In review",
  Approved: "Approved",
  Shared: "Shared with patient",
  Private: "Private",
};

export function HairTestsPage({
  patients,
  permissions,
  actor,
  onToast,
  onAudit,
}: {
  patients: PatientRecord[];
  permissions: AdminPermissionId[];
  actor: string;
  onToast: (message: string) => void;
  onAudit: (action: string, target: string) => void;
}) {
  const router = useRouter();
  const [records, setRecords] = useState<HairTestRecord[]>([]);
  const [patientsList, setPatientsList] = useState<PatientRecord[]>(patients);
  const [query, setQuery] = useState("");
  const [patientId, setPatientId] = useState(patients[0]?.id ?? "");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/users?page=1&limit=100", { cache: "no-store", signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((result) => {
        const items = result?.data?.items;
        if (Array.isArray(items) && items.length > 0) {
          const live: PatientRecord[] = items.map((u: Record<string, unknown>) => {
            const name = String(u.name || "Unnamed patient");
            return {
              id: String(u.id ?? ""),
              patientCode: typeof u.patient_code === "string" ? u.patient_code : undefined,
              name,
              initials: name.split(/\s+/).map((part) => part[0] || "").join("").slice(0, 2).toUpperCase(),
              email: String(u.email || ""),
              phone: String(u.phone || ""),
              assessment: "",
              submitted: "",
              status: "Active",
            };
          });
          setPatientsList(live);
          setPatientId((curr) => (curr && live.some((p) => p.id === curr) ? curr : live[0]?.id || ""));
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const [testName, setTestName] = useState("Scalp analysis");
  const [testDate, setTestDate] = useState(new Date().toISOString().slice(0, 10));
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [shareOnUpload, setShareOnUpload] = useState(false);
  const [uploadConsentConfirmed, setUploadConsentConfirmed] = useState(false);

  const [reportToConfirmVisibility, setReportToConfirmVisibility] = useState<{
    record: HairTestRecord;
    targetVisibility: "Shared" | "Private";
  } | null>(null);
  const [patientConsentConfirmed, setPatientConsentConfirmed] = useState(false);
  const [updatingReportVisibility, setUpdatingReportVisibility] = useState(false);

  const canUpload = permissions.includes("hair-tests.upload");
  const canSubmit = permissions.includes("hair-tests.submit");
  const canApprove = permissions.includes("reports.approve");
  const canShare = permissions.includes("reports.share") || permissions.includes("documents.share");
  const canView = permissions.includes("hair-tests.view") || canUpload || canApprove || canShare;

  const loadRecords = useCallback(async (signal?: AbortSignal) => {
    try {
      const [testsRes, reportsRes] = await Promise.all([
        fetch("/api/admin/hair-tests?limit=50", { cache: "no-store", signal })
          .then((res) => (res.ok ? res.json() : null))
          .catch(() => null),
        fetch("/api/admin/reports", { cache: "no-store", signal })
          .then((res) => (res.ok ? res.json() : null))
          .catch(() => null),
      ]);

      const combined: HairTestRecord[] = [];

      const rawTests = testsRes?.data?.items || testsRes?.items;
      if (Array.isArray(rawTests) && rawTests.length > 0) {
        rawTests.forEach((t: Record<string, unknown>) => {
          if (String(t.status || "").toLowerCase() === "archived") return;
          const patient = patientsList.find((p) => String(p.id) === String(t.userId));
          const stage = String(t.hair_loss_stage || t.stage || t.main_concern || "Scalp screening");
          const photos = Array.isArray(t.scalp_photos)
            ? t.scalp_photos.filter((photo): photo is Record<string, unknown> => Boolean(photo) && typeof photo === "object")
            : [];
          const photoCount = photos.length;
          const photoBytes = photos.reduce((total, photo) => {
            const bytes = Number(photo.bytes);
            return total + (Number.isFinite(bytes) && bytes > 0 ? bytes : 0);
          }, 0);
          const photoTypes = [...new Set(photos.map((photo) => {
            const mimeType = typeof photo.mime_type === "string" ? photo.mime_type : "";
            const format = typeof photo.format === "string" ? photo.format : "";
            return mimeType || (format ? `image/${format.toLowerCase()}` : "");
          }).filter(Boolean))];
          const status = String(t.status || "submitted").toLowerCase();
          combined.push({
            id: String(t.reference_no || t.id),
            patientId: String(t.userId),
            patientName: patient?.name || String(t.name || `Patient #${t.userId}`),
            testName: `Hair assessment · ${stage}`,
            testDate: t.created_at ? new Date(String(t.created_at)).toISOString().slice(0, 10) : "—",
            fileName: photoCount > 0 ? `${photoCount} scalp photos attached` : "Clinical questionnaire",
            fileType: photoCount > 0 ? (photoTypes.length === 1 ? photoTypes[0] : photoTypes.length > 1 ? "Multiple image formats" : "") : "",
            fileSize: photoBytes || undefined,
            status: status === "reviewed" ? "Approved" : status === "under_review" || status === "submitted" ? "In review" : "Draft",
            aiAssessmentStatus: String(t.ai_assessment_status || (t.ai_assessment ? "ready" : "not_available")) as NonNullable<HairTestRecord["aiAssessmentStatus"]>,
            createdAt: t.created_at ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(String(t.created_at))) : "Recently",
            uploadedBy: "Patient via app",
            recordKind: "assessment",
          });
        });
      }

      const reportItems = reportsRes?.data?.reports;
      if (Array.isArray(reportItems) && reportItems.length > 0) {
        reportItems.forEach((r: Record<string, unknown>) => {
          const patient = patientsList.find((p) => String(p.id) === String(r.userId));
          combined.push({
            id: String(r.id),
            patientId: String(r.userId),
            patientName: patient?.name || `Patient #${r.userId}`,
            testName: String(r.title || "Clinical Report"),
            testDate: r.created_at ? new Date(String(r.created_at)).toISOString().slice(0, 10) : "—",
            fileName: String(r.file_name || "report.pdf"),
            fileType: String(r.mime_type || ""),
            fileSize: Number(r.bytes) > 0 ? Number(r.bytes) : undefined,
            status: r.visibility === "Shared" ? "Shared" : "Private",
            createdAt: r.created_at ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(String(r.created_at))) : "Recently",
            uploadedBy: String(r.uploaded_by || actor),
            recordKind: "report",
          });
        });
      }

      setRecords(combined);
    } catch {
      // Keep previous records on fetch error
    }
  }, [patientsList, actor]);

  useEffect(() => {
    const controller = new AbortController();
    const deferredLoad = window.setTimeout(() => { void loadRecords(controller.signal); }, 0);
    return () => { window.clearTimeout(deferredLoad); controller.abort(); };
  }, [loadRecords]);

  const filtered = useMemo(() => records.filter((record) =>
    `${record.id} ${record.patientId} ${record.patientName} ${record.testName} ${record.fileName} ${record.status} ${record.aiAssessmentStatus || ""}`.toLowerCase().includes(query.toLowerCase())
  ), [records, query]);
  const pendingAiCount = records.filter((record) => record.recordKind === "assessment" && ["queued", "processing"].includes(record.aiAssessmentStatus || "")).length;
  const failedAiCount = records.filter((record) => record.recordKind === "assessment" && record.aiAssessmentStatus === "failed").length;

  const addFile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canUpload || uploading) return;
    const patient = patientsList.find((item) => item.id === patientId);
    if (!patient || !testName.trim() || !file || (shareOnUpload && !uploadConsentConfirmed)) {
      onToast("Choose a patient, test name, date, and result file.");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", testName.trim());
      if (shareOnUpload) {
        formData.append("visibility", "Shared");
        formData.append("patient_consent_confirmed", "true");
      }

      const res = await fetch(`/api/admin/users/${encodeURIComponent(patient.id)}/reports`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const body = await res.json();
        const r = body.data || {};
        const newRecord: HairTestRecord = {
          id: String(r.id || `rpt_${Date.now().toString().slice(-6)}`),
          patientId: patient.id,
          patientName: patient.name,
          testName: String(r.title || testName.trim()),
          testDate,
          fileName: String(r.file_name || file.name),
          fileType: String(r.mime_type || file.type || "application/pdf"),
          fileSize: Number(r.bytes) || file.size,
          status: r.visibility === "Shared" ? "Shared" : "Private",
          createdAt: new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date()),
          uploadedBy: actor,
          recordKind: "report",
        };
        setRecords((current) => [newRecord, ...current]);
        setFile(null);
        setShareOnUpload(false);
        setUploadConsentConfirmed(false);
        event.currentTarget.reset();
        onAudit("uploaded patient report", `${patient.id} · ${newRecord.testName}`);
        const storedBytes = Number(r.stored_bytes);
        const saved = r.compressed === true && storedBytes > 0 && storedBytes < file.size
          ? ` Lossless storage saved ${Math.round((1 - storedBytes / file.size) * 100)}%.`
          : "";
        const delivery = r.notification_delivery || {};
        const notificationMessage = delivery.inboxCreated
          ? delivery.pushStatus === "sent"
            ? `In-app notification saved and push sent to ${delivery.pushSent} device${delivery.pushSent === 1 ? "" : "s"}.`
            : delivery.pushStatus === "failed"
              ? `In-app notification saved, but push delivery failed for ${delivery.pushFailed} device${delivery.pushFailed === 1 ? "" : "s"}.`
              : delivery.pushStatus === "no_devices"
                ? "In-app notification saved; no push-enabled device is registered."
                : "In-app notification saved; push delivery status is unavailable."
          : "Report shared, but its in-app notification could not be saved.";
        onToast(shareOnUpload
          ? `Clinical report uploaded and shared. ${notificationMessage}${saved}`
          : `Clinical report uploaded privately.${saved} Share with patient when ready.`);
      } else {
        const err = await res.json().catch(() => ({}));
        onToast(err.message || "Failed to upload report.");
      }
    } catch {
      onToast("Could not upload report. Check network connection.");
    } finally {
      setUploading(false);
    }
  };

  const updateAssessmentStatus = async (record: HairTestRecord, nextStatus: HairTestStatus) => {
    const allowed = nextStatus === "In review" ? canSubmit : nextStatus === "Approved" ? canApprove : false;
    if (!allowed) return;

    const backendStatus = nextStatus === "In review" ? "under_review" : "reviewed";
    try {
      const res = await fetch(`/api/admin/hair-tests/${encodeURIComponent(record.id)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: backendStatus }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        onToast(err.message || "Failed to update assessment status.");
        return;
      }
      setRecords((current) => current.map((item) => (item.id === record.id ? { ...item, status: nextStatus } : item)));
      onAudit(
        nextStatus === "In review" ? "submitted for doctor review" : "approved hair test",
        `${record.id} · ${record.patientName}`
      );
      onToast(`${record.id} marked ${permissionLabels[nextStatus].toLowerCase()}.`);
    } catch {
      onToast("Could not update assessment status. Check network connection.");
    }
  };

  const confirmReportVisibility = async () => {
    if (!reportToConfirmVisibility) return;
    const { record, targetVisibility } = reportToConfirmVisibility;
    setUpdatingReportVisibility(true);
    try {
      const res = await fetch(
        `/api/admin/users/${encodeURIComponent(record.patientId)}/reports/${encodeURIComponent(record.id)}/visibility`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            visibility: targetVisibility,
            ...(targetVisibility === "Shared" ? { patient_consent_confirmed: patientConsentConfirmed } : {}),
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to update report visibility.");
      }
      const json = await res.json().catch(() => ({}));
      const updatedVis = (json?.data?.visibility as HairTestStatus) || targetVisibility;
      setRecords((curr) =>
        curr.map((item) => (item.id === record.id ? { ...item, status: updatedVis } : item))
      );
      onAudit(
        targetVisibility === "Shared" ? "shared patient report" : "hid patient report",
        `${record.patientId} · ${record.testName}`
      );
      onToast(
        targetVisibility === "Shared"
          ? `${record.testName} is now visible to the patient.`
          : `${record.testName} is now hidden from the patient.`
      );
      setReportToConfirmVisibility(null);
      setPatientConsentConfirmed(false);
    } catch (cause) {
      onToast(cause instanceof Error ? cause.message : "Failed to update report visibility.");
    } finally {
      setUpdatingReportVisibility(false);
    }
  };

  if (!canView) return <div className="page-wrap w-full min-w-0"><section className="card empty-state">You don’t have permission to view hair test records.</section></div>;

  return (
    <div className="page-wrap w-full min-w-0">
      <PageHeader eyebrow="Clinical workspace" title="Hair tests & reports" description="Keep patient test files in one review queue, then approve and share results when they are ready." />
      <div className="notice" style={{ marginBottom: 15 }}>
        <FileCheck2 size={14} />
        <span>Upload clinical reports. Files remain private until explicitly shared with patient consent; malware scanning is not configured.</span>
      </div>
      {canUpload && (
        <form className="card hair-test-upload w-full" onSubmit={addFile}>
          <div className="section-row">
            <div>
              <h2 className="card-title">Add a patient test result</h2>
          <p className="card-note">PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, TXT, and supported images · up to 25 MiB</p>
            </div>
            <FileUp size={18} color="#167f79" />
          </div>
          <div className="hair-test-form-grid grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="field">
              <span>Patient</span>
              <select value={patientId} onChange={(event) => setPatientId(event.target.value)} required>
                {patientsList.map((patient) => (
                  <option key={patient.id} value={patient.id}>{patient.name} · {patient.patientCode || patient.id}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Test name</span>
              <input value={testName} onChange={(event) => setTestName(event.target.value)} required placeholder="e.g. Hair density test" />
            </label>
            <label className="field">
              <span>Test date</span>
              <input type="date" value={testDate} onChange={(event) => setTestDate(event.target.value)} required />
            </label>
            <label className="field">
              <span>Result file</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                onChange={(event) => {
                  const next = event.target.files?.[0] ?? null;
                  if (next && next.size > 25 * 1024 * 1024) {
                    onToast("Choose a file smaller than 25 MiB.");
                    event.target.value = "";
                    return;
                  }
                  setFile(next);
                }}
                required
              />
              <small>{file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MiB` : "File is private by default. Eligible small reports are losslessly compressed only when the stored result is smaller."}</small>
            </label>
          </div>
          {canShare && <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 bg-[#FAFBFD] p-3 text-xs leading-5 text-slate-700"><input type="checkbox" checked={shareOnUpload} onChange={(event) => { setShareOnUpload(event.target.checked); setUploadConsentConfirmed(false); }} className="mt-1 accent-teal-700" disabled={uploading} /><span>Share with the selected patient and send an app notification after upload.</span></label>}
          {canShare && shareOnUpload && <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-xl border border-teal-100 bg-teal-50/60 p-3 text-xs leading-5 text-teal-950"><input type="checkbox" checked={uploadConsentConfirmed} onChange={(event) => setUploadConsentConfirmed(event.target.checked)} className="mt-1 accent-teal-700" disabled={uploading} /><span>I confirmed this patient agrees to receive the report in their signed-in app.</span></label>}
          <div className="hair-test-form-actions">
            <button className="button button-primary" type="submit" disabled={uploading || (shareOnUpload && (!canShare || !uploadConsentConfirmed))}>
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
              {uploading ? "Uploading..." : shareOnUpload ? "Upload & notify patient" : "Add test record"}
            </button>
          </div>
        </form>
      )}

      <section className="card hair-test-queue">
        <div className="section-row">
          <div>
            <h2 className="card-title">Test review queue</h2>
            <p className="card-note">
              {records.filter((item) => item.status === "In review").length} waiting for doctor review · {records.filter((item) => item.status === "Approved").length} approved to share · {records.filter((item) => item.status === "Shared").length} shared with patients · {pendingAiCount} AI pending · {failedAiCount} AI failed
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hair-test-count">{records.length} records</span>
            <button type="button" className="button button-secondary button-small" onClick={() => void loadRecords()} aria-label="Refresh assessment and AI queue status">
              <RefreshCw size={13} />Refresh status
            </button>
          </div>
        </div>
        <TableToolbar value={query} onChange={setQuery} placeholder="Search by patient, test, ID, or file name..." right={<Search size={14} color="#98a3af" />} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Patient</th>
                <th>Test</th>
                <th>File</th>
                <th>Test date</th>
                <th>Status</th>
                <th>Workflow</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((record) => {
                const isReport = record.recordKind === "report";
                return (
                  <tr key={record.id}>
                    <td>
                      <strong>{record.patientName}</strong>
                      <div className="person-sub">{record.patientId} · {record.id}</div>
                    </td>
                    <td>{record.testName}</td>
                    <td>
                      <div className="hair-test-file">
                        {record.fileName}
                        <small>{record.fileSize ? `${(record.fileSize / 1024).toFixed(0)} KB` : "File size unavailable"} · added by {record.uploadedBy}</small>
                      </div>
                    </td>
                    <td>{record.testDate}</td>
                    <td>
                      <StatusPill status={record.status} />
                      {record.recordKind === "assessment" && record.aiAssessmentStatus && (
                        <div className="mt-1"><StatusPill status={`AI ${record.aiAssessmentStatus}`} /></div>
                      )}
                    </td>
                    <td>
                      <div className="hair-test-actions">
                        {record.recordKind === "assessment" && (
                          <button
                            type="button"
                            className="button button-secondary button-small"
                            onClick={() => router.push(`/patients/${encodeURIComponent(record.patientId)}/assessments/${encodeURIComponent(record.id)}`)}
                          >
                            View assessment
                          </button>
                        )}
                        {!isReport && record.status === "Draft" && canSubmit && (
                          <button
                            type="button"
                            className="button button-secondary button-small"
                            onClick={() => void updateAssessmentStatus(record, "In review")}
                          >
                            <ClipboardCheck size={13} />Submit
                          </button>
                        )}
                        {!isReport && record.status === "In review" && canApprove && (
                          <button
                            type="button"
                            className="button button-secondary button-small"
                            onClick={() => void updateAssessmentStatus(record, "Approved")}
                          >
                            <Check size={13} />Approve
                          </button>
                        )}
                        {isReport && record.status === "Private" && canShare && (
                          <button
                            type="button"
                            className="button button-primary button-small"
                            onClick={() => {
                              setPatientConsentConfirmed(false);
                              setReportToConfirmVisibility({ record, targetVisibility: "Shared" });
                            }}
                          >
                            <Share2 size={13} />Share with patient
                          </button>
                        )}
                        {isReport && record.status === "Shared" && canShare && (
                          <button
                            type="button"
                            className="button button-secondary button-small"
                            onClick={() => {
                              setReportToConfirmVisibility({ record, targetVisibility: "Private" });
                            }}
                          >
                            <EyeOff size={13} />Hide from patient
                          </button>
                        )}
                        {isReport && record.status === "Private" && !canShare && (
                          <span className="person-sub">Private · Super Admin can share</span>
                        )}
                        {isReport && record.status === "Shared" && !canShare && (
                          <span className="person-sub">Visible in patient app</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      {records.length === 0
                        ? "No hair assessment submissions or clinical reports yet."
                        : "No hair test records match this search."}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span>Showing {filtered.length} of {records.length} test records</span>
          <span>Stored in secure Cloudflare R2 clinical storage</span>
        </div>
      </section>

      {reportToConfirmVisibility && (
        <Modal
          title={reportToConfirmVisibility.targetVisibility === "Shared" ? "Share report with patient?" : "Hide report from patient?"}
          description={
            reportToConfirmVisibility.targetVisibility === "Shared"
              ? "Only this patient’s signed-in app account can view the report. The DHP patient ID alone does not grant access."
              : "The patient will no longer see this report in their signed-in clinical record."
          }
          submitLabel={
            updatingReportVisibility
              ? "Updating…"
              : reportToConfirmVisibility.targetVisibility === "Shared"
              ? "Share report"
              : "Hide report"
          }
          submitDisabled={
            updatingReportVisibility ||
            (reportToConfirmVisibility.targetVisibility === "Shared" && !patientConsentConfirmed)
          }
          onClose={() => {
            if (!updatingReportVisibility) {
              setReportToConfirmVisibility(null);
              setPatientConsentConfirmed(false);
            }
          }}
          onSubmit={() => {
            void confirmReportVisibility();
          }}
        >
          <div className="rounded-xl border border-slate-200 bg-[#FAFBFD] p-3">
            <p className="text-sm font-semibold text-[#1A365D]">
              {reportToConfirmVisibility.record.testName}
            </p>
            <p className="mt-1 break-all text-xs text-slate-500">
              {reportToConfirmVisibility.record.fileName} · Patient {reportToConfirmVisibility.record.patientName} ({reportToConfirmVisibility.record.patientId})
            </p>
          </div>
          {reportToConfirmVisibility.targetVisibility === "Shared" && (
            <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-teal-100 bg-teal-50/60 p-3 text-xs leading-5 text-teal-950">
              <input
                type="checkbox"
                checked={patientConsentConfirmed}
                onChange={(e) => setPatientConsentConfirmed(e.target.checked)}
                className="mt-1 accent-teal-700"
              />
              <span>I confirmed with the patient that this report may be shared to their signed-in app account.</span>
            </label>
          )}
          <p className="mt-3 text-xs leading-5 text-slate-500">
            This grants access only inside the patient’s authenticated app.
          </p>
        </Modal>
      )}
    </div>
  );
}
