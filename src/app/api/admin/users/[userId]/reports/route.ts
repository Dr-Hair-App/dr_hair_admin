import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, fetchBackend, noStoreJson, readJson } from "../../../../_lib/backend";
import { forwardClinicalReportUpload, getClinicalReportUploadToken } from "./forward-clinical-report-upload.js";

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
  const token = getClinicalReportUploadToken(cookieToken, authHeader);
  if (!token) return noStoreJson({ message: "Sign in to upload a patient report." }, 401);

  const { userId } = await params;
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return noStoreJson({ message: "Upload a report as multipart form data." }, 400);
  }

  try {
    const upstream = await forwardClinicalReportUpload(request, userId, token, fetchBackend);
    return noStoreJson(await readJson(upstream), upstream.status);
  } catch {
    return noStoreJson({ message: "The report storage service is temporarily unavailable." }, 503);
  }
}
