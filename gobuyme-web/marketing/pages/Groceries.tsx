"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { SimplePage } from "@/marketing/components/site/SimplePage";
import { Marquee } from "@/marketing/components/site/Marquee";
const grocery = "/marketing/sticker-grocery.png";

const aisles = [
  { emoji: "🥦", name: "Fresh produce", note: "Tomato, pepper, ugu, ewedu — straight from Mile 12" },
  { emoji: "🍞", name: "Pantry staples", note: "Garri, rice, beans, semo, indomie" },
  { emoji: "🥩", name: "Meat & Fish", note: "Suya cut, goat meat, croaker, titus" },
  { emoji: "🥛", name: "Dairy & Eggs", note: "Peak, Hollandia, crate of eggs" },
  { emoji: "🧴", name: "Household", note: "Detergent, tissue, dish soap, candles" },
  { emoji: "🍷", name: "Drinks & Wine", note: "Hennessy to Hollandia yoghurt" },
];

const Groceries = () => (
  <SimplePage
    eyebrow="Groceries"
    title={
      <>
        Skip the market.<br />
        <span className="bg-primary px-3 text-primary-foreground">Keep your weekend.</span>
      </>
    }
    intro="Mile 12 prices, doorstep delivery. Our shoppers hand-pick every yam, weigh every kilo of meat, and bring it to you within hours."
    heroBg="bg-leaf"
    heroText="text-leaf-foreground"
  >
    <Marquee items={["🥦 Fresh", "🥩 Meat", "🍞 Pantry", "🥛 Dairy", "🧴 Home", "🍷 Drinks"]} />

    <section className="container py-20">
      <div className="mb-10">
        <h2 className="font-display text-4xl md:text-5xl">Every aisle, in your pocket</h2>
        <p className="mt-3 max-w-2xl text-muted-foreground">Over 8,000 items from local markets, supermarkets and specialty stores across Lagos, Abuja and Port Harcourt.</p>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {aisles.map((a, i) => (
          <motion.article
            key={a.name}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.05 }}
            whileHover={{ y: -4 }}
            className="rounded-3xl border-2 border-ink bg-background p-6 shadow-pop-sm"
          >
            <div className="text-5xl">{a.emoji}</div>
            <h3 className="mt-4 font-display text-2xl">{a.name}</h3>
            <p className="mt-2 text-muted-foreground">{a.note}</p>
          </motion.article>
        ))}
      </div>
    </section>

    <section className="border-y-2 border-ink bg-foreground text-background">
      <div className="container grid grid-cols-1 items-center gap-10 py-20 lg:grid-cols-2">
        <img src={grocery} alt="Grocery bag" className="mx-auto h-72 w-auto rotate-[-6deg] drop-shadow-[6px_6px_0_hsl(var(--primary))]" />
        <div>
          <h2 className="font-display text-4xl md:text-6xl">
            Shop today.<br /><span className="text-primary">Eat tonight.</span>
          </h2>
          <p className="mt-4 max-w-md opacity-80">Schedule a weekly shop or order on demand. Our personal shoppers WhatsApp you for substitutions if anything's out of stock.</p>
          <Link href="/" className="mt-8 inline-flex items-center gap-2 rounded-full border-2 border-background bg-primary px-6 py-3 font-mono-pop text-xs uppercase tracking-widest text-primary-foreground shadow-[6px_6px_0_hsl(var(--background))]">
            Start shopping →
          </Link>
        </div>
      </div>
    </section>
  </SimplePage>
);

export default Groceries;
