"use client";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/marketing/components/ui/dialog";
import { Button } from "@/marketing/components/ui/button";
import { Input } from "@/marketing/components/ui/input";
import { Textarea } from "@/marketing/components/ui/textarea";
import { submitSiteForm } from "@/marketing/lib/submitSiteForm";

export interface BookCallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BookCallModal({ open, onOpenChange }: BookCallModalProps) {
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const reset = () => {
    setName("");
    setBusinessName("");
    setEmail("");
    setPhone("");
    setMessage("");
    setError("");
    setSent(false);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError("");
    try {
      await submitSiteForm("book-a-call", { name, businessName, email, phone, message });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send. Try again.");
    } finally {
      setSending(false);
    }
  };

  const canSubmit = name.trim() && businessName.trim() && email.trim();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md rounded-3xl border-2 border-ink p-6 shadow-pop">
        <DialogHeader>
          <DialogTitle className="font-display text-3xl">Book a call</DialogTitle>
          <DialogDescription className="mt-1 text-sm text-muted-foreground">
            Tell us about your business. Our partnerships team will reach out within 24 hours.
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="flex flex-col items-center py-6 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border-2 border-ink bg-primary text-2xl shadow-pop-sm">
              📞
            </div>
            <h3 className="font-display text-2xl">We'll be in touch!</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Your enquiry has been forwarded to our partnerships team at{" "}
              <span className="font-medium text-foreground">partners@gobuyme.shop</span>.
              Expect a response within 24 hours.
            </p>
            <Button
              onClick={() => handleOpenChange(false)}
              className="mt-6 rounded-full border-2 border-ink bg-primary px-7 font-mono-pop text-xs uppercase tracking-widest text-primary-foreground shadow-pop-sm hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
            >
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-2 space-y-4">
            <div>
              <label className="font-mono-pop text-xs uppercase tracking-widest">Full Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Oluwaseun Bello"
                required
                className="mt-2 border-2 border-ink"
              />
            </div>
            <div>
              <label className="font-mono-pop text-xs uppercase tracking-widest">Business Name</label>
              <Input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Empire Groceries Ltd"
                required
                className="mt-2 border-2 border-ink"
              />
            </div>
            <div>
              <label className="font-mono-pop text-xs uppercase tracking-widest">Email Address</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="oluwaseun@empire.ng"
                required
                className="mt-2 border-2 border-ink"
              />
            </div>
            <div>
              <label className="font-mono-pop text-xs uppercase tracking-widest">
                Phone{" "}
                <span className="normal-case text-muted-foreground">(optional)</span>
              </label>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+2348012345678"
                className="mt-2 border-2 border-ink"
              />
            </div>
            <div>
              <label className="font-mono-pop text-xs uppercase tracking-widest">
                Message{" "}
                <span className="normal-case text-muted-foreground">(optional)</span>
              </label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell us about your business — number of branches, what you sell, anything specific you'd like to discuss."
                rows={3}
                className="mt-2 resize-none border-2 border-ink"
              />
            </div>
            {error && (
              <div className="rounded-xl border-2 border-destructive bg-destructive/10 px-4 py-3 font-mono-pop text-xs uppercase tracking-wider text-destructive">
                {error}
              </div>
            )}
            <Button
              type="submit"
              disabled={sending || !canSubmit}
              className="w-full rounded-full border-2 border-ink bg-primary text-primary-foreground shadow-pop-sm hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none font-mono-pop text-xs uppercase tracking-widest h-11"
            >
              {sending ? "Sending…" : "Send enquiry →"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
