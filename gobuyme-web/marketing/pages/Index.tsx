"use client";
import { useEffect } from "react";
import { Nav } from "@/marketing/components/site/Nav";
import { Hero } from "@/marketing/components/site/Hero";
import { TickerBar } from "@/marketing/components/site/TickerBar";
import { Services } from "@/marketing/components/site/Services";
import { HowItWorks } from "@/marketing/components/site/HowItWorks";
import { Stats } from "@/marketing/components/site/Stats";
import { PartnerCTA } from "@/marketing/components/site/PartnerCTA";
import { Testimonials } from "@/marketing/components/site/Testimonials";
import { FAQ } from "@/marketing/components/site/FAQ";
import { DownloadCTA } from "@/marketing/components/site/DownloadCTA";
import { Footer } from "@/marketing/components/site/Footer";

const Index = () => {
  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      const id = hash.replace("#", "");
      // wait a tick for sections to mount
      requestAnimationFrame(() => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, []);
  return (
    <main className="min-h-screen bg-background">
      <Nav />
      <Hero />
      <TickerBar />
      <Services />
      <HowItWorks />
      <Stats />
      <PartnerCTA />
      <Testimonials />
      <FAQ />
      <DownloadCTA />
      <Footer />
    </main>
  );
};

export default Index;
