# Handoff: GoBuyMe — Full App UI

**Product:** GoBuyMe  
**Tagline:** Hungry? GoBuyMe. Anything.  
**Company:** Bubble Barrel Commerce Limited, Owerri, Nigeria  
**Date:** April 2026  
**Prepared for:** Claude Code / Developer implementation

---

## Overview

GoBuyMe is a single on-demand delivery super-app for the Nigerian market serving three user roles — **Customer**, **Vendor**, and **Rider** — selected at onboarding. It delivers food, groceries, pharmacy items, and errands across Nigerian cities.

This handoff covers two distinct UIs:

| UI | File | Target platform |
|---|---|---|
| Mobile app | `GoBuyMe Prototype.html` | React Native (Expo SDK 51+) |
| Admin dashboard | `GoBuyMe Admin.html` | React (Vite) web app |

---

## About the Design Files

The `.html` files in this bundle are **high-fidelity design prototypes** — interactive references showing intended look, layout, and behaviour. They are **not production code to be shipped directly**.

Your task is to **recreate these designs in the target codebase** using its established environment:
- **Mobile app** → React Native with `StyleSheet.create`, the GoBuyMe `theme.js` constants, and Expo libraries as specified in the Master Build Prompt.
- **Admin dashboard** → React (Vite) + Shadcn/ui + Tailwind CSS as specified.

Do not copy the inline HTML/CSS/JS into production. Use the prototypes as a pixel-perfect visual specification.

---

## Fidelity

**High-fidelity.** Both prototypes are pixel-perfect mocks with final colours, typography, spacing, component shapes, and interactions. Recreate them precisely using the design tokens below.

---

## Design Tokens

### Theme Switching
Both UIs support **dark** (default) and **light** themes, toggled live via the Tweaks panel. Use the token sets below — all other values (primary, success, warning, error, info) remain identical across themes.

### Colours — Dark Theme (default)
```js
// theme.js — dark
export const colors = {
  primary:      '#FF521B',
  primaryDark:  '#CC3D0E',
  primaryLight: '#FF7A4D',
  primaryTint:  'rgba(255,82,27,0.12)',   // used for tinted backgrounds

  neutral900:   '#111111',
  neutral700:   '#3D3D3D',
  neutral500:   '#767676',
  neutral300:   '#C2C2C2',
  neutral100:   '#F5F5F5',
  white:        '#FFFFFF',

  success:      '#1A9E5F',
  successBg:    'rgba(26,158,95,0.1)',
  warning:      '#F5A623',
  warningBg:    'rgba(245,166,35,0.1)',
  error:        '#E23B3B',
  errorBg:      'rgba(226,59,59,0.1)',
  info:         '#1A6EFF',
  infoBg:       'rgba(26,110,255,0.1)',

  // Dark mode surfaces
  bg:           '#0E0E0E',
  surface:      '#1A1A1A',
  surface2:     '#222222',
  surface3:     '#2A2A2A',
  border:       '#2E2E2E',
  text:         '#FFFFFF',
  textSec:      '#A0A0A0',
  textMuted:    '#555555',
};

// theme.js — light (warm off-white palette)
export const lightColors = {
  primary:      '#FF521B',
  primaryDark:  '#CC3D0E',
  primaryLight: '#FF7A4D',
  primaryTint:  'rgba(255,82,27,0.09)',
  bg:           '#F7F5F3',
  surface:      '#FFFFFF',
  surface2:     '#F2F0EE',
  surface3:     '#E8E5E2',
  border:       '#E5E0DA',
  text:         '#1A1410',
  textSec:      '#6B6560',
  textMuted:    '#B0AAA4',
  success:      '#1A9E5F',  successBg: 'rgba(26,158,95,0.08)',
  warning:      '#F5A623',  warningBg: 'rgba(245,166,35,0.08)',
  error:        '#E23B3B',  errorBg:   'rgba(226,59,59,0.08)',
  info:         '#1A6EFF',  infoBg:    'rgba(26,110,255,0.08)',
};
```

### Typography
Font: **Plus Jakarta Sans** (Google Font — weights 400, 500, 600, 700, 800)

```js
export const typography = {
  h1:      { fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  h2:      { fontSize: 26, fontWeight: '700' },
  h3:      { fontSize: 20, fontWeight: '700' },
  h4:      { fontSize: 17, fontWeight: '600' },
  bodyLg:  { fontSize: 16, fontWeight: '400', lineHeight: 1.6 },
  body:    { fontSize: 14, fontWeight: '400', lineHeight: 1.5 },
  caption: { fontSize: 12, fontWeight: '500' },
  label:   { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
};
```

### Spacing Scale
`4, 8, 12, 16, 20, 24, 32, 40, 48, 64` (multiples of 4)

### Border Radius
```
inputs:       4px
cards/buttons: 8px  (React Native: 8)
bottom sheets: 12px
modals:        16px
pills/chips:   999px
```

### Shadows
Use sparingly — one level per surface layer. Example card shadow:
```js
{ shadowColor:'#000', shadowOffset:{width:0,height:4}, shadowOpacity:0.3, shadowRadius:12, elevation:6 }
```

---

## Mobile App Screens

Open `GoBuyMe Prototype.html` in a browser to interact with all screens. Use the **Tweaks panel** (bottom-right) to jump directly to any screen.

### 1. Splash Screen
- Full dark background (`#0E0E0E`)
- Centred logo: 80×80 rounded square (radius 20), orange gradient (`#FF521B → #CC3D0E`), bike icon inside
- App name: 34px / ExtraBold, tagline: 14px / Medium / `#A0A0A0`
- Spinning loader (40px, border 3px, top colour = primary)
- Auto-advances after ~2.2s to Onboarding

### 2. Onboarding Slides (3 slides)
- **Full-bleed photo background** (Unsplash — see Assets below), `objectFit: cover`
- Multi-layer gradient overlay: `linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.05) 35%, rgba(0,0,0,0.92) 100%)`
- Colour tint layer at bottom 55% — unique per slide (primary, success, info)
- **Slide counter** top-left: 13px / 600 / muted white
- **Skip button** top-right: glass pill, backdrop-filter blur 8px, `rgba(255,255,255,0.15)` bg
- Bottom content (from bottom, padding 24px):
  - **Tag pill**: glassmorphism, `rgba(255,255,255,0.12)` + blur 12px, 12px / 600
  - **Headline**: 42px / ExtraBold / `#fff` / `lineHeight 1.1` / `letterSpacing -1.5` / `whiteSpace pre-line`
  - **Sub-text**: 15px / 400 / `rgba(255,255,255,0.75)` / lineHeight 1.6
  - **Dots** (progress): active dot = 32px wide × 5px tall, inactive = 5×5; white / `rgba(255,255,255,0.3)`
  - **CTA button**: 54px height circle (primary colour), accent colour changes per slide
- Slide content:
  - Slide 1: photo = food spread, accent = `#FF521B`, headline = "Jollof in\n25 minutes."
  - Slide 2: photo = restaurant interior, accent = `#1A9E5F`, headline = "Sell to thousands.\nStress less."
  - Slide 3: photo = delivery rider, accent = `#1A6EFF`, headline = "Ride. Earn.\nRepeat."
- Last slide CTA reads "Get Started" (full-width pill)

### 3. Role Select Screen
- Background: `#0E0E0E`, padding top 80
- Headline: 30px / ExtraBold / `letterSpacing -0.5` / `lineHeight 1.2`
- Three tappable cards (`surface` bg, radius 16, border `#2E2E2E`, padding 20×24):
  - 56×56 icon container (radius 16, `primaryTint` bg, 28px emoji)
  - Title: 17px / Bold; Sub: 13px / `#A0A0A0`
  - Trailing chevron right
- Roles: 🍛 Customer, 🏪 Vendor, 🏍️ Rider
- Tapping navigates to Register (role pre-set)

### 4. Login Screen
- Heading: 30px / ExtraBold "Welcome back 👋"
- Two `AppInput` fields (email, password) — surface bg, radius 10, border `#2E2E2E`, 14px padding, 15px text
- Label above each: 12px / 600 / uppercase / `#A0A0A0`
- "Forgot password?" right-aligned, 13px / 600 / primary
- `PrimaryBtn`: full width, radius 10, primary bg, 16px / Bold / white, shadow `0 8px 24px #FF521B44`
- Google OAuth button: surface bg, border `#2E2E2E`, radius 10, Google SVG logo + 14px / 600 text
- Footer: "Don't have an account? Sign Up" (Sign Up in primary)

### 5. Customer Home Screen
**Header:**
- Location row: pin icon (primary), "Deliver to" label + chevron, city name 16px / Bold below
- Cart icon button: 40×40, radius 10, surface bg — badge (18px circle, primary) when items > 0

**Search bar:**
- Surface bg, radius 12, border, 46px tall, search icon left-padded, muted placeholder
- Filter button: 46×46, radius 12, surface bg

**Promo Banner:**
- Radius 16, height 110, orange gradient (`#CC3D0E → #FF521B → #FF9D5C`)
- Tag: 11px / 700 / uppercase / 70% white opacity
- Headline: 22px / ExtraBold / white
- Promo code badge: bottom-right, `rgba(255,255,255,0.25)`, radius 8, 12px / 700

**Category Chips:**
- Scrollable horizontal row, radius 99 pills
- Active: primary bg, white text; Inactive: surface bg, border, `#A0A0A0` text
- Content: All 🍽️, Food 🍛, Grocery 🛒, Pharmacy 💊, Errand 📦

**Vendor Cards:**
- Surface bg, radius 16, border
- Image: 150px tall, no radius (flush), `objectFit cover`
- Tag badge: top-left, primary bg, radius 6, 11px / Bold
- Arrow button: bottom-right, 36×36, radius 18, primary bg
- Below image: name 15px / Bold, category 12px / `#A0A0A0`
- Meta row: ⭐ rating / ⚡ time / min order — separated by 3×3 dots

### 6. Vendor Detail Screen
- Back button: 36×36 circle, `rgba(0,0,0,0.5)`, top-left over image
- Favourite button: same, top-right
- Cover image: 200px tall
- Store info: name 22px / ExtraBold, category 13px / muted, open/close badge
- Stat row: star rating, time, min order
- Tabs: Menu / Info — active tab has `primaryTint` bg + primary text
- Menu items: surface card, row layout, 90×90 image left, name/desc/price right, qty controls far-right
- Qty controls: `−` (surface3) and `+` (primary) 28×28 radius 8 buttons; quantity centred between

### 7. Cart Screen
- Header with back + "Your Cart" + vendor name
- Cart items: surface card, 60×60 image radius 10, name + total price, qty stepper
- Delivery note input: surface card, placeholder text
- Summary: Subtotal, Delivery (₦800), divider, **Total** 16px / ExtraBold / primary
- `PrimaryBtn`: "Proceed to Checkout"

### 8. Checkout Screen
- Delivery address card: pin icon in `primaryTint` 40×40 circle, label + address, chevron
- Payment methods: radio-style cards, selected = 2px primary border
  - Methods: 💳 Debit Card, 🏦 Bank Transfer, 💵 Cash on Delivery
- Footer: total + "Pay ₦X,XXX" primary button

### 9. Order Tracking Screen
- Map placeholder: dark gradient with SVG route line (dashed, primary), vendor pin, customer pin, animated rider dot
- ETA badge: bottom-right of map, dark bg, primary bolt icon
- Status card: icon + status label + order number
- Progress stepper: 5 steps (Confirmed → Preparing → Ready → Picked Up → Delivered)
  - Active step: circle with white inner dot; completed: checkmark; future: surface3
  - Connecting lines: primary if passed, surface3 if future
- Rider card: avatar, name, rating, vehicle — with 📞 and 💬 action buttons (primaryTint bg)
- Auto-advances steps every 3s (prototype behaviour — in prod, driven by socket events)

### 10. Search Screen
- Back + search input (autofocus)
- Trending pills: 🔥 prefix, surface bg, radius 99
- Results list: 56×56 vendor thumbnail, name, meta row, star rating

### 11. Profile Screen
- Avatar: 64px circle, primary gradient
- Menu list: icon + label + subtitle + chevron for each item
- "Sign Out" in error red, no chevron

---

## Vendor Dashboard Screens

### Vendor Dashboard
- **Store toggle**: open = green border/text; closed = red; pulsing ripple animation when online
- **Stats grid**: 2-column, 4 cards (Orders, Revenue, Rating, Pending) — icon top-right, delta badge
- **Weekly chart**: bar chart, today's bar in primary, others at 44% opacity, day labels below
- **Tabs**: Orders / Menu / Earnings — active = `primaryTint` bg + primary border + primary text

**Orders tab:**
- Cards with order ID, customer, items, total
- Status badge: New = `#F5A623`, Preparing = `#1A6EFF`, Ready = `#1A9E5F`
- Actions: Accept (primary btn) + Reject (error outline) for new; "Mark Ready" (blue) for preparing; "Awaiting Rider" (green tinted) for ready
- New order toast: primary bg, slides in from top, auto-dismisses 3s

**Menu tab:**
- Row layout: 70×70 image, name + price, availability toggle (pill switch, primary when on)

**Earnings tab:**
- 3 summary cards: This Month / Pending Payout / All Time
- "Request Payout" primary button

---

## Rider Flow Screens

### Rider Dashboard
- **Online/Offline toggle**: online = green glow + ripple pulse animation (keyframe: scale 1→2.5, opacity 0.6→0)
- **Offline state**: grey card with "Go Online" primary button
- **Online state**: dark green hero card, "N orders nearby" with blinking dot, taps to available jobs
- Stats grid: 4 cards (Deliveries, Earned, Rating, Online hrs) — per-stat accent colours
- Weekly earnings chart: green bars, total shown top-right
- Recent deliveries list: amount in green, star rating row

### Available Orders Screen
- Each job card:
  - **Vendor photo strip** (80px): dark gradient overlay left, name + item count left-aligned, fee badge top-right in primary
  - **Route section**: pick-up → deliver, orange dot → green dot connected by vertical line
  - Meta row: ETA bolt / distance map / customer name
  - **Accept button**: full width, primary, shows ✓ + "Accepted!" on tap (green transition)

### Active Delivery Screen
- **Map**: dark SVG with grid lines, dashed route, vendor pin (primary), customer pin (green), rider emoji dot — moves position between steps
- **ETA badge** bottom-right of map
- **Status card**: icon + label, progress bar (0→50→100%), step labels below (Pickup / Transit / Done)
- **Customer info row**: avatar, name, address, 📞 and 💬 buttons
- **Earnings badge**: shows rider's cut for this delivery
- **CTA button** changes each step:
  - Step 1: "Arrived at Vendor"
  - Step 2: "Mark as Delivered"
  - Step 3: "Done" → back to dashboard

---

## Admin Dashboard (Web)

File: `GoBuyMe Admin.html`. Target stack: **React (Vite) + Shadcn/ui + Tailwind CSS**

### Layout
- Fixed sidebar: 220px wide, `#1A1A1A` bg, `#2E2E2E` right border
- Top bar: 58px tall, `#1A1A1A`, border-bottom
- Content area: flex-1, scrollable, `24px 28px` padding

### Sidebar
- Logo: 34×34 rounded square (radius 9) primary gradient + 🏍️
- Nav items: 13px / 500 text, icon left; active = `primaryTint` bg + primary border + primary text + 700 weight
- Pending badge: `#F5A623` pill (warning colour)
- User footer: 32px avatar, name 12px / 700, email 10px / muted

### Stat Cards (Overview)
- 4-up grid, flex row
- Label: 12px / 600 / uppercase / muted; Value: 26px / ExtraBold; Delta: 12px / 700 success/error colour
- Sparkline SVG bottom-right (7 data points, accent colour with 10% fill)
- Emoji icon top-right

### Charts
- **Monthly Revenue**: bar chart, 12 months, current month primary, others at `primary50`
- **Category Donut**: SVG, inner circle `surface` bg for hollow effect, legend right
- **Weekly Orders**: bar chart, 7 days

### Tables
- Header row: `#222` bg, 11px / 700 / uppercase / muted / letterSpacing 0.4
- Rows: `1px solid #2E2E2E` border-top, 13px body
- Order ID column: primary colour / 700 weight
- Revenue column: success colour
- Status badges: coloured pill — see Badge component below

### Badge Component
```
APPROVED   → #1A9E5F on rgba(26,158,95,0.1)
PENDING    → #F5A623 on rgba(245,166,35,0.1)
REJECTED   → #E23B3B on rgba(226,59,59,0.1)
SUSPENDED  → #E23B3B on rgba(226,59,59,0.1)
DELIVERED  → #1A9E5F on rgba(26,158,95,0.1)
IN_TRANSIT → #1A6EFF on rgba(26,110,255,0.1)
PREPARING  → #F5A623 on rgba(245,166,35,0.1)
CANCELLED  → #E23B3B on rgba(226,59,59,0.1)
ONLINE     → #1A9E5F on rgba(26,158,95,0.1)
OFFLINE    → #A0A0A0 on #2A2A2A
```
Style: `font-size 11px / font-weight 700 / border-radius 6px / padding 3px 9px`

### Inline Actions (Vendors & Riders pages)
- Filter tabs: active = `primaryTint` bg + 1px primary border + primary text
- Search input: `#222` bg, radius 9, left padding for icon
- Table row actions:
  - PENDING: "Approve" (success bg, white text) + "Reject" (error border, error text)
  - APPROVED: "Suspend" (warning border, warning text)
  - SUSPENDED/REJECTED: "Reinstate" (primary bg, white text)
  - All: `padding 5px 10px`, `radius 6px`, `font-size 11px / font-weight 700`

### Audit Logs
- Coloured 8×8 dot (radius 4) per action type
- Action name in action colour, entity + ID muted, meta text below
- Timestamp + actor right-aligned

---

## Interactions & Behaviour

| Interaction | Behaviour |
|---|---|
| Onboarding slide tap "next" | Fade image (opacity 0→1, 350ms) + slide content transition |
| Role card tap | Navigate to Register with role pre-set |
| Vendor card tap | Navigate to Vendor Detail |
| Add to cart | Qty stepper appears in place of + button |
| Cart → Checkout → Pay | Sequential screen push |
| Order Tracking | Auto-advances step every 3s (prototype); production = socket event `order:status` |
| Vendor new order toast | Slides down from top (translateY -20→0, opacity 0→1), auto-dismisses 3s |
| Rider online toggle | Ripple pulse animation on the toggle button |
| Rider accept job | Button turns green + shows "Accepted!" for 800ms, then navigates |
| Active delivery steps | Progress bar animates 0→50→100%, map rider dot repositions, CTA text changes |

---

## State Management

Use Redux Toolkit slices as defined in the Master Build Prompt:

| Slice | Key state |
|---|---|
| `authSlice` | `user`, `accessToken`, `refreshToken`, `role` |
| `cartSlice` | `items[]`, `vendorId`, `subtotal` |
| `orderSlice` | `currentOrder`, `trackingStatus`, `riderLocation` |
| `notificationSlice` | `unread[]` |

Socket events that drive UI state:
- `order:status` → update `orderSlice.trackingStatus`
- `rider:location` → update `orderSlice.riderLocation` (map marker)
- `order:new` → trigger vendor toast + update incoming orders list
- `order:assigned` → update rider's available jobs

---

## Assets

### Photography (Unsplash — free to use)
| Usage | URL |
|---|---|
| Onboarding slide 1 (food) | `https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=800&q=90` |
| Onboarding slide 2 (restaurant) | `https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&q=90` |
| Onboarding slide 3 (rider) | `https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=90` |
| Food (jollof rice) | `https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=700&q=85` |
| Suya | `https://images.unsplash.com/photo-1544025162-d76694265947?w=700&q=85` |
| Grocery | `https://images.unsplash.com/photo-1542838132-92c53300491e?w=700&q=85` |

In production, replace with actual vendor/food photography from Cloudinary (uploaded via `multer + Cloudinary` in the backend).

### Icons
- **Primary icon set**: Feather (react-native-vector-icons/Feather)
- **Secondary**: Ionicons
- All icons in prototype are hand-drawn SVGs; replace with the above in production

---

## Files in This Package

| File | Description |
|---|---|
| `GoBuyMe Prototype.html` | Full mobile app interactive prototype (all customer, vendor, rider screens) |
| `GoBuyMe Admin.html` | Full web admin dashboard prototype |
| `README.md` | This document |

For the full technical specification including API routes, database schema, socket events, payment integration, and build phases, refer to the **GoBuyMe Master Build Prompt** provided separately.

---

*Design by Bubble Barrel Commerce Limited · April 2026*
