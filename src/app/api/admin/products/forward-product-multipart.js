/** Forward a multipart product request with its original boundary and stream intact. */
export function forwardAdminProductMultipart(request, path, method, token, fetcher) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    throw new TypeError("Expected multipart/form-data with a boundary.");
  }
  if (!request.body) throw new TypeError("Product upload body is empty.");

  return fetcher(path, {
    method,
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

/** Keep metadata-only JSON updates (such as archive status) compatible. */
export async function forwardAdminProductJson(product, path, method, token, fetcher) {
  return fetcher(path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(product),
    cache: "no-store",
  });
}
