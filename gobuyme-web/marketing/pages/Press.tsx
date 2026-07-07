"use client";
import { motion } from "framer-motion";
import { SimplePage } from "@/marketing/components/site/SimplePage";

const stats = [
  { n: "500K+", l: "Active users" },
  { n: "12,000", l: "Vendors" },
  { n: "8,500", l: "Riders" },
  { n: "₦3.2B", l: "Paid to partners" },
];

const press = [
  { src: "TechCabal", quote: "GoBuyMe is reshaping last-mile delivery in West Africa.", date: "Mar 2025" },
  { src: "BusinessDay", quote: "The hyperlocal app Lagos didn't know it needed.", date: "Feb 2025" },
  { src: "Techpoint", quote: "From jollof to pharmacy in under 30 minutes.", date: "Jan 2025" },
  { src: "Disrupt Africa", quote: "One of the most exciting logistics plays on the continent.", date: "Dec 2024" },
];

const Press = () => (
  <SimplePage
    eyebrow="Press & Media"
    title={
      <>
        We're in the<br />
        <span className="bg-hot px-3 text-hot-foreground">papers.</span>
      </>
    }
    intro="Story angles, founder bios, brand assets and high-resolution logos — everything you need to write about GoBuyMe."
    heroBg="bg-accent"
    heroText="text-accent-foreground"
  >
    <section className="border-b-2 border-ink bg-background">
      <div className="container grid grid-cols-2 gap-6 py-12 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.l} className="text-center">
            <div className="font-display text-4xl md:text-5xl">{s.n}</div>
            <div className="mt-2 font-mono-pop text-xs uppercase tracking-widest text-muted-foreground">{s.l}</div>
          </div>
        ))}
      </div>
    </section>

    <section className="container py-20">
      <h2 className="mb-10 font-display text-4xl md:text-5xl">In the news</h2>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {press.map((p, i) => (
          <motion.article
            key={p.src}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.05 }}
            className="rounded-3xl border-2 border-ink bg-background p-8 shadow-pop-sm"
          >
            <div className="font-mono-pop text-xs uppercase tracking-widest text-primary">{p.src} · {p.date}</div>
            <p className="mt-4 font-display text-2xl leading-snug">"{p.quote}"</p>
          </motion.article>
        ))}
      </div>
    </section>

    <section className="border-y-2 border-ink bg-foreground text-background">
      <div className="container py-20">
        <h2 className="font-display text-4xl md:text-5xl">Media kit</h2>
        <p className="mt-3 max-w-xl opacity-80">Logos (PNG + SVG), brand colours, founder photos and our official one-pager.</p>
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          {["Brand assets (.zip)", "Founder photos (.zip)", "One-pager (.pdf)"].map((d) => (
            <a
              key={d}
              href="mailto:press@gobuyme.shop"
              className="rounded-2xl border-2 border-background bg-background p-6 text-foreground shadow-[6px_6px_0_hsl(var(--primary))] transition-all hover:translate-x-1 hover:translate-y-1 hover:shadow-none"
            >
              <div className="font-mono-pop text-xs uppercase tracking-widest text-primary">Download</div>
              <div className="mt-2 font-display text-lg">{d}</div>
            </a>
          ))}
        </div>
        <p className="mt-8 font-mono-pop text-xs uppercase tracking-widest opacity-70">
          Press inquiries → press@gobuyme.shop
        </p>
      </div>
    </section>
  </SimplePage>
);

export default Press;
