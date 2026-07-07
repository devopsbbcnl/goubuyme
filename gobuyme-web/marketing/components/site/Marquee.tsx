"use client";
import { ReactNode } from "react";
import { cn } from "@/marketing/lib/utils";

interface MarqueeProps {
  items: ReactNode[];
  className?: string;
  reverse?: boolean;
  slow?: boolean;
}

export const Marquee = ({ items, className, reverse, slow }: MarqueeProps) => {
  const doubled = [...items, ...items];
  return (
    <div className={cn("overflow-hidden", className)}>
      <div className={cn("flex w-max gap-10 whitespace-nowrap", reverse ? "ticker-reverse" : slow ? "ticker-slow" : "ticker")}>
        {doubled.map((item, i) => (
          <div key={i} className="flex items-center gap-10">{item}</div>
        ))}
      </div>
    </div>
  );
};
