import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { describe, it } from "node:test";
import { forwardAdminProductJson, forwardAdminProductMultipart } from "../src/app/api/admin/products/forward-product-multipart.js";

describe("admin product multipart proxy", () => {
  for (const method of ["POST", "PATCH"]) {
    it(`streams product metadata and repeated files unchanged for ${method}`, async () => {
      let received;
      const server = createServer(async (request, response) => {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        received = { method: request.method, headers: request.headers, body: Buffer.concat(chunks) };
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ status: "success" }));
      });
      server.listen(0, "127.0.0.1");
      await once(server, "listening");

      try {
        const address = server.address();
        assert.ok(address && typeof address === "object");
        const form = new FormData();
        form.set("product", JSON.stringify({ name: "Test product", media: [{ pending_upload: true, upload_index: 0 }] }));
        form.append("files", new Blob(["optimized-image"], { type: "image/webp" }), "product.webp");
        form.append("files", new Blob(["second-image"], { type: "image/png" }), "second.png");
        const request = new Request("http://admin.local/api/admin/products", { method, body: form });

        const upstream = await forwardAdminProductMultipart(
          request,
          "/api/v1/admin/products/p-1",
          method,
          "synthetic-admin-token",
          (path, init) => fetch(`http://127.0.0.1:${address.port}${path}`, init),
        );

        assert.equal(upstream.status, 200);
        assert.equal(received.method, method);
        assert.equal(received.headers.authorization, "Bearer synthetic-admin-token");
        assert.match(received.headers["content-type"], /^multipart\/form-data; boundary=/);
        const payload = received.body.toString();
        assert.match(payload, /name="product"/);
        assert.match(payload, /name="files"; filename="product\.webp"/);
        assert.match(payload, /name="files"; filename="second\.png"/);
        assert.ok(received.body.includes(Buffer.from("optimized-image")));
        assert.ok(received.body.includes(Buffer.from("second-image")));
      } finally {
        server.close();
        await once(server, "close");
      }
    });
  }

  it("preserves metadata-only JSON PATCH for archive actions", async () => {
    let received;
    const result = await forwardAdminProductJson(
      { status: "archived" },
      "/api/v1/admin/products/p-1",
      "PATCH",
      "synthetic-admin-token",
      async (path, init) => {
        received = { path, init };
        return new Response(JSON.stringify({ status: "success" }), { status: 200 });
      },
    );
    assert.equal(result.status, 200);
    assert.equal(received.path, "/api/v1/admin/products/p-1");
    assert.equal(received.init.method, "PATCH");
    assert.equal(received.init.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(received.init.body), { status: "archived" });
  });

  it("preserves legacy JSON product creation callers", async () => {
    let received;
    const result = await forwardAdminProductJson(
      { name: "Legacy product" },
      "/api/v1/admin/products",
      "POST",
      "synthetic-admin-token",
      async (path, init) => {
        received = { path, init };
        return new Response(JSON.stringify({ status: "success" }), { status: 201 });
      },
    );
    assert.equal(result.status, 201);
    assert.equal(received.path, "/api/v1/admin/products");
    assert.equal(received.init.method, "POST");
    assert.equal(received.init.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(received.init.body), { name: "Legacy product" });
  });
});
