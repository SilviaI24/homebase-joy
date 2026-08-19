import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
} from "recharts";

export function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "primary",
  sparkData,
  sparkColor,
  delta,
  progress,
  progressTone = "success",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone?: "primary" | "success" | "warning" | "gold";
  sparkData?: { i: number; v: number }[];
  sparkColor?: string;
  delta?: number;
  progress?: number;
  progressTone?: "success" | "warning";
}) {
  const toneMap: Record<string, string> = {
    primary: "text-primary bg-primary/10",
    success: "text-success bg-success/10",
    warning: "text-warning bg-warning/10",
    gold: "text-[var(--gold)] bg-[var(--gold)]/10",
  };
  const positive = (delta ?? 0) >= 0;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground font-medium">{label}</div>
        <div className={`size-8 rounded-md flex items-center justify-center ${toneMap[tone]}`}>
          <Icon className="size-4" />
        </div>
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {typeof delta === "number" && (
          <div
            className={`inline-flex items-center gap-0.5 text-[11px] font-semibold rounded-full px-1.5 py-0.5 ${
              positive
                ? "bg-success/10 text-success"
                : "bg-destructive/10 text-destructive"
            }`}
          >
            {positive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
            {positive ? "+" : ""}
            {delta}%
          </div>
        )}
      </div>
      {hint && (
        <div className="mt-0.5 text-[11px] text-muted-foreground line-clamp-1">{hint}</div>
      )}
      {sparkData && sparkData.length > 1 && (
        <div className="mt-2 -mx-1 h-8">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
              <defs>
                <linearGradient id={`kpi-spark-${label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={sparkColor ?? "#3b82f6"} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={sparkColor ?? "#3b82f6"} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={sparkColor ?? "#3b82f6"}
                strokeWidth={1.75}
                fill={`url(#kpi-spark-${label})`}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {typeof progress === "number" && (
        <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full ${
              progressTone === "warning"
                ? "bg-gradient-to-r from-warning to-warning/70"
                : "bg-gradient-to-r from-success to-brand-green"
            }`}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
    </div>
  );
}
