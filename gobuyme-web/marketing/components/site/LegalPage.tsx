"use client";
import { ReactNode } from "react";
import { SimplePage } from "@/marketing/components/site/SimplePage";

interface Section {
  h: string;
  p: ReactNode;
}

interface LegalPageProps {
  eyebrow: string;
  title: ReactNode;
  intro: string;
  updated: string;
  sections: Section[];
}

export const LegalPage = ({ eyebrow, title, intro, updated, sections }: LegalPageProps) => (
  <SimplePage eyebrow={eyebrow} title={title} intro={intro} heroBg="bg-foreground" heroText="text-background">
    <section className="container py-16">
      <div className="mb-10 inline-block rounded-full border-2 border-ink bg-accent px-4 py-2 font-mono-pop text-xs uppercase tracking-widest text-accent-foreground shadow-pop-sm">
        Last updated: {updated}
      </div>
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[240px_1fr]">
        <nav className="lg:sticky lg:top-24 lg:self-start">
          <div className="font-mono-pop text-xs uppercase tracking-widest text-muted-foreground">On this page</div>
          <ul className="mt-3 space-y-2">
            {sections.map((s, i) => (
              <li key={i}>
                <a href={`#s${i}`} className="text-sm hover:text-primary">{i + 1}. {s.h}</a>
              </li>
            ))}
          </ul>
        </nav>
        <article className="space-y-10">
          {sections.map((s, i) => (
            <section key={i} id={`s${i}`} className="rounded-3xl border-2 border-ink bg-background p-8 shadow-pop-sm">
              <h2 className="font-display text-2xl md:text-3xl">{i + 1}. {s.h}</h2>
              <div className="mt-4 space-y-3 text-muted-foreground leading-relaxed">{s.p}</div>
            </section>
          ))}
        </article>
      </div>
    </section>
  </SimplePage>
);
