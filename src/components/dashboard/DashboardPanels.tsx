// M-03: extraído de src/routes/index.tsx. Componentes de presentación puros
// (sin hooks de Route, reciben todo por props) del Dashboard.
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { MapPin, TrendingDown, Flame, BellOff, ArrowRight } from "lucide-react";
import type { Inmueble } from "@/lib/inmuebles.functions";
import type { LeadInsight } from "@/lib/clientes.functions";
import { moneyShort, moneyFull, fmtDate, calcDelta } from "@/lib/dashboard-format";
import { cleanRef } from "@/lib/format";

export function PulsoChip({
  label,
  value,
  prev,
  icon: Icon,
  iconColor,
  iconBg,
}: {
  label: string;
  value: number;
  prev?: number;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
}) {
  const d = prev !== undefined ? calcDelta(value, prev) : null;
  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3">
      <span
        className={`inline-flex items-center justify-center size-9 rounded-xl shrink-0 ${iconBg}`}
      >
        <Icon className={`size-4 ${iconColor}`} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-2xl font-display font-bold tabular-nums leading-none">{value}</div>
        <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mt-1 leading-tight">
          {label}
        </div>
      </div>
      {d !== null && (
        <div
          className={`shrink-0 text-xs font-semibold ${d >= 0 ? "text-success" : "text-destructive"}`}
        >
          {d >= 0 ? "+" : ""}
          {d}%
        </div>
      )}
    </div>
  );
}

export function DepartamentosPanel({
  data,
}: {
  data: { display: string; captaciones: number; ventas: number; activos: number }[];
}) {
  const maxCap = Math.max(1, ...data.map((d) => d.captaciones));
  const totalCapt = data.reduce((s, d) => s + d.captaciones, 0);
  const totalVentas = data.reduce((s, d) => s + d.ventas, 0);
  return (
    <div className="rounded-2xl border border-border bg-card p-5 flex flex-col">
      <div className="flex items-start justify-between mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <MapPin className="size-4 text-gold" /> Actividad por zona
        </h3>
        <div className="text-[10px] text-muted-foreground tabular-nums text-right leading-tight">
          <span className="font-semibold text-foreground">{totalCapt}</span> capt
          <br />
          <span className="font-semibold text-foreground">{totalVentas}</span> vtas
        </div>
      </div>
      {data.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          Sin datos.
        </div>
      ) : (
        <div className="flex-1 space-y-2.5">
          {data.map((d) => (
            <div key={d.display}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-medium truncate">{d.display}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded bg-gold/15 text-gold text-[10px] font-bold tabular-nums">
                    {d.captaciones}
                  </span>
                  {d.ventas > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded bg-success/10 text-success text-[10px] font-bold tabular-nums">
                      {d.ventas}
                    </span>
                  )}
                </div>
              </div>
              <div className="h-1 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-gold"
                  style={{ width: `${Math.max(6, Math.round((d.captaciones / maxCap) * 100))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 pt-3 border-t border-border flex gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-gold inline-block" />
          Captaciones
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-success/40 inline-block" />
          Ventas
        </span>
      </div>
    </div>
  );
}

export function CarteraBreakdown({
  data,
  maxValor,
}: {
  data: { tipo: string; count: number; valor: number }[];
  maxValor: number;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium mb-4">
        Cartera activa · por tipo
      </h3>
      {data.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Sin activos.</div>
      ) : (
        <div className="space-y-3">
          {data.map((d) => (
            <div key={d.tipo}>
              <div className="flex items-baseline justify-between text-xs mb-1.5">
                <span className="font-medium truncate max-w-[55%]">{d.tipo}</span>
                <span className="text-muted-foreground tabular-nums shrink-0 text-[11px]">
                  <span className="font-semibold text-foreground">{d.count}</span> ·{" "}
                  {moneyShort(d.valor)}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-gold/70"
                  style={{ width: `${Math.max(6, Math.round((d.valor / maxValor) * 100))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AlertasPanel({ estancados }: { estancados: { i: Inmueble; dias: number }[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <TrendingDown className="size-4 text-alert" /> Inmuebles estancados
        </h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Activos sin escritura tras +90 días.
        </p>
      </div>
      {estancados.length === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground">
          Sin alertas. Cartera saludable.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {estancados.map(({ i, dias }) => (
            <li key={i.id}>
              <Link
                to="/inmuebles/$id"
                params={{ id: i.id }}
                className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40 transition-colors"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-alert/10 text-alert text-[11px] font-bold tabular-nums">
                  {dias}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">
                    {i.calle || "Sin dirección"} {i.numero}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {[i.barrio, i.localidad].filter(Boolean).join(" · ") || i.tipo}
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums">
                  {i.precio ? moneyShort(i.precio) : "—"}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RecentRow({ i }: { i: Inmueble }) {
  return (
    <Link
      to="/inmuebles/$id"
      params={{ id: i.id }}
      className="flex items-center gap-3 px-5 py-3 hover:bg-accent/40 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">
          {i.calle || "Sin dirección"} {i.numero}
          {i.ref && (
            <span className="ml-2 text-[11px] font-mono text-muted-foreground">
              #{cleanRef(i.ref)}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {[i.barrio, i.localidad].filter(Boolean).join(" · ") || "—"} · {i.tipo || "—"}
          {i.agentesNombres.length > 0 && ` · ${i.agentesNombres.join(", ")}`}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-semibold tabular-nums">
          {i.precio ? moneyFull(i.precio) : "—"}
        </div>
        <div className="text-[11px] text-muted-foreground">{fmtDate(i.fechaInicio)}</div>
      </div>
    </Link>
  );
}

export function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 70
      ? "bg-success/15 text-success"
      : pct >= 40
        ? "bg-gold/15 text-[var(--gold)]"
        : "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center justify-center size-8 rounded-lg text-[11px] font-bold tabular-nums shrink-0 ${color}`}
    >
      {pct}
    </span>
  );
}

export function LeadsCalientesPanel({ leads }: { leads: LeadInsight[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Flame className="size-4 text-[var(--gold)]" /> Leads más calientes
        </h3>
        <Link
          to="/mis-leads"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
        >
          Ver todos <ArrowRight className="size-3" />
        </Link>
      </div>
      {leads.length === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground">
          Sin leads con score alto.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {leads.map((lead) => (
            <li key={lead.id}>
              <Link
                to="/clientes"
                search={{ id: lead.id }}
                className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40 transition-colors"
              >
                <ScoreBadge score={lead.score} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{lead.nombre}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {lead.telefono ?? "Sin tel."} · {lead.ciclo_vida}
                    {lead.diasSinContacto !== null && (
                      <span className={`ml-1 ${lead.diasSinContacto < 7 ? "text-success" : ""}`}>
                        · {lead.diasSinContacto}d
                      </span>
                    )}
                  </div>
                </div>
                {!lead.tieneAgente && (
                  <span className="text-[10px] text-warning bg-warning/10 px-1.5 py-0.5 rounded shrink-0">
                    Sin asignar
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SinSeguimientoPanel({ leads }: { leads: LeadInsight[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <BellOff className="size-4 text-destructive" /> Sin seguimiento · +30 días
        </h3>
        <Link
          to="/mis-leads"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
        >
          Ver todos <ArrowRight className="size-3" />
        </Link>
      </div>
      {leads.length === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground">
          Sin leads sin atender. Bien hecho.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {leads.map((lead) => (
            <li key={lead.id}>
              <Link
                to="/clientes"
                search={{ id: lead.id }}
                className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40 transition-colors"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive text-[11px] font-bold tabular-nums">
                  {lead.diasSinContacto === null ? "∞" : lead.diasSinContacto}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{lead.nombre}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {lead.telefono ?? "Sin tel."} · {lead.ciclo_vida}
                  </div>
                </div>
                {!lead.tieneAgente && (
                  <span className="text-[10px] text-warning bg-warning/10 px-1.5 py-0.5 rounded shrink-0">
                    Sin asignar
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
