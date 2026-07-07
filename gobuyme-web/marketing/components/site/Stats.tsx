"use client";
import { motion } from "framer-motion";

const stats = [
  { k: "500+", v: "Restaurants" },
  { k: "50+", v: "Cities live" },
  { k: "25min", v: "Avg delivery" },
  { k: "4.9★", v: "App rating" },
];

export const Stats = () => (
  <section className="border-b-2 border-ink bg-accent py-14">
    <div className="container">
      <div className="grid grid-cols-2 gap-y-10 md:grid-cols-4">
        {stats.map((s, i) => (
          <motion.div
            key={s.v}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08 }}
            className="text-center"
          >
            <div className="font-display text-5xl text-foreground md:text-7xl">{s.k}</div>
            <div className="mt-2 font-mono-pop text-xs uppercase tracking-widest text-foreground/70">{s.v}</div>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);
