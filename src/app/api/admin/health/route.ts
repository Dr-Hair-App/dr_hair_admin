import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, backendUrl, noStoreJson } from "@/app/api/_lib/backend";

export async function GET() {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return noStoreJson({ message: "Sign in to check backend status." }, 401);

  try {
    const response = await fetch(backendUrl("/health"), {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return noStoreJson({ available: response.ok }, response.ok ? 200 : 503);
  } catch {
    return noStoreJson({ available: false, message: "Backend health check failed." }, 503);
  }
}
