"use client";
import { motion } from "framer-motion";
import { useState } from "react";
import { PageNav } from "@/marketing/components/site/PageNav";
import { Footer } from "@/marketing/components/site/Footer";
import { Marquee } from "@/marketing/components/site/Marquee";
import { RegistrationModal, useTierRates } from "@/marketing/components/site/RegistrationModal";
import { BookCallModal } from "@/marketing/components/site/BookCallModal";
const jollof = "/marketing/sticker-jollof.png";
const grocery = "/marketing/sticker-grocery.png";
const burger = "/marketing/sticker-burger.png";

const perks = [
  { icon: "🔥", title: "0% setup fee", body: "Free onboarding for your first 90 days. No card. No catch." },
  { icon: "💸", title: "Daily payouts", body: "Cash settles to your bank every morning. No weekly waits." },
  { icon: "📈", title: "Built-in marketing", body: "Promo engine, loyalty stamps & in-app placements that move units." },
  { icon: "📊", title: "Live dashboard", body: "See orders, top items & customer repeat rate in real time." },
  { icon: "🛵", title: "Our riders, your menu", body: "We dispatch — you cook. No fleet headache." },
  { icon: "🧾", title: "Smart tax reports", body: "VAT-ready exports your accountant will actually thank you for." },
];

const buildTiers = (rates: { TIER_1: number; TIER_2: number }) => [
  {
    name: "Starter",
    price: "TIER1",
    sub: "/Free forever",
    color: "bg-background",
    features: ["Unlimited orders", "Standard placement", "Email support", "Daily payouts", `${rates.TIER_1}% Platform Commission`],
    cta: "Start free",
  },
  {
    name: "Growth",
    price: "TIER2",
    sub: "/Free Forever",
    color: "bg-accent",
    features: ["Everything in Tier 1", "Boosted placement", "Promo engine", "Priority WhatsApp support", "Loyalty stamps", `${rates.TIER_2}% Platform Commission`],
    cta: "Go Growth",
    featured: true,
  },
  {
    name: "Empire",
    price: "Custom",
    sub: "talk to us",
    color: "bg-foreground text-background",
    features: ["Multi-branch console", "Dedicated account lead", "Co-marketing campaigns", "API access"],
    cta: "Book a call",
    bookCall: true,
  },
];

const Vendors = () => {
  const tiers = buildTiers(useTierRates());
  const [modalOpen, setModalOpen] = useState(false);
  const [bookCallOpen, setBookCallOpen] = useState(false);

  return (
    <main className="min-h-screen bg-background">
      <PageNav />

      {/* HERO */}
      <section className="relative overflow-hidden border-b-2 border-ink bg-hot text-hot-foreground">
        <div className="absolute -left-20 top-10 h-80 w-80 rounded-full bg-accent/40 blur-3xl" />
        <div className="absolute -right-20 bottom-0 h-96 w-96 rounded-full bg-primary/40 blur-3xl" />
        <div className="container relative grid grid-cols-1 items-center gap-12 py-20 lg:grid-cols-2 lg:py-28">
          <div>
            <span className="inline-block rounded-full border-2 border-background px-3 py-1 font-mono-pop text-xs uppercase tracking-widest">
              For vendors
            </span>
            <h1 className="mt-6 font-display text-5xl leading-[0.95] md:text-7xl">
              Cook it.<br />
              List it.<br />
              <span className="bg-accent px-3 text-accent-foreground">Sell out.</span>
            </h1>
            <p className="mt-6 max-w-md text-lg opacity-90">
              Join 1,200+ Nigerian kitchens, supermarkets and pharmacies turning GoBuyMe orders into a second storefront.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-full border-2 border-background bg-background px-6 py-3 font-mono-pop text-xs uppercase tracking-widest text-foreground shadow-[6px_6px_0_hsl(var(--foreground))] transition-all hover:translate-x-1 hover:translate-y-1 hover:shadow-none"
              >
                List your business →
              </button>
              <a
                href="#pricing"
                className="inline-flex items-center gap-2 rounded-full border-2 border-background px-6 py-3 font-mono-pop text-xs uppercase tracking-widest"
              >
                See pricing
              </a>
            </div>
          </div>
          <div className="relative h-[420px]">
            <motion.img
              src={jollof}
              alt="Jollof"
              className="absolute left-10 top-0 h-44 w-44 drop-shadow-[6px_6px_0_hsl(var(--foreground))]"
              animate={{ y: [0, -16, 0], rotate: [-4, 4, -4] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.img
              src={burger}
              alt="Burger"
              className="absolute right-0 top-24 h-48 w-48 drop-shadow-[6px_6px_0_hsl(var(--foreground))]"
              animate={{ y: [0, 18, 0], rotate: [3, -3, 3] }}
              transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.img
              src={grocery}
              alt="Grocery"
              className="absolute bottom-0 left-24 h-44 w-44 drop-shadow-[6px_6px_0_hsl(var(--foreground))]"
              animate={{ y: [0, -12, 0], rotate: [-2, 6, -2] }}
              transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
        </div>
      </section>

      <Marquee
        items={[
          "Our Dream",
          "₦8.4B paid to vendors",
          "1,200+ active partners",
          "Avg 38% revenue lift",
          "Onboard in 48 hrs",
          "Daily payouts",
        ]}
      />

      {/* PERKS */}
      <section className="border-b-2 border-ink py-20 md:py-28">
        <div className="container">
          <div className="max-w-2xl">
            <span className="font-mono-pop text-xs uppercase tracking-widest text-primary">Why vendors switch</span>
            <h2 className="mt-3 font-display text-4xl md:text-5xl">Everything you need.<br />Nothing you don't.</h2>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {perks.map((p, i) => (
              <motion.div
                key={p.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ rotate: i % 2 === 0 ? -1 : 1, y: -4 }}
                className="rounded-3xl border-2 border-ink bg-card p-7 shadow-pop-sm"
              >
                <div className="text-4xl">{p.icon}</div>
                <h3 className="mt-4 font-display text-2xl">{p.title}</h3>
                <p className="mt-2 text-muted-foreground">{p.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW */}
      <section className="border-b-2 border-ink bg-accent py-20 md:py-28 text-accent-foreground">
        <div className="container">
          <h2 className="max-w-2xl font-display text-4xl md:text-5xl">From sign-up to first order in 48 hours.</h2>
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-4">
            {[
              { n: "01", t: "Apply", b: "Drop your details. Takes 2 mins." },
              { n: "02", t: "Verify", b: "We confirm your kitchen / store." },
              { n: "03", t: "Upload menu", b: "Or we'll do it for you, free." },
              { n: "04", t: "Go live", b: "Orders start hitting your tablet." },
            ].map((s) => (
              <div key={s.n} className="rounded-3xl border-2 border-ink bg-background p-6 shadow-pop-sm">
                <div className="font-mono-pop text-xs uppercase tracking-widest text-primary">Step {s.n}</div>
                <h3 className="mt-3 font-display text-2xl">{s.t}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="border-b-2 border-ink py-20 md:py-28">
        <div className="container">
          <div className="max-w-2xl">
            <span className="font-mono-pop text-xs uppercase tracking-widest text-primary">Pricing</span>
            <h2 className="mt-3 font-display text-4xl md:text-5xl">Pick a plan. Grow your plate.</h2>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
            {tiers.map((t) => (
              <motion.div
                key={t.name}
                whileHover={{ y: -6 }}
                className={`relative rounded-3xl border-2 border-ink p-8 shadow-pop ${t.color} ${
                  t.featured ? "md:-translate-y-4" : ""
                }`}
              >
                {t.featured && (
                  <span className="absolute -top-4 left-6 rounded-full border-2 border-ink bg-hot px-3 py-1 font-mono-pop text-xs uppercase tracking-widest text-hot-foreground">
                    Most picked
                  </span>
                )}
                <div className="font-mono-pop text-xs uppercase tracking-widest opacity-70">{t.name}</div>
                <div className="mt-4 flex items-end gap-2">
                  <span className="font-display text-5xl">{t.price}</span>
                  <span className="pb-2 font-mono-pop text-xs uppercase tracking-widest opacity-70">{t.sub}</span>
                </div>
                <ul className="mt-6 space-y-2 text-sm">
                  {t.features.map((f) => (
                    <li key={f}>→ {f}</li>
                  ))}
                </ul>
                <button
                  onClick={() => t.bookCall ? setBookCallOpen(true) : setModalOpen(true)}
                  className="mt-8 inline-flex w-full items-center justify-center rounded-full border-2 border-ink bg-primary px-6 py-3 font-mono-pop text-xs uppercase tracking-widest text-primary-foreground shadow-pop-sm transition-all hover:translate-x-1 hover:translate-y-1 hover:shadow-none"
                >
                  {t.cta} →
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* APPLY */}
      <section id="apply" className="border-b-2 border-ink bg-foreground py-20 text-background md:py-28">
        <div className="container grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-4xl md:text-5xl">
              Ready to <span className="text-primary">sell more</span>?
            </h2>
            <p className="mt-4 max-w-md text-background/80">
              Create your vendor account in minutes. Our partnerships team will review and approve you within 24 hours.
            </p>
          </div>
          <div className="rounded-3xl border-2 border-background bg-background p-8 text-foreground shadow-pop">
            <p className="font-mono-pop text-xs uppercase tracking-widest text-muted-foreground">
              What you'll need
            </p>
            <ul className="mt-4 space-y-2 text-sm">
              {[
                "Business name & category",
                "Valid email address",
                "Business address",
                "A commission plan (Starter or Growth)",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-0.5 text-primary">→</span>
                  {item}
                </li>
              ))}
            </ul>
            <button
              onClick={() => setModalOpen(true)}
              className="mt-6 inline-flex w-full items-center justify-center rounded-full border-2 border-ink bg-primary px-6 py-3 font-mono-pop text-xs uppercase tracking-widest text-primary-foreground shadow-pop-sm transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none h-12"
            >
              Apply now →
            </button>
          </div>
        </div>
      </section>

      <RegistrationModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        defaultTab="vendor"
      />
      <BookCallModal open={bookCallOpen} onOpenChange={setBookCallOpen} />

      <Footer />
    </main>
  );
};

export default Vendors;
