"use client";
import { motion } from "framer-motion";
import { ReactNode } from "react";
import { PageNav } from "@/marketing/components/site/PageNav";
import { Footer } from "@/marketing/components/site/Footer";

interface SimplePageProps {
  eyebrow: string;
  title: ReactNode;
  intro: string;
  heroBg?: string;
  heroText?: string;
  children: ReactNode;
}

export const SimplePage = ({
  eyebrow,
  title,
  intro,
  heroBg = "bg-primary",
  heroText = "text-primary-foreground",
  children,
}: SimplePageProps) => (
  <main className="min-h-screen bg-background">
    <PageNav />
    <section className={`relative overflow-hidden border-b-2 border-ink ${heroBg} ${heroText}`}>
      <div className="absolute -left-20 top-10 h-80 w-80 rounded-full bg-accent/30 blur-3xl" />
      <div className="absolute -right-20 bottom-0 h-96 w-96 rounded-full bg-foreground/20 blur-3xl" />
      <div className="container relative py-20 md:py-28">
        <motion.span
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-block rounded-full border-2 border-current px-3 py-1 font-mono-pop text-xs uppercase tracking-widest"
        >
          {eyebrow}
        </motion.span>
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-6 max-w-3xl font-display text-5xl leading-[0.95] md:text-7xl"
        >
          {title}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-6 max-w-2xl text-lg opacity-90"
        >
          {intro}
        </motion.p>
      </div>
    </section>
    {children}
    <Footer />
  </main>
);
