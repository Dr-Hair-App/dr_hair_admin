import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const testFiles = [
  'test/admin_auth_workflow.test.mjs',
  'test/patient_records_workflow.test.mjs',
  'test/appointment_bookings_workflow.test.mjs',
  'test/order_fulfillment_workflow.test.mjs',
  'test/product_catalog_workflow.test.mjs',
  'test/content_updates_workflow.test.mjs',
  'test/reports_and_analytics_workflow.test.mjs',
  'test/routes_and_pages_verification.test.mjs',
  'test/admin_production_regressions.test.mjs',
  'test/admin_media_upload_proxy.test.mjs',
  'test/e2e_browser_audit.test.mjs',
];

console.log('================================================================');
console.log('🧪 Dr. Hair Admin Panel Full Automated Verification Suite');
console.log('================================================================\n');

let totalPass = 0;
let totalFail = 0;
const results = [];

for (const file of testFiles) {
  const testPath = path.resolve(__dirname, '..', file);
  console.log(`▶ Running ${file}...`);
  
  const startTime = Date.now();
  const exitCode = await new Promise((resolve) => {
    const proc = spawn(process.execPath, ['--test', testPath], {
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'development' },
    });
    proc.on('close', resolve);
  });
  const duration = Date.now() - startTime;

  if (exitCode === 0) {
    totalPass++;
    results.push({ file, status: 'PASSED', duration: `${duration}ms` });
    console.log(`✅ [PASS] ${file} (${duration}ms)\n`);
  } else {
    totalFail++;
    results.push({ file, status: 'FAILED', duration: `${duration}ms`, code: exitCode });
    console.error(`❌ [FAIL] ${file} (Exit code: ${exitCode})\n`);
  }
}

console.log('================================================================');
console.log('📊 AUTOMATED VERIFICATION RESULTS SUMMARY:');
console.log('================================================================');
results.forEach((r, idx) => {
  const icon = r.status === 'PASSED' ? '✅' : '❌';
  console.log(`${idx + 1}. ${icon} ${r.file} - ${r.status} (${r.duration})`);
});
console.log('----------------------------------------------------------------');
console.log(`Total Suites: ${testFiles.length} | Passed: ${totalPass} | Failed: ${totalFail}`);
console.log('================================================================\n');

if (totalFail > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
