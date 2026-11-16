# Dr. Hair Admin Panel

TypeScript admin panel for the Dr. Hair mobile app. It runs on Cloudflare Workers through vinext.

## Start locally

```bash
npm install
npm run dev
```

Open `http://localhost:3001`. Admin sign-in uses the backend email/password flow. Set `DRHAIR_BACKEND_URL` to the API origin and `ADMIN_PUBLIC_URL` to this panel's origin before deployment.

## Structure

```text
src/
  app/                         # Next.js entry point and global styling
  features/
    admin-users/               # Super Admin team and audit screens
    app-management/            # Content, notifications, updates, feature controls
    commerce/                  # Products, orders, coupons, referrals
    content/                   # Banners, videos, patient stories
    dashboard/                 # Role-aware workspace overview
    feature-controls/           # App feature and admin-module controls
    operations/                # Patients, reports, orders, clinic appointments
    shared/
      components/              # Shell, sign-in, dialogs, reusable UI
      lib/                     # Access rules and sample records
      types/                   # Shared role, record, and feature types
```

Feature screens stay grouped by domain. Shared UI and role/access rules live in `shared/`; sample records live behind `demo-data.ts`. Server Route Handlers proxy authenticated requests so JWTs remain in an HttpOnly cookie.

## Demo behavior

- Super Admin can see all Admin workspace areas plus Admin Users, App Management controls, and Audit Log.
- Super Admin can invite demo admins, assign modules and actions, edit access, and suspend/reactivate demo accounts.
- App feature controls update local demo state. Admin Panel module controls also update which workspace sections appear in the Admin preview.
- Clinic appointments are browser previews from staff and sample app sources. The Flutter app has a separate local physical visit request flow for Dr. Jai Bansal; requests do not sync yet.
- Content/product forms, search, status filters, and record detail dialogs use local sample data.
- The current backend admin role has no granular server-side permissions, so the connected panel exposes the patient directory as read-only. Other operational screens remain UI previews and do not persist to the backend.
- Admin image uploads use `/api/admin/media/upload` and the backend's private R2 bucket. Video content is added as a YouTube URL and streams from YouTube.

## Cloudflare deployment

GitHub Actions runs lint and a production build on pull requests and `main` pushes. Deployments are manual; staging is the default target and production requires the explicit `CLOUDFLARE_PRODUCTION_DEPLOY_ENABLED=true` environment variable. Configure `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `DRHAIR_BACKEND_URL`, and `ADMIN_PUBLIC_URL` as GitHub environment secrets before deployment.

## Brand

The interface uses the Flutter app palette: navy `#1A365D`, teal `#0D9488`, canvas `#F7F9FC`, and border `#E2E8F0`.
