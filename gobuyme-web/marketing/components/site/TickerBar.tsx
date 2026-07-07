"use client";
import { Marquee } from "./Marquee";

const phrases = [
  "JOLLOF IN 25 MINS",
  "GROCERIES BEFORE DINNER",
  "PHARMACY AT MIDNIGHT",
  "SUYA ON DEMAND",
  "ZERO QUEUE, ALL FLAVOUR",
  "LAGOS · ABUJA · PORT HARCOURT · OWERRI · ENUGU · UYO · CALABAR . AND MORE",
  "RIDERS EARN ₦150K+/MO",
];

export const TickerBar = () => (
  <div className="border-b-2 border-ink bg-foreground py-4 text-background">
    <Marquee
      items={phrases.map((p, i) => (
        <div key={i} className="flex items-center gap-10">
          <span className="font-display text-2xl uppercase md:text-3xl">{p}</span>
          <span className="text-primary">✦</span>
        </div>
      ))}
    />
  </div>
);
