"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { Button } from "@/marketing/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/marketing/components/ui/sheet";
import { Menu, X } from "lucide-react";
const logo = "/marketing/logo.png";

const links = [
  { label: "Eat", href: "#services" },
  { label: "How", href: "#how" },
  { label: "Vendors", href: "#vendors" },
  { label: "Riders", href: "#riders" },
  { label: "FAQ", href: "#faq" },
  { label: "How To", href: "/how-to" },
];

export const Nav = () => {
  return (
    <motion.header
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="sticky top-0 z-50 border-b-2 border-ink bg-background/85 backdrop-blur-md"
    >
      <div className="container flex h-16 items-center justify-between gap-6">
        <a href="#" className="flex items-center gap-2">
          <img src={logo} alt="GoBuyMe" className="h-8 w-auto" />
        </a>
        
        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <a 
              key={l.href} 
              href={l.href.startsWith('#') ? l.href : undefined}
              onClick={(e) => {
                if (!l.href.startsWith('#')) {
                  e.preventDefault();
                  window.location.href = l.href;
                }
              }}
              className="font-mono-pop text-xs uppercase tracking-widest hover:text-primary transition-colors"
            >
              {l.label}
            </a>
          ))}
        </nav>
        
        {/* Mobile Navigation */}
        <div className="md:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] sm:w-[400px]">
              <div className="flex flex-col gap-4 mt-8">
                {links.map((l) => (
                  <a
                    key={l.href}
                    href={l.href.startsWith('#') ? l.href : undefined}
                    onClick={(e) => {
                      if (!l.href.startsWith('#')) {
                        e.preventDefault();
                        window.location.href = l.href;
                        window.close();
                      }
                    }}
                    className="font-mono-pop text-xs uppercase tracking-widest hover:text-primary transition-colors py-2"
                  >
                    {l.label}
                  </a>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="default" asChild className="rounded-full border-2 border-ink bg-primary text-primary-foreground shadow-pop-sm hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all font-mono-pop text-xs uppercase tracking-widest">
            <a href="/home">Order now</a>
          </Button>
          <Button variant="default" asChild className="rounded-full border-2 border-ink bg-foreground text-background shadow-pop-sm hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all font-mono-pop text-xs uppercase tracking-widest hidden sm:inline-flex">
            <Link href="/downloads">Get the app ↓</Link>
          </Button>
        </div>
      </div>
    </motion.header>
  );
};
