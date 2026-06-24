import { LineChart, Line, ResponsiveContainer } from 'recharts';

export default function MiniSparkline({ points, color = '#2563EB', height = 44 }) {
  const data = (points || [])
    .filter((p) => p.numericValue != null)
    .map((p, i) => ({ i, v: p.numericValue }));

  if (data.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-[10px] text-slate-400 bg-slate-50 rounded-lg border border-slate-100"
        style={{ height }}
      >
        —
      </div>
    );
  }

  return (
    <div style={{ height }} dir="ltr" className="rounded-lg bg-slate-50/80 border border-slate-100 px-1">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 2, left: 2, bottom: 4 }}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
