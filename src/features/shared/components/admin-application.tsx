"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { AdminAccountManagement } from "../../admin-users/components/admin-account-management";
import { PatientAccountManagement } from "../../admin-users/components/patient-account-management";
import { AppManagement } from "../../app-management/components/app-management";
import { ProductManagement } from "../../commerce/components/product-management";
import { Dashboard } from "../../dashboard/components/dashboard";
import { NotificationCenter } from "../../notifications/components/notification-center";
import { ApiTrafficPage } from "../../operations/components/api-traffic-page";
import { HairTestsPage } from "../../operations/components/hair-tests-page";
import { OperationsPage } from "../../operations/components/operations-page";
import {
  admins as initialAdmins,
  auditEvents as initialAudit,
  initialFeatures,
  patients as demoPatients,
} from "../lib/demo-data";
import { canAccessPage, type PanelFeatureAccess } from "../lib/permissions";
import { useSessionState } from "../lib/use-session-state";
import { installAdminFetchRecorder, setAdminRequestView } from "../lib/admin-request-recorder";
import {
  cachedFetch,
  clearCache,
  setCacheSessionScope,
  TTL_PROFILES,
} from "../lib/api-cache";
import type {
  AdminRecord,
  AdminDashboardSummary,
  AdminPermissionId,
  AuditEventRecord,
  FeatureRecord,
  PageKey,
  Role,
} from "../types";
import { AdminShell } from "./admin-shell";
import { PanelScreen } from "./panel-screen";
import { SignIn, type AdminIdentity } from "./sign-in";
import { Toast } from "./ui";
import { PatientDetailPage } from "../../operations/components/patient-detail-page";
import { PatientAssessmentDetailPage } from "../../operations/components/patient-assessment-detail-page";

const initialAuditEvents = initialAudit.map((event) => ({
  ...event,
  type: event.type as AuditEventRecord["type"],
}));

const superAdminPermissions: AdminPermissionId[] = [
  "patients.view",
  "assessments.review",
  "care-plans.edit",
  "progress.review",
  "documents.view",
  "documents.upload",
  "documents.share",
  "patients.export",
  "patients.lookup",
  "hair-tests.view",
  "hair-tests.upload",
  "hair-tests.submit",
  "reports.approve",
  "reports.share",
  "content.edit",
  "media.upload",
  "content.publish",
  "notifications.manage",
  "products.manage",
  "orders.manage",
  "promotions.manage",
  "commerce.export",
  "bookings.manage",
  "audit.view",
];

export function AdminApplication({
  initialPage = "overview",
  initialPatientId = null,
  initialAssessmentRef = null,
  initialBookingDate = "",
}: {
  initialPage?: PageKey;
  initialPatientId?: string | null;
  initialAssessmentRef?: string | null;
  initialBookingDate?: string;
}) {
  const [auth, setAuth] = useState<{
    status: "checking" | "signed-out" | "signed-in";
    admin?: AdminIdentity;
    message?: string;
  }>({ status: "checking" });
  const [actorEmail, setActorEmail] = useState("");
  const role: Role =
    auth.admin?.role === "super_admin" ? "super-admin" : "admin";
  const [page, setPage] = useState<PageKey>(initialPage);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(
    initialPatientId,
  );
  const [selectedAssessmentRef, setSelectedAssessmentRef] = useState<
    string | null
  >(initialAssessmentRef);
  const [bookingDate, setBookingDate] = useState(initialBookingDate);
  const [dashboardAnchor, setDashboardAnchor] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [toast, setToast] = useState("");
  const [adminRecords] = useSessionState<AdminRecord[]>(
    "drhair-demo-admins",
    initialAdmins,
  );
  const [features, setFeatures] = useState<FeatureRecord[]>(initialFeatures);
  const [panelAccess, setPanelAccess] = useState<PanelFeatureAccess>({
    patients: true,
    catalog: true,
    content: true,
    orders: true,
    bookings: true,
    tests: true,
  });
  const [dashboardSummary, setDashboardSummary] =
    useState<AdminDashboardSummary | null>(null);
  const hasDashboardSummary = dashboardSummary !== null;
  const [dashboardSummaryRevision, setDashboardSummaryRevision] = useState(0);
  useEffect(() => {
    if (auth.status !== "signed-in") setCacheSessionScope(null);
  }, [auth.status]);
  useLayoutEffect(() => {
    setAdminRequestView(page);
    if (auth.status !== "signed-in") return;
    return installAdminFetchRecorder();
  }, [auth.status, page]);
  const [events, setEvents] = useSessionState<AuditEventRecord[]>(
    "drhair-demo-audit",
    initialAuditEvents,
  );
  const showToast = useCallback((message: string) => setToast(message), []);
  const closeToast = useCallback(() => setToast(""), []);
  const isOwner = false;
  const permissions = useMemo<AdminPermissionId[]>(() => {
    if (role === "super-admin") return superAdminPermissions;
    if (
      Array.isArray(auth.admin?.permissions) &&
      auth.admin.permissions.length > 0
    ) {
      return auth.admin.permissions as AdminPermissionId[];
    }
    return ["patients.view"];
  }, [auth.admin?.permissions, role]);
  const visibleName = auth.admin?.name || actorEmail || "Admin";
  const actorName = visibleName;

  const openPatient = useCallback(
    (patientId: string, assessmentRef: string | null = null) => {
      setSelectedPatientId(patientId);
      setSelectedAssessmentRef(assessmentRef);
      setPage("patients");
      const path = assessmentRef
        ? `/patients/${encodeURIComponent(patientId)}/assessments/${encodeURIComponent(assessmentRef)}`
        : `/patients/${encodeURIComponent(patientId)}`;
      window.history.pushState(null, "", path);
    },
    [],
  );

  const closePatient = useCallback(() => {
    setSelectedPatientId(null);
    setSelectedAssessmentRef(null);
    setPage("overview");
    setDashboardAnchor("registered-patients");
    window.history.pushState(null, "", "/overview#registered-patients");
  }, []);

  useEffect(() => {
    const syncRouteState = () => {
      const query = new URLSearchParams(window.location.search);
      const queryPanel = query.get("panel") as PageKey | null;
      const pathname = window.location.pathname;
      const segments = pathname.replace(/^\/+/, "").split("/");
      const pathSegment = segments[0] as PageKey;
      if (pathSegment === "patients" && segments[1]) {
        setSelectedPatientId(decodeURIComponent(segments[1]));
        setSelectedAssessmentRef(
          segments[3] ? decodeURIComponent(segments[3]) : null,
        );
        setPage("patients");
        return;
      }
      const validKeys: PageKey[] = [
        "overview",
        "patients",
        "catalog",
        "content",
        "orders",
        "tests",
        "bookings",
        "team",
        "activity",
        "notifications",
        "apiTraffic",
      ];
      const resolvedPage =
        queryPanel && validKeys.includes(queryPanel)
          ? queryPanel
          : pathSegment && validKeys.includes(pathSegment)
            ? pathSegment
            : "overview";
      setPage(resolvedPage);
      setSelectedPatientId(null);
      setSelectedAssessmentRef(null);
      setBookingDate(query.get("date") ?? "");
      setDashboardAnchor(window.location.hash.slice(1));
    };
    window.addEventListener("popstate", syncRouteState);
    return () => window.removeEventListener("popstate", syncRouteState);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/session", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          if (response.status === 401) {
            setAuth({ status: "signed-out" });
            return;
          }
          const payload: unknown = await response.json().catch(() => ({}));
          const message = payload && typeof payload === "object"
            && typeof (payload as Record<string, unknown>).message === "string"
            ? (payload as Record<string, string>).message
            : "The sign-in service is temporarily unavailable. Try again shortly.";
          setAuth({ status: "signed-out", message });
          return;
        }
        const rawResult: unknown = await response.json().catch(() => ({}));
        const result = (
          rawResult && typeof rawResult === "object" ? rawResult : {}
        ) as Record<string, unknown>;
        const admin = result?.admin as AdminIdentity | undefined;
        if (
          !result?.authenticated ||
          !admin?.email ||
          !["admin", "super_admin"].includes(admin.role)
        ) {
          setAuth({ status: "signed-out" });
          return;
        }
        setCacheSessionScope(admin.id || admin.email);
        setActorEmail(admin.email);
        setAuth({ status: "signed-in", admin });
      })
      .catch(() => {
      if (!controller.signal.aborted) {
        setAuth({
          status: "signed-out",
          message: "Could not check your admin session. Check your connection and try signing in again.",
        });
      }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (auth.status !== "signed-in") return;
    const controller = new AbortController();
    fetch("/api/admin/features?platform=admin", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const rawPayload: unknown = await response.json().catch(() => ({}));
        const payload = (
          rawPayload && typeof rawPayload === "object" ? rawPayload : {}
        ) as Record<string, unknown>;
        const payloadData =
          payload?.data && typeof payload.data === "object"
            ? (payload.data as Record<string, unknown>)
            : {};
        if (!response.ok)
          throw new Error(
            typeof payload?.message === "string"
              ? payload.message
              : "Could not load admin module settings.",
          );
        const items = Array.isArray(payloadData.items) ? payloadData.items : [];
        const values = Object.fromEntries(
          items
            .filter(
              (item: { key?: string }) =>
                typeof item.key === "string" && item.key.startsWith("admin_"),
            )
            .map((item: { key: string; enabled?: boolean }) => [
              item.key.slice("admin_".length),
              item.enabled !== false,
            ]),
        );
        if (Object.keys(values).length)
          setPanelAccess((current) => ({ ...current, ...values }));
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          showToast(
            error instanceof Error
              ? error.message
              : "Could not load admin module settings.",
          );
      });
    return () => controller.abort();
  }, [auth.status, showToast]);

  useEffect(() => {
    if (auth.status !== "signed-in") return;
    // Only re-fetch dashboard summary on revision increment if user is on overview page (or initial load)
    if (page !== "overview" && hasDashboardSummary) return;
    const controller = new AbortController();
    cachedFetch("/api/admin/dashboard/summary", {
      signal: controller.signal,
    }, TTL_PROFILES.navigationShort)
      .then(async (response) => {
        if (!response.ok) return;
        const result: unknown = await response.json().catch(() => ({}));
        if (
          !controller.signal.aborted &&
          result &&
          typeof result === "object"
        ) {
          const data = (result as Record<string, unknown>).data;
          if (data && typeof data === "object") {
            setDashboardSummary(data as AdminDashboardSummary);
          }
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [auth.status, dashboardSummaryRevision, hasDashboardSummary, page]);

  const recordAudit = useCallback(
    (action: string, target: string) => {
      const time = new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date());
      setEvents((current) => [
        {
          who: actorName,
          initials: actorName
            .split(/\s+/)
            .map((part) => part[0])
            .join("")
            .slice(0, 2)
            .toUpperCase(),
          action,
          target,
          time,
          type: action.match(
            /admin|access|permission|invitation|suspended|reactivated/i,
          )
            ? "Access"
            : action.match(/app update|release policy|minimum version/i)
              ? "App updates"
              : action.match(/notification/i)
                ? "Notifications"
                : action.match(/feature|disabled|enabled/i)
                  ? "Feature"
                  : action.match(/hair test|report|file/i)
                    ? "Testing"
                    : action.match(
                          /content|publish|draft|banner|home placement/i,
                        )
                      ? "Content"
                      : action.match(/booking|appointment|OPD status/i)
                        ? "Bookings"
                        : action.match(/order/i)
                          ? "Orders"
                          : action.match(/commerce|product|coupon|referral/i)
                            ? "Commerce"
                            : "Clinical",
        },
        ...current,
      ]);
      setDashboardSummaryRevision((revision) => revision + 1);
    },
    [actorName, setEvents],
  );

  const navigate = useCallback(
    (
      nextPage: PageKey,
      options?: { bookingDate?: string; anchor?: string },
    ) => {
      if (!canAccessPage(role, nextPage, panelAccess, permissions)) {
        showToast("This account does not have access to that section.");
        return;
      }
      setSelectedPatientId(null);
      setSelectedAssessmentRef(null);
      if (nextPage === "patients") {
        setPage("overview");
        setGlobalSearch("");
        setBookingDate("");
        const anchor = options?.anchor ?? "registered-patients";
        setDashboardAnchor(anchor);
        window.history.pushState(
          null,
          "",
          `/overview#${encodeURIComponent(anchor)}`,
        );
        return;
      }
      setPage(nextPage);
      setGlobalSearch("");
      setDashboardAnchor("");
      const selectedDate =
        nextPage === "bookings" ? (options?.bookingDate ?? "") : "";
      setBookingDate(selectedDate);
      const targetUrl =
        nextPage === "overview"
          ? "/"
          : selectedDate
            ? `/${nextPage}?date=${encodeURIComponent(selectedDate)}`
            : `/${nextPage}`;
      window.history.pushState(null, "", targetUrl);
    },
    [panelAccess, permissions, role, showToast],
  );

  const changePanelAccess = useCallback(
    (id: string, enabled: boolean) => {
      setPanelAccess((current) => ({ ...current, [id]: enabled }));
    },
    [setPanelAccess],
  );

  const content = useMemo(() => {
    switch (page) {
      case "overview":
        return (
          <Dashboard
            role={role}
            userName={visibleName}
            onNavigate={navigate}
            onOpenPatient={openPatient}
            permissions={permissions}
            events={events}
            admins={adminRecords}
            onAudit={recordAudit}
            onToast={showToast}
            anchor={dashboardAnchor}
            serverSummary={dashboardSummary}
          />
        );
      case "patients":
        return selectedAssessmentRef && selectedPatientId ? (
          <PatientAssessmentDetailPage
            key={`${selectedPatientId}:${selectedAssessmentRef}`}
            patientId={selectedPatientId}
            referenceNo={selectedAssessmentRef}
            permissions={permissions}
            onToast={showToast}
            onAudit={recordAudit}
            onBack={closePatient}
          />
        ) : selectedPatientId ? (
          <PatientDetailPage
            key={selectedPatientId}
            patientId={selectedPatientId}
            role={role}
            permissions={permissions}
            onToast={showToast}
            onAudit={recordAudit}
            onBack={closePatient}
          />
        ) : (
          <OperationsPage
            kind="patients"
            globalSearch={globalSearch}
            onToast={showToast}
            permissions={permissions}
            onAudit={recordAudit}
            onOpenPatient={openPatient}
          />
        );
      case "catalog":
        return (
          <ProductManagement
            onToast={showToast}
            permissions={permissions}
            panelAccess={panelAccess}
            globalSearch={globalSearch}
            onAudit={recordAudit}
          />
        );
      case "content":
        return (
          <AppManagement
            role={role}
            onToast={showToast}
            permissions={permissions}
            onAudit={recordAudit}
            features={features}
            onFeaturesChange={setFeatures}
            panelAccess={panelAccess}
            onPanelAccessChange={changePanelAccess}
          />
        );
      case "orders":
        return (
          <OperationsPage
            kind="orders"
            globalSearch={globalSearch}
            onToast={showToast}
            permissions={permissions}
            onAudit={recordAudit}
          />
        );
      case "tests":
        return (
          <HairTestsPage
            patients={demoPatients}
            permissions={permissions}
            actor={actorName}
            onToast={showToast}
            onAudit={recordAudit}
          />
        );
      case "bookings":
        return (
          <OperationsPage
            key={bookingDate}
            kind="bookings"
            globalSearch={globalSearch}
            onToast={showToast}
            permissions={permissions}
            onAudit={recordAudit}
            initialDateFilter={bookingDate}
          />
        );
      case "notifications":
        return (
          <NotificationCenter
            role={role}
            userName={visibleName}
            permissions={permissions}
            events={events}
            onNavigate={navigate}
          />
        );
      case "apiTraffic":
        return permissions.includes("audit.view") || role === "super-admin" ? <ApiTrafficPage /> : <Denied />;
      case "team":
        return role === "super-admin" ? <AdminAccountManagement /> : <Denied />;
      case "activity":
        return role === "super-admin" ? (
          <PatientAccountManagement
            globalSearch={globalSearch}
            onToast={showToast}
            role={role}
            onOpenPatient={openPatient}
            onAudit={recordAudit}
          />
        ) : (
          <Denied />
        );
    }
  }, [
    actorName,
    adminRecords,
    bookingDate,
    changePanelAccess,
    closePatient,
    dashboardAnchor,
    dashboardSummary,
    events,
    features,
    globalSearch,
    navigate,
    openPatient,
    page,
    panelAccess,
    permissions,
    recordAudit,
    role,
    selectedAssessmentRef,
    selectedPatientId,
    setFeatures,
    showToast,
    visibleName,
  ]);

  if (auth.status === "checking") return <AdminSessionSkeleton />;

  if (auth.status !== "signed-in")
    return (
      <SignIn
        notice={auth.message}
        onAuthenticated={(admin) => {
          setCacheSessionScope(admin.id || admin.email);
          setActorEmail(admin.email);
          setAuth({ status: "signed-in", admin });
          setPage(initialPatientId ? "patients" : initialPage);
          showToast(`Welcome, ${admin.name || admin.email}.`);
        }}
      />
    );

  return (
    <>
      <AdminShell
        role={role}
        page={page}
        dashboardSummary={dashboardSummary}
        showSearch={!initialPatientId}
        headerTitle={
          initialAssessmentRef
            ? "Assessment detail"
            : initialPatientId
              ? "Patient record"
              : undefined
        }
        headerSubtitle={
          initialAssessmentRef
            ? `${initialAssessmentRef} · Patient ${initialPatientId}`
            : initialPatientId
              ? `Patient ID ${initialPatientId} · Clinical care`
              : undefined
        }
        globalSearch={globalSearch}
        panelAccess={panelAccess}
        permissions={permissions}
        isOwner={isOwner}
        userName={visibleName}
        onRoleChange={() => {}}
        onPageChange={navigate}
        onSearchChange={setGlobalSearch}
        onSignOut={() => {
          setCacheSessionScope(null);
          clearCache();
          void fetch("/api/auth/logout", { method: "POST" });
          setDashboardSummary(null);
          setAuth({ status: "signed-out" });
          setPage("overview");
          setGlobalSearch("");
        }}
      >
        <PanelScreen page={page}>{content}</PanelScreen>
      </AdminShell>
      {toast && <Toast message={toast} onClose={closeToast} />}
    </>
  );
}

function Denied() {
  return (
    <div className="page-wrap w-full min-w-0">
      <section className="card empty-state">
        Super Admin access is required for this section.
      </section>
    </div>
  );
}

function AdminSessionSkeleton() {
  return (
    <main
      className="min-h-screen w-full overflow-x-clip bg-[#F7F9FC]"
      aria-label="Loading admin workspace"
      aria-busy="true"
    >
      <aside
        aria-hidden="true"
        className="fixed inset-y-0 left-3 z-10 hidden w-[68px] flex-col items-center justify-between py-5 md:flex lg:left-5"
      >
        <div className="h-10 w-10 animate-pulse rounded-full bg-slate-200" />
        <div className="flex flex-col items-center gap-1 rounded-full bg-white/95 p-1.5 shadow-sm">
          {Array.from({ length: 7 }, (_, index) => (
            <div
              key={index}
              className="h-11 w-11 animate-pulse rounded-full bg-slate-100"
            />
          ))}
        </div>
        <div className="rounded-full bg-white/95 p-1.5 shadow-sm">
          <div className="h-11 w-11 animate-pulse rounded-full bg-slate-100" />
        </div>
        <div className="flex flex-col items-center gap-1 rounded-full bg-white/95 p-1.5 shadow-sm">
          <div className="h-10 w-10 animate-pulse rounded-full bg-slate-200" />
          <div className="h-10 w-10 animate-pulse rounded-full bg-slate-100" />
        </div>
      </aside>
      <section
        className="min-h-screen min-w-0 md:ml-[92px] lg:ml-[108px]"
        aria-hidden="true"
      >
        <header className="flex h-[68px] items-center justify-between bg-[#F7F9FC]/90 px-4 sm:px-6 lg:px-8">
          <div className="space-y-2">
            <div className="h-5 w-32 animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-56 animate-pulse rounded bg-slate-100" />
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden h-10 w-52 animate-pulse rounded-full bg-white sm:block" />
            <div className="h-10 w-10 animate-pulse rounded-full bg-slate-200" />
          </div>
        </header>
        <div className="w-full min-w-0 space-y-5 px-4 py-5 pb-28 sm:px-6 lg:px-8 md:pb-8">
          <div className="h-40 animate-pulse rounded-[28px] border border-slate-200 bg-white" />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
            <div className="h-80 animate-pulse rounded-[28px] border border-slate-200 bg-white" />
            <div className="h-80 animate-pulse rounded-[28px] border border-slate-200 bg-white" />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div
                key={index}
                className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white"
              />
            ))}
          </div>
        </div>
      </section>
      <div
        aria-hidden="true"
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+12px)] left-1/2 z-10 flex w-[min(360px,calc(100vw-28px))] -translate-x-1/2 items-center justify-around rounded-full border border-slate-200/80 bg-white/95 p-2 shadow-sm md:hidden"
      >
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-11 w-11 animate-pulse rounded-full bg-slate-100"
          />
        ))}
      </div>
      <span className="sr-only">Checking your secure admin session…</span>
    </main>
  );
}
