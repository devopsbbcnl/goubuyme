import Image from 'next/image';

// Marketing pages live in the (marketing) route group of this same app, so
// these are plain internal links (full page load across root layouts).
export function CustomerFooter() {
  return (
    <footer className="footer">
      <div className="inner">
        <div className="footer-grid">
          <div className="footer-col">
            <a href="/" className="footer-logo" style={{ display: 'inline-block', background: 'rgba(255,255,255,0.16)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 4, padding: '4px 10px' }}>
              <Image src="/images/logo.png" alt="GoBuyMe" width={130} height={40} style={{ objectFit: 'contain' }} />
            </a>
            <p style={{ fontSize: 13, lineHeight: 1.7, maxWidth: 260 }}>
              Nigeria&apos;s fastest on-demand delivery platform. Food, groceries, and more in 25 minutes or less.
            </p>
          </div>
          <div className="footer-col">
            <h4>Company</h4>
            <a href="/">About GoBuyMe</a>
            <a href="/press">Press</a>
            <a href="/how-to">How It Works</a>
            <a href="/affiliate">Affiliate Program</a>
          </div>
          <div className="footer-col">
            <h4>Partners</h4>
            <a href="/become-a-vendor">Become a Vendor</a>
            <a href="/riders">Become a Rider</a>
            <a href="/contact">Advertise</a>
          </div>
          <div className="footer-col">
            <h4>Support</h4>
            <a href="/contact">Contact Us</a>
            <a href="/privacy">Privacy Policy</a>
            <a href="/terms">Terms of Service</a>
            <a href="/downloads">Download App</a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2025 Bubble Barrel Commerce Limited. All rights reserved.</span>
          <span>🇳🇬 Made in Nigeria</span>
        </div>
      </div>
    </footer>
  );
}
