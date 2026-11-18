import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendEnvPath = path.resolve(__dirname, '../../backend/.env');

if (fs.existsSync(backendEnvPath)) {
  const content = fs.readFileSync(backendEnvPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}
process.env.NODE_ENV = 'development';

const { TokenService } = await import('../../backend/src/shared/utils/token.service.js');

export const BASE_URL = 'http://localhost:3001';
export const BACKEND_URL = 'http://localhost:5001';

export function getSuperAdminToken(customClaims = {}) {
  return TokenService.generateToken({
    id: 'bootstrap:dr.hair@admin',
    email: 'dr.hair@admin',
    role: 'super_admin',
    name: 'Dr. Hair Super Admin',
    ...customClaims,
  });
}

export function getAdminToken(customClaims = {}) {
  return TokenService.generateToken({
    id: 'admin:test-staff',
    email: 'staff@drhairindia.com',
    role: 'admin',
    name: 'Clinic Staff Admin',
    permissions: ['patients.view', 'bookings.manage', 'orders.manage'],
    ...customClaims,
  });
}

export function getAuthHeaders(token) {
  return {
    Cookie: `drhair_admin_session=${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}
