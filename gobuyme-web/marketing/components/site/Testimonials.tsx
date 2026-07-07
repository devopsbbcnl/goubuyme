"use client";
import { motion } from "framer-motion";

const quotes = [
  { q: "Ordered jollof at 11pm. Arrived hot at 11:24pm. GoBuyMe is now my therapist.", n: "Tola A.", c: "Lagos", color: "bg-primary text-primary-foreground" },
  { q: "Listed my buka on a Tuesday. By Friday I had 80 new orders. This app is unfair.", n: "Mama Nkechi", c: "Abuja", color: "bg-accent text-accent-foreground" },
  { q: "I ride part-time after work and pulled ₦62k last week alone. No be small thing.", n: "Emeka O.", c: "Port Harcourt", color: "bg-leaf text-leaf-foreground" },
  { q: "The tracking actually works. My rider sent me a meme while waiting at the gate.", n: "Adaeze U.", c: "Lagos", color: "bg-hot text-hot-foreground" },
];

export const Testimonials = () => (
  <section className="border-b-2 border-ink bg-background py-20 md:py-28">
    <div className="container">
      <div className="mb-14 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="mb-4 inline-block rounded-full border-2 border-ink bg-background px-3 py-1 font-mono-pop text-xs uppercase tracking-widest">
            [ word on the street ]
          </div>
          <h2 className="font-display text-5xl leading-[0.95] md:text-7xl">
            Real Nigerians.<br />Real cravings. <span className="text-primary">Solved.</span>
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {quotes.map((t, i) => (
          <motion.figure
            key={t.n}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ delay: i * 0.08 }}
            whileHover={{ rotate: i % 2 === 0 ? -1.5 : 1.5, y: -4 }}
            className={`rounded-3xl border-2 border-ink ${t.color} p-8 shadow-pop`}
          >
            <div className="font-display text-6xl leading-none opacity-50">"</div>
            <blockquote className="mt-2 text-xl font-medium leading-snug md:text-2xl">{t.q}</blockquote>
            <figcaption className="mt-6 flex items-center justify-between font-mono-pop text-xs uppercase tracking-widest">
              <span>{t.n}</span>
              <span className="opacity-70">{t.c}</span>
            </figcaption>
          </motion.figure>
        ))}
      </div>
    </div>
  </section>
);
