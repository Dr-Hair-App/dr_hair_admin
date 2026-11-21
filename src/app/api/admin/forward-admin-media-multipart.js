/** Stream admin content/review metadata and image files to the backend. */
export function forwardAdminMediaMultipart(request, path, method, token, fetcher) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    throw new TypeError("Expected multipart/form-data with a boundary.");
  }
  if (!request.body) throw new TypeError("Upload body is empty.");

  return fetcher(path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": contentType,
      "X-Media-Purpose": "content",
    },
    body: request.body,
    cache: "no-store",
    duplex: "half",
  });
}
