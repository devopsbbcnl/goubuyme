import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy — GoBuyMe',
  description: 'Learn how GoBuyMe collects, uses, and protects your personal data in compliance with the NDPR and NDPA 2023.',
};

const EFFECTIVE_DATE = 'May 1, 2025';
const COMPANY = 'Bubble Barrel Commerce Ltd.';
const EMAIL = 'privacy@gobuyme.shop';

const SECTIONS = [
  {
    title: '1. Introduction',
    body: `Welcome to GoBuyMe, operated by ${COMPANY} ("we", "us", or "our"). We are committed to protecting your personal data in accordance with the Nigeria Data Protection Regulation (NDPR) and the Nigeria Data Protection Act 2023 (NDPA).

This Privacy Policy explains what information we collect, why we collect it, how we use and share it, and the choices you have. By using the GoBuyMe platform, you agree to the practices described here.`,
  },
  {
    title: '2. Information We Collect',
    body: `We collect information you provide directly and information generated as you use our service:

Account Information
Your full name, email address, phone number, and password when you register.

Profile & Role Data
For customers: saved delivery addresses and payment preferences.
For vendors: business name, business address, menu items, and banking details for payouts.
For riders: national ID, vehicle details, and bank account information.

Order & Transaction Data
Items ordered, delivery addresses, payment amounts, and order history.

Location Data
If you are a rider, we collect your precise GPS location while you are marked online to enable live delivery tracking. Customers share a delivery address only — no background location tracking.

Device & Usage Data
Device type, operating system, IP address, app version, and in-platform activity logs for debugging and security purposes.

Communications
Messages and support tickets you send us.`,
  },
  {
    title: '3. How We Use Your Information',
    body: `We process your data only for the following purposes:

• To create and manage your account.
• To process orders, calculate delivery routes, and coordinate between customers, vendors, and riders.
• To process payments and remit earnings to vendors and riders.
• To send order confirmations, status updates, and delivery notifications.
• To improve platform performance, fix bugs, and build new features.
• To detect, investigate, and prevent fraud, abuse, or violations of our Terms of Service.
• To comply with legal obligations under Nigerian law.`,
  },
  {
    title: '4. Legal Basis for Processing',
    body: `We process your personal data on the following legal bases as defined by the NDPA 2023:

Contract Performance: processing necessary to fulfil orders you place or deliver.

Legitimate Interests: fraud prevention, platform security, and improving our services.

Consent: marketing communications and non-essential cookies — you may withdraw consent at any time.

Legal Obligation: tax records, regulatory filings, and law-enforcement cooperation.`,
  },
  {
    title: '5. Sharing Your Information',
    body: `We do not sell your personal data. We share information only in the following circumstances:

Service Providers
We share data with payment processors (Paystack), cloud hosting providers, push notification services, and mapping providers strictly to operate GoBuyMe.

Between Users
Your first name and order details are shared with the vendor fulfilling your order. Your first name and live location (while delivering) are shared with the customer you are delivering to.

Legal Requirements
We may disclose data when required by a court order, government authority, or to protect the rights and safety of our users.

Business Transfers
In the event of a merger, acquisition, or sale of assets, your data may be transferred to the successor entity. We will notify you before your data is governed by a different privacy policy.`,
  },
  {
    title: '6. Data Retention',
    body: `We retain your account data for as long as your account is active and for 6 years thereafter to meet our legal and regulatory obligations under Nigerian law.

Order and transaction records are retained for 7 years for tax and financial audit purposes.

You may request deletion of your account at any time. Upon deletion, your personal identifiers will be anonymised within 30 days, except where retention is required by law.`,
  },
  {
    title: '7. Your Rights',
    body: `Under the NDPA 2023 you have the right to:

• Access: request a copy of the personal data we hold about you.
• Correction: request that inaccurate data be corrected.
• Deletion: request erasure of your data (subject to legal retention requirements).
• Portability: receive your data in a structured, machine-readable format.
• Objection: object to processing based on legitimate interests.
• Restriction: request that we limit how we use your data while a complaint is resolved.
• Withdraw Consent: withdraw any consent you previously gave at any time.

To exercise any of these rights, contact us at ${EMAIL}. We will respond within 30 days.`,
  },
  {
    title: '8. Data Security',
    body: `We implement industry-standard security measures including:

• TLS 1.2+ encryption for all data in transit.
• AES-256 encryption for sensitive data at rest.
• JWT-based authentication with short expiry and refresh tokens.
• Access controls limiting data visibility to authorised personnel only.
• Regular security audits and vulnerability assessments.

No system is 100% secure. If you believe your account has been compromised, please contact us immediately at ${EMAIL}.`,
  },
  {
    title: "9. Children's Privacy",
    body: `GoBuyMe is not intended for users under the age of 18. We do not knowingly collect personal data from minors. If we discover that a child under 18 has provided us with personal information, we will delete it immediately.`,
  },
  {
    title: '10. Third-Party Links',
    body: `The platform may contain links to third-party websites or services (e.g. payment gateways). We are not responsible for the privacy practices of those third parties. We encourage you to review their privacy policies before submitting personal information.`,
  },
  {
    title: '11. Changes to This Policy',
    body: `We may update this Privacy Policy from time to time. When we make material changes, we will notify you via email and display a notice on the platform at least 14 days before the changes take effect. Continued use of the platform after that date constitutes acceptance of the updated policy.`,
  },
  {
    title: '12. Contact Us',
    body: `If you have questions, concerns, or complaints about this Privacy Policy or our data practices, please contact our Data Protection Officer:

${COMPANY}
Email: ${EMAIL}
Address: Owerri, Imo State, Nigeria

You also have the right to lodge a complaint with the Nigeria Data Protection Commission (NDPC) at www.ndpc.gov.ng if you believe your data rights have been violated.`,
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
