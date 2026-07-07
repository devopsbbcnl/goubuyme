"use client";
import { motion } from "framer-motion";
const playstoreIcon = "/marketing/playstore-svgrepo-com.svg";

export const DownloadCTA = () => (
  <section id="download" className="relative overflow-hidden border-b-2 border-ink bg-primary py-24 text-primary-foreground md:py-32">
    <div className="absolute inset-0 bg-dots opacity-20" />
    {/* huge background type */}
    <div className="pointer-events-none absolute inset-x-0 top-0 select-none overflow-hidden">
      <div className="font-display text-[22vw] leading-none text-stroke opacity-30" style={{ WebkitTextStrokeColor: 'hsl(var(--primary-foreground))' }}>
        EAT NOW
      </div>
    </div>

    <div className="container relative z-10 text-center">
      <motion.h2
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="font-display text-6xl leading-[0.95] md:text-8xl"
      >
        Your next meal is<br />
        <span className="relative inline-block">
          one tap away.
          <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 400 18" preserveAspectRatio="none" aria-hidden>
            <path d="M0 14 C 100 2, 300 2, 400 14" stroke="hsl(var(--accent))" strokeWidth="6" fill="none" strokeLinecap="round" />
          </svg>
        </span>
      </motion.h2>

      <p className="mx-auto mt-6 max-w-xl text-lg opacity-90">
        Download GoBuyMe free. No subscription. No hidden fees. Just food, fast.
      </p>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.2 }}
        className="mt-10 flex flex-wrap items-center justify-center gap-4"
      >
        <a href="#" className="inline-flex items-center gap-3 rounded-full border-2 border-background bg-foreground px-7 py-4 text-background shadow-[8px_8px_0_hsl(var(--background))] transition-all hover:translate-x-1 hover:translate-y-1 hover:shadow-none">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
          <div className="text-left leading-tight">
            <div className="font-mono-pop text-[10px] uppercase tracking-widest opacity-75">Download on</div>
            <div className="font-display text-lg">App Store</div>
          </div>
        </a>
        <a href="#" className="inline-flex items-center gap-3 rounded-full border-2 border-background bg-background px-7 py-4 text-foreground shadow-[8px_8px_0_hsl(var(--foreground))] transition-all hover:translate-x-1 hover:translate-y-1 hover:shadow-none">
          <img src={playstoreIcon} className="h-6 w-6" alt="" aria-hidden />
          <div className="text-left leading-tight">
            <div className="font-mono-pop text-[10px] uppercase tracking-widest opacity-75">Get it on</div>
            <div className="font-display text-lg">Google Play</div>
          </div>
        </a>
      </motion.div>
    </div>
  </section>
);
