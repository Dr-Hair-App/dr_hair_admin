"use client";

import {
  ShieldAlert,
  Trash2,
  Lock,
  Unlock,
  ExternalLink,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar, PageHeader, TableToolbar, Modal } from "../../shared/components/ui";
import { SlidingTabList } from "../../shared/components/sliding-tab-list";
import type { Role } from "../../shared/types";

export interface LoginUserRecord {
  id: number;
  patient_code?: string;
  name: string;
  email?: string;
  phone?: string;
  status?: string;
  is_blocked?: boolean;
  blocked_at?: string | null;
  blocked_reason?: string | null;
  last_login_at?: string | null;
  created_at?: string | null;
  has_completed_assessment?: boolean;
}

type PatientSegment = "accounts_assessments" | "product_customers" | "appointment_treatment";
type SegmentSummary = Record<PatientSegment, { total: number; assessed?: number; not_assessed?: number; active_within_days?: number }>;
const patientSegments: { id: PatientSegment; label: string; detail: string }[] = [
  { id: "accounts_assessments", label: "Accounts & assessments", detail: "Registered patients and assessment progress" },
  { id: "product_customers", label: "Active product customers", detail: "Paid order + recent app login; product use itself is not tracked" },
  { id: "appointment_treatment", label: "Appointments & treatment", detail: "Booked appointment plus treatment record" },
];

export function PatientAccountManagement({
  globalSearch,
  onToast,
  role = "super-admin",
  onOpenPatient,
  onAudit,
}: {
  globalSearch: string;
  onToast: (message: string) => void;
  role?: Role;
  onOpenPatient?: (patientId: string) => void;
  onAudit?: (action: string, target: string) => void;
}) {
  const router = useRouter();
  const isSuperAdmin = role === "super-admin";
  // User management state
  const [users, setUsers] = useState<LoginUserRecord[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userPage, setUserPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState(25);
  const [usersTotal, setUsersTotal] = useState(0);
  const [selectedSegment, setSelectedSegment] = useState<PatientSegment>("accounts_assessments");
  const [segmentSummary, setSegmentSummary] = useState<SegmentSummary | null>(null);
  const userRequest = useRef<AbortController | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState<"All" | "Active" | "Blocked">("All");

  // Modals state
  const [blockModalUser, setBlockModalUser] = useState<LoginUserRecord | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [isSubmittingBlock, setIsSubmittingBlock] = useState(false);

  const [deleteModalUser, setDeleteModalUser] = useState<LoginUserRecord | null>(null);
  const [isSubmittingDelete, setIsSubmittingDelete] = useState(false);

  // Load user login activity list
  const loadUsers = useCallback(async () => {
    userRequest.current?.abort();
    const controller = new AbortController();
    userRequest.current = controller;
    setLoadingUsers(true);
    try {
      const search = userSearch.trim() || globalSearch.trim();
      const params = new URLSearchParams({ page: String(userPage), limit: String(userPageSize), segment: selectedSegment });
      if (search) params.set("search", search);
      const response = await fetch(`/api/admin/users?${params.toString()}`, { cache: "no-store", signal: controller.signal });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.message || "Failed to load patient accounts list.");
      }
      const rawList = Array.isArray(result?.data?.items)
        ? result.data.items
        : Array.isArray(result?.data)
        ? result.data
        : [];
      setUsers(rawList as LoginUserRecord[]);
      setUsersTotal(Math.max(0, Number(result?.data?.total) || rawList.length));
    } catch (err) {
      if (!controller.signal.aborted) onToast(err instanceof Error ? err.message : "Could not load user accounts list.");
    } finally {
      if (!controller.signal.aborted) setLoadingUsers(false);
    }
  }, [globalSearch, onToast, selectedSegment, userPage, userPageSize, userSearch]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadUsers();
    return () => userRequest.current?.abort();
  }, [loadUsers]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/users/segments", { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => {
        if (!controller.signal.aborted && result?.data) setSegmentSummary(result.data as SegmentSummary);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  // Filtered users
  const filteredUsers = useMemo(() => {
    const q = (userSearch.trim() || globalSearch.trim()).toLowerCase();
    return users.filter((u) => {
      const isBlocked = Boolean(u.is_blocked || u.status === "blocked");
      if (userStatusFilter === "Active" && isBlocked) return false;
      if (userStatusFilter === "Blocked" && !isBlocked) return false;
      if (!q) return true;
      const haystack = `${u.name} ${u.email || ""} ${u.phone || ""} ${u.patient_code || ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [users, userSearch, globalSearch, userStatusFilter]);
  const activeSegment = patientSegments.find((segment) => segment.id === selectedSegment);
  const activeSegmentSummary = segmentSummary?.[selectedSegment];

  // Block / Unblock user handler
  const handleConfirmBlock = async () => {
    if (!blockModalUser) return;
    setIsSubmittingBlock(true);
    const targetUserId = blockModalUser.id;
    const willBlock = !Boolean(blockModalUser.is_blocked || blockModalUser.status === "blocked");
    try {
      const response = await fetch(`/api/admin/users/${targetUserId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_blocked: willBlock,
          status: willBlock ? "blocked" : "active",
          reason: blockReason || (willBlock ? "Administrative suspension" : null),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "Failed to update status");

      setUsers((prev) =>
        prev.map((u) =>
          u.id === targetUserId
            ? {
                ...u,
                is_blocked: willBlock,
                status: willBlock ? "blocked" : "active",
                blocked_at: willBlock ? new Date().toISOString() : null,
                blocked_reason: willBlock ? blockReason || "Administrative suspension" : null,
              }
            : u
        )
      );

      const msg = willBlock
        ? `User ${blockModalUser.name} has been blocked. Mobile app session revoked.`
        : `User ${blockModalUser.name} has been unblocked. Mobile access restored.`;
      onToast(msg);

      if (onAudit) {
        onAudit(willBlock ? "blocked account" : "unblocked account", blockModalUser.patient_code || `patient_${targetUserId}`);
      }
      setBlockModalUser(null);
      setBlockReason("");
    } catch (err: unknown) {
      onToast(err instanceof Error ? err.message : "Failed to change user status.");
    } finally {
      setIsSubmittingBlock(false);
    }
  };

  // Delete user handler
  const handleConfirmDelete = async () => {
    if (!deleteModalUser) return;
    setIsSubmittingDelete(true);
    const targetUserId = deleteModalUser.id;
    try {
      const response = await fetch(`/api/admin/users/${targetUserId}`, {
        method: "DELETE",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "Failed to delete user account");

      setUsers((prev) => prev.filter((u) => u.id !== targetUserId));
      setUsersTotal((count) => Math.max(0, count - 1));
      if (users.length === 1 && userPage > 1) setUserPage((page) => Math.max(1, page - 1));
      onToast(`User ${deleteModalUser.name} account permanently deleted.`);

      if (onAudit) {
        onAudit("permanently deleted user", deleteModalUser.patient_code || `patient_${targetUserId}`);
      }
      setDeleteModalUser(null);
    } catch (err: unknown) {
      onToast(err instanceof Error ? err.message : "Failed to delete account.");
    } finally {
      setIsSubmittingDelete(false);
    }
  };

  return (
    <div className="page-wrap workspace-page user-accounts-page w-full min-w-0">
      <PageHeader
        eyebrow="Management · Super Admin"
        title="Patient accounts"
        description="Review patient login access and manage active or blocked accounts."
        action={
          <button className="button button-secondary" onClick={() => { void loadUsers(); }} disabled={loadingUsers} title="Refresh patient accounts from the API">
            <RefreshCw size={14} className={loadingUsers ? "animate-spin" : ""} />
            {loadingUsers ? "Refreshing..." : "Refresh"}
          </button>
        }
      />

      <section className="card">
          <div className="section-row flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="card-title">Patient groups</h2>
              <p className="card-note">
                Live segments from account, assessment, order, appointment, and treatment records.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                className="period-select"
                aria-label="Filter status"
                value={userStatusFilter}
                onChange={(e) => setUserStatusFilter(e.target.value as "All" | "Active" | "Blocked")}
              >
                <option value="All">All statuses</option>
                <option value="Active">Active only</option>
                <option value="Blocked">Blocked only</option>
              </select>
            </div>
          </div>

          <SlidingTabList activeKey={selectedSegment} indicatorVariant="underline" className="patient-segment-tabs" label="Patient segments">
            {patientSegments.map((segment) => {
              const isSelected = selectedSegment === segment.id;
              const summary = segmentSummary?.[segment.id];
              return <button
                key={segment.id}
                type="button"
                role="tab"
                id={`patient-segment-tab-${segment.id}`}
                aria-controls="patient-segment-panel"
                aria-selected={isSelected}
                onClick={() => { setSelectedSegment(segment.id); setUserPage(1); }}
                className={`commerce-tab patient-segment-tab ${isSelected ? "selected" : ""}`}
              >
                {segment.label}
                <span className="patient-segment-count">{summary ? summary.total.toLocaleString("en-IN") : "—"}</span>
              </button>;
            })}
          </SlidingTabList>

          <div className="patient-segment-summary" aria-live="polite">
            <span>{activeSegment?.detail}</span>
            {selectedSegment === "accounts_assessments" && activeSegmentSummary && <strong>{activeSegmentSummary.assessed ?? 0} assessed <i>·</i> {activeSegmentSummary.not_assessed ?? 0} not yet assessed</strong>}
            {selectedSegment === "product_customers" && activeSegmentSummary?.active_within_days && <strong>App login within {activeSegmentSummary.active_within_days} days</strong>}
          </div>

          <TableToolbar
            value={userSearch}
            onChange={(value) => { setUserSearch(value); setUserPage(1); }}
            placeholder="Search patient by name, phone, email, or patient code..."
            right={<span style={{ color: "#8a95a4", fontSize: 11 }}>{usersTotal.toLocaleString("en-IN")} patients found</span>}
          />

          <div id="patient-segment-panel" role="tabpanel" aria-labelledby={`patient-segment-tab-${selectedSegment}`} tabIndex={0}>
          <div key={selectedSegment} className="patient-accounts-table table-wrap overflow-x-auto animate-in fade-in slide-in-from-bottom-1 duration-200 motion-reduce:animate-none">
            <table>
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Contact</th>
                  <th>Account Status</th>
                  <th>Last Active / Login</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const isBlocked = Boolean(u.is_blocked || u.status === "blocked");
                  const initials = u.name
                    ? u.name
                        .split(/\s+/)
                        .map((p) => p[0] || "")
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()
                    : "PT";
                  const lastLoginStr = u.last_login_at
                    ? new Date(u.last_login_at).toLocaleString()
                    : u.created_at
                    ? `Registered ${new Date(u.created_at).toLocaleDateString()}`
                    : "Not recorded";

                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="person flex items-center gap-2.5">
                          <Avatar initials={initials} />
                          <div>
                            <div className="person-name font-semibold text-slate-900">{u.name}</div>
                            <div className="text-xs text-slate-500 font-mono">{u.patient_code || `PT-${u.id}`}</div>
                            {selectedSegment === "accounts_assessments" && <div className={`mt-0.5 text-[10px] font-medium ${u.has_completed_assessment ? "text-emerald-700" : "text-slate-400"}`}>{u.has_completed_assessment ? "Assessment complete" : "Assessment not completed"}</div>}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="text-xs font-medium text-slate-800">{u.phone || "No phone"}</div>
                        <div className="text-xs text-slate-500">{u.email || "No email"}</div>
                      </td>
                      <td>
                        {isBlocked ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700 border border-red-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-red-600"></span>
                            Blocked
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600"></span>
                            Active
                          </span>
                        )}
                        {isBlocked && u.blocked_reason && (
                          <div className="text-[10px] text-red-600 truncate max-w-[150px]" title={u.blocked_reason}>
                            {u.blocked_reason}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="text-xs text-slate-700">{lastLoginStr}</span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div className="flex items-center justify-end gap-1.5">
                          {/* 1. Show Detail Page Option */}
                          <button
                            type="button"
                            className="button button-secondary button-small"
                            onClick={() => {
                              if (onOpenPatient) {
                                onOpenPatient(String(u.id));
                              } else {
                                router.push(`/patients/${encodeURIComponent(u.id)}`);
                              }
                            }}
                            title="Open patient profile and clinical file"
                          >
                            <ExternalLink size={12} />
                            Details
                          </button>

                          {/* 2. Block / Unblock User Option (Super Admin Only) */}
                          {isSuperAdmin ? (
                            <button
                              type="button"
                              className={`button button-small ${
                                isBlocked
                                  ? "button-secondary border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                  : "button-secondary border-amber-300 text-amber-700 hover:bg-amber-50"
                              }`}
                              onClick={() => {
                                setBlockReason(u.blocked_reason || "");
                                setBlockModalUser(u);
                              }}
                              title={isBlocked ? "Unblock patient account" : "Suspend patient account"}
                            >
                              {isBlocked ? <Unlock size={12} /> : <Lock size={12} />}
                              {isBlocked ? "Unblock" : "Block"}
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400" title="Super Admin access required">
                              Super Admin only
                            </span>
                          )}

                          {/* 3. Delete Account of User Option (Super Admin Only) */}
                          {isSuperAdmin && (
                            <button
                              type="button"
                              className="button button-danger button-small"
                              onClick={() => setDeleteModalUser(u)}
                              title="Permanently delete user account from database"
                            >
                              <Trash2 size={12} />
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <div className="empty-state py-8 text-center text-slate-500">
                        {loadingUsers ? "Loading user accounts..." : "No user accounts match those filters."}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div key={`mobile-${selectedSegment}`} className="patient-mobile-list animate-in fade-in slide-in-from-bottom-1 duration-200 motion-reduce:animate-none">
            {filteredUsers.map((u) => {
              const isBlocked = Boolean(u.is_blocked || u.status === "blocked");
              return <article className="patient-mobile-card" key={u.id}>
                <div className="patient-mobile-card-head">
                  <Avatar initials={u.name.split(/\s+/).map((part) => part[0] || "").join("").slice(0, 2).toUpperCase() || "PT"} />
                  <div className="patient-mobile-copy"><strong>{u.name}</strong><span>{u.patient_code || `PT-${u.id}`}</span></div>
                  <span className={`patient-status ${isBlocked ? "is-blocked" : "is-active"}`}>{isBlocked ? "Blocked" : "Active"}</span>
                </div>
                <div className="patient-mobile-contact">
                  <span>{u.phone || "No phone"}</span><span>{u.email || "No email"}</span>
                </div>
                <div className="patient-mobile-foot">
                  <span>{u.last_login_at ? `Last active ${new Date(u.last_login_at).toLocaleDateString()}` : u.created_at ? `Joined ${new Date(u.created_at).toLocaleDateString()}` : "Activity not recorded"}</span>
                  {selectedSegment === "accounts_assessments" && <span>{u.has_completed_assessment ? "Assessment complete" : "Assessment pending"}</span>}
                </div>
                <div className="patient-mobile-actions">
                  <button type="button" className="button button-secondary button-small" onClick={() => onOpenPatient ? onOpenPatient(String(u.id)) : router.push(`/patients/${encodeURIComponent(u.id)}`)}><ExternalLink size={12} />Details</button>
                  {isSuperAdmin && <button type="button" className="button button-secondary button-small" onClick={() => { setBlockReason(u.blocked_reason || ""); setBlockModalUser(u); }}>{isBlocked ? <Unlock size={12} /> : <Lock size={12} />}{isBlocked ? "Unblock" : "Block"}</button>}
                  {isSuperAdmin && <button type="button" className="button button-danger button-small" onClick={() => setDeleteModalUser(u)}><Trash2 size={12} />Delete</button>}
                </div>
              </article>;
            })}
            {filteredUsers.length === 0 && <div className="empty-state">{loadingUsers ? "Loading user accounts…" : "No user accounts match those filters."}</div>}
          </div>
          </div>

          <div className="table-footer flex flex-col items-start justify-between gap-2 text-xs text-slate-500 py-3 px-4 sm:flex-row sm:items-center">
            <div className="flex flex-wrap items-center gap-3">
              <span>Showing {usersTotal === 0 ? 0 : ((userPage - 1) * userPageSize) + 1}–{Math.min(userPage * userPageSize, usersTotal)} of {usersTotal} patient accounts</span>
              <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
                Rows
                <select className="period-select !min-h-7 !py-1" aria-label="Rows per page" value={userPageSize} onChange={(event) => { setUserPageSize(Number(event.target.value)); setUserPage(1); }}>
                  {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
              </label>
            </div>
            <span className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-slate-400">
              Page {userPage} of {Math.max(1, Math.ceil(usersTotal / userPageSize))}
              <button type="button" className="button button-secondary button-small" disabled={userPage <= 1 || loadingUsers} onClick={() => setUserPage((page) => Math.max(1, page - 1))}>Previous</button>
              <button type="button" className="button button-secondary button-small" disabled={userPage >= Math.ceil(usersTotal / userPageSize) || loadingUsers} onClick={() => setUserPage((page) => page + 1)}>Next</button>
            </span>
          </div>
        </section>

      {/* Block / Unblock Modal Dialog */}
      {blockModalUser && (
        <Modal
          title={
            blockModalUser.is_blocked || blockModalUser.status === "blocked"
              ? `Unblock Patient Account: ${blockModalUser.name}`
              : `Block Patient Account: ${blockModalUser.name}`
          }
          description={
            blockModalUser.is_blocked || blockModalUser.status === "blocked"
              ? "Restoring this patient account will re-enable mobile app access and login privileges."
              : "Suspending this user account immediately invalidates their active app sessions and prevents further logins."
          }
          submitLabel={
            isSubmittingBlock
              ? "Saving..."
              : blockModalUser.is_blocked || blockModalUser.status === "blocked"
              ? "Confirm & Unblock Account"
              : "Confirm & Block Account"
          }
          submitVariant={blockModalUser.is_blocked || blockModalUser.status === "blocked" ? "primary" : "danger"}
          submitDisabled={isSubmittingBlock}
          onClose={() => setBlockModalUser(null)}
          onSubmit={handleConfirmBlock}
        >
          <div className="space-y-4 py-2">
            {!(blockModalUser.is_blocked || blockModalUser.status === "blocked") && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2.5">
                <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-semibold mb-1">Warning: Live App Suspension</strong>
                  The user will be immediately disconnected from the Dr. Hair mobile app. On their next screen load or app
                  open, they will see a clinical suspension warning screen with support contact instructions
                  (support@drhair.in, +91-9876543210).
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reason for {blockModalUser.is_blocked || blockModalUser.status === "blocked" ? "unblocking" : "suspension"} (optional audit trail):
              </label>
              <textarea
                className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A365D]"
                rows={3}
                placeholder="e.g., Requested consultation pause, suspicious activity, or identity review..."
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
              />
            </div>
          </div>
        </Modal>
      )}

      {/* Delete User Account Modal Dialog */}
      {deleteModalUser && (
        <Modal
          title={`Permanently Delete Patient: ${deleteModalUser.name}`}
          description="Are you sure you want to delete this patient account from the database?"
          submitLabel={isSubmittingDelete ? "Deleting..." : "Permanently Delete Account"}
          submitVariant="danger"
          submitDisabled={isSubmittingDelete}
          onClose={() => setDeleteModalUser(null)}
          onSubmit={handleConfirmDelete}
        >
          <div className="space-y-4 py-2">
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900 flex items-start gap-2.5">
              <ShieldAlert size={18} className="text-red-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-semibold mb-1 text-red-800">Dangerous Administrative Action</strong>
                This action is irreversible. The patient profile ({deleteModalUser.patient_code || `PT-${deleteModalUser.id}`}),
                phone verification, and active sessions will be permanently purged from the database.
                <span className="block mt-1 font-semibold">
                  If the patient opens the Dr. Hair app, they will be automatically signed out and navigated to the login screen.
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600">
              Patient: <strong>{deleteModalUser.name}</strong> ({deleteModalUser.phone || deleteModalUser.email})
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
