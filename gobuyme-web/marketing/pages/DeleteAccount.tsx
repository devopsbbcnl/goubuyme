"use client";
import { useState } from "react";
import { SimplePage } from "@/marketing/components/site/SimplePage";
import { Button } from "@/marketing/components/ui/button";
import { Input } from "@/marketing/components/ui/input";
import { Textarea } from "@/marketing/components/ui/textarea";
import { useToast } from "@/marketing/hooks/use-toast";
import { submitSiteForm } from "@/marketing/lib/submitSiteForm";

const dataDeleted = [
  { title: "Profile & account info", note: "Name, email, phone number, password, saved addresses." },
  { title: "Order & payment history", note: "Anonymised within 30 days, except records we must keep for tax/audit law." },
  { title: "Vendor/rider documents", note: "KYC uploads, bank details, and license/ID documents." },
  { title: "App activity", note: "Notification tokens, saved favourites, and in-app preferences." },
];

const DeleteAccount = () => {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || sending) return;
    setSending(true);
    try {
      await submitSiteForm("delete-account", { email, role, reason });
      setSent(true);
      toast({ title: "Request received", description: "We'll process your deletion request within 30 days." });
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
      eyebrow="Account"
      title={
        <>
          Delete your<br />
          <span className="bg-primary px-3 text-primary-foreground">account & data.</span>
        </>
      }
      intro="You can delete your GoBuyMe account and personal data at any time, whether you're a customer, vendor, or rider."
      heroBg="bg-foreground"
      heroText="text-background"
    >
      <section className="container py-20">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-3xl">Option 1 — In the app</h2>
            <p className="mt-3 text-muted-foreground">
              The fastest way. Open GoBuyMe and go to:
            </p>
            <ol className="mt-4 space-y-2 font-mono-pop text-sm">
              <li>1. Profile</li>
              <li>2. Privacy &amp; Security</li>
              <li>3. Delete My Account → Confirm Delete</li>
            </ol>
            <p className="mt-4 text-sm text-muted-foreground">
              Your account is deactivated immediately and queued for permanent deletion.
            </p>

            <h2 className="mt-12 font-display text-3xl">What gets deleted</h2>
            <div className="mt-4 space-y-4">
              {dataDeleted.map((d) => (
                <div key={d.title} className="rounded-2xl border-2 border-ink bg-background p-4">
                  <p className="font-display text-lg">{d.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{d.note}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Some records (order/transaction history) are retained up to 7 years where Nigerian tax and financial
              regulations require it, per our{" "}
              <a href="/privacy" className="underline">Privacy Policy</a>. This data is not used for any purpose
              other than legal compliance after deletion.
            </p>
          </div>

          <div>
            <h2 className="font-display text-3xl">Option 2 — Can&apos;t access the app?</h2>
            <p className="mt-3 text-muted-foreground">
              Submit a request below using the email or phone number on your account and we&apos;ll delete it for
              you within 30 days, after verifying it&apos;s you.
            </p>

            {sent ? (
              <div className="mt-6 rounded-3xl border-2 border-ink bg-accent p-6 text-accent-foreground shadow-pop">
                <p className="font-display text-xl">Request received ✓</p>
                <p className="mt-2 text-sm opacity-90">
                  We&apos;ll email you to confirm your identity, then delete your account within 30 days.
                </p>
              </div>
            ) : (
              <form
                id="site-form-delete-account"
                data-form-id="delete-account"
                onSubmit={submit}
                className="mt-6 rounded-3xl border-2 border-ink bg-background p-6 shadow-pop"
              >
                <label className="font-mono-pop text-xs uppercase tracking-widest">Account email or phone</label>
                <Input
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2 border-2 border-ink"
                />
                <label className="mt-4 block font-mono-pop text-xs uppercase tracking-widest">
                  I am a (customer / vendor / rider)
                </label>
                <Input value={role} onChange={(e) => setRole(e.target.value)} className="mt-2 border-2 border-ink" />
                <label className="mt-4 block font-mono-pop text-xs uppercase tracking-widest">
                  Reason (optional)
                </label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={4}
                  className="mt-2 border-2 border-ink"
                />
                <Button
                  type="submit"
                  disabled={sending}
                  className="mt-6 w-full rounded-full border-2 border-ink bg-foreground text-background shadow-pop-sm font-mono-pop text-xs uppercase tracking-widest"
                >
                  {sending ? "Sending…" : "Request account deletion →"}
                </Button>
              </form>
            )}

            <p className="mt-4 text-xs text-muted-foreground">
              Questions? Email{" "}
              <a href="mailto:privacy@gobuyme.shop" className="underline">privacy@gobuyme.shop</a>.
            </p>
          </div>
        </div>
      </section>
    </SimplePage>
  );
};

export default DeleteAccount;
