'use client';
import { useState } from 'react';
import Image from 'next/image';
import { useTheme } from '@/context/ThemeContext';

type Role = 'customer' | 'vendor' | 'rider';

export default function HowToPage() {
  const { theme: T } = useTheme();
  const [activeRole, setActiveRole] = useState<Role>('customer');
  const [activeSection, setActiveSection] = useState<string>('quick-start');

  const roleData: Record<Role, { title: string; icon: string; color: string; quickStart: string[] }> = {
    customer: {
      title: 'Customer',
      icon: '🛒',
      color: '#FF521B',
      quickStart: [
        'Download GoBuyMe from Play Store/App Store',
        'Select "Customer" role and create account',
        'Browse vendors by category or search',
        'Add items to cart and checkout',
        'Track order live with GPS'
      ]
    },
    vendor: {
      title: 'Vendor',
      icon: '🏪',
      color: '#1A9E5F',
      quickStart: [
        'Download GoBuyMe and select "Vendor" role',
        'Complete profile with logo, cover, and description',
        'Upload KYC document (NIN, Driver\'s License, or Passport)',
        'Add menu items with photos',
        'Wait for approval (1-2 business days)'
      ]
    },
    rider: {
      title: 'Rider',
      icon: '🏍️',
      color: '#3B82F6',
      quickStart: [
        'Download GoBuyMe and select "Rider" role',
        'Enter vehicle details and plate number',
        'Upload NIN, selfie, and vehicle photo',
        'Provide guarantor information',
        'Wait for approval, then go online to earn'
      ]
    }
  };

  const sections = [
    { id: 'quick-start', label: 'Quick Start' },
    { id: 'getting-started', label: 'Getting Started' },
    { id: 'features', label: 'Key Features' },
    { id: 'payments', label: 'Payments' },
    { id: 'troubleshooting', label: 'Troubleshooting' }
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#fbfbf2', fontFamily: 'var(--font-jakarta), sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${T.border}`, padding: '40px 24px', textAlign: 'center' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <Image src="/icon.png" alt="GoBuyMe" width={80} height={80} style={{ objectFit: 'contain', marginBottom: 16 }} />
          <h1 style={{ fontSize: 36, fontWeight: 800, color: '#111', letterSpacing: '-0.5px', marginBottom: 8 }}>
            How To Use GoBuyMe
          </h1>
          <p style={{ fontSize: 16, color: '#444', lineHeight: 1.6 }}>
            Step-by-step guides for customers, vendors, and riders. Get started in minutes.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 24px' }}>
        {/* Role Selector */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {(Object.keys(roleData) as Role[]).map(role => (
              <button
                key={role}
                onClick={() => { setActiveRole(role); setActiveSection('quick-start'); }}
                style={{
                  padding: '16px 24px',
                  borderRadius: 4,
                  border: `2px solid ${activeRole === role ? roleData[role].color : T.border}`,
                  background: activeRole === role ? roleData[role].color : '#fff',
                  color: activeRole === role ? '#fff' : '#444',
                  fontSize: 15,
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  transition: 'all 0.2s'
                }}
              >
                <span style={{ fontSize: 20 }}>{roleData[role].icon}</span>
                {roleData[role].title}
              </button>
            ))}
          </div>
        </div>

        {/* Section Navigation */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', background: '#fff', padding: 8, borderRadius: 4, border: `1px solid ${T.border}` }}>
            {sections.map(section => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                style={{
                  padding: '10px 20px',
                  borderRadius: 4,
                  border: 'none',
                  background: activeSection === section.id ? roleData[activeRole].color : 'transparent',
                  color: activeSection === section.id ? '#fff' : '#444',
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {section.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div style={{ background: '#fff', borderRadius: 4, border: `1px solid ${T.border}`, padding: 32, minHeight: 400 }}>
          {activeSection === 'quick-start' && <QuickStartContent role={activeRole} data={roleData[activeRole]} T={T} />}
          {activeSection === 'getting-started' && <GettingStartedContent role={activeRole} T={T} />}
          {activeSection === 'features' && <FeaturesContent role={activeRole} T={T} />}
          {activeSection === 'payments' && <PaymentsContent role={activeRole} T={T} />}
          {activeSection === 'troubleshooting' && <TroubleshootingContent role={activeRole} T={T} />}
        </div>

        {/* Nigerian Features Banner */}
        <div style={{ marginTop: 40, background: 'linear-gradient(135deg, #FF521B 0%, #FF7B47 100%)', borderRadius: 4, padding: 32, color: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <span style={{ fontSize: 32 }}>🇳🇬</span>
            <h3 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Built for Nigeria</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16, fontSize: 14, lineHeight: 1.6 }}>
            <div>
              <strong style={{ display: 'block', marginBottom: 4, fontSize: 15 }}>Paystack Payments</strong>
              Card, bank transfer, USSD, and cash on delivery
            </div>
            <div>
              <strong style={{ display: 'block', marginBottom: 4, fontSize: 15 }}>Naira Currency</strong>
              All transactions in Nigerian Naira (₦)
            </div>
            <div>
              <strong style={{ display: 'block', marginBottom: 4, fontSize: 15 }}>NAFDAC Compliance</strong>
              Food and pharmacy vendors require NAFDAC certificates
            </div>
            <div>
              <strong style={{ display: 'block', marginBottom: 4, fontSize: 15 }}>NIN Verification</strong>
              Secure identity verification with National Identity Number
            </div>
          </div>
        </div>

        {/* Support CTA */}
        <div style={{ marginTop: 32, textAlign: 'center', padding: 24, background: '#fff', borderRadius: 4, border: `1px solid ${T.border}` }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: '#111', marginBottom: 8 }}>Need Help?</h3>
          <p style={{ fontSize: 14, color: '#444', marginBottom: 16 }}>
            Our support team is available to assist you with any questions.
          </p>
          <a
            href="mailto:support@gobuyme.shop"
            style={{
              display: 'inline-block',
              padding: '12px 24px',
              borderRadius: 4,
              background: '#FF521B',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              textDecoration: 'none',
              fontFamily: 'inherit'
            }}
          >
            Contact Support
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Content Components ─────────────────────────────────────────────────────

function QuickStartContent({ role, data, T }: { role: Role; data: { title: string; icon: string; color: string; quickStart: string[] }; T: Record<string, string> }) {
  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: '#111', marginBottom: 8 }}>
        {data.icon} {data.title} Quick Start
      </h2>
      <p style={{ fontSize: 14, color: '#444', marginBottom: 24 }}>
        Get started in 5 simple steps
      </p>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {data.quickStart.map((step, index) => (
          <div key={index} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: data.color,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 700,
              flexShrink: 0
            }}>
              {index + 1}
            </div>
            <div style={{ flex: 1, paddingTop: 4 }}>
              <p style={{ fontSize: 15, color: '#111', lineHeight: 1.6, margin: 0 }}>
                {step}
              </p>
            </div>
          </div>
        ))}
      </div>

      {role === 'vendor' && (
        <div style={{ marginTop: 24, padding: 16, background: '#F0E6FF', borderRadius: 4, border: '1px solid #E0D0FF' }}>
          <strong style={{ display: 'block', fontSize: 13, color: '#6B21A8', marginBottom: 4 }}>⏱️ Approval Time</strong>
          <p style={{ fontSize: 13, color: '#444', margin: 0 }}>
            Vendor accounts require admin approval. This typically takes 1-2 business days. You'll receive an email when your account is activated.
          </p>
        </div>
      )}

      {role === 'rider' && (
        <div style={{ marginTop: 24, padding: 16, background: '#E0F2FE', borderRadius: 4, border: '1px solid #BAE6FD' }}>
          <strong style={{ display: 'block', fontSize: 13, color: '#0369A1', marginBottom: 4 }}>💰 Earnings</strong>
          <p style={{ fontSize: 13, color: '#444', margin: 0 }}>
            Riders earn 85% of each delivery fee. Payouts are processed daily at 11:30 AM and transferred to your Nigerian bank account.
          </p>
        </div>
      )}
    </div>
  );
}

function GettingStartedContent({ role, T }: { role: Role; T: Record<string, string> }) {
  const content: Record<Role, { steps: { title: string; description: string; details: string[] }[] }> = {
    customer: {
      steps: [
        {
          title: 'Download the App',
          description: 'Get GoBuyMe from Google Play Store or Apple App Store',
          details: [
            'Requires iOS 13.0+ or Android 6.0+',
            '100MB free storage space',
            'Stable internet connection required'
          ]
        },
        {
          title: 'Create Account',
          description: 'Sign up with your email and phone number',
          details: [
            'Enter your email address',
            'Create a password (minimum 8 characters)',
            'Provide Nigerian phone number (+234 format)',
            'Verify email with 6-digit OTP code'
          ]
        },
        {
          title: 'Browse Vendors',
          description: 'Find restaurants, groceries, pharmacies, and errands near you',
          details: [
            'Browse by category cards',
            'Search by vendor name or dish',
            'View vendor ratings and delivery times',
            'Add favorites for quick access'
          ]
        },
        {
          title: 'Place Your First Order',
          description: 'Add items to cart and checkout',
          details: [
            'Select items and quantities',
            'Add options (drinks, sides, etc.)',
            'Choose delivery address',
            'Select payment method',
            'Track order live with GPS'
          ]
        }
      ]
    },
    vendor: {
      steps: [
        {
          title: 'Download and Register',
          description: 'Get the app and create your vendor account',
          details: [
            'Select "Vendor" role during signup',
            'Enter business name and contact details',
            'Verify email with OTP code',
            'Complete profile setup'
          ]
        },
        {
          title: 'Complete Your Profile',
          description: 'Upload business information and documents',
          details: [
            'Upload business logo and cover photo',
            'Write business description',
            'Set opening and closing hours',
            'Choose commission tier (TIER_1: 3% or TIER_2: 7.5%)',
            'Upload KYC document (NIN, Driver\'s License, or Passport)',
            'For food/pharmacy: Upload NAFDAC certificate'
          ]
        },
        {
          title: 'Add Menu Items',
          description: 'Create your menu with photos and prices',
          details: [
            'Add item name, description, and price',
            'Upload high-quality photos',
            'Set availability status',
            'Add option groups (drinks, sides, etc.)'
          ]
        },
        {
          title: 'Wait for Approval',
          description: 'Admin team reviews your profile',
          details: [
            'Approval typically takes 1-2 business days',
            'You\'ll receive email notification',
            'Once approved, open your store to receive orders'
          ]
        }
      ]
    },
    rider: {
      steps: [
        {
          title: 'Download and Register',
          description: 'Get the app and create your rider account',
          details: [
            'Select "Rider" role during signup',
            'Enter personal details and phone number',
            'Specify vehicle type (Motorcycle, Bicycle, Car)',
            'Enter plate number (auto-capitalized)',
            'Verify email with OTP code'
          ]
        },
        {
          title: 'Complete KYC',
          description: 'Upload required documents for verification',
          details: [
            'Upload NIN (front and back)',
            'Upload selfie photo',
            'Upload vehicle photo',
            'Provide guarantor details (name, phone, address)',
            'Optional: BVN for faster payouts'
          ]
        },
        {
          title: 'Wait for Approval',
          description: 'Admin team reviews your documents',
          details: [
            'Approval typically takes 1-2 business days',
            'You\'ll receive email notification',
            'Once approved, you can go online to receive jobs'
          ]
        },
        {
          title: 'Start Earning',
          description: 'Go online and accept delivery jobs',
          details: [
            'Toggle online status from dashboard',
            'View available jobs in your area',
            'Accept jobs that fit your route',
            'Navigate to pickup and delivery locations',
            'Track earnings in real-time'
          ]
        }
      ]
    }
  };

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: '#111', marginBottom: 8 }}>
        Getting Started as {role.charAt(0).toUpperCase() + role.slice(1)}
      </h2>
      <p style={{ fontSize: 14, color: '#444', marginBottom: 24 }}>
        Follow these steps to get started with GoBuyMe
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {content[role].steps.map((step, index) => (
          <div key={index} style={{ padding: 20, background: '#f8f8f3', borderRadius: 4, border: `1px solid ${T.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: '#FF521B',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 700
              }}>
                {index + 1}
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111', margin: 0 }}>
                {step.title}
              </h3>
            </div>
            <p style={{ fontSize: 14, color: '#444', marginBottom: 12, marginTop: 8 }}>
              {step.description}
            </p>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#666', lineHeight: 1.8 }}>
              {step.details.map((detail, i) => (
                <li key={i}>{detail}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeaturesContent({ role, T }: { role: Role; T: Record<string, string> }) {
  const features: Record<Role, { title: string; items: { icon: string; title: string; description: string }[] }> = {
    customer: {
      title: 'Customer Features',
      items: [
        { icon: '🗺️', title: 'Live GPS Tracking', description: 'Watch your rider\'s real-time location on an interactive map with ETA updates' },
        { icon: '🔍', title: 'Smart Search', description: 'Find vendors by name, dish, or category with trending suggestions' },
        { icon: '💳', title: 'Multiple Payments', description: 'Pay with card, bank transfer, Paystack USSD, or cash on delivery' },
        { icon: '⭐', title: 'Favorites', description: 'Save your favorite restaurants for quick access' },
        { icon: '📍', title: 'Saved Addresses', description: 'Store multiple delivery addresses (Home, Work, Other)' },
        { icon: '📱', title: 'Order History', description: 'View all past orders with status and details' },
        { icon: '🎁', title: 'Promo Codes', description: 'Apply promo codes for discounts on orders' }
      ]
    },
    vendor: {
      title: 'Vendor Features',
      items: [
        { icon: '📊', title: 'Dashboard', description: 'View today\'s orders, revenue, and average order value at a glance' },
        { icon: '🍽️', title: 'Menu Management', description: 'Full CRUD for menu items with photo uploads and option groups' },
        { icon: '📦', title: 'Order Management', description: 'Accept, reject, and mark orders ready with status filters' },
        { icon: '📈', title: 'Earnings Tracking', description: 'View revenue breakdown by period with payout history' },
        { icon: '🎯', title: 'Promotions', description: 'Create promotional banners (TIER_2 only) for customer carousel' },
        { icon: '⏰', title: 'Store Hours', description: 'Toggle store open/close status with animated indicator' },
        { icon: '💰', title: 'Daily Payouts', description: 'Automatic daily payouts at 11:30 AM to your bank account' }
      ]
    },
    rider: {
      title: 'Rider Features',
      items: [
        { icon: '🟢', title: 'Online/Offline Toggle', description: 'Switch availability to start/stop receiving job notifications' },
        { icon: '📋', title: 'Available Jobs', description: 'View nearby delivery jobs with earnings and route visualization' },
        { icon: '🗺️', title: 'Live Delivery Map', description: 'Interactive map with GPS streaming and progress tracking' },
        { icon: '💵', title: 'Earnings Dashboard', description: 'Track today, week, month, and all-time earnings with charts' },
        { icon: '📱', title: 'Job Notifications', description: 'Real-time alerts for new delivery opportunities' },
        { icon: '🔄', title: 'GPS Streaming', description: 'Your location streams to customers for live tracking' },
        { icon: '💳', title: 'Payout History', description: 'View all payouts with status and transaction references' }
      ]
    }
  };

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: '#111', marginBottom: 8 }}>
        {features[role].title}
      </h2>
      <p style={{ fontSize: 14, color: '#444', marginBottom: 24 }}>
        Everything you need to succeed on GoBuyMe
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {features[role].items.map((item, index) => (
          <div key={index} style={{ padding: 20, background: '#f8f8f3', borderRadius: 4, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>{item.icon}</div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 6 }}>
              {item.title}
            </h3>
            <p style={{ fontSize: 13, color: '#666', lineHeight: 1.6, margin: 0 }}>
              {item.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaymentsContent({ role, T }: { role: Role; T: Record<string, string> }) {
  if (role === 'customer') {
    return (
      <div>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: '#111', marginBottom: 8 }}>
          Payment Methods
        </h2>
        <p style={{ fontSize: 14, color: '#444', marginBottom: 24 }}>
          Multiple payment options for your convenience
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <PaymentCard
            icon="💳"
            title="Card Payment"
            description="Pay with debit or credit card via Paystack"
            details={['Supports Visa, Mastercard, Verve', '3D Secure verification may be required', 'Instant payment confirmation']}
            T={T}
          />
          <PaymentCard
            icon="🏦"
            title="Bank Transfer"
            description="Transfer to Paystack virtual account"
            details={['Supports all Nigerian banks', 'Virtual account generated instantly', 'Transfers reflect within 5-10 minutes']}
            T={T}
          />
          <PaymentCard
            icon="📱"
            title="Paystack USSD"
            description="Dial USSD code for instant payment"
            details={['Works on all networks (MTN, Airtel, Glo, 9mobile)', 'No internet required for initiation', 'Instant payment confirmation']}
            T={T}
          />
          <PaymentCard
            icon="💵"
            title="Cash on Delivery"
            description="Pay when rider arrives"
            details={['Cash only payment', 'Exact change recommended', 'Riders carry limited change']}
            T={T}
          />
        </div>
      </div>
    );
  }

  if (role === 'vendor' || role === 'rider') {
    return (
      <div>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: '#111', marginBottom: 8 }}>
          Payouts & Earnings
        </h2>
        <p style={{ fontSize: 14, color: '#444', marginBottom: 24 }}>
          How you get paid on GoBuyMe
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ padding: 20, background: '#f8f8f3', borderRadius: 4, border: `1px solid ${T.border}` }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111', marginBottom: 8 }}>Payout Schedule</h3>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: '#666', lineHeight: 1.8 }}>
              <li>Daily payout batch at 11:30 AM (WAT)</li>
              <li>Automatic transfer to Nigerian bank account</li>
              <li>Supports all major Nigerian banks</li>
              <li>Payouts reflect within 2-4 business hours</li>
              <li>Minimum payout threshold: ₦500</li>
            </ul>
          </div>

          {role === 'rider' && (
            <div style={{ padding: 20, background: '#E0F2FE', borderRadius: 4, border: '1px solid #BAE6FD' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0369A1', marginBottom: 8 }}>Rider Earnings</h3>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: '#444', lineHeight: 1.8 }}>
                <li>You receive 85% of delivery fee per order</li>
                <li>Platform keeps 15%</li>
                <li>Earnings depend on number of deliveries and distance</li>
                <li>Track earnings in real-time from dashboard</li>
              </ul>
            </div>
          )}

          {role === 'vendor' && (
            <div style={{ padding: 20, background: '#F0E6FF', borderRadius: 4, border: '1px solid #E0D0FF' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#6B21A8', marginBottom: 8 }}>Vendor Commission</h3>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: '#444', lineHeight: 1.8 }}>
                <li><strong>TIER_1 (Starter)</strong>: 3% commission per order</li>
                <li><strong>TIER_2 (Growth)</strong>: 7.5% commission per order</li>
                <li>TIER_2 includes promotional banner access</li>
                <li>Can switch tiers (14-day cooldown applies)</li>
              </ul>
            </div>
          )}

          <div style={{ padding: 20, background: '#FEF3C7', borderRadius: 4, border: '1px solid #FDE68A' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#92400E', marginBottom: 8 }}>Setting Up Payout Account</h3>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: '#444', lineHeight: 1.8 }}>
              <li>Add your Nigerian bank account details</li>
              <li>Account name must match your registered name</li>
              <li>Paystack recipient code generated automatically</li>
              <li>Update anytime from profile settings</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function PaymentCard({ icon, title, description, details, T }: { icon: string; title: string; description: string; details: string[]; T: Record<string, string> }) {
  return (
    <div style={{ padding: 20, background: '#fff', borderRadius: 4, border: `1px solid ${T.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <span style={{ fontSize: 24 }}>{icon}</span>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111', margin: 0 }}>
          {title}
        </h3>
      </div>
      <p style={{ fontSize: 14, color: '#444', marginBottom: 12 }}>
        {description}
      </p>
      <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#666', lineHeight: 1.8 }}>
        {details.map((detail, i) => (
          <li key={i}>{detail}</li>
        ))}
      </ul>
    </div>
  );
}

function TroubleshootingContent({ role, T }: { role: Role; T: Record<string, string> }) {
  const issues: Record<Role, { title: string; problems: { question: string; answer: string }[] }> = {
    customer: {
      title: 'Common Customer Issues',
      problems: [
        { question: 'App won\'t open?', answer: 'Force close and restart, check internet connection, update to latest version' },
        { question: 'Can\'t receive OTP?', answer: 'Check spam folder, wait 60 seconds before resending, verify email is correct' },
        { question: 'Payment failed?', answer: 'Verify payment details, check bank balance, try alternative payment method' },
        { question: 'Order not appearing?', answer: 'Refresh the page, check order history, contact support if issue persists' },
        { question: 'Map not loading?', answer: 'Enable location services, grant location permission, check internet connection' }
      ]
    },
    vendor: {
      title: 'Common Vendor Issues',
      problems: [
        { question: 'Orders not appearing?', answer: 'Check if store is open, verify approval status, refresh dashboard' },
        { question: 'Can\'t upload photos?', answer: 'Check internet connection, verify file size (max 5MB), ensure JPG/PNG format' },
        { question: 'Payout not received?', answer: 'Check payout account is configured, verify bank details, check payout history' },
        { question: 'Account not active?', answer: 'Wait for admin approval (1-2 business days), check email for notification' },
        { question: 'Menu items not saving?', answer: 'Ensure all required fields are filled, check photo upload completed' }
      ]
    },
    rider: {
      title: 'Common Rider Issues',
      problems: [
        { question: 'No jobs appearing?', answer: 'Check if you\'re online, verify approval status, check internet connection' },
        { question: 'GPS not streaming?', answer: 'Enable location services, grant "Always" permission, check you\'re online' },
        { question: 'Can\'t complete delivery?', answer: 'Contact support immediately, frequent cancellations affect rating' },
        { question: 'Payout not received?', answer: 'Check payout account is configured, verify bank details, minimum threshold is ₦500' },
        { question: 'App crashes when online?', answer: 'Update to latest version, clear app cache, reinstall if needed' }
      ]
    }
  };

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: '#111', marginBottom: 8 }}>
        {issues[role].title}
      </h2>
      <p style={{ fontSize: 14, color: '#444', marginBottom: 24 }}>
        Solutions to common problems
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {issues[role].problems.map((problem, index) => (
          <div key={index} style={{ padding: 16, background: '#f8f8f3', borderRadius: 4, border: `1px solid ${T.border}` }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#111', marginBottom: 6 }}>
              {problem.question}
            </h3>
            <p style={{ fontSize: 13, color: '#666', lineHeight: 1.6, margin: 0 }}>
              {problem.answer}
            </p>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 24, padding: 16, background: '#FEF3C7', borderRadius: 4, border: '1px solid #FDE68A' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#92400E', marginBottom: 6 }}>Still Need Help?</h3>
        <p style={{ fontSize: 13, color: '#444', marginBottom: 8, margin: 0 }}>
          Contact our support team for personalized assistance.
        </p>
        <a
          href="mailto:support@gobuyme.shop"
          style={{ color: '#FF521B', fontWeight: 600, textDecoration: 'none', fontSize: 13 }}
        >
          support@gobuyme.shop
        </a>
      </div>
    </div>
  );
}
