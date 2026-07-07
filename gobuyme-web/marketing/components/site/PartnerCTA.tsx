"use client";
import { motion } from "framer-motion";
import Link from "next/link";
const rider = "/marketing/sticker-rider.png";

export const PartnerCTA = () => (
  <section className="border-b-2 border-ink bg-background py-20 md:py-28">
    <div className="container grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Vendors */}
      <motion.div
        id="vendors"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        whileHover={{ rotate: -1 }}
        className="relative overflow-hidden rounded-3xl border-2 border-ink bg-hot p-8 text-hot-foreground shadow-pop md:p-12"
      >
        <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-accent/40 blur-2xl" />
        <span className="inline-block rounded-full border-2 border-background px-3 py-1 font-mono-pop text-xs uppercase tracking-widest">
          For vendors
        </span>
        <h3 className="mt-6 font-display text-4xl leading-tight md:text-5xl">
          Sell more.<br />Stress less.
        </h3>
        <p className="mt-4 max-w-md opacity-90">
          Plug your kitchen, store or pharmacy into thousands of hungry customers. We handle delivery, payments and marketing — you handle the recipe.
        </p>
        <ul className="mt-6 grid gap-2 font-mono-pop text-sm">
          <li>→ 0% setup fee for the first 90 days</li>
          <li>→ Daily payouts, no minimum</li>
          <li>→ Built-in promo & loyalty engine</li>
        </ul>
        <Link href="/become-a-vendor" className="mt-8 inline-flex items-center gap-2 rounded-full border-2 border-background bg-background px-6 py-3 font-mono-pop text-xs uppercase tracking-widest text-foreground shadow-[6px_6px_0_hsl(var(--foreground))] transition-all hover:translate-x-1 hover:translate-y-1 hover:shadow-none">
          List your business →
        </Link>
      </motion.div>

      {/* Riders */}
      <motion.div
        id="riders"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        whileHover={{ rotate: 1 }}
        className="relative overflow-hidden rounded-3xl border-2 border-ink bg-foreground p-8 text-background shadow-pop md:p-12"
      >
        <img
          src={rider}
          alt="Delivery rider on motorbike"
          className="absolute -bottom-6 -right-8 h-64 w-auto opacity-95 drop-shadow-[6px_6px_0_hsl(var(--primary))]"
          loading="lazy"
        />
        <span className="inline-block rounded-full border-2 border-background px-3 py-1 font-mono-pop text-xs uppercase tracking-widest">
          For riders
        </span>
        <h3 className="mt-6 max-w-xs font-display text-4xl leading-tight md:text-5xl">
          Ride. Earn.<br /><span className="text-primary">Repeat.</span>
        </h3>
        <p className="mt-4 max-w-xs opacity-90">
          Flexible hours. Weekly cash-out. Top riders earn ₦150k+ per month with bonuses.
        </p>
        <Link href="/riders" className="relative z-10 mt-8 inline-flex items-center gap-2 rounded-full border-2 border-background bg-primary px-6 py-3 font-mono-pop text-xs uppercase tracking-widest text-primary-foreground shadow-[6px_6px_0_hsl(var(--background))] transition-all hover:translate-x-1 hover:translate-y-1 hover:shadow-none">
          Become a rider →
        </Link>
      </motion.div>
    </div>
  </section>
);
