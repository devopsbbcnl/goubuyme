"use client";
import { useState } from "react";
import { SimplePage } from "@/marketing/components/site/SimplePage";
import { Button } from "@/marketing/components/ui/button";
import { Input } from "@/marketing/components/ui/input";
import { Textarea } from "@/marketing/components/ui/textarea";
import { useToast } from "@/marketing/hooks/use-toast";
import { submitSiteForm } from "@/marketing/lib/submitSiteForm";

const channels = [
  { emoji: "💬", title: "WhatsApp support", note: "+234 707 890 1075", sub: "Mon–Sun · 7am–10pm" },
  { emoji: "✉️", title: "Email", note: "contact@gobuyme.shop", sub: "We reply within 4 hours" },
  { emoji: "🏢", title: "HQ", note: "7th Avenu Federal Housing Estate, Egbeada. Owerri, Nigeria.", sub: "Visits by appointment" },
  { emoji: "🚨", title: "Emergency", note: "+234 707 890 1075", sub: "Order issues · 24/7" },
];

const Contact = () => {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !msg || sending) return;
    setSending(true);
    try {
      await submitSiteForm("contact", { name, email, message: msg });
      toast({ title: "Message sent ✉️", description: "We'll get back to you within 4 hours." });
      setName("");
      setEmail("");
      setMsg("");
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
      eyebrow="Contact"
      title={
        <>
          Holler<br />
          <span className="bg-leaf px-3 text-leaf-foreground">at us.</span>
        </>
      }
      intro="Question, complaint, partnership pitch, or just want to say hi? Pick a channel — we read every message."
      heroBg="bg-primary"
      heroText="text-primary-foreground"
    >
      <section className="container py-20">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {channels.map((c) => (
            <div key={c.title} className="rounded-3xl border-2 border-ink bg-background p-6 shadow-pop-sm">
              <div className="text-4xl">{c.emoji}</div>
              <h3 className="mt-4 font-display text-xl">{c.title}</h3>
              <p className="mt-2 font-mono-pop text-sm">{c.note}</p>
              <p className="mt-1 text-xs text-muted-foreground">{c.sub}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y-2 border-ink bg-accent">
        <div className="container grid grid-cols-1 items-center gap-10 py-20 lg:grid-cols-2">
          <div className="text-accent-foreground">
            <h2 className="font-display text-4xl md:text-5xl">Or drop a note</h2>
            <p className="mt-3 max-w-md opacity-90">For longer questions, partnership ideas, or feedback — we'll route it to the right team.</p>
          </div>
          <form
            id="site-form-contact"
            data-form-id="contact"
            onSubmit={submit}
            className="rounded-3xl border-2 border-ink bg-background p-6 shadow-pop"
          >
            <label className="font-mono-pop text-xs uppercase tracking-widest">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-2 border-2 border-ink" />
            <label className="mt-4 block font-mono-pop text-xs uppercase tracking-widest">Email</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 border-2 border-ink" />
            <label className="mt-4 block font-mono-pop text-xs uppercase tracking-widest">Message</label>
            <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={5} className="mt-2 border-2 border-ink" />
            <Button
              type="submit"
              disabled={sending}
              className="mt-6 w-full rounded-full border-2 border-ink bg-foreground text-background shadow-pop-sm font-mono-pop text-xs uppercase tracking-widest"
            >
              {sending ? "Sending…" : "Send message →"}
            </Button>
          </form>
        </div>
      </section>
    </SimplePage>
  );
};

export default Contact;
