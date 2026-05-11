# GoBuyMe Admin — Next.js Project

## Stack
- **Next.js 15** (App Router)
- **TypeScript**
- **React 19**
- **Plus Jakarta Sans** (via next/font/google)
- No UI library — pure inline styles using the theme system

## Project Structure
```
app/
  (admin)/           ← Admin route group (Sidebar + TopBar layout)
    dashboard/       ← Overview page
    vendors/         ← Vendor management
    riders/          ← Rider management
    orders/          ← Order management
    customers/       ← Customer list
    payouts/         ← Payouts & commissions
    audit/           ← Audit logs
    settings/        ← Platform settings
  layout.tsx         ← Root layout (ThemeProvider)
  page.tsx           ← Redirect → /dashboard

components/
  layout/
    Sidebar.tsx      ← Fixed left nav with theme toggle
    TopBar.tsx       ← Page title + notification bell + user avatar
  ui/
    Badge.tsx        ← Status badge (APPROVED, PENDING, etc.)
    StatCard.tsx     ← KPI card with sparkline
    Sparkline.tsx    ← SVG mini chart
    BarChart.tsx     ← SVG bar chart

context/
  ThemeContext.tsx   ← Dark/light theme state (persisted to localStorage)

theme/
  colors.ts          ← dark + light colour tokens
  index.ts           ← spacing, radius, typography, shadows
```

## Design Tokens
Primary orange: `#FF521B`
Dark bg: `#0E0E0E` | surfaces: `#1A1A1A / #222 / #2A2A2A`
Light bg: `#F4F2F0` | surfaces: `#FFF / #F0EDEA / #E8E4E0`
Border radius: **4px** everywhere (pills = 999px)
Font: Plus Jakarta Sans (weights 400–800)

## Pages to complete
The following pages exist in the HTML prototype (`GoBuyMe Admin.html`) but
need to be scaffolded as Next.js pages using the same pattern as `vendors/page.tsx`:

- [ ] `/riders`    — same table pattern as vendors, with ONLINE/OFFLINE badge
- [ ] `/orders`    — filterable by status, no row actions needed
- [ ] `/customers` — read-only table
- [ ] `/payouts`   — summary cards + table with "Pay Now" action
- [ ] `/audit`     — colour-coded log list (no table, card list style)
- [ ] `/settings`  — form fields for platform config (fees, rates)

## Reference
Open `GoBuyMe Admin.html` (in the same repo or handoff folder) for the
exact visual spec for each page. The HTML prototype is pixel-perfect;
recreate it faithfully using the theme tokens and component patterns above.

## Running locally
```bash
npm install
npm run dev
# → http://localhost:3000
```
