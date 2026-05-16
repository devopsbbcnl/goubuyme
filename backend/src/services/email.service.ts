import { Resend } from 'resend';
import logger from '../utils/logger';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM ?? 'GoBuyMe <noreply@notifications.gobuyme.shop>';
const DASHBOARD_URL = process.env.DASHBOARD_URL ?? 'https://dashboard.gobuyme.shop';
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL ?? 'support@gobuyme.shop';
const LOGO_URL = process.env.LOGO_URL ?? '';

// ─── Base ──────────────────────────────────────────────────────────────────

export const sendEmail = async (to: string, subject: string, html: string): Promise<void> => {
  try {
    await resend.emails.send({ from: FROM, to, subject, html });
    logger.info(`Email sent to ${to}: ${subject}`);
  } catch (err) {
    logger.error('Email send failed', err);
  }
};

// ─── Shared layout wrapper ──────────────────────────────────────────────────

function emailLayout(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F4F4;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F4;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;">
        <!-- Header -->
        <tr>
          <td style="padding:24px 40px;text-align:center;">
            ${LOGO_URL
              ? `<img src="${LOGO_URL}" alt="GoBuyMe" height="52" style="display:block;margin:0 auto;max-width:160px;height:52px;object-fit:contain;" />`
              : `<span style="font-size:22px;font-weight:800;color:#FF521B;letter-spacing:-0.5px;">GoBuyMe</span>`
            }
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 32px;">
            ${content}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px;background:#F9F9F9;border-top:1px solid #EBEBEB;">
            <p style="margin:0;font-size:12px;color:#999999;line-height:18px;">
              © ${new Date().getFullYear()} GoBuyMe. All rights reserved.<br>
              Need help? <a href="mailto:${SUPPORT_EMAIL}" style="color:#FF521B;text-decoration:none;">${SUPPORT_EMAIL}</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function ctaButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#FF521B;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:4px;margin-top:24px;">${label}</a>`;
}

function step(number: number, title: string, body: string): string {
  return `<tr>
    <td style="padding:16px 0;border-bottom:1px solid #F0F0F0;">
      <table cellpadding="0" cellspacing="0" width="100%"><tr>
        <td width="36" valign="top" style="padding-top:2px;">
          <span style="display:inline-block;width:26px;height:26px;background:#FF521B;border-radius:50%;color:#fff;font-size:12px;font-weight:700;text-align:center;line-height:26px;">${number}</span>
        </td>
        <td style="padding-left:12px;">
          <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#111111;">${title}</p>
          <p style="margin:0;font-size:14px;color:#666666;line-height:21px;">${body}</p>
        </td>
      </tr></table>
    </td>
  </tr>`;
}

// ─── OTP ───────────────────────────────────────────────────────────────────

export const sendOtpEmail = async (to: string, name: string, otp: string): Promise<void> => {
  const content = `
    <p style="margin:0 0 8px;font-size:16px;color:#333333;">Hi ${name},</p>
    <p style="margin:0 0 28px;font-size:15px;color:#555555;line-height:22px;">
      Use the code below to verify your GoBuyMe account. It expires in <strong>10 minutes</strong>.
    </p>
    <div style="background:#F9F9F9;border:1px solid #EBEBEB;border-radius:6px;padding:28px;text-align:center;">
      <span style="font-size:40px;font-weight:800;letter-spacing:12px;color:#111111;">${otp}</span>
    </div>
    <p style="margin:24px 0 0;font-size:13px;color:#999999;">
      Do not share this code with anyone. If you didn't create a GoBuyMe account, you can safely ignore this email.
    </p>`;
  await sendEmail(to, 'Verify your GoBuyMe account', emailLayout(content));
};

// ─── Password reset ────────────────────────────────────────────────────────

export const sendPasswordResetEmail = async (to: string, resetToken: string): Promise<void> => {
  const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`;
  const content = `
    <p style="margin:0 0 8px;font-size:16px;color:#333333;">Password reset request</p>
    <p style="margin:0 0 24px;font-size:15px;color:#555555;line-height:22px;">
      Click the button below to reset your password. This link expires in <strong>1 hour</strong>.
    </p>
    ${ctaButton(resetUrl, 'Reset Password')}
    <p style="margin:24px 0 0;font-size:13px;color:#999999;">
      If you didn't request a password reset, you can safely ignore this email.
    </p>`;
  await sendEmail(to, 'Reset your GoBuyMe password', emailLayout(content));
};

// ─── Welcome emails ────────────────────────────────────────────────────────

function welcomeCustomer(name: string): string {
  return emailLayout(`
    <p style="margin:0 0 4px;font-size:20px;font-weight:800;color:#111111;">Welcome to GoBuyMe, ${name}! 🎉</p>
    <p style="margin:8px 0 28px;font-size:15px;color:#555555;line-height:22px;">
      Your account is ready. Order food, groceries, and more from local vendors — delivered straight to your door.
    </p>

    <table cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid #F0F0F0;">
      ${step(1, 'Browse vendors near you', 'Explore restaurants, grocery stores, pharmacies, and errand services in your area.')}
      ${step(2, 'Place your first order', 'Add items to your cart, choose a delivery address, and pay securely via card or cash.')}
      ${step(3, 'Track in real time', 'Watch your rider on a live map from the moment your order is picked up.')}
    </table>

    <p style="margin:28px 0 0;font-size:14px;color:#555555;line-height:22px;">
      Questions? Reply to this email or reach us at
      <a href="mailto:${SUPPORT_EMAIL}" style="color:#FF521B;text-decoration:none;">${SUPPORT_EMAIL}</a>.
    </p>`);
}

function welcomeVendor(name: string, businessName: string): string {
  const setupUrl = `${DASHBOARD_URL}/vendor/setup`;

  return emailLayout(`
    <p style="margin:0 0 4px;font-size:20px;font-weight:800;color:#111111;">Welcome to GoBuyMe, ${name}!</p>
    <p style="margin:8px 0 28px;font-size:15px;color:#555555;line-height:22px;">
      <strong>${businessName}</strong> has been registered. Your account is now under review —
      here's what to do next to get approved and go live faster.
    </p>

    <table cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid #F0F0F0;">
      ${step(1, 'Complete your business profile', 'Add your logo, cover photo, opening hours, and a short description so customers know what to expect.')}
      ${step(2, 'Choose your commission plan', 'Pick between the Growth Plan (7.5% commission) and the Starter Plan (3% commission). Both have no monthly fee — you can compare details on the setup page.')}
      ${step(3, 'Add your menu', 'Upload your items with names, prices, and photos. A well-stocked menu gets approved faster.')}
      ${step(4, 'Wait for approval', 'Our team reviews every vendor before going live — usually within 1–2 business days. You\'ll receive an email once approved.')}
    </table>

    <p style="margin:28px 0 16px;font-size:15px;color:#555555;line-height:22px;">
      Head to the vendor dashboard to complete your setup:
    </p>
    ${ctaButton(setupUrl, 'Complete Setup')}

    <p style="margin:32px 0 0;font-size:14px;color:#555555;line-height:22px;">
      Need help getting set up? Reply to this email or contact
      <a href="mailto:${SUPPORT_EMAIL}" style="color:#FF521B;text-decoration:none;">${SUPPORT_EMAIL}</a>.
    </p>`);
}

function welcomeRider(name: string): string {
  const setupUrl = `${DASHBOARD_URL}/rider/setup`;

  return emailLayout(`
    <p style="margin:0 0 4px;font-size:20px;font-weight:800;color:#111111;">Welcome to GoBuyMe, ${name}!</p>
    <p style="margin:8px 0 28px;font-size:15px;color:#555555;line-height:22px;">
      Your rider account is registered and under review. Complete your profile to get approved and start earning.
    </p>

    <table cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid #F0F0F0;">
      ${step(1, 'Complete your rider profile', 'Log in to the dashboard and fill in your personal details, emergency contact, and bank account for payouts.')}
      ${step(2, 'Upload required documents', 'Submit a valid ID, your vehicle details, and a clear profile photo. This speeds up your verification.')}
      ${step(3, 'Await verification', 'Our team verifies every rider before activation — typically within 1–2 business days. You\'ll get an email once you\'re approved.')}
      ${step(4, 'Go online and earn', 'Once approved, open the app, toggle online, and start accepting delivery jobs near you.')}
    </table>

    <p style="margin:28px 0 16px;font-size:15px;color:#555555;line-height:22px;">
      Complete your setup now to get approved sooner:
    </p>
    ${ctaButton(setupUrl, 'Complete Rider Profile')}

    <p style="margin:32px 0 0;font-size:14px;color:#555555;line-height:22px;">
      Questions? Reach us at
      <a href="mailto:${SUPPORT_EMAIL}" style="color:#FF521B;text-decoration:none;">${SUPPORT_EMAIL}</a>.
    </p>`);
}

export const sendWelcomeEmail = async (
  to: string,
  name: string,
  role: string,
  businessName?: string,
): Promise<void> => {
  if (role === 'CUSTOMER') {
    await sendEmail(to, `Welcome to GoBuyMe, ${name}!`, welcomeCustomer(name));
  } else if (role === 'VENDOR') {
    await sendEmail(to, 'Welcome to GoBuyMe – Complete your vendor setup', welcomeVendor(name, businessName ?? name));
  } else if (role === 'RIDER') {
    await sendEmail(to, 'Welcome to GoBuyMe – Complete your rider profile', welcomeRider(name));
  }
};
