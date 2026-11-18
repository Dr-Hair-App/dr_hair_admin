/**
 * Forward an incoming admin multipart upload without buffering its body.
 * The explicit duplex option is required by Node's fetch for streamed bodies.
 *
 * @param {Request} request
 * @param {string} token
 * @param {(path: string, init: RequestInit & { duplex: 'half' }) => Promise<Response>} fetcher
 */
export function forwardAdminMediaUpload(request, token, fetcher) {
  const contentType = request.headers.get("content-type") || "";
  const purpose = request.headers.get("x-media-purpose") || "product";

  return fetcher("/api/v1/media/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": contentType,
      "X-Media-Purpose": purpose,
    },
    body: request.body,
    cache: "no-store",
    duplex: "half",
  });
}
