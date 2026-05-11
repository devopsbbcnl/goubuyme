interface BarChartProps {
  data: number[];
  labels: string[];
  color: string;
  h?: number;
}

export function BarChart({ data, labels, color, h = 120 }: BarChartProps) {
  const max = Math.max(...data);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: h + 20 }}>
      {data.map((v, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: '100%',
            borderRadius: '4px 4px 0 0',
            height: `${(v / max) * h}px`,
            background: i === data.length - 1 ? color : `${color}55`,
            transition: 'height 0.5s ease',
            minHeight: 4,
          }} />
          <span style={{ fontSize: 10, color: '#555', fontWeight: 600 }}>{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}
