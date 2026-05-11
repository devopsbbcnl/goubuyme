import { useTheme } from '@/context/ThemeContext';
import { Sparkline } from './Sparkline';

interface StatCardProps {
  label: string;
  value: string;
  delta: string;
  deltaUp: boolean;
  sparkData: number[];
  color: string;
  icon: string;
}

export function StatCard({ label, value, delta, deltaUp, sparkData, color, icon }: StatCardProps) {
  const { theme: T } = useTheme();
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 4, padding: '20px 22px', flex: 1,
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textSec, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
            {label}
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: T.text, letterSpacing: '-0.5px' }}>
            {value}
          </div>
        </div>
        <div style={{ fontSize: 24, opacity: 0.7 }}>{icon}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ color: deltaUp ? T.success : T.error, fontSize: 12, fontWeight: 700 }}>
            {deltaUp ? '↑' : '↓'} {delta}
          </span>
          <span style={{ fontSize: 11, color: T.textMuted }}>vs last week</span>
        </div>
        <Sparkline data={sparkData} color={color} />
      </div>
    </div>
  );
}
