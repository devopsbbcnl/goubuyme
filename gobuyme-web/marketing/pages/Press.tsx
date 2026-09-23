"use client";
import { motion } from "framer-motion";
import { SimplePage } from "@/marketing/components/site/SimplePage";

const stats = [
  { n: "Owerri", l: "Now live" },
  { n: "25min", l: "Avg delivery" },
  { n: "3%", l: "Commission from" },
  { n: "Nigeria", l: "Expanding across" },
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
      <p className="max-w-xl text-muted-foreground">
        We're just getting started in Owerri — press coverage will show up here as it happens.
        In the meantime, reach out to press@gobuyme.shop for interviews, founder access or the media kit below.
      </p>
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
