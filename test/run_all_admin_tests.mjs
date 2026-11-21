import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const testFiles = [
  'test/api_cache.test.mjs',
  'test/admin_request_optimization.test.mjs',
  'test/admin_auth_workflow.test.mjs',
  'test/patient_records_workflow.test.mjs',
  'test/patient_accounts_ui.test.mjs',
  'test/appointment_bookings_workflow.test.mjs',
  'test/order_fulfillment_workflow.test.mjs',
  'test/product_catalog_workflow.test.mjs',
  'test/product_editor_publish.test.mjs',
  'test/content_updates_workflow.test.mjs',
  'test/reports_and_analytics_workflow.test.mjs',
  'test/routes_and_pages_verification.test.mjs',
  'test/admin_production_regressions.test.mjs',
  'test/admin_audit_ui_regressions.test.mjs',
  'test/admin_product_multipart_proxy.test.mjs',
  'test/admin_clinical_report_upload_proxy.test.mjs',
  'test/admin_my_reports_proxy.test.mjs',
  'test/e2e_browser_audit.test.mjs',
];

const adminRoot = path.resolve(__dirname, '..');
const backendRoot = path.resolve(adminRoot, '..', 'backend');
const backendEntry = path.join(backendRoot, 'src', 'server.js');
const viteEntry = path.join(adminRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const testJwtSecret = randomBytes(32).toString('hex');

async function findFreePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function startService(command, args, cwd, env) {
  const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const output = [];
  const remember = (chunk) => {
    output.push(chunk.toString());
    if (output.join('').length > 12000) output.splice(0, output.length - 1);
  };
  child.stdout.on('data', remember);
  child.stderr.on('data', remember);
  child.recentOutput = () => output.join('').slice(-4000);
  return child;
}

async function waitForUrl(url, child, label, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${label} exited before becoming ready.\n${child.recentOutput()}`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
      lastError = new Error(`${label} returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`${label} did not become ready at ${url}: ${lastError?.message || 'timeout'}\n${child.recentOutput()}`);
}

async function stopService(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve) => {
    const forceStop = setTimeout(() => child.kill('SIGKILL'), 3000);
    child.once('exit', () => {
      clearTimeout(forceStop);
      resolve();
    });
    child.kill('SIGINT');
  });
}

let backendService;
let adminService;
let totalPass = 0;
let totalFail = 0;
const results = [];

try {
  const backendPort = await findFreePort();
  const adminPort = await findFreePort();
  const backendUrl = `http://127.0.0.1:${backendPort}`;
  const adminUrl = `http://127.0.0.1:${adminPort}`;
  const backendEnv = {
    ...process.env,
    NODE_ENV: 'test',
    DRHAIR_DEPLOYMENT_ENV: 'test',
    JWT_SECRET: testJwtSecret,
    PORT: String(backendPort),
  };
  const adminEnv = {
    ...process.env,
    NODE_ENV: 'development',
    JWT_SECRET: testJwtSecret,
    ADMIN_TEST_BASE_URL: adminUrl,
    BACKEND_TEST_URL: backendUrl,
    DRHAIR_BACKEND_URL: backendUrl,
    ADMIN_PUBLIC_URL: adminUrl,
  };

  backendService = startService(process.execPath, [backendEntry], backendRoot, backendEnv);
  await waitForUrl(`${backendUrl}/health`, backendService, 'Isolated test backend');
  adminService = startService(process.execPath, [viteEntry, 'dev', '--host', '127.0.0.1', '--port', String(adminPort)], adminRoot, adminEnv);
  await waitForUrl(adminUrl, adminService, 'Local Admin test server');

console.log('================================================================');
console.log('🧪 Dr. Hair Admin Panel Full Automated Verification Suite');
console.log('================================================================\n');

for (const file of testFiles) {
  const testPath = path.resolve(adminRoot, file);
  console.log(`▶ Running ${file}...`);
  const startTime = Date.now();
  const exitCode = await new Promise((resolve) => {
    const proc = spawn(process.execPath, ['--test', '--experimental-strip-types', testPath], {
      stdio: 'inherit',
      env: adminEnv,
    });
    proc.on('error', () => resolve(1));
    proc.on('close', (code) => resolve(code ?? 1));
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

} catch (error) {
  totalFail += 1;
  console.error(`❌ [SETUP FAIL] ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await stopService(adminService);
  await stopService(backendService);
}

process.exitCode = totalFail > 0 ? 1 : 0;
