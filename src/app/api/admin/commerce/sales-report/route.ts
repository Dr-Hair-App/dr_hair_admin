import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, backendUrl, noStoreJson, readJson } from "../../../_lib/backend";

export async function GET(request: Request) {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return noStoreJson({ message: "Sign in to view sales reporting." }, 401);
  const query = new URL(request.url).searchParams;
  const period = query.get("period") || "month";
  if (!["week", "month", "year"].includes(period)) {
    return noStoreJson({ message: "Choose week, month, or year for the sales report." }, 400);
  }
  try {
    const upstream = await fetch(backendUrl(`/api/v1/admin/commerce/sales-report?period=${period}`), {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    return noStoreJson(await readJson(upstream), upstream.status);
  } catch {
    return noStoreJson({ message: "Commerce reporting is temporarily unavailable." }, 503);
  }
}
