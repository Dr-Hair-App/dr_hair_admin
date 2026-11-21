import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, fetchBackend, noStoreJson, readJson } from "../../../_lib/backend";
import { forwardMyAdminReports } from "./forward-my-reports.js";

export async function GET() {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return noStoreJson({ message: "Sign in to view your uploaded reports." }, 401);

  try {
    const upstream = await forwardMyAdminReports(token, fetchBackend);
    return noStoreJson(await readJson(upstream), upstream.status, upstream);
  } catch {
    return noStoreJson({ message: "Clinical reports service is temporarily unavailable." }, 503);
  }
}
