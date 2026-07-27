"use client";
import { motion } from "framer-motion";
const jollof = "/marketing/sticker-jollof.png";
const grocery = "/marketing/sticker-grocery.png";
const burger = "/marketing/sticker-burger.png";

const services = [
  { tag: "01", title: "Food", desc: "From buka classics to fine dining. Order from 500+ partner restaurants near you.", img: jollof, bg: "bg-primary", textColor: "text-primary-foreground", price: "from ₦1,500" },
  { tag: "02", title: "Groceries", desc: "Fresh produce, household essentials & market runs delivered same-day.", img: grocery, bg: "bg-leaf", textColor: "text-leaf-foreground", price: "same-day" },
  { tag: "03", title: "Anything", desc: "Pharmacy. Documents. Surprise gifts. If you can buy it, we can get it.", img: burger, bg: "bg-accent", textColor: "text-accent-foreground", price: "errand mode" },
];

export const Services = () => {
  return (
    <section id="services" className="relative border-b-2 border-ink bg-background py-20 md:py-28">
      <div className="container">
        <div className="mb-14 flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div>
            <div className="mb-4 inline-block rounded-full border-2 border-ink bg-background px-3 py-1 font-mono-pop text-xs uppercase tracking-widest">
              [ what we deliver ]
            </div>
            <h2 className="font-display text-5xl leading-[0.95] md:text-7xl">
              Three taps.<br />Anything you crave.
            </h2>
          </div>
          <p className="max-w-sm text-muted-foreground md:text-lg">
            We're not just food delivery. We're your daily errand crew — racing across the city so you don't have to.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {services.map((s, i) => (
            <motion.article
              key={s.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              whileHover={{ y: -6, rotate: i % 2 === 0 ? -1 : 1 }}
              className={`group relative overflow-hidden rounded-3xl border-2 border-ink ${s.bg} ${s.textColor} p-6 shadow-pop transition-shadow`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono-pop text-sm">{s.tag}</span>
                <span className="rounded-full border-2 border-ink bg-background px-3 py-1 font-mono-pop text-xs uppercase text-foreground">
                  {s.price}
                </span>
              </div>
              <div className="my-6 grid h-44 place-items-center">
                <img src={s.img} alt={s.title} className="h-44 w-auto transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6" loading="lazy" />
              </div>
              <h3 className="font-display text-4xl">{s.title}</h3>
              <p className="mt-3 opacity-90">{s.desc}</p>
              <a href="/home" className="mt-6 flex items-center gap-2 font-mono-pop text-xs uppercase tracking-widest opacity-90">
                Order now <span className="transition-transform group-hover:translate-x-1">→</span>
              </a>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
};
