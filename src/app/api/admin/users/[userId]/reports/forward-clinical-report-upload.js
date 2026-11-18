export function getClinicalReportUploadToken(cookieToken, authorizationHeader) {
  if (cookieToken) return cookieToken;
  const value = typeof authorizationHeader === "string" ? authorizationHeader : "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() || undefined : undefined;
}

/**
 * Stream a report multipart request through the Admin BFF without consuming or
 * rebuilding the request body. Keeping Content-Type unchanged preserves its
 * browser-generated multipart boundary.
 *
 * @param {Request} request
 * @param {string} userId
 * @param {string} token
 * @param {(path: string, init: RequestInit & { duplex: 'half' }) => Promise<Response>} fetcher
 */
export function forwardClinicalReportUpload(request, userId, token, fetcher) {
  const contentType = request.headers.get("content-type") || "";
  return fetcher(`/api/v1/admin/users/${encodeURIComponent(userId)}/reports`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": contentType,
    },
    body: request.body,
    cache: "no-store",
    duplex: "half",
  });
}
