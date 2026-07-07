"use client";
import { motion } from "framer-motion";
const jollof = "/marketing/sticker-jollof.png";
const burger = "/marketing/sticker-burger.png";
const grocery = "/marketing/sticker-grocery.png";
const playstoreIcon = "/marketing/playstore-svgrepo-com.svg";

export const Hero = () => {
  return (
    <section className="relative overflow-hidden border-b-2 border-ink bg-background">
      {/* dotted bg */}
      <div className="pointer-events-none absolute inset-0 bg-dots opacity-60" />
      {/* big orange swoosh from logo */}
      <svg
        className="pointer-events-none absolute -bottom-16 left-1/2 -z-0 w-[140%] -translate-x-1/2 text-primary"
        viewBox="0 0 1200 200"
        fill="none"
        aria-hidden
      >
        <path d="M0 140 C 300 40, 900 40, 1200 140 L 1200 200 L 0 200 Z" fill="currentColor" opacity="0.18" />
      </svg>

      <div className="container relative z-10 grid grid-cols-1 gap-10 py-16 md:py-24 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 rounded-full border-2 border-ink bg-accent px-4 py-1.5 font-mono-pop text-xs uppercase tracking-widest shadow-pop-sm"
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-hot" />
            Now delivering across major cities in Nigeria
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="font-display mt-6 text-[clamp(3rem,9vw,7.5rem)] leading-[0.88]"
          >
            Hungry?
            <br />
            <span className="relative inline-block">
              <span className="relative z-10 text-primary">GoBuyMe.</span>
              <svg className="absolute -bottom-3 left-0 z-0 w-full" viewBox="0 0 400 30" preserveAspectRatio="none" aria-hidden>
                <path d="M5 22 C 100 4, 300 4, 395 22" stroke="hsl(var(--primary))" strokeWidth="8" fill="none" strokeLinecap="round" />
              </svg>
            </span>
            <br />
            <span className="text-stroke">Anything.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="mt-8 max-w-xl text-lg text-muted-foreground md:text-xl"
          >
            Jollof at noon. Groceries by 6. Pharmacy at midnight. One app delivers
            <span className="font-semibold text-foreground"> everything </span>
            from your favourite spots — in 25 minutes flat.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55, duration: 0.5 }}
            className="mt-10 flex flex-wrap items-center gap-4"
          >
            <a
              href="/home"
              className="group inline-flex items-center gap-3 rounded-full border-2 border-ink bg-hot px-6 py-4 text-hot-foreground shadow-pop transition-all hover:-translate-y-1 hover:shadow-pop-orange"
            >
              <span className="font-display text-lg">Order Now</span>
              <span aria-hidden>→</span>
            </a>
            <a
              href="#download"
              className="group inline-flex items-center gap-3 rounded-full border-2 border-ink bg-foreground px-6 py-4 text-background shadow-pop transition-all hover:-translate-y-1 hover:translate-x-0 hover:shadow-pop-orange"
            >
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
              <div className="text-left leading-tight">
                <div className="font-mono-pop text-[10px] uppercase tracking-widest opacity-75">Download on</div>
                <div className="font-display text-lg">App Store</div>
              </div>
            </a>
            <a
              href="#download"
              className="group inline-flex items-center gap-3 rounded-full border-2 border-ink bg-primary px-6 py-4 text-primary-foreground shadow-pop transition-all hover:-translate-y-1 hover:shadow-pop-orange"
            >
              <img src={playstoreIcon} className="h-6 w-6" alt="" aria-hidden />
              <div className="text-left leading-tight">
                <div className="font-mono-pop text-[10px] uppercase tracking-widest opacity-90">Get it on</div>
                <div className="font-display text-lg">Google Play</div>
              </div>
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="mt-10 flex items-center gap-6 font-mono-pop text-xs uppercase tracking-widest text-muted-foreground"
          >
            <div className="flex -space-x-2">
              {["bg-primary", "bg-hot", "bg-accent", "bg-leaf"].map((c, i) => (
                <div key={i} className={`h-8 w-8 rounded-full border-2 border-ink ${c}`} />
              ))}
            </div>
            <div>
              <span className="font-display text-lg text-foreground">120k+</span> happy bellies this month
            </div>
          </motion.div>
        </div>

        {/* Sticker collage */}
        <div className="relative lg:col-span-5">
          <motion.div
            initial={{ opacity: 0, scale: 0.6, rotate: -10 }}
            animate={{ opacity: 1, scale: 1, rotate: -8 }}
            transition={{ delay: 0.3, type: "spring", stiffness: 80 }}
            className="absolute left-4 top-2 z-30 w-56 rotate-[-8deg]"
          >
            <div className="relative">
              <img src={jollof} alt="Bowl of jollof rice" className="float-y h-auto w-full drop-shadow-[8px_8px_0_hsl(var(--foreground))]" />
              <div className="absolute -right-3 -top-3 rounded-full border-2 border-ink bg-hot px-3 py-1 font-mono-pop text-xs uppercase text-hot-foreground shadow-pop-sm">
                ₦2,500
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.6, rotate: 20 }}
            animate={{ opacity: 1, scale: 1, rotate: 12 }}
            transition={{ delay: 0.5, type: "spring", stiffness: 80 }}
            className="absolute right-0 top-32 z-20 w-48"
          >
            <div className="relative wiggle">
              <img src={burger} alt="Cheese burger" className="h-auto w-full drop-shadow-[8px_8px_0_hsl(var(--foreground))]" />
              <div className="absolute -left-4 top-2 rounded-full border-2 border-ink bg-accent px-3 py-1 font-mono-pop text-xs uppercase shadow-pop-sm">
                Hot 🔥
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, type: "spring", stiffness: 60 }}
            className="absolute bottom-0 left-12 z-10 w-56"
          >
            <img src={grocery} alt="Grocery bag with fresh produce" className="float-y h-auto w-full drop-shadow-[8px_8px_0_hsl(var(--foreground))]" style={{ animationDelay: "1.5s" }} />
          </motion.div>

          {/* spinning badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.9, type: "spring" }}
            className="absolute -right-2 bottom-4 z-40"
          >
            <div className="relative grid h-32 w-32 place-items-center">
              <svg viewBox="0 0 200 200" className="spin-slow absolute inset-0 h-full w-full text-foreground">
                <defs>
                  <path id="circ" d="M 100, 100 m -75, 0 a 75,75 0 1,1 150,0 a 75,75 0 1,1 -150,0" />
                </defs>
                <text fill="currentColor" className="font-mono-pop" fontSize="18" letterSpacing="3">
                  <textPath href="#circ">25 MIN DELIVERY • FRESH • FAST • LOCAL •</textPath>
                </text>
              </svg>
              <div className="grid h-14 w-14 place-items-center rounded-full border-2 border-ink bg-primary text-primary-foreground shadow-pop-sm">
                <span className="font-display text-xl">★</span>
              </div>
            </div>
          </motion.div>

          {/* spacer for height on small screens */}
          <div className="h-[520px] md:h-[560px]" />
        </div>
      </div>
    </section>
  );
};
