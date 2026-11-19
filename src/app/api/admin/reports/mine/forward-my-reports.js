/**
 * Proxy the authenticated admin's scoped report list. Uploader identity is
 * derived by the backend from the bearer token, never from client input.
 *
 * @param {string} token
 * @param {(path: string, init: RequestInit) => Promise<Response>} fetcher
 */
export function forwardMyAdminReports(token, fetcher) {
  return fetcher("/api/v1/admin/reports/mine", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
}
