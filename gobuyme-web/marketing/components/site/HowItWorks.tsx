"use client";
import { motion } from "framer-motion";

const steps = [
  { n: "01", title: "Open the app", desc: "Browse spots near you. Filter by craving, price, vibe." },
  { n: "02", title: "Tap to order", desc: "Customise, pay with card / transfer / wallet. Done in seconds." },
  { n: "03", title: "Track your rider", desc: "Live map. ETA in minutes. Chat directly if needed." },
  { n: "04", title: "Devour. Repeat.", desc: "Rate your order. Earn loyalty points on every drop." },
];

export const HowItWorks = () => (
  <section id="how" className="relative overflow-hidden border-b-2 border-ink bg-foreground py-20 text-background md:py-28">
    <div className="absolute inset-0 bg-grid opacity-40" />
    <div className="container relative">
      <div className="mb-14">
        <div className="mb-4 inline-block rounded-full border-2 border-background bg-foreground px-3 py-1 font-mono-pop text-xs uppercase tracking-widest text-background">
          [ how it works ]
        </div>
        <h2 className="font-display text-5xl leading-[0.95] md:text-7xl">
          From craving to <span className="text-primary">chewing</span><br />in four taps.
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <motion.div
            key={s.n}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: i * 0.1 }}
            className="relative rounded-3xl border-2 border-background bg-background p-6 text-foreground"
          >
            <div className="flex items-baseline justify-between">
              <span className="font-display text-6xl text-primary">{s.n}</span>
              <span className="font-mono-pop text-xs uppercase tracking-widest text-muted-foreground">step</span>
            </div>
            <h3 className="mt-4 font-display text-2xl">{s.title}</h3>
            <p className="mt-2 text-muted-foreground">{s.desc}</p>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);
