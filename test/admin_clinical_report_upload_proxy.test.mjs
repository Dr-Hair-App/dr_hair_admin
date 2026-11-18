import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { forwardClinicalReportUpload, getClinicalReportUploadToken } from "../src/app/api/admin/users/[userId]/reports/forward-clinical-report-upload.js";

describe("Admin clinical report upload proxy", () => {
  it("forwards auth, the exact multipart boundary and unconsumed request stream to the backend service", async () => {
    const form = new FormData();
    form.append("title", "Synthetic report");
    form.append("visibility", "Shared");
    form.append("patient_consent_confirmed", "true");
    form.append("file", new Blob(["synthetic report bytes"], { type: "application/pdf" }), "synthetic.pdf");
    const request = new Request("http://admin.local/api/admin/users/42/reports", { method: "POST", body: form });
    const originalStream = request.body;
    const originalContentType = request.headers.get("content-type");
    let backendRequest;
    let backendBytes;

    const backendService = {
      async fetch(path, init) {
        backendRequest = { path, init, sameStream: init.body === originalStream };
        const chunks = [];
        for await (const chunk of init.body) chunks.push(Buffer.from(chunk));
        backendBytes = Buffer.concat(chunks);
        return Response.json({ status: "success", data: { id: "synthetic-report-id" } }, { status: 201 });
      },
    };

    const response = await forwardClinicalReportUpload(
      request,
      "42",
      "synthetic-admin-token",
      (path, init) => backendService.fetch(path, init),
    );
    const payload = await response.json();

    assert.equal(response.status, 201);
    assert.deepEqual(payload, { status: "success", data: { id: "synthetic-report-id" } });
    assert.equal(backendRequest.path, "/api/v1/admin/users/42/reports");
    assert.equal(backendRequest.init.method, "POST");
    assert.equal(backendRequest.init.headers.Authorization, "Bearer synthetic-admin-token");
    assert.equal(backendRequest.init.headers.Accept, "application/json");
    assert.equal(backendRequest.init.headers["Content-Type"], originalContentType);
    assert.match(backendRequest.init.headers["Content-Type"], /^multipart\/form-data; boundary=/);
    assert.equal(backendRequest.sameStream, true);
    assert.equal(backendRequest.init.duplex, "half");
    const bodyText = backendBytes.toString();
    assert.match(bodyText, /name="title"/);
    assert.match(bodyText, /Synthetic report/);
    assert.match(bodyText, /name="patient_consent_confirmed"/);
    assert.match(bodyText, /filename="synthetic\.pdf"/);
    assert.match(bodyText, /synthetic report bytes/);
  });

  it("requires a usable session token and accepts the same-origin bearer fallback", () => {
    assert.equal(getClinicalReportUploadToken(undefined, null), undefined);
    assert.equal(getClinicalReportUploadToken("cookie-session", "Bearer header-session"), "cookie-session");
    assert.equal(getClinicalReportUploadToken(undefined, "Bearer header-session"), "header-session");
    assert.equal(getClinicalReportUploadToken(undefined, "Basic invalid"), undefined);
    assert.equal(getClinicalReportUploadToken(undefined, "Bearer   "), undefined);
  });
});
