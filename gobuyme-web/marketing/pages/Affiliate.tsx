"use client";
import { motion } from "framer-motion";
import { useState } from "react";
import { SimplePage } from "@/marketing/components/site/SimplePage";
import { Button } from "@/marketing/components/ui/button";
import { Input } from "@/marketing/components/ui/input";
import { useToast } from "@/marketing/hooks/use-toast";
import { submitSiteForm } from "@/marketing/lib/submitSiteForm";

const tiers = [
  { name: "Hustler", earn: "₦500", per: "per signup", note: "First 10 referrals" },
  { name: "Influencer", earn: "₦1,000", per: "per signup", note: "11–100 referrals/mo", featured: true },
  { name: "Creator Plus", earn: "₦1,500 + 2%", per: "per order", note: "100+ referrals/mo" },
];

const Affiliate = () => {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !handle || sending) return;
    setSending(true);
    try {
      await submitSiteForm("affiliate", { name, socialHandle: handle });
      toast({ title: "Application received 🚀", description: "We'll review and email your affiliate code within 48 hours." });
      setName("");
      setHandle("");
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not send",
        description: err instanceof Error ? err.message : "Try again in a moment.",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <SimplePage
      eyebrow="Affiliate program"
      title={
        <>
          Refer.<br />
          <span className="bg-accent px-3 text-accent-foreground">Get paid.</span>
        </>
      }
      intro="Tell your followers about GoBuyMe. Every signup that orders, you earn. Cash out weekly to any Nigerian bank."
      heroBg="bg-primary"
      heroText="text-primary-foreground"
    >
      <section className="container py-20">
        <div className="mb-10 text-center">
          <h2 className="font-display text-4xl md:text-5xl">Tier up. Cash up.</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">The more friends you bring, the more you earn per head. No cap.</p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {tiers.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className={`rounded-3xl border-2 border-ink p-8 shadow-pop ${t.featured ? "bg-accent text-accent-foreground rotate-[-1deg]" : "bg-background"}`}
            >
              <div className="font-mono-pop text-xs uppercase tracking-widest opacity-70">{t.name}</div>
              <div className="mt-4 font-display text-5xl">{t.earn}</div>
              <div className="mt-1 text-sm opacity-80">{t.per}</div>
              <div className="mt-6 border-t-2 border-current/20 pt-4 text-sm">{t.note}</div>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="border-y-2 border-ink bg-foreground text-background">
        <div className="container grid grid-cols-1 items-center gap-10 py-20 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-4xl md:text-5xl">Apply in 30 seconds</h2>
            <p className="mt-3 max-w-md opacity-80">Drop your details. We'll send your unique code, marketing kit and dashboard login.</p>
          </div>
          <form
            id="site-form-affiliate"
            data-form-id="affiliate"
            onSubmit={submit}
            className="rounded-3xl border-2 border-background bg-background p-6 text-foreground shadow-pop"
          >
            <label className="font-mono-pop text-xs uppercase tracking-widest">Full name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Chinedu Okeke" className="mt-2 border-2 border-ink" />
            <label className="mt-4 block font-mono-pop text-xs uppercase tracking-widest">Social handle</label>
            <Input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@chinedu" className="mt-2 border-2 border-ink" />
            <Button
              type="submit"
              disabled={sending}
              className="mt-6 w-full rounded-full border-2 border-ink bg-primary text-primary-foreground shadow-pop-sm font-mono-pop text-xs uppercase tracking-widest"
            >
              {sending ? "Sending…" : "Get my code →"}
            </Button>
          </form>
        </div>
      </section>
    </SimplePage>
  );
};

export default Affiliate;
