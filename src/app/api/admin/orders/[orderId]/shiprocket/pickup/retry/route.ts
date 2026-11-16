import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, backendUrl, noStoreJson, readJson } from "../../../../../../_lib/backend";

export async function POST(_request: Request, props: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await props.params;
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return noStoreJson({ message: "Sign in to retry the courier pickup." }, 401);
  try {
    const upstream = await fetch(backendUrl(`/api/v1/admin/orders/${encodeURIComponent(orderId)}/shiprocket/pickup/retry`), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    return noStoreJson(await readJson(upstream), upstream.status);
  } catch {
    return noStoreJson({ message: "Shiprocket is temporarily unavailable." }, 503);
  }
}
