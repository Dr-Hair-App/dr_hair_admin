import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { describe, it } from "node:test";
import { forwardAdminMediaUpload } from "../src/app/api/admin/media/upload/forward-media-upload.js";

describe("admin multipart media upload proxy", () => {
  it("streams synthetic multipart bytes and forwards auth, boundary, and purpose", async () => {
    let received;
    const server = createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      received = {
        method: request.method,
        headers: request.headers,
        body: Buffer.concat(chunks),
      };
      response.writeHead(201, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "success", bytes: received.body.length }));
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    try {
      const address = server.address();
      assert.ok(address && typeof address === "object");
      const form = new FormData();
      form.append(
        "file",
        new Blob([Buffer.from("synthetic-image-payload")], { type: "image/png" }),
        "synthetic.png",
      );
      const request = new Request("http://admin.local/api/admin/media/upload", {
        method: "POST",
        headers: { "X-Media-Purpose": "product" },
        body: form,
      });

      const upstream = await forwardAdminMediaUpload(
        request,
        "synthetic-admin-token",
        (path, init) => fetch(`http://127.0.0.1:${address.port}${path}`, init),
      );

      assert.equal(upstream.status, 201);
      assert.deepEqual(await upstream.json(), {
        status: "success",
        bytes: received.body.length,
      });
      assert.equal(received.method, "POST");
      assert.equal(received.headers.authorization, "Bearer synthetic-admin-token");
      assert.equal(received.headers["x-media-purpose"], "product");
      assert.match(received.headers["content-type"], /^multipart\/form-data; boundary=/);
      assert.match(received.body.toString(), /name="file"; filename="synthetic\.png"/);
      assert.ok(received.body.includes(Buffer.from("synthetic-image-payload")));
    } finally {
      server.close();
      await once(server, "close");
    }
  });
});
