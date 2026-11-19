import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { forwardMyAdminReports } from "../src/app/api/admin/reports/mine/forward-my-reports.js";

describe("Admin own-report list BFF", () => {
  it("forwards auth to the scoped backend route and preserves its response", async () => {
    let call;
    const backendService = {
      async fetch(path, init) {
        call = { path, init };
        return Response.json({ status: "success", data: { reports: [{ id: "only-my-upload" }] } });
      },
    };
    const response = await forwardMyAdminReports("synthetic-admin-token", (path, init) => backendService.fetch(path, init));
    assert.equal(call.path, "/api/v1/admin/reports/mine");
    assert.equal(call.init.method, "GET");
    assert.equal(call.init.headers.Authorization, "Bearer synthetic-admin-token");
    assert.equal(call.init.cache, "no-store");
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(payload.data.reports.map((report) => report.id), ["only-my-upload"]);
  });
});
