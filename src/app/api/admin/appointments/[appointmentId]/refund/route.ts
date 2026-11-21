import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, backendUrl, noStoreJson, readJson } from "../../../../_lib/backend";

type RouteContext = { params: Promise<{ appointmentId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return noStoreJson({ message: "Sign in to request an appointment refund." }, 401);
  const { appointmentId } = await params;
  let body: unknown;
  try { body = await request.json(); } catch { return noStoreJson({ message: "Send refund details as JSON." }, 400); }
  try {
    const upstream = await fetch(backendUrl(`/api/v1/admin/appointments/${encodeURIComponent(appointmentId)}/refund`), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return noStoreJson(await readJson(upstream), upstream.status, upstream);
  } catch {
    return noStoreJson({ message: "Appointment refund service is temporarily unavailable." }, 503);
  }
}
