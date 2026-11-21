"use client";

import { useEffect, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import { PageHeader } from "../../shared/components/ui";
import { getAdminRequestRecords, subscribeAdminRequestRecords, type AdminRequestRecord } from "../../shared/lib/admin-request-recorder";

type TrafficRecord = {
  id: string;
  request_id: string | null;
  surface: string;
  method: string;
  route: string;
  status: number;
  duration_ms: number;
  cache_control: string;
  created_at: string;
};

export function ApiTrafficPage() {
  const [windowRange, setWindowRange] = useState("24h");
  const [statusClass, setStatusClass] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<TrafficRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [clientRequests, setClientRequests] = useState<AdminRequestRecord[]>(() => getAdminRequestRecords());

  useEffect(() => subscribeAdminRequestRecords(() => setClientRequests(getAdminRequestRecords())), []);
  const screenSummary = Object.values(clientRequests.reduce<Record<string, { view: string; count: number; errors: number; duration: number; cache: Record<string, number> }>>((summary, request) => {
    const entry = summary[request.view] || (summary[request.view] = { view: request.view, count: 0, errors: 0, duration: 0, cache: {} });
    entry.count += 1;
    entry.errors += request.status === null || request.status >= 400 ? 1 : 0;
    entry.duration += request.duration_ms;
    entry.cache[request.cache_outcome] = (entry.cache[request.cache_outcome] || 0) + 1;
    return summary;
  }, {}));

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ window: windowRange, limit: "100", page: String(page) });
    if (statusClass) query.set("statusClass", statusClass);
    const request = async () => {
      try {
        const response = await fetch(`/api/admin/api-traffic?${query}`, { cache: "no-store", signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.message || "API traffic could not be loaded.");
        const nextTotalPages = Math.max(1, Number(payload?.meta?.total_pages) || 1);
        setItems(Array.isArray(payload?.data?.items) ? payload.data.items : []);
        setTotal(Number(payload?.meta?.total) || 0);
        setTotalPages(nextTotalPages);
        setPage((current) => Math.min(current, nextTotalPages));
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "API traffic could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void request();
    return () => controller.abort();
  }, [page, statusClass, windowRange, refreshKey]);

  return <div className="page-wrap workspace-page w-full min-w-0">
    <PageHeader eyebrow="System operations" title="API Traffic" description="Recent authenticated Admin API requests. Duration is Worker processing time; request bodies and patient data are never stored." />
    <section className="card space-y-4" aria-label="API traffic history">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="traffic-window">Time window</label>
          <select id="traffic-window" className="period-select" value={windowRange} onChange={(event) => { setLoading(true); setError(""); setPage(1); setWindowRange(event.target.value); }}>
            <option value="1h">Last hour</option><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option>
          </select>
          <label className="sr-only" htmlFor="traffic-status">Status filter</label>
          <select id="traffic-status" className="period-select" value={statusClass} onChange={(event) => { setLoading(true); setError(""); setPage(1); setStatusClass(event.target.value); }}>
            <option value="">All statuses</option><option value="2xx">2xx success</option><option value="4xx">4xx client errors</option><option value="5xx">5xx server errors</option>
          </select>
        </div>
        <button type="button" className="button-secondary inline-flex items-center gap-2" onClick={() => { setLoading(true); setError(""); setRefreshKey((value) => value + 1); }} disabled={loading}>
          <RefreshCw size={15} aria-hidden="true" /> Refresh
        </button>
      </div>
      <div className="flex items-center gap-2 text-sm text-slate-600"><Activity size={16} aria-hidden="true" />{loading ? "Loading traffic…" : error ? "Traffic count unavailable" : `${total} requests in this window`}</div>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {!loading && !error && items.length === 0 && <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-600">No API traffic found for these filters.</p>}
      {!error && items.length > 0 && <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-3">Time</th><th className="p-3">Request</th><th className="p-3">Status</th><th className="p-3">Worker time</th><th className="p-3">Cache policy</th><th className="p-3">Request ID</th></tr></thead>
          <tbody>{items.map((item) => <tr key={item.id} className="border-t border-slate-100">
            <td className="whitespace-nowrap p-3 text-slate-600">{new Date(item.created_at).toLocaleString()}</td>
            <td className="p-3"><span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold">{item.method}</span><code className="break-all">{item.route}</code></td>
            <td className="p-3"><span className={item.status >= 500 ? "font-semibold text-rose-700" : item.status >= 400 ? "font-semibold text-amber-700" : "font-semibold text-emerald-700"}>{item.status || "—"}</span></td>
            <td className="whitespace-nowrap p-3">{Number(item.duration_ms).toFixed(1)} ms</td><td className="max-w-[180px] truncate p-3 text-slate-600">{item.cache_control || "—"}</td>
            <td className="p-3"><code className="text-xs">{item.request_id || "—"}</code></td>
          </tr>)}</tbody>
        </table>
      </div>}
      {!error && totalPages > 1 && <nav className="flex items-center justify-between gap-3" aria-label="API traffic pages">
        <p className="text-sm text-slate-600">Page {page} of {totalPages}</p>
        <div className="flex gap-2">
          <button type="button" className="button button-secondary button-small" onClick={() => { setLoading(true); setPage((current) => Math.max(1, current - 1)); }} disabled={loading || page <= 1}>Previous</button>
          <button type="button" className="button button-secondary button-small" onClick={() => { setLoading(true); setPage((current) => Math.min(totalPages, current + 1)); }} disabled={loading || page >= totalPages}>Next</button>
        </div>
      </nav>}
      <p className="text-xs text-slate-500">History is retained for up to 30 days. Only route templates and response metadata are recorded.</p>
    </section>
    <section className="card space-y-4" aria-label="This tab request diagnostics">
      <div>
        <h2 className="text-base font-semibold text-slate-900">This tab’s Admin requests</h2>
        <p className="mt-1 text-xs text-slate-500">In-memory diagnostics from this browser tab only. Query strings, request bodies, headers, and record identifiers are not captured. API Traffic display requests are excluded.</p>
      </div>
      {clientRequests.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No Admin requests recorded in this tab yet.</p>
      ) : (
        <>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-3">Screen</th><th className="p-3">Requests</th><th className="p-3">Errors</th><th className="p-3">Average time</th><th className="p-3">Cache outcomes</th></tr></thead>
            <tbody>{screenSummary.map((summary) => <tr key={summary.view} className="border-t border-slate-100">
              <td className="p-3 capitalize">{summary.view}</td><td className="p-3">{summary.count}</td><td className="p-3">{summary.errors}</td><td className="whitespace-nowrap p-3">{(summary.duration / summary.count).toFixed(1)} ms</td><td className="p-3 text-xs">{Object.entries(summary.cache).map(([outcome, count]) => `${outcome}: ${count}`).join(" · ")}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-3">Screen</th><th className="p-3">Route template</th><th className="p-3">Method</th><th className="p-3">Status</th><th className="p-3">Client time</th><th className="p-3">Cache outcome</th></tr></thead>
            <tbody>{clientRequests.slice(0, 30).map((request) => <tr key={request.id} className="border-t border-slate-100">
              <td className="p-3 capitalize text-slate-700">{request.view}</td>
              <td className="p-3"><code className="break-all text-xs">{request.route}</code></td>
              <td className="p-3">{request.method}</td>
              <td className="p-3">{request.status ?? "Network error"}</td>
              <td className="whitespace-nowrap p-3">{request.duration_ms.toFixed(1)} ms</td>
              <td className="p-3">{request.cache_outcome}</td>
            </tr>)}</tbody>
          </table>
        </div>
        </>
      )}
      <p className="text-xs text-slate-500">Keeping the latest 100 records in memory. Leaving this tab clears the diagnostics.</p>
    </section>
  </div>;
}
