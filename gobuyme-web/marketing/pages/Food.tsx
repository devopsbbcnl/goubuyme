"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { SimplePage } from "@/marketing/components/site/SimplePage";
import { Marquee } from "@/marketing/components/site/Marquee";
const jollof = "/marketing/sticker-jollof.png";
const burger = "/marketing/sticker-burger.png";

const cuisines = [
  { emoji: "🍛", name: "Jollof & Rice", note: "Party jollof, fried rice, coconut rice" },
  { emoji: "🍲", name: "Soups & Swallow", note: "Egusi, afang, ogbono, eba, amala" },
  { emoji: "🍔", name: "Burgers & Fast Food", note: "From The Place to that new spot in Lekki" },
  { emoji: "🍕", name: "Pizza & Pasta", note: "Wood-fired, Chicago-style, you name it" },
  { emoji: "🍗", name: "Suya & Grills", note: "Late-night suya runs, peppered chicken" },
  { emoji: "🍰", name: "Desserts & Drinks", note: "Cake, smoothies, zobo, chapman" },
];

const Food = () => (
  <SimplePage
    eyebrow="Food delivery"
    title={
      <>
        Hot food.<br />
        <span className="bg-accent px-3 text-accent-foreground">25 minutes.</span>
      </>
    }
    intro="From your favourite mama-put to that fancy spot you've been eyeing on Instagram — order it, we deliver it. Hot. Fast. Right."
    heroBg="bg-hot"
    heroText="text-hot-foreground"
  >
    <Marquee items={["🍛 Jollof", "🍔 Burgers", "🍕 Pizza", "🍗 Suya", "🥘 Soups", "🍰 Cake"]} />

    <section className="container py-20">
      <div className="mb-10 flex items-end justify-between">
        <h2 className="font-display text-4xl md:text-5xl">What's cooking</h2>
        <span className="font-mono-pop text-xs uppercase tracking-widest text-muted-foreground">6 categories</span>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {cuisines.map((c, i) => (
          <motion.article
            key={c.name}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.05 }}
            whileHover={{ y: -4, rotate: i % 2 === 0 ? -1 : 1 }}
            className="rounded-3xl border-2 border-ink bg-background p-6 shadow-pop-sm"
          >
            <div className="text-5xl">{c.emoji}</div>
            <h3 className="mt-4 font-display text-2xl">{c.name}</h3>
            <p className="mt-2 text-muted-foreground">{c.note}</p>
          </motion.article>
        ))}
      </div>
    </section>

    <section className="border-y-2 border-ink bg-accent">
      <div className="container grid grid-cols-1 items-center gap-10 py-20 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-4xl text-accent-foreground md:text-6xl">Hungry now?</h2>
          <p className="mt-4 max-w-md text-accent-foreground/80">
            Open the app, pick your spice level, watch the rider come through. Average time door-to-door: 25 minutes in Lagos.
          </p>
          <Link
            href="/downloads"
            className="mt-8 inline-flex items-center gap-2 rounded-full border-2 border-ink bg-foreground px-6 py-3 font-mono-pop text-xs uppercase tracking-widest text-background shadow-pop-sm"
          >
            Get the app →
          </Link>
        </div>
        <div className="relative h-72">
          <img src={jollof} alt="Jollof rice" className="absolute left-0 top-0 h-48 w-48 rotate-[-8deg] drop-shadow-[6px_6px_0_hsl(var(--ink))]" />
          <img src={burger} alt="Burger" className="absolute right-4 bottom-0 h-48 w-48 rotate-[10deg] drop-shadow-[6px_6px_0_hsl(var(--ink))]" />
        </div>
      </div>
    </section>
  </SimplePage>
);

export default Food;
