"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { SimplePage } from "@/marketing/components/site/SimplePage";
import { Marquee } from "@/marketing/components/site/Marquee";

const services = [
  { emoji: "💊", name: "Prescription refills", note: "Upload your prescription, we verify and deliver" },
  { emoji: "🩹", name: "OTC essentials", note: "Paracetamol, vitamins, first-aid, sanitary care" },
  { emoji: "🌡️", name: "Health devices", note: "Thermometers, BP monitors, glucose strips" },
  { emoji: "👶", name: "Baby & Mom", note: "Diapers, formula, baby wipes, prenatal" },
  { emoji: "🧴", name: "Skincare & Beauty", note: "Sunscreen, cleansers, dermatologist picks" },
  { emoji: "🚑", name: "Emergency 60-min", note: "Critical meds delivered within an hour" },
];

const Pharmacy = () => (
  <SimplePage
    eyebrow="Pharmacy"
    title={
      <>
        Wellness,<br />
        <span className="bg-leaf px-3 text-leaf-foreground">on demand.</span>
      </>
    }
    intro="Verified pharmacies. Real pharmacists. Discreet delivery. Get your meds without leaving the couch — even at 2am."
    heroBg="bg-accent"
    heroText="text-accent-foreground"
  >
    <Marquee items={["💊 Rx", "🩹 OTC", "🌡️ Devices", "👶 Baby", "🧴 Beauty", "🚑 Emergency"]} />

    <section className="container py-20">
      <div className="mb-10">
        <h2 className="font-display text-4xl md:text-5xl">Care, categorised</h2>
        <p className="mt-3 max-w-2xl text-muted-foreground">Every item ships from a NAFDAC-licensed pharmacy. Cold-chain available for sensitive medication.</p>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {services.map((s, i) => (
          <motion.article
            key={s.name}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.05 }}
            whileHover={{ y: -4, rotate: i % 2 === 0 ? -1 : 1 }}
            className="rounded-3xl border-2 border-ink bg-background p-6 shadow-pop-sm"
          >
            <div className="text-5xl">{s.emoji}</div>
            <h3 className="mt-4 font-display text-2xl">{s.name}</h3>
            <p className="mt-2 text-muted-foreground">{s.note}</p>
          </motion.article>
        ))}
      </div>
    </section>

    <section className="border-y-2 border-ink bg-leaf">
      <div className="container py-20 text-center text-leaf-foreground">
        <h2 className="font-display text-4xl md:text-6xl">Need it now?</h2>
        <p className="mx-auto mt-4 max-w-xl opacity-90">Tap the SOS button in the app for 60-minute emergency delivery in Lagos and Abuja. Available 24/7.</p>
        <Link href="/" className="mt-8 inline-flex items-center gap-2 rounded-full border-2 border-ink bg-foreground px-6 py-3 font-mono-pop text-xs uppercase tracking-widest text-background shadow-pop-sm">
          Order meds →
        </Link>
      </div>
    </section>
  </SimplePage>
);

export default Pharmacy;
