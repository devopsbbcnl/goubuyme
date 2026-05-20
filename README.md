# GoBuyMe — Project Documentation

## Overview

**GoBuyMe** is a Nigerian food and goods delivery super-app, similar in concept to Uber Eats or DoorDash but built specifically for the Nigerian market. It connects three types of users on a single platform — **customers** who order food and goods, **vendors** (restaurants and shops) who fulfill those orders, and **riders** (delivery agents) who transport them. The system is built as three separate applications sharing one backend API.

---

## The Three Apps

### 1. Mobile App (Customer · Vendor · Rider)
A single React Native / Expo app that serves all three user roles. When a new user signs up, they choose their role — customer, vendor, or rider — and are taken into a completely different tab experience tailored to that role. All three roles live in one app binary.

### 2. Admin Dashboard (Web)
A Next.js web application used internally by the GoBuyMe operations team. It gives admins visibility into all platform activity — vendors, riders, customers, orders, payouts, and system settings.

### 3. Backend API
An Express + TypeScript REST API with a PostgreSQL database. It powers all three apps and also handles real-time communication (Socket.io), scheduled financial jobs, and third-party integrations (payments, email, push notifications).

---

## How It Works End-to-End

### A typical order lifecycle:

1. **Customer** opens the app, browses vendors near them, adds items to cart, and checks out
2. Customer pays via **Paystack** (Nigeria's primary payment gateway) — card, bank transfer, or pay-on-delivery
3. The **order is broadcast** to the vendor in real time via Socket.io
4. The **vendor** accepts the order, prepares it, and marks it ready for pickup
5. A nearby **rider** who is online sees the job appear on their Available Jobs screen and accepts it
6. The rider picks up the order and begins delivery — their **GPS location streams live** to the customer's tracking map
7. On delivery, the order is marked complete and the customer can rate the experience
8. At **11:30 AM daily**, an automated job processes all completed orders and calculates payouts for vendors and riders

---

## Core Features by Role

### Customer
- **Discovery** — Browse vendors by category, search by name or dish, view trending results
- **Vendor detail** — Full menu with photos, pricing, drink/option selections, opening hours
- **Cart & Checkout** — Qty controls, delivery notes, multiple saved addresses, three payment options (card, bank transfer, pay on delivery)
- **Live order tracking** — Interactive map showing the rider's real-time GPS position, 5-step order progress bar (placed → confirmed → preparing → on the way → delivered)
- **Order history** — Full history with status, items, and amounts
- **Favorites** — Save preferred restaurants
- **Offers & promos** — Promo codes and platform-wide offers
- **Referrals** — Invite friends, earn free delivery credits
- **Profile management** — Edit name, phone, avatar, saved addresses, notification preferences, dark/light mode

### Vendor (Restaurant or Shop)
- **Onboarding** — After signup, vendors complete a profile setup: business logo, cover photo, description, opening/closing hours, commission tier, and KYC identity document upload (NIN, Driver's License, or Passport)
- **Dashboard** — Open/close store toggle, daily stats (orders, revenue, avg. order value), recent order cards with Accept / Reject / Ready actions
- **Menu management** — Full CRUD for menu items with image upload to Cloudinary, option groups (e.g. swallow choices)
- **Order management** — List view of all orders filterable by status
- **Promotions** — Tier-gated promotional banner cards shown in the customer home carousel (TIER_2 only — see Commission Tiers below)
- **Earnings** — Breakdown of revenue per period
- **KYC & Approval** — Vendors are not active until the admin team approves their profile and documents

### Rider (Delivery Agent)
- **Online/Offline toggle** — Rider switches on to start receiving jobs; animated ripple effect on the toggle indicates active status
- **Available jobs** — List of nearby orders ready for pickup, showing vendor name, pickup/dropoff route, and estimated earnings
- **Active delivery** — Live interactive map with the delivery route, animated progress bar, and GPS streaming back to the customer
- **Earnings** — Today / week / month / all-time breakdown, weekly bar chart, payout history, pending payout balance
- **Profile** — Vehicle type, plate number, stats, inline editing
- **KYC & Approval** — Riders submit NIN, selfie, vehicle photo, and guarantor information; admin must approve before they can go online

### Admin (Internal Team)
Three admin roles with different access levels:
- **SUPER_ADMIN** — Full platform control
- **OPERATIONS_ADMIN** — Vendor/rider approvals, order management
- **SUPPORT_ADMIN** — Read-only access to customer and order data

Admin capabilities:
- **Dashboard** — Platform KPIs: total orders, revenue, active vendors, active riders; charts and sparklines
- **Vendor management** — Approve/reject vendors, view documents, switch commission tiers
- **Rider management** — Approve/reject riders, view documents and online status
- **Order management** — Full order history filterable by status
- **Customer list** — Read-only customer directory
- **Payouts** — Payout batch summaries, manually trigger payouts, view per-vendor and per-rider amounts
- **Audit logs** — Full action log for compliance and dispute resolution
- **Platform settings** — Configure delivery fees, per-km rate, vendor search radius, commission rates, maintenance mode

---

## Commission Tiers

Vendors choose between two pricing models at signup (and can switch later):

| | TIER_1 — Starter | TIER_2 — Growth |
|---|---|---|
| Platform commission | 3% per order | 7.5% per order |
| Promotional cards | Not available | Unlocked |
| Typical use | New or small vendors | Established vendors wanting marketing |

**Promotional cards** are banner images shown in the customer home screen carousel. TIER_2 vendors can create up to one active promo card at a time (1080×580 px). Downgrading from TIER_2 to TIER_1 automatically deactivates all promo cards but preserves them.

---

## Technical Architecture

### Backend
- **Node.js + Express + TypeScript** — REST API on port 5000
- **PostgreSQL + Prisma ORM** — relational database with 20+ models
- **Socket.io** — two real-time namespaces: `/orders` (status updates) and `/riders` (GPS streaming)
- **JWT auth** — short-lived access tokens (15 min) + long-lived refresh tokens (30 days), stored securely on device
- **MFA/2FA** — optional two-factor authentication via TOTP (OTPLib)
- **Google OAuth** — social login option
- **node-cron** — scheduled daily payout batch at 11:30 AM

### Mobile App
- **Expo SDK 52 + Expo Router v4** — file-based navigation, supports iOS and Android
- **React Native 0.76 + TypeScript**
- **MapLibre** — open-source maps for live order tracking and active delivery screens (requires native build; gracefully mocked in Expo Go)
- **Socket.io client** — real-time order and location updates
- **Expo Secure Store** — encrypted JWT storage on device
- **Expo Notifications** — push notification support

### Admin Dashboard
- **Next.js 15 (App Router) + React 19 + TypeScript**
- **Deployed on Netlify**
- No third-party UI library — pure custom components using the brand design system

### Third-Party Integrations

| Service | Purpose |
|---|---|
| **Paystack** | Payment processing (Nigeria) — card, bank transfer, webhooks |
| **Cloudinary** | Image storage — vendor logos, covers, menu photos, promo banners, KYC photos |
| **Resend** | Transactional email — welcome, OTP verification, notifications |
| **Expo Push** | Mobile push notifications for order/delivery/earnings events |
| **Sentry** | Error monitoring and crash reporting |
| **MapTiler** | Map tile provider for MapLibre |

---

## Security & Compliance

- All passwords hashed with bcrypt (never stored in plain text)
- Paystack webhook signatures verified server-side before processing
- Rate limiting on all API endpoints (brute-force protection)
- Helmet.js for HTTP security headers
- CORS configured per environment
- TIER_1 promotion restrictions enforced at the API level (not just the UI)
- Admin role middleware — each admin endpoint checks the specific role required
- **Privacy Policy and Terms of Service** are in-app, written to comply with Nigeria's **NDPR/NDPA** (effective May 1, 2025)
- Audit log tracks every significant admin action for compliance

---

## What Makes It Nigerian-Specific

- **Paystack** — the dominant payment gateway in Nigeria, supporting local bank transfers, USSD, and cards
- **NDPR/NDPA compliance** — Nigeria Data Protection Regulation / Act
- **Naira (₦) currency** — all fees, earnings, and commissions are in Naira
- **Local license types** — vendors can submit NAFDAC certificates, Pharmacist licenses, Food Handler permits as part of KYC
- **Delivery fee structure** — base fee (₦500) + per-km rate (₦100) + cap (₦3,000), tuned for Nigerian urban distances

---

## Project Status

Phase 1 is complete. All three apps are fully built and functional:

- All customer screens (20+ screens)
- All vendor screens including tier-gated promotions
- All rider screens including live GPS delivery
- Full backend API with all routes, services, and scheduled jobs
- Complete admin dashboard with all management pages
- EAS build configuration for iOS/Android releases
- Netlify deployment configuration for the admin dashboard
- CVE patches applied (Next.js CVE-2025-55182)
