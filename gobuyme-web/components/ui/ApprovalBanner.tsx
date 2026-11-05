'use client';

const COPY: Record<'vendor' | 'rider' | 'company', string> = {
  vendor: "Your account is pending verification. You won't appear in the store until approved.",
  rider: "Your account is pending verification. You can't receive delivery jobs until approved.",
  company: "Your company is pending verification. You can't invite riders until it is approved.",
};

export function ApprovalBanner({ role }: { role: 'vendor' | 'rider' | 'company' }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 20px',
        background: 'rgba(245,166,35,0.12)',
        borderBottom: '1px solid var(--warning)',
        fontSize: 13,
        fontWeight: 500,
        color: 'var(--text)',
      }}
    >
      <span aria-hidden="true">⚠️</span>
      <span>{COPY[role]}</span>
    </div>
  );
}
