import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "dr-hair-admin",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-11-16",
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      BACKEND_SERVICE: bindings.worker({ worker: "dr-hair-backend" }),
      DRHAIR_BACKEND_URL: bindings.secret(),
      ADMIN_PUBLIC_URL: bindings.secret(),
    },
  }),
});
