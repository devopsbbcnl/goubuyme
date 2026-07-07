"use client";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/marketing/components/ui/accordion";

const faqs = [
  { q: "Where does GoBuyMe deliver?", a: "We're live across Lagos, Abuja, Port Harcourt and 50+ cities — and we add a new one almost every week. Open the app to see if we're in your area." },
  { q: "How fast is delivery?", a: "Average 25 minutes for food and 60 minutes for groceries within delivery zones. You get live tracking from kitchen to doorstep." },
  { q: "What payment methods are accepted?", a: "Cards, bank transfer and USSD. Cash on delivery is available in select cities." },
  { q: "How do I list my restaurant or store?", a: "Tap 'List your business' above. Onboarding takes ~10 minutes — no setup fee, just choose a partnership tier." },
  { q: "How much do riders earn?", a: "Earnings depend on hours and city, but our top riders pull in ₦150k+ per month with weekend bonuses and tips." },
  { q: "What if my order is wrong or late?", a: "We refund instantly through the app. Our support is human, fast, and actually solves problems." },
];

export const FAQ = () => (
  <section id="faq" className="border-b-2 border-ink bg-muted py-20 md:py-28">
    <div className="container grid grid-cols-1 gap-12 lg:grid-cols-12">
      <div className="lg:col-span-5">
        <div className="mb-4 inline-block rounded-full border-2 border-ink bg-background px-3 py-1 font-mono-pop text-xs uppercase tracking-widest">
          [ FAQ ]
        </div>
        <h2 className="font-display text-5xl leading-[0.95] md:text-6xl">
          Curious?<br />We've got answers.
        </h2>
        <p className="mt-6 max-w-sm text-muted-foreground">Can't find what you're looking for? Reach out — we reply to every message, usually within an hour.</p>
      </div>
      <div className="lg:col-span-7">
        <Accordion type="single" collapsible className="space-y-4">
          {faqs.map((f, i) => (
            <AccordionItem
              key={i}
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
