import { Link } from "@tanstack/react-router";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const TOOLTIP_STYLE = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
  color: "var(--foreground)",
  boxShadow: "0 8px 24px -8px rgb(0 0 0 / 0.18)",
} as const;

export default function VisitasAnalytics({
  data,
}: {
  data: {
    semanas: { label: string; count: number }[];
    topInmuebles: { id: string; dir: string; count: number }[];
  };
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 flex flex-col">
      <h3 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium mb-3">
        Visitas · últimas 8 semanas
      </h3>
      <ResponsiveContainer width="100%" height={100}>
        <BarChart data={data.semanas} margin={{ top: 2, right: 4, left: -28, bottom: 0 }}>
          <defs>
            <linearGradient id="gVisBar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={1} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.5} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 9 }} stroke="var(--muted-foreground)" />
          <YAxis tick={{ fontSize: 9 }} stroke="var(--muted-foreground)" allowDecimals={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="count" name="Visitas" fill="url(#gVisBar)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      {data.topInmuebles.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border flex-1">
          <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-2">
            Top inmuebles
          </div>
          <div className="space-y-1.5">
            {data.topInmuebles.map((item, idx) => (
              <Link
                key={item.id}
                to="/inmuebles/$id"
                params={{ id: item.id }}
                className="flex items-center gap-2 hover:bg-accent/40 -mx-1 px-1 py-0.5 rounded-lg transition-colors"
              >
                <span className="text-[10px] text-muted-foreground tabular-nums w-3 shrink-0">
                  {idx + 1}
                </span>
                <span className="text-xs truncate flex-1">{item.dir || "Sin dirección"}</span>
                <span className="text-xs font-semibold text-primary shrink-0">{item.count}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
