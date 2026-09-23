"use client";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/marketing/components/ui/accordion";
import type { FaqEntry } from "@/lib/seo";

interface PageFAQProps {
  eyebrow: string;
  heading: React.ReactNode;
  faqs: FaqEntry[];
  id?: string;
}

export const PageFAQ = ({ eyebrow, heading, faqs, id = "faq" }: PageFAQProps) => (
  <section id={id} className="border-b-2 border-ink bg-muted py-20 md:py-28">
    <div className="container grid grid-cols-1 gap-12 lg:grid-cols-12">
      <div className="lg:col-span-5">
        <span className="font-mono-pop text-xs uppercase tracking-widest text-primary">{eyebrow}</span>
        <h2 className="mt-3 font-display text-4xl leading-[0.95] md:text-5xl">{heading}</h2>
      </div>
      <div className="lg:col-span-7">
        <Accordion type="single" collapsible className="space-y-4">
          {faqs.map((f, i) => (
            <AccordionItem
              key={f.q}
              value={`item-${i}`}
              className="rounded-2xl border-2 border-ink bg-background px-5 shadow-pop-sm"
            >
              <AccordionTrigger className="py-5 text-left font-display text-lg hover:no-underline md:text-xl">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="pb-5 text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  </section>
);
