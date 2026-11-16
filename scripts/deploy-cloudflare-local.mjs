import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildOutput = path.join(projectRoot, '.cloudflare/output');
const uploadOutput = path.join(projectRoot, '.cloudflare/wrangler-upload');
const wranglerConfigPath = path.join(projectRoot, '.wrangler-admin-direct.jsonc');
const backendUrl = process.env.DRHAIR_BACKEND_URL || 'https://dr-hair-backend-production.drhair-app.workers.dev';
const adminUrl = process.env.ADMIN_PUBLIC_URL || 'https://dr-hair-admin.drhair-app.workers.dev';

const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: projectRoot, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
};

const workerConfig = {
  $schema: './node_modules/wrangler/config-schema.json',
  name: 'dr-hair-admin',
  main: './.cloudflare/wrangler-upload/v0/workers/default/bundle/index.js',
  compatibility_date: '2026-11-16',
  compatibility_flags: ['nodejs_compat', 'nodejs_compat_populate_process_env'],
  assets: {
    directory: './.cloudflare/wrangler-upload/v0/workers/default/assets',
    binding: 'ASSETS',
    html_handling: 'none',
    not_found_handling: 'none',
    run_worker_first: ['/*', '!/_next/static/*', '!/*/_next/static/*'],
  },
  vars: {
    DRHAIR_BACKEND_URL: backendUrl,
    ADMIN_PUBLIC_URL: adminUrl,
  },
};

let movedBuildOutput = false;
try {
  run('npx', ['cf', 'build']);
  if (!fs.existsSync(buildOutput)) throw new Error('Cloudflare build output was not created.');
  if (fs.existsSync(uploadOutput)) throw new Error('A previous deploy left upload output in place.');

  fs.renameSync(buildOutput, uploadOutput);
  movedBuildOutput = true;
  fs.writeFileSync(wranglerConfigPath, `${JSON.stringify(workerConfig, null, 2)}\n`);
  run('npx', ['wrangler', 'deploy', '--config', '.wrangler-admin-direct.jsonc']);
} finally {
  if (movedBuildOutput && fs.existsSync(uploadOutput) && !fs.existsSync(buildOutput)) {
    fs.renameSync(uploadOutput, buildOutput);
  }
  if (fs.existsSync(wranglerConfigPath)) fs.unlinkSync(wranglerConfigPath);
}
