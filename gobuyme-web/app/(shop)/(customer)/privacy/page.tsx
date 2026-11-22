import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy — GoBuyMe',
  description: 'Learn how GoBuyMe collects, uses, and protects your personal data in compliance with the NDPR and NDPA 2023.',
};

const EFFECTIVE_DATE = 'November 22, 2026';
const POLICY_VERSION = '2026-11-22'; // keep equal to POLICY_VERSION in backend/src/config/policy.ts
const COMPANY = 'Bubble Barrel Commerce Ltd.';
const EMAIL = 'privacy@gobuyme.shop';

const SECTIONS = [
  {
    title: '1. Who we are',
    body: `GoBuyMe is operated by ${COMPANY} ("we", "us", "our"), a company registered in Nigeria. We decide why and how your personal data is used, which makes us the "data controller" under the Nigeria Data Protection Act 2023 (NDPA).

This policy explains what we collect, why, who we share it with, how long we keep it, and the choices and rights you have. It applies to customers, vendors, riders, logistics companies, and visitors to our website. You can reach us on ${EMAIL}.`,
  },
  {
    title: '2. What we collect',
    body: `Account information
Your name, email address, phone number and password (stored as a one-way hash, never in readable form). If you sign in with Google or Apple we receive your name, email address and an account identifier from them. Apple may give us a private relay email address instead of your real one.

Customers
Saved delivery addresses, the items you order, delivery address and location pin for each order, payment status and reference (card details are handled by Paystack and never reach us), delivery chat messages, support tickets, favourites and cart.

Vendors
Business name, address, hours and menu; bank account details for payouts; and, if you submit them for verification, a driver's licence or passport number and photos, a selfie, your CAC and tax number and certificate, and regulatory licences (for example NAFDAC or pharmacist licences).

Riders
Vehicle details, your National Identification Number (NIN), photos of your ID, a selfie and your vehicle, bank account details for payouts, and your guarantor's name, phone number and address. While you are online we collect your live location.

Logistics companies
Company details and registration number, and the riders and vehicles you add.

Technical and usage data
IP address, device type, app version, and error reports so we can fix faults and keep the service secure. We only record product usage analytics (which screens are used) if you have allowed it, and you can switch that off in Settings.

Your choices and consents
When you accepted these terms and which version, and whether you agreed to receive promotions.`,
  },
  {
    title: '3. Why we use your data, and our legal basis',
    body: `Contract: to create your account, take and deliver orders, take payments, pay vendors and riders, and give support.

Legal obligation: to keep financial and tax records and to answer lawful requests from authorities.

Legitimate interests: to prevent fraud and abuse, keep the service secure, verify vendors and riders before they handle orders and customers' addresses, improve the service, and find new vendors to invite to GoBuyMe. We weigh these interests against your rights, collect only what is needed, and you can object (see section 10).

Consent: for promotional emails and messages, usage analytics, and anything else we ask you about separately. Promotions are off unless you tick the box, and you can withdraw consent at any time without affecting orders.`,
  },
  {
    title: '4. Promotions and analytics',
    body: `We send order updates and important account notices to everyone, because they are part of the service. We send offers and promotions only if you said yes. Turn them off any time in Settings, or with the unsubscribe link in any email.

Usage analytics are collected only if you allow them. You can change this in Settings.`,
  },
  {
    title: '5. Automated tools and AI',
    body: `We use an AI service (Anthropic) to help our team: it reads new support tickets and suggests a category, a summary and a draft reply, and it helps analyse technical error reports. For tickets we send only what is needed (your message, your first name and role, and basic facts about the order such as items, amounts and status). We remove phone numbers, email addresses and similar details from error reports before they are analysed. A member of staff approves every reply and every credit; no decision about you is made solely by an automated tool.`,
  },
  {
    title: '6. Who we share data with',
    body: `We do not sell your data.

Other people on your order
The vendor sees your name and order, and your phone number while the order is open. The rider sees your name, delivery address and location, and your phone number once they accept the job. You see the rider's first name and live location while they deliver to you. After an order is delivered or cancelled, vendors no longer see your phone number.

Companies that help us run GoBuyMe (processors)
Hosting and infrastructure: netcup (Germany), Cloudflare and Netlify. Payments: Paystack. SMS: Termii. Email: Resend. Image storage: Cloudinary. Push notifications: Expo (and Apple and Google). Maps and address lookup: MapTiler and OpenStreetMap services. AI assistance: Anthropic. Sign-in: Google and Apple. They may use your data only to provide their service to us, except Paystack, Google and Apple, which also act on their own account under their own privacy policies.

Authorities
When the law requires it, or to protect people from harm.

A change of ownership
If GoBuyMe is sold or merged, your data may pass to the new owner, who must respect this policy, and we will tell you first.`,
  },
  {
    title: '7. Sending data outside Nigeria',
    body: `Our database is hosted in Germany. Some of the providers in section 6 are in the United States, Switzerland or elsewhere. When data leaves Nigeria we choose providers that commit to protecting it, and we use contractual safeguards where the law requires them. You can ask us for details at ${EMAIL}.`,
  },
  {
    title: '8. How long we keep data',
    body: `Account details: while your account is open. When you delete your account we remove your name, avatar, saved addresses, favourites, cart, notifications, chat text and identity documents, and make your email and phone unusable for sign-in.

Orders, payments and payouts: 6 years, because tax and accounting law requires it. After you delete your account these records stay but are no longer linked to your name.

Identity documents of vendors and riders: while the account is active; rejected documents are deleted after 30 days; all are deleted when the account is deleted.

Delivery chat messages: 90 days. Notifications: 180 days. Technical error reports: 90 days. Usage analytics: about 13 months.

Backups: encrypted backups, when taken, are kept for no more than 90 days.

Security records of who changed what in our systems are kept for as long as needed to protect the platform and contain no readable email or phone number for deleted accounts.`,
  },
  {
    title: '9. Other people\'s details (rider guarantors)',
    body: `Riders give us a guarantor's name, phone number and address. If you are a rider, please tell your guarantor that you are giving us these details and why: so we can check who is delivering to our customers, and contact the guarantor if there is a serious problem. If you are a guarantor, you have the same rights as everyone else in section 10. Contact ${EMAIL} and we will tell you what we hold.`,
  },
  {
    title: '10. Your rights',
    body: `Under the NDPA you can:

• Access your data and get a copy. Customers: in the app, Settings, Privacy & Security, "Download a copy of my data"; on the website, Profile, "Download my data". Vendors, riders and companies: email us and we will send it.
• Correct data that is wrong (edit your profile, or contact us).
• Delete your account and data (Settings, Privacy & Security). We cannot delete records the law requires us to keep, and we cannot close an account with an order in progress.
• Object to processing based on legitimate interests, or ask us to restrict it.
• Withdraw consent for promotions and analytics at any time.
• Move your data: the download is a structured, machine-readable file.
• Not be subject to decisions made only by automated means.

To use a right that has no button, email ${EMAIL}. We may need to confirm it is you. We will reply within one month.

If you are unhappy with our answer you can complain to the Nigeria Data Protection Commission (NDPC) at www.ndpc.gov.ng.`,
  },
  {
    title: '11. Keeping your data safe',
    body: `• Connections are encrypted (HTTPS).
• Passwords are stored as one-way hashes; sign-in sessions use short-lived tokens, and long-lived sign-in tokens are stored hashed.
• Identity numbers (NIN, licence and passport numbers) and sensitive secrets are encrypted in our database.
• Identity photos are stored privately and shown only to you and authorised staff through short-lived links.
• Staff access is limited by role, and looking at full identity numbers is logged.
• We limit what leaves our systems and remove personal details from technical logs.

No system is perfectly secure. If a breach puts your rights at risk we will tell you and the NDPC as the law requires. If you think your account has been accessed by someone else, contact ${EMAIL} straight away.`,
  },
  {
    title: '12. Children',
    body: `GoBuyMe is for people aged 18 and over, and you confirm this when you register. We do not knowingly collect data from children. If you believe a child has an account, contact ${EMAIL} and we will delete it.`,
  },
  {
    title: '13. Changes to this policy',
    body: `When we change this policy in a way that matters, we will tell you in the app or by email before it takes effect, and ask you to accept it again if the law requires. The version you accepted is recorded on your account. This version: ${POLICY_VERSION}.`,
  },
  {
    title: '14. Contact',
    body: `${COMPANY}
Email: ${EMAIL}
Address: Owerri, Imo State, Nigeria

Our Data Protection Officer can be reached on the same email address.`,
  },
];

export default function PrivacyPage() {
  return (
    <div className="page-body">
      <div className="inner" style={{ maxWidth: 800, paddingTop: 48, paddingBottom: 80 }}>

        {/* Hero banner */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          background: 'var(--brand-tint)',
          border: '1px solid rgba(255,82,27,.2)',
          borderRadius: 8,
          padding: '24px 28px',
          marginBottom: 40,
        }}>
          <div style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: 'rgba(255,82,27,.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontSize: 24,
          }}>
            🛡️
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>
              Privacy Policy
            </h1>
            <p style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 500 }}>
              Your privacy matters to us · Effective {EFFECTIVE_DATE} · {COMPANY}
            </p>
          </div>
        </div>

        {/* Sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, color: 'var(--text)' }}>
                {section.title}
              </h2>
              <div className="card" style={{ padding: '20px 24px' }}>
                <p style={{
                  fontSize: 14,
                  color: 'var(--text2)',
                  lineHeight: 1.75,
                  whiteSpace: 'pre-line',
                }}>
                  {section.body}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer note */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'var(--surface2)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--r)',
          padding: '16px 20px',
          marginTop: 40,
        }}>
          <span style={{ fontSize: 18 }}>✉️</span>
          <p style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>
            Questions? Email us at{' '}
            <a href={`mailto:${EMAIL}`} style={{ color: 'var(--brand)', fontWeight: 700 }}>{EMAIL}</a>
          </p>
        </div>

        {/* Cross-link */}
        <p style={{ textAlign: 'center', marginTop: 32, fontSize: 14, color: 'var(--muted)' }}>
          Also see our{' '}
          <Link href="/terms" style={{ color: 'var(--brand)', fontWeight: 700 }}>Terms of Service</Link>
        </p>

      </div>
    </div>
  );
}
