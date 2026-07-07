"use client";
import { motion } from "framer-motion";
import { useState } from "react";
import { PageNav } from "@/marketing/components/site/PageNav";
import { Footer } from "@/marketing/components/site/Footer";
import { Marquee } from "@/marketing/components/site/Marquee";
import { RegistrationModal } from "@/marketing/components/site/RegistrationModal";
const rider = "/marketing/sticker-rider.png";

const perks = [
  { icon: "💰", title: "₦150k+ / mo", body: "Top riders earn over ₦150,000 monthly with peak-hour bonuses." },
  { icon: "⏰", title: "Ride your hours", body: "Log on whenever. No shifts. No bosses. No drama." },
  { icon: "⚡", title: "Weekly cash-out", body: "Friday payouts straight to your bank. Or instant for ₦50." },
  { icon: "🛡️", title: "Free insurance", body: "Accident & bike cover on every active trip — on us." },
  { icon: "🎁", title: "Streak bonuses", body: "Hit 25 trips in a week, unlock ₦10k bonus. Every week." },
  { icon: "🏍️", title: "Bike financing", body: "Don't have a bike? Lease-to-own from ₦4,500/day." },
];

const Riders = () => {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <main className="min-h-screen bg-background">
      <PageNav />

      {/* HERO */}
      <section className="relative overflow-hidden border-b-2 border-ink bg-foreground text-background">
        <div className="absolute -right-20 -top-20 h-96 w-96 rounded-full bg-primary/40 blur-3xl" />
        <div className="absolute -left-20 bottom-0 h-80 w-80 rounded-full bg-accent/30 blur-3xl" />
        <div className="container relative grid grid-cols-1 items-center gap-12 py-20 lg:grid-cols-2 lg:py-28">
          <div>
            <span className="inline-block rounded-full border-2 border-background px-3 py-1 font-mono-pop text-xs uppercase tracking-widest">
              For riders
            </span>
            <h1 className="mt-6 font-display text-5xl leading-[0.95] md:text-7xl">
              Ride.<br />
              Earn.<br />
              <span className="text-primary">Repeat.</span>
            </h1>
            <p className="mt-6 max-w-md text-lg text-background/80">
              Become a GoBuyMe Captain. Flexible hours, weekly cash-outs and the busiest order book in Nigeria.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-full border-2 border-background bg-primary px-6 py-3 font-mono-pop text-xs uppercase tracking-widest text-primary-foreground shadow-[6px_6px_0_hsl(var(--background))] transition-all hover:translate-x-1 hover:translate-y-1 hover:shadow-none"
              >
                Become a rider →
              </button>
              <a
                href="#earnings"
                className="inline-flex items-center gap-2 rounded-full border-2 border-background px-6 py-3 font-mono-pop text-xs uppercase tracking-widest"
              >
                See earnings
              </a>
            </div>
          </div>
          <div className="relative h-[420px]">
            <motion.img
              src={rider}
              alt="Delivery rider"
              className="absolute inset-0 m-auto h-80 w-auto drop-shadow-[10px_10px_0_hsl(var(--primary))]"
              animate={{ y: [0, -14, 0], rotate: [-2, 2, -2] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
              className="absolute right-4 top-4 grid h-28 w-28 place-items-center rounded-full border-2 border-background bg-accent text-accent-foreground"
            >
              <span className="text-center font-display text-sm leading-tight">
                ₦150K+<br />/month
              </span>
            </motion.div>
          </div>
        </div>
      </section>

      <Marquee
        items={[
          "12,000+ active captains",
          "Avg payout ₦38,500/week",
          "98% on-time delivery",
          "Free insurance included",
          "Cash-out daily",
        ]}
      />

      {/* PERKS */}
      <section className="border-b-2 border-ink py-20 md:py-28">
        <div className="container">
          <div className="max-w-2xl">
            <span className="font-mono-pop text-xs uppercase tracking-widest text-primary">Why ride with us</span>
            <h2 className="mt-3 font-display text-4xl md:text-5xl">Built for the road.<br />Built for you.</h2>
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

      {/* EARNINGS */}
      <section id="earnings" className="border-b-2 border-ink bg-primary py-20 text-primary-foreground md:py-28">
        <div className="container">
          <h2 className="max-w-2xl font-display text-4xl md:text-5xl">Real earnings. No fairy tales.</h2>
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
            {[
              { tier: "Part-time", trips: "10 trips/day", weekly: "₦22,000", monthly: "₦88,000" },
              { tier: "Full-time", trips: "20 trips/day", weekly: "₦42,000", monthly: "₦168,000", featured: true },
              { tier: "Hustler", trips: "30+ trips/day", weekly: "₦64,000", monthly: "₦256,000" },
            ].map((e) => (
              <motion.div
                key={e.tier}
                whileHover={{ y: -6 }}
                className={`rounded-3xl border-2 border-ink bg-background p-8 text-foreground shadow-pop ${
                  e.featured ? "md:-translate-y-4" : ""
                }`}
              >
                <div className="font-mono-pop text-xs uppercase tracking-widest text-primary">{e.tier}</div>
                <div className="mt-2 text-sm text-muted-foreground">{e.trips}</div>
                <div className="mt-6 font-display text-5xl">{e.monthly}</div>
                <div className="mt-1 font-mono-pop text-xs uppercase tracking-widest text-muted-foreground">
                  per month · {e.weekly}/wk
                </div>
              </motion.div>
            ))}
          </div>
          <p className="mt-6 font-mono-pop text-xs uppercase tracking-widest opacity-80">
            * Based on Lagos rider averages (Jan–Mar 2026). Bonuses not included.
          </p>
        </div>
      </section>

      {/* REQUIREMENTS */}
      <section className="border-b-2 border-ink py-20 md:py-28">
        <div className="container grid grid-cols-1 gap-12 lg:grid-cols-2">
          <div>
            <span className="font-mono-pop text-xs uppercase tracking-widest text-primary">Requirements</span>
            <h2 className="mt-3 font-display text-4xl md:text-5xl">What you'll need.</h2>
            <ul className="mt-8 space-y-4">
              {[
                "18+ years old",
                "Valid Nigerian ID (NIN, Driver's License or Voter's Card)",
                "Smartphone (Android 8+ or iPhone)",
                "Bike or willingness to lease one",
                "Valid rider's permit",
              ].map((r) => (
                <li key={r} className="flex items-start gap-3 border-b-2 border-dashed border-ink pb-3 font-mono-pop text-sm uppercase tracking-wider">
                  <span className="text-primary">✓</span> {r}
                </li>
              ))}
            </ul>
          </div>
          <motion.div
            whileHover={{ rotate: 1 }}
            className="rounded-3xl border-2 border-ink bg-accent p-10 text-accent-foreground shadow-pop"
          >
            <h3 className="font-display text-3xl">No bike? No problem.</h3>
            <p className="mt-4">
              Our lease-to-own program puts a brand-new Sonik bike under you for as low as ₦4,500/day. Pay from your earnings, own it in 18 months.
            </p>
            <button
              onClick={() => setModalOpen(true)}
              className="mt-6 inline-flex items-center gap-2 rounded-full border-2 border-ink bg-foreground px-6 py-3 font-mono-pop text-xs uppercase tracking-widest text-background shadow-pop-sm transition-all hover:translate-x-1 hover:translate-y-1 hover:shadow-none"
            >
              Apply for a bike →
            </button>
          </motion.div>
        </div>
      </section>

      {/* SIGNUP */}
      <section id="signup" className="border-b-2 border-ink bg-hot py-20 text-hot-foreground md:py-28">
        <div className="container grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-4xl md:text-5xl">
              Start earning <span className="bg-accent px-3 text-accent-foreground">this week</span>.
            </h2>
            <p className="mt-4 max-w-md opacity-90">
              Sign up takes a few minutes. Once approved, you'll be on the road and earning within 48 hours.
            </p>
          </div>
          <div className="rounded-3xl border-2 border-ink bg-background p-8 text-foreground shadow-pop">
            <p className="font-mono-pop text-xs uppercase tracking-widest text-muted-foreground">
              What you'll need
            </p>
            <ul className="mt-4 space-y-2 text-sm">
              {[
                "Valid email address",
                "NIN (National ID Number)",
                "Your vehicle type",
                "A guarantor (optional)",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-0.5 text-primary">→</span>
                  {item}
                </li>
              ))}
            </ul>
            <button
              onClick={() => setModalOpen(true)}
              className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full border-2 border-ink bg-foreground px-6 font-mono-pop text-xs uppercase tracking-widest text-background shadow-pop-sm transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
            >
              Become a rider →
            </button>
          </div>
        </div>
      </section>

      <RegistrationModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        defaultTab="rider"
      />

      <Footer />
    </main>
  );
};

export default Riders;
