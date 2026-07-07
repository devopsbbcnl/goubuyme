"use client";
import { motion } from "framer-motion";
import { PageNav } from "@/marketing/components/site/PageNav";
import { Footer } from "@/marketing/components/site/Footer";
import { Marquee } from "@/marketing/components/site/Marquee";
const playstoreIcon = "/marketing/playstore-svgrepo-com.svg";

/** Swap for live App Store and Play listing URLs when published */
const APP_STORE_URL = "#";
const PLAY_STORE_URL = "#";

const AppStoreBadge = ({ className = "" }: { className?: string }) => (
  <a
    href={APP_STORE_URL}
    className={`inline-flex items-center gap-3 rounded-full border-2 border-ink bg-foreground px-7 py-4 text-background shadow-[8px_8px_0_hsl(var(--foreground))] transition-all hover:translate-x-1 hover:translate-y-1 hover:shadow-none ${className}`}
  >
    <svg className="h-7 w-7 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
    <div className="text-left leading-tight">
      <div className="font-mono-pop text-[10px] uppercase tracking-widest opacity-75">Download on</div>
      <div className="font-display text-xl">App Store</div>
    </div>
  </a>
);

const PlayStoreBadge = ({ className = "" }: { className?: string }) => (
  <a
    href={PLAY_STORE_URL}
    className={`inline-flex items-center gap-3 rounded-full border-2 border-ink bg-background px-7 py-4 text-foreground shadow-[8px_8px_0_hsl(var(--foreground))] transition-all hover:translate-x-1 hover:translate-y-1 hover:shadow-none ${className}`}
  >
    <img src={playstoreIcon} className="h-7 w-7 shrink-0" alt="" aria-hidden />
    <div className="text-left leading-tight">
      <div className="font-mono-pop text-[10px] uppercase tracking-widest opacity-75">Get it on</div>
      <div className="font-display text-xl">Google Play</div>
    </div>
  </a>
);

const iosBullets = [
  "Built for iPhone and iPad — same account everywhere.",
  "Apple Pay at checkout when your bank supports it.",
  "Push alerts so you never miss a rider or promo.",
];

const androidBullets = [
  "Runs great on Android 8 and up — millions of devices.",
  "Small download; updates roll out as we ship features.",
  "Home-screen shortcuts to reorder your usuals in one tap.",
];

const Downloads = () => (
  <main className="min-h-screen bg-background">
    <PageNav />

    {/* Hero — full viewport feel before store sections */}
    <section className="relative overflow-hidden border-b-2 border-ink bg-foreground text-background">
      <div className="absolute -right-20 -top-20 h-96 w-96 rounded-full bg-primary/35 blur-3xl" />
      <div className="absolute -left-20 bottom-0 h-80 w-80 rounded-full bg-accent/25 blur-3xl" />
      <div className="container relative grid grid-cols-1 items-center gap-12 py-20 lg:grid-cols-2 lg:py-28">
        <div>
          <span className="inline-block rounded-full border-2 border-background px-3 py-1 font-mono-pop text-xs uppercase tracking-widest">
            Get the app
          </span>
          <h1 className="mt-6 font-display text-5xl leading-[0.95] md:text-7xl">
            Order
            <br />
            <span className="text-primary">everywhere.</span>
          </h1>
          <p className="mt-6 max-w-md text-lg text-background/80">
            Food, groceries, pharmacy and errands — one GoBuyMe app on your phone. Pick your store below and download in seconds.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#app-store"
              className="inline-flex items-center gap-2 rounded-full border-2 border-background bg-primary px-6 py-3 font-mono-pop text-xs uppercase tracking-widest text-primary-foreground shadow-[6px_6px_0_hsl(var(--background))] transition-all hover:translate-x-1 hover:translate-y-1 hover:shadow-none"
            >
              App Store →
            </a>
            <a
              href="#play-store"
              className="inline-flex items-center gap-2 rounded-full border-2 border-background px-6 py-3 font-mono-pop text-xs uppercase tracking-widest"
            >
              Google Play →
            </a>
          </div>
        </div>
        <div className="relative flex min-h-[320px] items-center justify-center lg:min-h-[420px]">
          <motion.div
            animate={{ y: [0, -10, 0], rotate: [-3, 3, -3] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            className="relative z-10 rounded-[2.5rem] border-4 border-background bg-background/10 p-4 shadow-[12px_12px_0_hsl(var(--primary))] backdrop-blur-sm"
          >
            <div className="flex h-[280px] w-[140px] flex-col overflow-hidden rounded-[2rem] border-2 border-background/40 bg-gradient-to-b from-background/20 to-background/5">
              <div className="h-6 shrink-0 border-b border-background/20" />
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
                <span className="text-4xl" aria-hidden>
                  📱
                </span>
                <span className="font-mono-pop text-[10px] uppercase tracking-widest text-background/70">GoBuyMe</span>
              </div>
            </div>
          </motion.div>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
            className="absolute right-4 top-6 grid h-24 w-24 place-items-center rounded-full border-2 border-background bg-accent text-accent-foreground md:right-10"
          >
            <span className="text-center font-display text-xs leading-tight">
              Free
              <br />
              download
            </span>
          </motion.div>
        </div>
      </div>
    </section>

    <Marquee
      items={[
        "Same app — iPhone & Android",
        "Track orders live",
        "Saved addresses & favourites",
        "Exclusive in-app deals",
        "24/7 support in your pocket",
      ]}
    />

    {/* App Store */}
    <section id="app-store" className="scroll-mt-24 border-b-2 border-ink py-20 md:py-28">
      <div className="container grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <span className="font-mono-pop text-xs uppercase tracking-widest text-primary">iPhone &amp; iPad</span>
          <h2 className="mt-3 font-display text-4xl md:text-5xl">
            App Store
          </h2>
          <p className="mt-4 max-w-lg text-muted-foreground">
            The native iOS experience — fast checkout, crisp maps, and notifications tuned for your lock screen. Works on any iPhone or iPad running a recent iOS release.
          </p>
          <ul className="mt-8 space-y-3">
            {iosBullets.map((line) => (
              <li key={line} className="flex gap-3 font-mono-pop text-sm uppercase tracking-wider text-foreground">
                <span className="text-primary">✓</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <div className="mt-10">
            <AppStoreBadge />
          </div>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          whileHover={{ rotate: -0.5 }}
          className="rounded-3xl border-2 border-ink bg-card p-8 shadow-pop-sm md:p-10"
        >
          <div className="font-mono-pop text-xs uppercase tracking-widest text-muted-foreground">Why iOS users love it</div>
          <p className="mt-4 font-display text-2xl leading-snug">
            Haptic taps, Live Activities for active orders, and a layout that feels at home on every screen size.
          </p>
          <div className="mt-8 rounded-2xl border-2 border-dashed border-ink/40 bg-muted/50 p-6 text-center font-mono-pop text-xs uppercase tracking-widest text-muted-foreground">
            Screenshots &amp; version notes appear here when the listing is live.
          </div>
        </motion.div>
      </div>
    </section>

    {/* Google Play */}
    <section id="play-store" className="scroll-mt-24 border-b-2 border-ink bg-primary py-20 text-primary-foreground md:py-28">
      <div className="container grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="order-2 rounded-3xl border-2 border-ink bg-background p-8 text-foreground shadow-pop md:p-10 lg:order-1"
        >
          <div className="font-mono-pop text-xs uppercase tracking-widest text-primary">For Android</div>
          <p className="mt-4 font-display text-2xl leading-snug">
            Material motion, adaptive icons, and the same order book as iOS — so your favourites sync no matter which device you carry.
          </p>
          <div className="mt-8 rounded-2xl border-2 border-dashed border-ink/40 bg-muted/60 p-6 text-center font-mono-pop text-xs uppercase tracking-widest text-muted-foreground">
            Play listing graphics &amp; “What’s new” copy slot in here.
          </div>
        </motion.div>
        <div className="order-1 lg:order-2">
          <span className="font-mono-pop text-xs uppercase tracking-widest opacity-90">Phones &amp; tablets</span>
          <h2 className="mt-3 font-display text-4xl md:text-5xl">Google Play</h2>
          <p className="mt-4 max-w-lg opacity-90">
            Install from the Play Store for automatic updates, Google Pay where available, and a build tuned for Nigerian networks.
          </p>
          <ul className="mt-8 space-y-3">
            {androidBullets.map((line) => (
              <li key={line} className="flex gap-3 font-mono-pop text-sm uppercase tracking-wider">
                <span className="text-accent">✓</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <div className="mt-10">
            <PlayStoreBadge />
          </div>
        </div>
      </div>
    </section>

    <Footer />
  </main>
);

export default Downloads;
