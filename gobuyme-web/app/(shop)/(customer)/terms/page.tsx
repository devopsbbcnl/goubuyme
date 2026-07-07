import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service — GoBuyMe',
  description: 'Read the GoBuyMe Terms of Service governing your use of our platform.',
};

const EFFECTIVE_DATE = 'May 1, 2025';
const COMPANY = 'Bubble Barrel Commerce Ltd.';
const EMAIL = 'legal@gobuyme.shop';

const SECTIONS = [
  {
    title: '1. Acceptance of Terms',
    body: `By accessing or using the GoBuyMe website or mobile application ("Platform"), you agree to be legally bound by these Terms of Service ("Terms") and our Privacy Policy.

These Terms constitute a binding agreement between you and ${COMPANY} ("GoBuyMe", "we", "us", or "our"), a company registered in Nigeria.

If you do not agree to these Terms, do not use the Platform. We reserve the right to update these Terms at any time with 14 days' notice via the Platform.`,
  },
  {
    title: '2. Who May Use GoBuyMe',
    body: `You may use GoBuyMe only if:

• You are at least 18 years of age.
• You are legally capable of forming a binding contract under Nigerian law.
• You are not prohibited from using the Platform under applicable laws.

GoBuyMe offers three user roles — Customer, Vendor, and Rider — each governed by the provisions relevant to that role within these Terms.`,
  },
  {
    title: '3. Account Registration',
    body: `You must create an account to place orders, list products, or accept deliveries. You agree to:

• Provide accurate, current, and complete information during registration.
• Keep your login credentials confidential and not share them with anyone.
• Notify us immediately at ${EMAIL} if you suspect unauthorised access to your account.
• Take responsibility for all activity that occurs under your account.

GoBuyMe reserves the right to suspend or terminate accounts that provide false information or violate these Terms.`,
  },
  {
    title: '4. Customer Terms',
    body: `Placing Orders
When you place an order through the Platform, you make a binding offer to purchase the selected items at the displayed price. The order is confirmed once the vendor accepts it.

Pricing & Availability
Prices are set by vendors and may change at any time. GoBuyMe displays these prices as provided and is not responsible for pricing errors by vendors. Items are subject to availability.

Delivery Address
You are responsible for providing an accurate and accessible delivery address. GoBuyMe and the rider are not liable for failed deliveries due to an incorrect or inaccessible address.

Cancellations & Refunds
You may cancel an order within 2 minutes of placement at no charge. After the vendor begins preparation, cancellation may not be possible. Refunds for legitimate issues (wrong items, food safety concerns) are processed within 5–10 business days to your original payment method.

Conduct
You agree to treat vendors and riders with respect. Abusive behaviour towards riders or vendors will result in account suspension.`,
  },
  {
    title: '5. Vendor Terms',
    body: `Onboarding
To list products on GoBuyMe, vendors must provide valid business documentation and agree to our Vendor Agreement. GoBuyMe reserves the right to reject or remove any vendor at its discretion.

Product Listings
Vendors are solely responsible for the accuracy, legality, and safety of their product listings, including ingredients, allergen information, and pricing.

Order Fulfilment
Vendors must accept or reject incoming orders within 5 minutes. Repeated rejection of orders or failure to maintain a minimum acceptance rate may result in account suspension.

Payouts
Earnings are calculated after the deduction of GoBuyMe's service fee (as disclosed during onboarding). Payouts are processed daily to the bank account provided during registration.

Food Safety
Vendors must comply with all applicable Nigerian food safety regulations. GoBuyMe reserves the right to remove listings or suspend vendors found to be in violation.`,
  },
  {
    title: '6. Rider Terms',
    body: `Eligibility
Riders must be at least 18 years old, hold a valid Nigerian driver's licence (where applicable to vehicle type), provide a valid means of identification, and pass a background check.

Independent Contractor
Riders are independent contractors, not employees of GoBuyMe. GoBuyMe does not guarantee a minimum number of delivery requests. Riders are responsible for their own taxes, insurance, and compliance with traffic laws.

GPS & Location
By going online, you consent to GoBuyMe collecting your real-time GPS location for the purpose of routing and sharing your position with the relevant customer during active deliveries. Location tracking stops when you go offline.

Conduct
Riders must handle all orders with care, maintain professional conduct, and adhere to delivery instructions provided in the Platform. Fraudulent delivery claims will result in immediate suspension.

Earnings
Delivery earnings are credited after each completed delivery and paid out daily. GoBuyMe charges a platform fee as disclosed in the Rider Agreement.`,
  },
  {
    title: '7. Payments',
    body: `GoBuyMe processes payments via Paystack, a third-party payment processor licensed by the Central Bank of Nigeria (CBN). By making a payment, you also agree to Paystack's terms of service.

Supported payment methods include debit/credit cards and bank transfers. GoBuyMe does not store your full card details; these are securely handled by Paystack.

All transactions are in Nigerian Naira (₦). GoBuyMe is not responsible for currency conversion fees charged by your bank.`,
  },
  {
    title: '8. Prohibited Conduct',
    body: `You agree not to:

• Use the Platform for any unlawful purpose or to facilitate illegal activities.
• Place fraudulent orders or submit false refund claims.
• Harass, threaten, or abuse other users, vendors, or riders.
• Attempt to reverse-engineer, hack, or disrupt the Platform or its infrastructure.
• Create multiple accounts to abuse promotions or circumvent suspensions.
• Use automated bots or scripts to interact with the Platform.
• Resell access to the Platform or your account credentials.

Violation of these prohibitions may result in immediate account termination and, where appropriate, legal action.`,
  },
  {
    title: '9. Intellectual Property',
    body: `All content on the Platform — including the GoBuyMe name, logo, design, software, and text — is the exclusive property of ${COMPANY} and is protected by Nigerian and international intellectual property laws.

You are granted a limited, non-exclusive, non-transferable licence to use the Platform solely for its intended purpose. You may not copy, modify, distribute, or create derivative works from any part of the Platform without our prior written consent.

User-submitted content (e.g. reviews, photos) remains yours, but you grant GoBuyMe a worldwide, royalty-free licence to use it for operating and promoting the service.`,
  },
  {
    title: '10. Disclaimers & Limitation of Liability',
    body: `The Platform is provided "as is" without warranties of any kind, express or implied. GoBuyMe does not warrant that the Platform will be error-free, uninterrupted, or free of viruses.

GoBuyMe acts as a marketplace connecting customers, vendors, and riders. We are not the vendor or the food preparer. We are not liable for food quality, ingredient accuracy, or food safety incidents attributable to a vendor.

To the maximum extent permitted by Nigerian law, GoBuyMe's total liability to you for any claim arising from use of the Platform shall not exceed the amount you paid for the specific order giving rise to the claim in the 30 days prior to the event.

GoBuyMe is not liable for indirect, incidental, consequential, or punitive damages.`,
  },
  {
    title: '11. Dispute Resolution',
    body: `In-Platform Support
For order disputes, please contact our support team through the Platform within 48 hours of the incident. We aim to resolve all disputes within 7 business days.

Governing Law
These Terms are governed by the laws of the Federal Republic of Nigeria. Any disputes shall be subject to the exclusive jurisdiction of the courts in Lagos State, Nigeria.

Consumer Protection
Nothing in these Terms limits your rights as a consumer under the Federal Competition and Consumer Protection Act (FCCPA) 2018 or other applicable Nigerian consumer protection laws.`,
  },
  {
    title: '12. Termination',
    body: `You may close your account at any time through your account settings.

GoBuyMe may suspend or terminate your account at any time if you violate these Terms, engage in fraudulent activity, or if required by law.

Upon termination, your right to use the Platform ceases immediately. Provisions that by their nature should survive termination (including intellectual property, liability, and dispute resolution clauses) will remain in force.`,
  },
  {
    title: '13. Contact Us',
    body: `If you have questions about these Terms, please contact us:

${COMPANY}
Email: ${EMAIL}
Address: Lagos, Nigeria

For order support: support@gobuyme.ng
For vendor inquiries: vendors@gobuyme.ng`,
  },
];

export default function TermsPage() {
  return (
    <div className="page-body">
      <div className="inner" style={{ maxWidth: 800, paddingTop: 48, paddingBottom: 80 }}>

        {/* Hero banner */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          background: '#EAF2FF',
          border: '1px solid rgba(0,119,255,.2)',
          borderRadius: 8,
          padding: '24px 28px',
          marginBottom: 40,
        }}>
          <div style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: 'rgba(0,119,255,.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontSize: 24,
          }}>
            📄
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>
              Terms of Service
            </h1>
            <p style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 500 }}>
              Please read these terms carefully · Effective {EFFECTIVE_DATE} · {COMPANY}
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
            Legal questions? Email us at{' '}
            <a href={`mailto:${EMAIL}`} style={{ color: 'var(--brand)', fontWeight: 700 }}>{EMAIL}</a>
          </p>
        </div>

        {/* Cross-link */}
        <p style={{ textAlign: 'center', marginTop: 32, fontSize: 14, color: 'var(--muted)' }}>
          Also see our{' '}
          <Link href="/privacy" style={{ color: 'var(--brand)', fontWeight: 700 }}>Privacy Policy</Link>
        </p>

      </div>
    </div>
  );
}
