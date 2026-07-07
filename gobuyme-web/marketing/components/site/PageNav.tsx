"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/marketing/components/ui/button";
const logo = "/marketing/logo.png";

const links = [
  { label: "Eat", to: "/food" },
  { label: "How", to: "/#how" },
  { label: "Vendors", to: "/become-a-vendor" },
  { label: "Riders", to: "/riders" },
  { label: "FAQ", to: "/#faq" },
];

export const PageNav = () => {
  const pathname = usePathname();
  return (
    <motion.header
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="sticky top-0 z-50 border-b-2 border-ink bg-background/85 backdrop-blur-md"
    >
      <div className="container flex h-16 items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-2">
          <img src={logo} alt="GoBuyMe" className="h-8 w-auto" />
        </Link>
        <nav className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <Link
              key={l.to}
              href={l.to}
              className={`font-mono-pop text-xs uppercase tracking-widest transition-colors hover:text-primary ${
                pathname === l.to.split("#")[0] ? "text-primary" : ""
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <Button asChild className="rounded-full border-2 border-ink bg-foreground text-background shadow-pop-sm hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all font-mono-pop text-xs uppercase tracking-widest">
          <Link href="/downloads">Get the app ↓</Link>
        </Button>
      </div>
    </motion.header>
  );
};
