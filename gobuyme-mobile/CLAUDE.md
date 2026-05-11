# GoBuyMe Mobile — Expo / React Native Project

## Stack
- **Expo SDK 52** + **Expo Router v4** (file-based routing)
- **React Native 0.76** / **React 18**
- **TypeScript** (strict, zero errors)
- **Plus Jakarta Sans** via `@expo-google-fonts/plus-jakarta-sans`
- **@expo/vector-icons** (Ionicons, MaterialIcons)
- **AsyncStorage** for theme + address persistence
- **expo-secure-store** for JWT persistence
- **expo-location** for rider GPS streaming
- **expo-notifications** for push notifications
- **expo-device** for push notification gating
- **expo-linking** for deep linking (expo-router dependency)
- **expo-image-picker** for avatar / menu item photo uploads
- **@maplibre/maplibre-react-native** v11 for live maps (native build only)
- **socket.io-client** v4 for real-time order status + rider location
- **axios** for HTTP with JWT interceptor

## Project Structure
```
app/
  _layout.tsx            ← Root: fonts, providers (Theme, Auth, Cart, Address); waits for auth session restore
  index.tsx              ← Redirects → /splash
  splash.tsx             ← Auto-advances to /onboarding after 2.2s
  onboarding.tsx         ← 3-slide full-bleed photo onboarding
  role-select.tsx        ← Customer / Vendor / Rider picker → /register?role=...
  login.tsx              ← Email + password login (calls POST /auth/login)
  register.tsx           ← Multi-role registration + ToS/Privacy checkbox (calls POST /auth/register)
  verify-otp.tsx         ← 6-digit OTP entry; 60s resend cooldown (calls POST /auth/verify-otp)
  register-success.tsx   ← Role-specific success screen → navigates to role tab group
  account-not-active.tsx         ← Pending approval gate for vendor/rider; poll + email support link
  vendor-complete-profile.tsx    ← Post-signup profile setup for vendors (logo, cover, description, hours, tier)
  (customer)/            ← Customer route group
    index.tsx            ← Home screen ✅
    vendor/[id].tsx      ← Vendor detail + menu ✅
    cart.tsx             ← Cart review ✅
    checkout.tsx         ← Address + payment method ✅
    tracking.tsx         ← Live order tracking with MapLibre ✅
    search.tsx           ← Search + trending ✅
    profile.tsx          ← Profile + settings ✅
    favorites.tsx        ← Saved restaurants ✅
    edit-profile.tsx     ← Edit name / phone / avatar (expo-image-picker) ✅
    orders.tsx           ← Order history ✅
    saved-addresses.tsx  ← Saved addresses CRUD ✅
    notifications.tsx    ← Per-category notification toggles ✅
    offers-promos.tsx    ← Promo codes + offers list ✅
    rate-app.tsx         ← Star rating + aspect chips + feedback ✅
    privacy-security.tsx ← Change password, delete account ✅
    settings.tsx         ← Dark/light toggle, app version ✅
    privacy-policy.tsx   ← Full privacy policy (NDPR/NDPA, effective May 1 2025) ✅
    terms-of-service.tsx ← Full terms of service (effective May 1 2025) ✅
  (vendor)/              ← Vendor route group
    index.tsx            ← Dashboard (stats, orders, menu, earnings) ✅
    profile.tsx          ← Vendor profile ✅
    edit-profile.tsx     ← Edit business info + cover image (Cloudinary) ✅
    menu.tsx             ← Manage menu items (CRUD + image upload) ✅
    orders.tsx           ← Order management ✅
    promotions.tsx       ← Vendor promotion cards (hidden tab, via router.push) ✅
  (rider)/               ← Rider route group
    index.tsx            ← Dashboard (online toggle, stats, earnings) ✅
    jobs.tsx             ← Available delivery jobs ✅
    active.tsx           ← Active delivery with MapLibre ✅
    profile.tsx          ← Rider profile + stats + inline edit ✅
    earnings.tsx         ← Earnings summary + payout history ✅
    notifications.tsx    ← Per-category notification toggles ✅
    settings.tsx         ← Dark/light toggle, delivery prefs, about ✅

screens/
  SplashScreen.tsx              ✅
  OnboardingScreen.tsx          ✅
  RoleSelectScreen.tsx          ✅  navigates to /register?role=...
  LoginScreen.tsx               ✅  wired to POST /auth/login, role-based redirect
  RegisterScreen.tsx            ✅  wired to POST /auth/register; role-specific fields;
                                     rider fields: vehicleType + plateNumber (auto-uppercased);
                                     ToS + Privacy Policy checkbox required before submit
  VerifyOTPScreen.tsx           ✅  6-digit OTP inputs, 60s resend, POST /auth/verify-otp
  RegisterSuccessScreen.tsx     ✅  role-aware heading + body; navigates to tab group
  AccountNotActiveScreen.tsx    ✅  pending approval for vendor/rider; poll status + email support
  vendor/
    VendorCompleteProfileScreen.tsx ✅  post-signup profile setup: cover photo, logo, description,
                                         opening/closing hours, commission tier selection (TIER_1/TIER_2),
                                         identity document upload (NIN/Driver's License/Passport),
                                         menu items with option groups (choice of swallow etc.);
                                         calls PATCH /vendors/me, optionally PATCH /vendors/me/tier,
                                         POST /vendors/me/document, POST /vendors/me/menu (×n);
                                         on save checks approval status → dashboard or account-not-active
  customer/
    HomeScreen.tsx              ✅  auto-scrolling promo carousel (3.5s interval, pagingEnabled);
                                     fetches active vendor promos from GET /vendors/active-promotions
                                     and prepends them as image cards before static platform cards;
                                     dot indicators sync with swipe and auto-scroll; pauses on drag
    VendorDetailScreen.tsx      ✅  cover image, tabs, qty stepper, cart CTA bar
    CartScreen.tsx              ✅  qty controls, delivery note, summary footer
    CheckoutScreen.tsx          ✅  address card, 3 payment radio cards, Paystack
    OrderTrackingScreen.tsx     ✅  MapLibre live map, socket status, 5-step progress
    SearchScreen.tsx            ✅  autofocus input, trending pills, filtered results
    ProfileScreen.tsx           ✅  avatar, menu rows, sign out
    FavoritesScreen.tsx         ✅  saved restaurants list
    EditProfileScreen.tsx       ✅  avatar (expo-image-picker), name / phone / email fields
    MyOrdersScreen.tsx          ✅  order history, status badges, pull-to-refresh
    OffersPromosScreen.tsx      ✅  promo codes (copy to clipboard), offers list
    SavedAddressesScreen.tsx    ✅  CRUD via AddressContext; home / work / other types
    NotificationsScreen.tsx     ✅  per-category notification toggles
    SettingsScreen.tsx          ✅  dark/light toggle, app version (expo-constants)
    RateAppScreen.tsx           ✅  star rating, aspect chips (speed/vendors/app), feedback text
    PrivacySecurityScreen.tsx   ✅  change password (API), delete account modal
    PrivacyPolicyScreen.tsx     ✅  full NDPR/NDPA policy text; effective May 1 2025
    TermsOfServiceScreen.tsx    ✅  full ToS text; effective May 1 2025
  vendor/
    VendorDashboardScreen.tsx   ✅  open/close toggle, stat grid, bar chart, order cards
                                     (Accept/Reject/Ready), toast, menu & earnings tabs
    VendorProfileScreen.tsx     ✅  business info, stats, fetched from API;
                                     menu rows: Menu Items, Earnings, Promotions, Notifications, Settings
    VendorOrdersScreen.tsx      ✅  order management list, status filters, pull-to-refresh
    ManageMenuScreen.tsx        ✅  menu CRUD, image picker, Cloudinary upload
    EditVendorProfileScreen.tsx ✅  edit business info + cover image via Cloudinary
    VendorPromotionsScreen.tsx  ✅  tier-gated promo card management:
                                     · TIER_1 — full screen visible, Add button disabled;
                                       pressing it shows Alert to upgrade to Growth Plan
                                     · TIER_2 — create/toggle/delete promo cards; only one
                                       active at a time (toggle deactivates others); image spec
                                       guide shown (1080×580 px, 1.86:1 ratio, 60 px safe zone)
                                     · Downgrade TIER_2→TIER_1 — all promos preserved but
                                       set to inactive automatically by the backend
                                     · Cloudinary upload (gobuyme_unsigned preset); code optional
  rider/
    RiderDashboardScreen.tsx      ✅  online/offline toggle + Animated ripple, hero banner,
                                       stat grid, bar chart, recent deliveries
    AvailableOrdersScreen.tsx     ✅  job cards, vendor photo strip, route dots, Accept button
    ActiveDeliveryScreen.tsx      ✅  MapLibre live map, Animated progress bar, GPS streaming
    RiderProfileScreen.tsx        ✅  rider profile + stats; inline edit mode for name/phone/
                                       vehicle type/plate number (PATCH /auth/profile + PATCH /riders/me)
    RiderEarningsScreen.tsx       ✅  today/week/month/all-time summary grid, weekly bar chart,
                                       payout history list, pending payout banner
    RiderNotificationsScreen.tsx  ✅  per-category toggles: Jobs, Deliveries, Earnings, Account
    RiderSettingsScreen.tsx       ✅  dark mode, delivery prefs (vehicle/area/nav), language,
                                       currency, about — mirrors customer SettingsScreen pattern

components/
  ui/
    PrimaryButton.tsx  ✅  disabled + loading props
    AppInput.tsx       ✅
    Badge.tsx          ✅
  layout/
    BottomNav.tsx      ✅

context/
  ThemeContext.tsx    ✅  dark/light toggle, AsyncStorage persist
  AuthContext.tsx     ✅  user, role, loading; SecureStore persist (accessToken,
                          refreshToken, userProfile); async login/logout; updateApprovalStatus
  CartContext.tsx     ✅  items, addItem, clearCart, total, count
  AddressContext.tsx  ✅  addresses[], selectedId, addAddress/updateAddress/deleteAddress/setDefault;
                          AsyncStorage persist + API sync; used by SavedAddressesScreen + CheckoutScreen

services/
  api.ts           ✅  axios instance; reads accessToken from SecureStore; clears on 401
  socketService.ts ✅  module-level singleton; /orders + /riders namespaces;
                        connectSockets(token?) / getOrdersSocket() / getRidersSocket() / disconnectSockets()

hooks/
  useOrderTracking.ts    ✅  joins order room; listens order:status + rider:location
  useRiderLocation.ts    ✅  watchPositionAsync (5s/10m); emits rider:updateLocation
  usePushNotifications.ts ✅  requests permission; registers Expo push token with backend

mocks/
  maplibre.js      ✅  stub Map/Camera/Marker for Expo Go (placeholder UI)

theme/
  colors.ts  ✅  dark + light tokens
  index.ts   ✅  spacing, radius, typography, shadows
```

## Design Tokens
```
Primary orange:  #FF521B
Dark bg:         #0E0E0E
Dark surface:    #1A1A1A / #242424 / #2E2E2E
Light bg:        #F7F5F3
Light surface:   #FFFFFF / #F2F0EE / #E8E5E2
Border radius:   4 (all rectangular elements), 999 (pills), 9999 (circles)
Font:            Plus Jakarta Sans 400/500/600/700/800
```

## Environment variables (gobuyme-mobile/.env)
```
EXPO_PUBLIC_API_URL=http://<machine-ip>:5000/api/v1
EXPO_PUBLIC_SOCKET_URL=http://<machine-ip>:5000
EXPO_PUBLIC_MAPTILER_KEY=get_free_key_at_maptiler_com
EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME=<your_cloudinary_cloud_name>
```
**Important:** Use the machine's LAN IP (e.g. `192.168.0.187`), NOT `localhost`.
Android devices/emulators cannot reach `localhost` on the dev machine.

## MapLibre / Expo Go compatibility
MapLibre v11 requires a native build — its codegen native component specs crash the
Metro bundler in Expo Go. `metro.config.js` auto-detects the situation:

- **No `android/` dir** (native build never run) → MapLibre is mocked automatically.
- **`android/` dir exists** → real MapLibre is used (native dev client).
- **Force mock** → set `EXPO_GO=1` before starting.

Map screens (`OrderTrackingScreen`, `ActiveDeliveryScreen`) render a dark `🗺️`
placeholder in Expo Go; real interactive maps in native builds.

## Running locally

### Expo Go (development — maps show placeholder)
```bash
npm install
npx expo start --clear          # metro auto-detects, mocks MapLibre
# or explicitly: EXPO_GO=1 npx expo start --clear
```

### Native build (real maps)
```bash
npm run android    # runs: expo run:android
```
First run generates the `android/` directory and compiles native modules.
Subsequent `npx expo start --clear` will use real MapLibre automatically.

## Backend (gobuyme6/backend/)
Express + TypeScript + Prisma + PostgreSQL. Runs on port 5000.

```bash
cd ../backend
npm run dev          # ts-node-dev with hot reload
npx prisma studio    # DB browser at localhost:5555
```

Key routes: `POST /auth/register`, `POST /auth/login`, `POST /auth/verify-otp`,
`PATCH /auth/profile`, `GET /auth/activation-status`,
`GET /vendors`, `POST /orders`, `POST /payments/initialize`, `POST /payments/verify`,
`GET /notifications/register-token`,
`GET /riders/me`, `PATCH /riders/me`, `GET /riders/me/stats`, `GET /riders/me/deliveries`,
`PATCH /riders/me/online`, `GET /riders/me/available-jobs`, `GET /riders/me/active`,
`POST /riders/me/accept/:orderId`, `PATCH /riders/me/orders/:orderId/status`

Vendor promotion routes (vendor-auth required):
`GET /vendors/me/promotions`, `POST /vendors/me/promotions`,
`PATCH /vendors/me/promotions/:id/toggle`, `DELETE /vendors/me/promotions/:id`

Public promotion route (customer homescreen carousel):
`GET /vendors/active-promotions` — returns all active vendor promo cards (max 10, ordered by updatedAt)

Prisma model: `VendorPromotion` (id, vendorId, title, imageUrl, code?, isActive, createdAt, updatedAt)
Tier rules enforced server-side: POST/PATCH toggle blocked for TIER_1 (403); PATCH /vendors/me/tier
to TIER_1 auto-deactivates all vendor promotions.

Socket.io namespaces: `/orders` (status updates) · `/riders` (GPS location)

## Auth flow
1. `RoleSelectScreen` → `/register?role=customer|vendor|rider`
2. `RegisterScreen` → ToS + Privacy Policy checkbox required → `POST /auth/register`
   → navigates to `/verify-otp?userId=...&email=...&role=...`
3. `VerifyOTPScreen` → `POST /auth/verify-otp` → saves JWT to SecureStore
   → navigates to `/register-success?role=...`
4. `RegisterSuccessScreen` → navigates to role tab group (customer/vendor/rider)
5. Vendor login: `GET /vendors/me` → if profile incomplete (no description/openingTime/closingTime)
   → `/vendor-complete-profile`; if complete but not APPROVED → `/account-not-active`;
   if APPROVED → `/(vendor)`
6. Rider with `approvalStatus !== APPROVED` → `/account-not-active`
7. `LoginScreen` → `POST /auth/login` → saves JWT → navigates to role tab group
7. On app restart `AuthContext` restores session from SecureStore before showing any screen
8. `api.ts` reads `accessToken` from SecureStore on every request; clears both tokens on 401

## Navigation notes
- Rider sub-screens (earnings, notifications, settings) are hidden tab routes (`href: null` in
  `_layout.tsx`). Back buttons use `router.navigate('/(rider)/profile')` — not `router.back()` —
  because hidden tab screens have no reliable stack to pop.
- Same pattern applies to any future hidden screens added to customer or vendor groups.
- Vendor hidden routes: `edit-profile`, `earnings`, `notifications`, `settings`, `promotions`.
  All use `router.push('/(vendor)/<screen>')` to navigate in and `router.back()` to return.

## Visual reference
`GoBuyMe Prototype.html` — open in Chrome, use Tweaks panel (toolbar) to jump between screens.
All colours, spacing, border radii, and component shapes match exactly.
