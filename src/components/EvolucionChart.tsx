import {
  AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

const TOOLTIP_STYLE = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
  color: "var(--foreground)",
  boxShadow: "0 8px 24px -8px rgb(0 0 0 / 0.18)",
} as const;

export default function EvolucionChart({
  seriesData,
}: {
  seriesData: { mes: string; Captaciones: number; Ventas: number }[];
}) {
  return (
    <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold tracking-tight mb-4">Captaciones y ventas · últimos 12 meses</h3>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={seriesData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gCapt" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gVent" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--gold)" stopOpacity={0.4} />
              <stop offset="100%" stopColor="var(--gold)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="mes" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
          <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" allowDecimals={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area type="monotone" dataKey="Captaciones" stroke="var(--primary)" strokeWidth={2.5} fill="url(#gCapt)" activeDot={{ r: 5 }} />
          <Area type="monotone" dataKey="Ventas" stroke="var(--gold)" strokeWidth={2.5} fill="url(#gVent)" activeDot={{ r: 5 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
