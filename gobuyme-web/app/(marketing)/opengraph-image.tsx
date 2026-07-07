import { ImageResponse } from 'next/og';

export const alt = 'GoBuyMe — Food, Grocery & Pharmacy Delivery in Nigeria';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background: 'linear-gradient(135deg, #FF521B 0%, #FF7A4D 100%)',
          color: '#fff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 4, textTransform: 'uppercase', opacity: 0.85 }}>
          GoBuyMe
        </div>
        <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.1, marginTop: 24, maxWidth: 950 }}>
          Hungry? GoBuyMe. Anything.
        </div>
        <div style={{ fontSize: 34, marginTop: 28, opacity: 0.92, maxWidth: 900 }}>
          Food, groceries & pharmacy delivered across Nigeria in 25 minutes.
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginTop: 48,
            fontSize: 26,
            fontWeight: 700,
            background: 'rgba(255,255,255,0.18)',
            border: '2px solid rgba(255,255,255,0.7)',
            borderRadius: 8,
            padding: '16px 32px',
            alignSelf: 'flex-start',
          }}
        >
          🇳🇬 500+ vendors · Lagos · Abuja · Port Harcourt & more
        </div>
      </div>
    ),
    { ...size }
  );
}
