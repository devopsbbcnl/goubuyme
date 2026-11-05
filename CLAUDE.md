# GoBuyMe — Monorepo Root

GoBuyMe is a Nigerian food & goods delivery super-app. Three independent apps share one backend.

## Repository layout

```
gobuyme6/
├── backend/                ← Express + TypeScript + Prisma + PostgreSQL API (port 5000)
├── gobuyme-mobile/         ← Expo/React Native customer · vendor · rider app
├── gobuyme-admin-nextjs/   ← Next.js 15 admin dashboard (port 3000)
├── photos/                 ← Static image assets
├── uploads/                ← Runtime file uploads
└── GBM_MCP.txt             ← Master product spec (brand, design system, coding standards)
```

Each sub-app has its own `CLAUDE.md`:
- `gobuyme-mobile/CLAUDE.md` — screens, contexts, navigation, MapLibre quirks, running instructions
- `gobuyme-admin-nextjs/CLAUDE.md` — pages, design tokens, running instructions

---

## Design system (shared across all apps)

```
Primary orange:  #FF521B
Dark bg:         #0E0E0E   surfaces: #1A1A1A / #222 / #2A2A2A
Light bg:        #F7F5F3   surfaces: #FFF / #F2F0EE / #E8E5E2
Border radius:   4px (all rectangles) · 999px (pills) · 9999px (circles)
Font:            Plus Jakarta Sans 400 / 500 / 600 / 700 / 800
```

---

## Backend

**Location:** `backend/`  
**Stack:** Node.js · TypeScript · Express v4 · Prisma v5 · PostgreSQL · Socket.io v4

### Running locally

```bash
cd backend
npm run dev           # ts-node-dev with hot reload on port 5000
npx prisma studio     # DB browser at localhost:5555
npx prisma migrate dev  # apply pending migrations
```

### Key libraries

| Purpose | Library |
|---|---|
| ORM | Prisma v5 |
| Auth | JWT (access 15 m / refresh 30 d) + bcryptjs + OTPLib MFA |
| OAuth | Google OAuth 2.0 |
| Payments | Paystack |
| Email | Resend |
| File storage | Cloudinary |
| Real-time | Socket.io |
| Validation | Joi |
| Logging | Winston + Daily Rotate File |
| Monitoring | Sentry v8 |
| Push notifications | Expo Server SDK |
| Scheduled jobs | node-cron (daily payout batch 11:30 AM) |

### Environment variables (`backend/.env`)

```
PORT=5000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:password123@localhost:5432/gobuyme_db
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
PAYSTACK_SECRET_KEY=...
PAYSTACK_PUBLIC_KEY=...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
RESEND_API_KEY=...
DELIVERY_BASE_FEE=500
DELIVERY_PER_KM_RATE=100
DELIVERY_MAX_FEE=3000
RIDER_NET_CUT=0.85
PLATFORM_CUT=0.15
COMMISSION_TIER_1_RATE=0.03
COMMISSION_TIER_2_RATE=0.075
PAYOUT_CRON_SCHEDULE="30 11 * * *"
DEFAULT_VENDOR_RADIUS_KM=10
```

### API route groups

| Prefix | Count | Auth |
|---|---|---|
| `POST /api/v1/auth/*` | 13 endpoints | Public / JWT |
| `GET/PATCH /api/v1/vendors/*` | 30+ endpoints | Public / Vendor JWT |
| `/api/v1/*` (customer) | 8 endpoints | Customer JWT |
| `/api/v1/orders/*` | 3 endpoints | Customer JWT |
| `/api/v1/riders/*` | 12 endpoints | Rider JWT |
| `/api/v1/payments/*` | 4 endpoints | JWT |
| `/api/v1/admin/*` | 30+ endpoints | SUPER_ADMIN / OPERATIONS_ADMIN / SUPPORT_ADMIN |
| `/api/v1/notifications/*` | 2 endpoints | JWT |
| `/api/v1/offers/*` | 2 endpoints | SUPER_ADMIN |

**Socket.io namespaces:**
- `/orders` — order status updates (real-time to customer)
- `/riders` — rider GPS location streaming

### Database models (Prisma)

Core: `User` · `Customer` · `Vendor` · `Rider` · `MenuItem` · `Order` · `OrderItem`

Financial: `Earning` · `VendorPayout` · `PayoutBatch` · `PayoutAccount`

Supporting: `Cart` · `CartItem` · `Address` · `VendorPromotion` · `VendorDocument` ·
`VendorLicense` · `RiderDocument` · `Referral` · `Offer` · `AuditLog` ·
`Notification` · `EmailOtp` · `PlatformSetting`

**Key enums:** `Role` · `CommissionTier (TIER_1/TIER_2)` · `ApprovalStatus` · `OrderStatus` ·
`PaymentStatus` · `PaymentMethod` · `PayoutStatus` · `DocumentType/Status` ·
`LicenseType/Status` · `VerificationBadge` · `VendorCategory`

### Commission tiers

- **TIER_1** — 3% platform commission, no vendor promotions, lower cost entry
- **TIER_2** — 7.5% platform commission, vendor promotion cards unlocked
- Tier switch: `PATCH /vendors/me/tier` — downgrade to TIER_1 auto-deactivates all promo cards

### Payout model

- Rider cut: 85% of delivery fee per order
- Platform cut: 15% of delivery fee
- Daily batch job runs at 11:30 AM via node-cron
- `PayoutBatch` records aggregate daily payouts for vendors and riders

---

## Mobile app

**Location:** `gobuyme-mobile/`  
See `gobuyme-mobile/CLAUDE.md` for full screen inventory, context providers, navigation rules, and MapLibre compatibility notes.

**Quick start:**
```bash
cd gobuyme-mobile
npm install
npx expo start --clear      # Expo Go (maps show placeholder)
npm run android             # Native build (real MapLibre maps)
```

**Environment variables (`gobuyme-mobile/.env`):**
```
EXPO_PUBLIC_API_URL=http://<LAN-IP>:5000/api/v1
EXPO_PUBLIC_SOCKET_URL=http://<LAN-IP>:5000
EXPO_PUBLIC_MAPTILER_KEY=...
EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME=...
EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET=...
EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY=...
```

Use the machine's LAN IP (e.g. `192.168.0.187`), not `localhost` — Android devices cannot reach `localhost`.

### Role routing after login

| Role | Incomplete profile | Not approved | Approved |
|---|---|---|---|
| Customer | — | — | `/(customer)` |
| Vendor | `/vendor-complete-profile` | `/account-not-active` | `/(vendor)` |
| Rider | — | `/account-not-active` | `/(rider)` |

---

## Admin dashboard

**Location:** `gobuyme-admin-nextjs/`  
See `gobuyme-admin-nextjs/CLAUDE.md` for page inventory and component patterns.

**Quick start:**
```bash
cd gobuyme-admin-nextjs
npm install
npm run dev     # → http://localhost:3000
```

**Environment variables (`gobuyme-admin-nextjs/.env.local`):**
```
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
BACKEND_API_URL=http://localhost:5000/api/v1
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=...
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=...
```

**Admin roles:**
- `SUPER_ADMIN` — full access including settings, offers, payout triggers
- `OPERATIONS_ADMIN` — vendor/rider approvals, order management
- `SUPPORT_ADMIN` — read-only customer/order views

---

## Completed features (Phase 1)

### Auth & onboarding
- Splash → onboarding (3 slides) → role select → register → OTP verify → role tab group
- Google OAuth, JWT access + refresh tokens, MFA/2FA via OTPLib
- Vendor post-signup complete-profile flow (cover/logo, hours, tier selection, document upload, menu seed)
- Rider/vendor approval gate (`/account-not-active` with polling)

### Customer app
- Home screen with auto-scrolling promo carousel (vendor promos + static platform cards)
- Vendor discovery, search, vendor detail with menu tabs
- Cart with qty controls, checkout (address + 3 payment methods), Paystack WebView
- Live order tracking (MapLibre + Socket.io), 5-step progress bar
- Saved addresses CRUD, order history, favorites
- Profile, edit profile (avatar upload), notifications toggles, settings (dark/light)
- Offers & promos, rate-app screen, privacy/security (change password, delete account)
- Full privacy policy + terms of service (NDPR/NDPA, effective May 1 2025)

### Vendor app
- Dashboard: open/close toggle, stat grid, bar chart, order cards (Accept/Reject/Ready)
- Menu CRUD with Cloudinary image upload
- Order management with status filters
- Edit profile (business info + cover image)
- Promotions: tier-gated promo card system — TIER_1 sees locked UI, TIER_2 can create/toggle/delete; one active at a time; image spec guide (1080×580 px, 1.86:1, 60 px safe zone)
- Earnings (via dashboard tab)

### Rider app
- Dashboard: online/offline toggle with animated ripple, stat grid, bar chart, recent deliveries
- Available jobs list with vendor photo strip + route dots
- Active delivery with MapLibre live map, animated progress bar, GPS streaming (Socket.io)
- Profile with inline edit (name / phone / vehicle / plate)
- Earnings: today/week/month/all-time, weekly bar chart, payout history, pending payout banner
- Notifications toggles, settings (dark mode, delivery prefs)

### Admin dashboard (Next.js)
- Dashboard overview (KPI cards, sparklines, bar chart)
- Vendor management (approval/tier controls)
- Rider management
- Order management (filterable by status)
- Customer list (read-only)
- Payouts (summary cards + table)
- Audit log viewer
- Platform settings (fees, rates)
- Three admin roles with scoped permissions

### Backend services
- Commission calculation (TIER_1 3%, TIER_2 7.5%)
- Delivery fee calculation by distance
- Daily payout batch (node-cron 11:30 AM)
- Referral credits (free delivery for successful referrals)
- Push notifications (Expo Server SDK)
- Transactional email (Resend: welcome, OTP, notifications)
- Vendor promotion public endpoint for customer carousel
- Audit logging
- KYC document upload for vendors and riders

---

## SMOIS — social media operations (admin module)

Internal workspace for the social media department, inside the admin console (`/smois`).
Backend: `/api/v1/admin/smois/*` (`routes/smois.routes.ts`, `controllers/smois/`, `services/smois/`).
Spec: `SMOIS_Detailed_PRD_v1.0.docx` (kept out of git; ask the owner for a copy).

- **Phase 1 is built:** accounts + assignments, content (brief + a version per platform account) with review/approval, calendar (drag to reschedule), publishing records, tasks (incl. recurring), activity log (CSV export), dashboard, in-app + email alerts.
- **Phase 2 is built except live connectors:** manually recorded metric snapshots and post readings (always labelled manual), growth/period comparison, KPI targets, staff scorecard + evaluations, weekly/monthly/quarterly/annual reports (draft from records, commentary, approval, CSV + print), integration-readiness page with a platform capability matrix. Pure rules live in `services/smois/analytics.ts` (unit-tested); DB aggregation in `insights.ts`.
- **Not built:** platform API connectors and sync jobs (need developer-app credentials and platform review), unified inbox, contacts, campaigns, social listening, competitor benchmarking, asset library, AI features. Accounts are `MANUAL`; publishing is a manual record. Never fake integrations or metrics: missing readings stay null and show as "Not recorded", never 0.
- **Individual targets** are only allowed for measures a person's own work decides (posts published, task rates, approval rate, report compliance), never shared audience growth.
- **Access:** `Role.SOCIAL_MEDIA` = SMOIS-only staff. Everyone else needs a `SmoisMember` row (super admins implicit). Capabilities live in `services/smois/workflow.ts` `can()`; routes use `smoisAuth(capability)`.
- **Rules to keep:** nobody approves their own submission (setting `allowSelfApproval`); material edits after approval return to review; managers only work on accounts they are currently assigned to.
- **Audit:** SMOIS activity is `AuditLog` rows with entity `Smois*`, append-only via DB trigger (UPDATE/DELETE raise). Test cleanup must `ALTER TABLE audit_logs DISABLE TRIGGER USER` first.
- Write new notifications through `notifyMany` (`controllers/smois/common.ts`); it handles in-app, push and the per-user email switch.

## Security notes

- All routes use Helmet + CORS
- Rate limiting via express-rate-limit
- Passwords hashed with bcryptjs
- JWT secrets in env (never in code)
- Paystack webhook signature verified server-side
- TIER_1 promo creation blocked at API level (403), not just UI
- Admin routes gated by role middleware (SUPER_ADMIN / OPERATIONS_ADMIN / SUPPORT_ADMIN)

---

## Deployment

| App | Target | Notes |
|---|---|---|
| Backend | Any Node host (Railway, Heroku, VPS) | Needs PostgreSQL + env vars |
| Mobile | EAS (Expo Application Services) | `eas build` for iOS/Android; `eas.json` configured |
| Admin | Netlify | `@netlify/plugin-nextjs` configured; `netlify.toml` present |
