import Image from 'next/image';

const BASE = 'https://gobuyme.shop';

export function CustomerFooter() {
  return (
    <footer className="footer">
      <div className="inner">
        <div className="footer-grid">
          <div className="footer-col">
            <a href={BASE} className="footer-logo">
              <Image src="/images/logo.png" alt="GoBuyMe" width={130} height={40} style={{ objectFit: 'contain' }} />
            </a>
            <p style={{ fontSize: 13, lineHeight: 1.7, maxWidth: 260 }}>
              Nigeria&apos;s fastest on-demand delivery platform. Food, groceries, and more in 25 minutes or less.
            </p>
          </div>
          <div className="footer-col">
            <h4>Company</h4>
            <a href={`${BASE}/about`}>About Us</a>
            <a href={`${BASE}/careers`}>Careers</a>
            <a href={`${BASE}/blog`}>Blog</a>
            <a href={`${BASE}/press`}>Press</a>
          </div>
          <div className="footer-col">
            <h4>Partners</h4>
            <a href={`${BASE}/vendor-signup`}>Become a Vendor</a>
            <a href={`${BASE}/rider-signup`}>Become a Rider</a>
            <a href={`${BASE}/advertise`}>Advertise</a>
          </div>
          <div className="footer-col">
            <h4>Support</h4>
            <a href={`${BASE}/help`}>Help Center</a>
            <a href={`${BASE}/contact`}>Contact Us</a>
            <a href={`${BASE}/privacy`}>Privacy Policy</a>
            <a href={`${BASE}/terms`}>Terms of Service</a>
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
