"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { SimplePage } from "@/marketing/components/site/SimplePage";
import { Marquee } from "@/marketing/components/site/Marquee";
const rider = "/marketing/sticker-rider.png";

const tasks = [
  { emoji: "📦", name: "Send a package", note: "Documents, gifts, anything that fits on a bike" },
  { emoji: "🏦", name: "Bank runs", note: "Pay cash deposits, pick up cards, drop documents" },
  { emoji: "🛒", name: "Custom shopping", note: "We buy whatever you need from wherever you say" },
  { emoji: "🚗", name: "Inter-city dispatch", note: "Lagos ↔ Ibadan, Lagos ↔ Abeokuta, same-day" },
  { emoji: "🎁", name: "Surprise drops", note: "Anonymous gifts, flowers, birthday surprises" },
  { emoji: "🔁", name: "Returns & swaps", note: "Take that wrong-size dress back to the seller" },
];

const Errands = () => (
  <SimplePage
    eyebrow="Errands"
    title={
      <>
        Anything.<br />
        <span className="bg-hot px-3 text-hot-foreground">Anywhere.</span>
      </>
    }
    intro="If you can describe it, we can run it. Our riders pick up, drop off, queue, pay, and deliver — so you don't have to leave your meeting."
    heroBg="bg-foreground"
    heroText="text-background"
  >
    <Marquee items={["📦 Send", "🏦 Bank", "🛒 Buy", "🚗 Inter-city", "🎁 Gift", "🔁 Return"]} />

    <section className="container py-20">
      <div className="mb-10">
        <h2 className="font-display text-4xl md:text-5xl">Send us anywhere</h2>
        <p className="mt-3 max-w-2xl text-muted-foreground">Flat rates within the city, transparent pricing for inter-city. Live track every step.</p>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {tasks.map((t, i) => (
          <motion.article
            key={t.name}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.05 }}
            whileHover={{ y: -4 }}
            className="rounded-3xl border-2 border-ink bg-background p-6 shadow-pop-sm"
          >
            <div className="text-5xl">{t.emoji}</div>
            <h3 className="mt-4 font-display text-2xl">{t.name}</h3>
            <p className="mt-2 text-muted-foreground">{t.note}</p>
          </motion.article>
        ))}
      </div>
    </section>

    <section className="relative overflow-hidden border-y-2 border-ink bg-primary">
      <img src={rider} alt="Rider" className="absolute -bottom-6 -right-8 h-72 w-auto opacity-95 drop-shadow-[6px_6px_0_hsl(var(--ink))]" />
      <div className="container relative py-20 text-primary-foreground">
        <h2 className="max-w-xl font-display text-4xl md:text-6xl">From ₦800. Pickup in 15 min.</h2>
        <p className="mt-4 max-w-md opacity-90">No subscription. No surge after 6pm. Just send the request, we send the rider.</p>
        <Link href="/" className="mt-8 inline-flex items-center gap-2 rounded-full border-2 border-ink bg-foreground px-6 py-3 font-mono-pop text-xs uppercase tracking-widest text-background shadow-pop-sm">
          Send something →
        </Link>
      </div>
    </section>
  </SimplePage>
);

export default Errands;
