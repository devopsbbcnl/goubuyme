"use client";
import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/marketing/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/marketing/components/ui/tabs";
import { Button } from "@/marketing/components/ui/button";
import { Input } from "@/marketing/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/marketing/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/marketing/components/ui/radio-group";
import { Checkbox } from "@/marketing/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/marketing/components/ui/form";

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://api.gobuyme.shop/api/v1";
const API_URL = `${API_BASE}/auth/register`;

const DEFAULT_TIER_RATES = { TIER_1: 3, TIER_2: 7.5 };

export function useTierRates() {
  const [rates, setRates] = useState(DEFAULT_TIER_RATES);
  useEffect(() => {
    fetch(`${API_BASE}/vendors/commission-rates`)
      .then((r) => r.json())
      .then((j) => {
        const d = j?.data;
        if (d?.TIER_1?.platformPercent != null && d?.TIER_2?.platformPercent != null) {
          setRates({ TIER_1: d.TIER_1.platformPercent, TIER_2: d.TIER_2.platformPercent });
        }
      })
      .catch(() => {});
  }, []);
  return rates;
}

const VENDOR_STEP_FIELDS: Record<number, string[]> = {
  1: ["name", "email", "phone", "password", "confirmPassword", "terms"],
  2: ["businessName", "category", "address", "city", "state", "commissionTier"],
  3: [],
};

const RIDER_STEP_FIELDS: Record<number, string[]> = {
  1: ["name", "email", "phone", "password", "confirmPassword", "terms"],
  2: ["vehicleType", "nin"],
};

// ─── Schemas ──────────────────────────────────────────────────────────────────

const phoneRule = z
  .string()
  .refine(
    (v) => v === "" || /^\+?[0-9]{10,15}$/.test(v),
    { message: "Invalid phone number (10–15 digits)" }
  );

const passwordRule = z
  .string()
  .min(8, "At least 8 characters")
  .regex(/[A-Z]/, "Must include an uppercase letter")
  .regex(/[a-z]/, "Must include a lowercase letter")
  .regex(/[0-9]/, "Must include a number")
  .regex(/[!@#$%^&*]/, "Must include a special character (!@#$%^&*)");

const accountBase = {
  name: z.string().min(2, "Min 2 characters").max(100, "Max 100 characters"),
  email: z.string().email("Enter a valid email address"),
  phone: phoneRule,
  password: passwordRule,
  confirmPassword: z.string().min(1, "Please confirm your password"),
  referralCode: z.string().optional(),
  terms: z
    .boolean()
    .refine((v) => v === true, "You must accept the terms to continue"),
};

const vendorSchema = z
  .object({
    ...accountBase,
    businessName: z.string().min(2, "Min 2 characters").max(150, "Max 150 characters"),
    category: z.enum(["RESTAURANT", "EMART", "PHARMACY", "BAKERY", "DRINKS", "BUTCHER", "GAS"], {
      required_error: "Select a business category",
    }),
    address: z.string().min(1, "Business address is required"),
    city: z.string().min(1, "City is required"),
    state: z.string().min(1, "State is required"),
    commissionTier: z.enum(["TIER_1", "TIER_2"], {
      required_error: "Select a commission plan",
    }),
    // Step 3 — identity (not sent to API, all optional since step is skippable)
    docType: z.enum(["NIN", "DRIVERS_LICENCE", "PASSPORT"]).optional(),
    docNumber: z.string().optional(),
    bvn: z
      .string()
      .refine((v) => !v || /^\d{11}$/.test(v), "BVN must be 11 digits")
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Passwords don't match",
        path: ["confirmPassword"],
      });
    }
    if (data.docType && data.docNumber) {
      if (data.docType === "NIN" && !/^\d{11}$/.test(data.docNumber)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "NIN must be exactly 11 digits",
          path: ["docNumber"],
        });
      }
      if (data.docType === "DRIVERS_LICENCE" && !/^[A-Za-z0-9]+$/.test(data.docNumber)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Alphanumeric only (e.g. ABC123456XY)",
          path: ["docNumber"],
        });
      }
      if (data.docType === "PASSPORT" && !/^[A-Za-z]\d{8}$/.test(data.docNumber)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Format: one letter + 8 digits (e.g. A12345678)",
          path: ["docNumber"],
        });
      }
    }
  });

const riderSchema = z
  .object({
    ...accountBase,
    vehicleType: z.string().min(1, "Vehicle type is required"),
    plateNumber: z.string().optional(),
    nin: z.string().regex(/^\d{11}$/, "NIN must be exactly 11 digits"),
    guarantorName: z.string().optional(),
    guarantorPhone: z
      .string()
      .refine((v) => !v || /^\+?[0-9]{10,15}$/.test(v), "Invalid phone number")
      .optional(),
    guarantorAddress: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Passwords don't match",
        path: ["confirmPassword"],
      });
    }
  });

type VendorValues = z.infer<typeof vendorSchema>;
type RiderValues = z.infer<typeof riderSchema>;

// ─── API ──────────────────────────────────────────────────────────────────────

async function registerUser(payload: object): Promise<void> {
  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Cannot reach the server. Check your connection.");
  }
  if (res.ok) return;
  if (res.status === 409) throw new Error("An account with this email already exists.");
  if (res.status === 429) throw new Error("Too many attempts. Please wait a moment.");
  const body = await res.json().catch(() => null);
  throw new Error(body?.message || "Something went wrong. Please try again.");
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center mb-6">
      {Array.from({ length: total }, (_, i) => {
        const step = i + 1;
        const done = step < current;
        const active = step === current;
        return (
          <React.Fragment key={step}>
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold font-mono-pop transition-colors ${
                done
                  ? "border-foreground bg-foreground text-background"
                  : active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-muted-foreground/30 bg-muted text-muted-foreground"
              }`}
            >
              {done ? "✓" : step}
            </div>
            {step < total && (
              <div
                className={`h-0.5 flex-1 mx-1 transition-colors ${
                  done ? "bg-foreground" : "bg-muted"
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function PasswordRules({ password }: { password: string }) {
  if (!password) return null;
  const rules = [
    { label: "At least 8 characters", met: password.length >= 8 },
    { label: "Uppercase letter", met: /[A-Z]/.test(password) },
    { label: "Lowercase letter", met: /[a-z]/.test(password) },
    { label: "Number", met: /[0-9]/.test(password) },
    { label: "Special character (!@#$%^&*)", met: /[!@#$%^&*]/.test(password) },
  ];
  return (
    <div className="mt-2 space-y-1">
      {rules.map(({ label, met }) => (
        <div
          key={label}
          className={`flex items-center gap-2 font-mono-pop text-[10px] uppercase tracking-wider transition-colors ${
            met ? "text-green-600" : "text-destructive"
          }`}
        >
          <span className="w-3 shrink-0">{met ? "✓" : "✕"}</span>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function ApiError({ message }: { message: string }) {
  return (
    <div className="rounded-xl border-2 border-destructive bg-destructive/10 px-4 py-3 font-mono-pop text-xs uppercase tracking-wider text-destructive">
      {message}
    </div>
  );
}

// ─── Shared account step fields (used in both forms) ──────────────────────────

function AccountStepFields<T extends VendorValues | RiderValues>({
  form,
}: {
  form: ReturnType<typeof useForm<T>>;
}) {
  const password = (form.watch as (name: string) => string)("password") ?? "";
  return (
    <div className="space-y-4">
      <FormField
        control={form.control as never}
        name={"name" as never}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="font-mono-pop text-xs uppercase tracking-widest">Full Name</FormLabel>
            <FormControl>
              <Input {...field} placeholder="Chisom Okafor" className="border-2 border-ink" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control as never}
        name={"email" as never}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="font-mono-pop text-xs uppercase tracking-widest">Email Address</FormLabel>
            <FormControl>
              <Input {...field} type="email" placeholder="you@example.com" className="border-2 border-ink" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control as never}
        name={"phone" as never}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="font-mono-pop text-xs uppercase tracking-widest">
              Phone Number{" "}
              <span className="normal-case text-muted-foreground">(optional)</span>
            </FormLabel>
            <FormControl>
              <Input {...field} type="tel" placeholder="+2348012345678" className="border-2 border-ink" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control as never}
        name={"password" as never}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="font-mono-pop text-xs uppercase tracking-widest">Password</FormLabel>
            <FormControl>
              <Input {...field} type="password" placeholder="••••••••" className="border-2 border-ink" />
            </FormControl>
            <PasswordRules password={password} />
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control as never}
        name={"confirmPassword" as never}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="font-mono-pop text-xs uppercase tracking-widest">Confirm Password</FormLabel>
            <FormControl>
              <Input {...field} type="password" placeholder="••••••••" className="border-2 border-ink" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control as never}
        name={"referralCode" as never}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="font-mono-pop text-xs uppercase tracking-widest">
              Referral Code{" "}
              <span className="normal-case text-muted-foreground">(optional)</span>
            </FormLabel>
            <FormControl>
              <Input {...field} placeholder="GBM-XXXX" className="border-2 border-ink" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control as never}
        name={"terms" as never}
        render={({ field }) => (
          <FormItem className="flex items-start gap-3">
            <FormControl>
              <Checkbox
                checked={field.value as boolean}
                onCheckedChange={field.onChange}
                className="mt-0.5 border-2 border-ink data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              />
            </FormControl>
            <div>
              <FormLabel className="font-mono-pop text-[10px] uppercase tracking-wider leading-relaxed">
                I agree to the{" "}
                <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline text-primary">
                  Terms of Service
                </a>{" "}
                and{" "}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline text-primary">
                  Privacy Policy
                </a>
              </FormLabel>
              <FormMessage />
            </div>
          </FormItem>
        )}
      />
    </div>
  );
}

// ─── Vendor Form ──────────────────────────────────────────────────────────────

function VendorForm({ onSuccess }: { onSuccess: () => void }) {
  const tierRates = useTierRates();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");

  const form = useForm<VendorValues>({
    resolver: zodResolver(vendorSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
      referralCode: "",
      terms: false,
      businessName: "",
      category: undefined,
      address: "",
      city: "",
      state: "",
      commissionTier: undefined,
      docType: undefined,
      docNumber: "",
      bvn: "",
    },
  });

  const docType = form.watch("docType");

  const advance = async () => {
    const fields = VENDOR_STEP_FIELDS[step] as (keyof VendorValues)[];
    const valid = await form.trigger(fields);
    if (valid) setStep((s) => s + 1);
  };

  const submitForm = async () => {
    const v = form.getValues();
    setApiError("");
    setSubmitting(true);
    try {
      await registerUser({
        name: v.name,
        email: v.email,
        phone: v.phone || "",
        password: v.password,
        role: "VENDOR",
        businessName: v.businessName,
        category: v.category,
        address: v.address,
        city: v.city,
        state: v.state,
        commissionTier: v.commissionTier,
        ...(v.referralCode ? { referralCode: v.referralCode } : {}),
      });
      onSuccess();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStep3Submit = async () => {
    const v = form.getValues();
    if (v.docType || v.docNumber) {
      const valid = await form.trigger(["docType", "docNumber"]);
      if (!valid) return;
    }
    if (v.bvn) {
      const valid = await form.trigger(["bvn"]);
      if (!valid) return;
    }
    await submitForm();
  };

  return (
    <Form {...form}>
      <form>
        <StepIndicator current={step} total={3} />

        {/* ── Step 1: Account Details ── */}
        {step === 1 && (
          <>
            <p className="mb-4 font-mono-pop text-[10px] uppercase tracking-widest text-muted-foreground">
              Step 1 — Account Details
            </p>
            <AccountStepFields form={form} />
            <Button
              type="button"
              onClick={advance}
              className="mt-5 w-full rounded-full border-2 border-ink bg-primary text-primary-foreground shadow-pop-sm hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none font-mono-pop text-xs uppercase tracking-widest h-11"
            >
              Next →
            </Button>
          </>
        )}

        {/* ── Step 2: Business Details ── */}
        {step === 2 && (
          <>
            <p className="mb-4 font-mono-pop text-[10px] uppercase tracking-widest text-muted-foreground">
              Step 2 — Business Details
            </p>
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="businessName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono-pop text-xs uppercase tracking-widest">Business Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Mama Put Express" className="border-2 border-ink" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono-pop text-xs uppercase tracking-widest">Business Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="border-2 border-ink">
                          <SelectValue placeholder="Select a category…" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="RESTAURANT">Restaurant</SelectItem>
                        <SelectItem value="EMART">EMART (Grocery & More)</SelectItem>
                        <SelectItem value="PHARMACY">Pharmacy</SelectItem>
                        <SelectItem value="BAKERY">Bakery</SelectItem>
                        <SelectItem value="DRINKS">Drinks</SelectItem>
                        <SelectItem value="BUTCHER">Butcher (Meat & Fish)</SelectItem>
                        <SelectItem value="GAS">Gas</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono-pop text-xs uppercase tracking-widest">Business Address</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="12 Adeyemi Close, Ikeja" className="border-2 border-ink" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono-pop text-xs uppercase tracking-widest">City</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Lagos" className="border-2 border-ink" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono-pop text-xs uppercase tracking-widest">State</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Lagos" className="border-2 border-ink" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="commissionTier"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono-pop text-xs uppercase tracking-widest">Commission Plan</FormLabel>
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      className="mt-1 space-y-2"
                    >
                      {[
                        {
                          value: "TIER_1",
                          name: "Starter",
                          desc: `${tierRates.TIER_1}% commission per order · Standard listing · No promotions`,
                        },
                        {
                          value: "TIER_2",
                          name: "Growth",
                          desc: `${tierRates.TIER_2}% commission per order · Priority listing · Promotions & analytics`,
                        },
                      ].map((tier) => (
                        <label
                          key={tier.value}
                          className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 transition-colors ${
                            field.value === tier.value
                              ? "border-primary bg-primary/5"
                              : "border-ink bg-card"
                          }`}
                        >
                          <RadioGroupItem value={tier.value} className="mt-0.5 shrink-0" />
                          <div>
                            <div className="font-mono-pop text-xs font-bold uppercase tracking-widest">
                              {tier.name}
                            </div>
                            <div className="mt-0.5 text-xs text-muted-foreground">{tier.desc}</div>
                          </div>
                        </label>
                      ))}
                    </RadioGroup>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="mt-5 flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(1)}
                className="flex-1 rounded-full border-2 border-ink font-mono-pop text-xs uppercase tracking-widest h-11"
              >
                ← Back
              </Button>
              <Button
                type="button"
                onClick={advance}
                className="flex-1 rounded-full border-2 border-ink bg-primary text-primary-foreground shadow-pop-sm hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none font-mono-pop text-xs uppercase tracking-widest h-11"
              >
                Next →
              </Button>
            </div>
          </>
        )}

        {/* ── Step 3: Identity Verification ── */}
        {step === 3 && (
          <>
            <p className="mb-4 font-mono-pop text-[10px] uppercase tracking-widest text-muted-foreground">
              Step 3 — Identity Verification
            </p>
            <div className="space-y-4">
              <div className="rounded-2xl border-2 border-dashed border-ink/40 bg-muted/40 px-4 py-3 text-sm text-muted-foreground leading-relaxed">
                We'll verify your identity before approving your account. You can also complete
                this step after logging in to the app.
              </div>
              <FormField
                control={form.control}
                name="docType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono-pop text-xs uppercase tracking-widest">Document Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="border-2 border-ink">
                          <SelectValue placeholder="Select document type…" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="NIN">NIN</SelectItem>
                        <SelectItem value="DRIVERS_LICENCE">Driver's Licence</SelectItem>
                        <SelectItem value="PASSPORT">International Passport</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="docNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono-pop text-xs uppercase tracking-widest">Document Number</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        disabled={!docType}
                        placeholder={
                          docType === "NIN"
                            ? "12345678901"
                            : docType === "DRIVERS_LICENCE"
                            ? "ABC123456XY"
                            : docType === "PASSPORT"
                            ? "A12345678"
                            : "Select a document type first"
                        }
                        className="border-2 border-ink"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bvn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono-pop text-xs uppercase tracking-widest">
                      BVN{" "}
                      <span className="normal-case text-muted-foreground">(optional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="22123456789"
                        maxLength={11}
                        className="border-2 border-ink"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {apiError && <ApiError message={apiError} />}
            </div>
            <div className="mt-5 flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(2)}
                disabled={submitting}
                className="rounded-full border-2 border-ink font-mono-pop text-xs uppercase tracking-widest h-11 px-4"
              >
                ← Back
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={submitForm}
                disabled={submitting}
                className="flex-1 rounded-full border-2 border-ink font-mono-pop text-xs uppercase tracking-widest h-11"
              >
                {submitting ? "Submitting…" : "Skip for now"}
              </Button>
              <Button
                type="button"
                onClick={handleStep3Submit}
                disabled={submitting}
                className="flex-1 rounded-full border-2 border-ink bg-primary text-primary-foreground shadow-pop-sm hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none font-mono-pop text-xs uppercase tracking-widest h-11"
              >
                {submitting ? "Submitting…" : "Submit →"}
              </Button>
            </div>
          </>
        )}
      </form>
    </Form>
  );
}

// ─── Rider Form ───────────────────────────────────────────────────────────────

function RiderForm({ onSuccess }: { onSuccess: () => void }) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");

  const form = useForm<RiderValues>({
    resolver: zodResolver(riderSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
      referralCode: "",
      terms: false,
      vehicleType: "",
      plateNumber: "",
      nin: "",
      guarantorName: "",
      guarantorPhone: "",
      guarantorAddress: "",
    },
  });

  const advance = async () => {
    const fields = RIDER_STEP_FIELDS[step] as (keyof RiderValues)[];
    const valid = await form.trigger(fields);
    if (valid) setStep(2);
  };

  const handleFinalSubmit = async () => {
    const fields = RIDER_STEP_FIELDS[2] as (keyof RiderValues)[];
    const valid = await form.trigger(fields);
    if (!valid) return;
    const v = form.getValues();
    setApiError("");
    setSubmitting(true);
    try {
      await registerUser({
        name: v.name,
        email: v.email,
        phone: v.phone || "",
        password: v.password,
        role: "RIDER",
        vehicleType: v.vehicleType,
        plateNumber: v.plateNumber || "",
        ...(v.referralCode ? { referralCode: v.referralCode } : {}),
      });
      onSuccess();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form>
        <StepIndicator current={step} total={2} />

        {/* ── Step 1: Account Details ── */}
        {step === 1 && (
          <>
            <p className="mb-4 font-mono-pop text-[10px] uppercase tracking-widest text-muted-foreground">
              Step 1 — Account Details
            </p>
            <AccountStepFields form={form} />
            <Button
              type="button"
              onClick={advance}
              className="mt-5 w-full rounded-full border-2 border-ink bg-primary text-primary-foreground shadow-pop-sm hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none font-mono-pop text-xs uppercase tracking-widest h-11"
            >
              Next →
            </Button>
          </>
        )}

        {/* ── Step 2: Vehicle & Identity ── */}
        {step === 2 && (
          <>
            <p className="mb-4 font-mono-pop text-[10px] uppercase tracking-widest text-muted-foreground">
              Step 2 — Vehicle & Identity
            </p>
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="vehicleType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono-pop text-xs uppercase tracking-widest">Vehicle Type</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="e.g. Honda CB150, Tricycle, Bicycle"
                        className="border-2 border-ink"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="plateNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono-pop text-xs uppercase tracking-widest">
                      Plate Number{" "}
                      <span className="normal-case text-muted-foreground">(optional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="LND-123AB"
                        className="border-2 border-ink uppercase"
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="nin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono-pop text-xs uppercase tracking-widest">NIN Number</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="12345678901"
                        maxLength={11}
                        className="border-2 border-ink"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Guarantor section */}
              <div className="rounded-2xl border-2 border-dashed border-ink/40 bg-muted/40 p-4">
                <p className="mb-3 font-mono-pop text-[10px] uppercase tracking-widest text-muted-foreground">
                  Guarantor — optional
                </p>
                <div className="space-y-3">
                  <FormField
                    control={form.control}
                    name="guarantorName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono-pop text-xs uppercase tracking-widest">Full Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Guarantor's full name" className="border-2 border-ink bg-background" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="guarantorPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono-pop text-xs uppercase tracking-widest">Phone Number</FormLabel>
                        <FormControl>
                          <Input {...field} type="tel" placeholder="+2348012345678" className="border-2 border-ink bg-background" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="guarantorAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono-pop text-xs uppercase tracking-widest">Address</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="12 Example Street, Lagos" className="border-2 border-ink bg-background" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {apiError && <ApiError message={apiError} />}
            </div>
            <div className="mt-5 flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(1)}
                disabled={submitting}
                className="flex-1 rounded-full border-2 border-ink font-mono-pop text-xs uppercase tracking-widest h-11"
              >
                ← Back
              </Button>
              <Button
                type="button"
                onClick={handleFinalSubmit}
                disabled={submitting}
                className="flex-1 rounded-full border-2 border-ink bg-primary text-primary-foreground shadow-pop-sm hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none font-mono-pop text-xs uppercase tracking-widest h-11"
              >
                {submitting ? "Submitting…" : "Submit →"}
              </Button>
            </div>
          </>
        )}
      </form>
    </Form>
  );
}

// ─── Success Screen ───────────────────────────────────────────────────────────

function SuccessScreen() {
  return (
    <div className="flex flex-col items-center py-6 text-center">
      <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full border-2 border-ink bg-primary text-3xl shadow-pop-sm">
        🎉
      </div>
      <h2 className="font-display text-3xl">Application Submitted!</h2>
      <p className="mt-4 max-w-sm leading-relaxed text-muted-foreground">
        Check your email for a{" "}
        <strong className="text-foreground">6-digit verification code</strong>. Once
        verified, your account will be reviewed by our team. You'll hear back within{" "}
        <strong className="text-foreground">24 hours</strong>.
      </p>
      <div className="mt-6 w-full rounded-2xl border-2 border-dashed border-ink/40 bg-muted/40 px-5 py-4 text-sm text-muted-foreground leading-relaxed">
        Complete your profile, upload documents, and track your approval status
        inside the <strong className="text-foreground">GoBuyMe app</strong>.
      </div>
      <a
        href="/downloads"
        className="mt-6 inline-flex items-center gap-2 rounded-full border-2 border-ink bg-primary px-7 py-3 font-mono-pop text-xs uppercase tracking-widest text-primary-foreground shadow-pop-sm transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
      >
        Download the App →
      </a>
    </div>
  );
}

// ─── Registration Modal (main export) ─────────────────────────────────────────

export interface RegistrationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: "vendor" | "rider";
}

export function RegistrationModal({
  open,
  onOpenChange,
  defaultTab = "vendor",
}: RegistrationModalProps) {
  const [submitted, setSubmitted] = useState(false);
  const [activeTab, setActiveTab] = useState<"vendor" | "rider">(defaultTab);

  useEffect(() => {
    if (open) {
      setActiveTab(defaultTab);
      setSubmitted(false);
    }
  }, [open, defaultTab]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border-2 border-ink p-6 shadow-pop">
        <DialogHeader className="mb-2">
          <DialogTitle className="font-display text-3xl">
            {submitted ? "You're in!" : "Join GoBuyMe"}
          </DialogTitle>
        </DialogHeader>

        {submitted ? (
          <SuccessScreen />
        ) : (
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as "vendor" | "rider")}
          >
            <TabsList className="mb-6 h-11 w-full rounded-full border-2 border-ink bg-muted p-1">
              <TabsTrigger
                value="vendor"
                className="flex-1 rounded-full font-mono-pop text-xs uppercase tracking-widest data-[state=active]:bg-foreground data-[state=active]:text-background"
              >
                Become a Vendor
              </TabsTrigger>
              <TabsTrigger
                value="rider"
                className="flex-1 rounded-full font-mono-pop text-xs uppercase tracking-widest data-[state=active]:bg-foreground data-[state=active]:text-background"
              >
                Become a Rider
              </TabsTrigger>
            </TabsList>
            <TabsContent value="vendor">
              <VendorForm
                key={`vendor-${open}`}
                onSuccess={() => setSubmitted(true)}
              />
            </TabsContent>
            <TabsContent value="rider">
              <RiderForm
                key={`rider-${open}`}
                onSuccess={() => setSubmitted(true)}
              />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
