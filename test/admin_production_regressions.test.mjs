import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

describe("Admin production regression guards", () => {
  it("does not claim a public deletion request was submitted without a submission endpoint", async () => {
    const page = await read("../src/app/delete-account/page.tsx");
    assert.doesNotMatch(page, /fetch\s*\(/);
    assert.doesNotMatch(page, /Deletion Request Received|logged in our compliance queue/i);
    assert.match(page, /does not currently submit or log deletion requests/i);
    assert.match(page, /public website does not submit deletion requests/i);
    assert.match(page, /authenticated deletion operation/i);
    assert.match(page, /clinical reports, treatment records, hair assessments, and appointments are retained/i);
    assert.match(page, /support@drhair\.in/i);
    assert.doesNotMatch(page, /Firebase|MongoDB|Cloudflare|NMC|CGST|7 business days|7 working days|7-day|within 24 hours|offline clinical safe|purge cycle/i);
  });

  it("does not invent inventory for new or legacy products", async () => {
    const panel = await read("../src/features/commerce/components/products-panel.tsx");
    assert.match(panel, /stock:\s*0/);
    assert.match(panel, /stock:\s*product\.stock\s*\?\?\s*0/);
    assert.doesNotMatch(panel, /stock:\s*100|stock:\s*product\.stock\s*\?\?\s*100/);
  });

  it("requires confirmed parcel dimensions instead of silently applying sample shipping sizes", async () => {
    const panel = await read("../src/features/commerce/components/products-panel.tsx");
    assert.match(panel, /shippingProfile:\s*\{\s*weightKg:\s*0,\s*lengthCm:\s*0,\s*breadthCm:\s*0,\s*heightCm:\s*0\s*\}/);
    assert.match(panel, /Enter confirmed weight and parcel dimensions for every supply plan before saving/);
    assert.doesNotMatch(panel, /shippingProfile\?\.[A-Za-z]+\s*\|\|\s*(?:0\.25|15|10|5)/);
    assert.match(panel, /Confirmed parcel dimensions for this bundle/);
  });

  it("does not seed publishable clinical or benefit claims with fabricated evidence", async () => {
    const panel = await read("../src/features/commerce/components/products-panel.tsx");
    assert.doesNotMatch(panel, /SAMPLE_CLINICAL_CLAIMS|SAMPLE_BENEFITS|89%|93%|Insert Clinical Metrics|Use Hair Care Template/);
    assert.match(panel, /verified source/i);
    assert.match(panel, /source reference/i);
  });

  it("does not seed or suggest generic product doses or usage instructions", async () => {
    const panel = await read("../src/features/commerce/components/products-panel.tsx");
    assert.doesNotMatch(panel, /SAMPLE_USAGE_STEPS|Insert Dropper Regimen|1\s*ml|twice daily|massage for 2 minutes/i);
    assert.match(panel, /instructions exactly as stated on the approved product label/i);
    assert.match(panel, /instruction exactly as stated on approved label/i);
  });

  it("ingredient shortcuts do not preload concentrations or medical-effect claims", async () => {
    const panel = await read("../src/features/commerce/components/products-panel.tsx");
    const suggestions = panel.match(/const INGREDIENT_SUGGESTIONS:[\s\S]*?\n\];/)?.[0];
    assert.ok(suggestions, "Ingredient name shortcuts should remain available.");
    assert.doesNotMatch(suggestions, /concentration:\s*"[^"]+"|purpose:\s*"[^"]+"/);
    assert.match(panel, /<span>\{ing\.name\}<\/span>/);
    assert.doesNotMatch(panel, /Reactivates dormant hair stem cells|Inhibits DHT hormone|Natural DHT reduction|Stimulates dermal papilla|Stem cell activation|Follicle Stimulation/i);
    assert.doesNotMatch(panel, /Supports hair density|reduce shedding|Procapil \| 3%|Biotin \| 1%|Follicle activation|Keratin support/i);
  });
});
