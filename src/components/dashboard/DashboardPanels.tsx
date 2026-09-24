// M-03: extraído de src/routes/index.tsx. Componentes de presentación puros
// (sin hooks de Route, reciben todo por props) del Dashboard.
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  MapPin,
  TrendingDown,
  Flame,
  BellOff,
  ArrowRight,
  UserX,
  HandCoins,
  Clock,
  CheckCircle2,
} from "lucide-react";
import type { Inmueble } from "@/lib/inmuebles.functions";
import type { LeadInsight } from "@/lib/clientes.functions";
import type { OperacionRow as OperacionRowData } from "@/lib/operaciones.functions";
import { moneyShort, moneyFull, fmtDate, calcDelta } from "@/lib/dashboard-format";
import { cleanRef } from "@/lib/format";
import { ESTADO_STYLE, fmtEur } from "@/lib/operaciones-format";

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
        <div className="text-xs uppercase tracking-[0.15em] text-muted-foreground mt-1 leading-tight">
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
        <div className="text-xs text-muted-foreground tabular-nums text-right leading-tight">
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
                  <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded bg-gold/15 text-gold text-xs font-bold tabular-nums">
                    {d.captaciones}
                  </span>
                  {d.ventas > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded bg-success/10 text-success text-xs font-bold tabular-nums">
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
      <h3 className="text-xs uppercase tracking-[0.18em] text-muted-foreground font-medium mb-4">
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
                <span className="text-muted-foreground tabular-nums shrink-0 text-xs">
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
        <p className="text-xs text-muted-foreground mt-0.5">Activos sin escritura tras +90 días.</p>
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
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-alert/10 text-alert text-xs font-bold tabular-nums">
                  {dias}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">
                    {i.calle || "Sin dirección"} {i.numero}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[i.barrio, i.localidad].filter(Boolean).join(" · ") || i.tipo}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">
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
            <span className="ml-2 text-xs font-mono text-muted-foreground">#{cleanRef(i.ref)}</span>
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
        <div className="text-xs text-muted-foreground">{fmtDate(i.fechaInicio)}</div>
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
      className={`inline-flex items-center justify-center size-9 rounded-lg text-xs font-bold tabular-nums shrink-0 ${color}`}
    >
      {pct}
    </span>
  );
}

// Tinte gold (23 sep 2026, sustituye la superficie "marfil" retirada — esa
// paleta crema era inventada, sin base en la marca real de elsolgrupo.com,
// que usa fondo blanco): este es, de los tres paneles de insights, el que
// más urgencia comunica ("más calientes" = actuar ya) — se distingue por
// color, no solo por icono. Los otros dos (SinSeguimientoPanel/
// SinAsignarPanel) se quedan en --card a propósito, para no diluir el
// énfasis convirtiéndolo en el estilo por defecto de los tres. Mismo
// propósito de énfasis que antes, ahora con un tinte del propio --gold en
// vez de un color de marca inventado.
export function LeadsCalientesPanel({ leads }: { leads: LeadInsight[] }) {
  return (
    <div className="rounded-2xl border border-gold/20 bg-gold/5 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gold/20">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Flame className="size-4 text-[var(--gold)]" /> Leads más calientes
        </h3>
        <Link
          to="/bandeja"
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
                to="/contactos"
                search={{ id: lead.id }}
                className="flex items-center gap-3 px-4 py-3 hover:bg-gold/10 transition-colors"
              >
                <ScoreBadge score={lead.score} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{lead.nombre}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {lead.telefono ?? "Sin tel."} · {lead.ciclo_vida}
                    {lead.diasSinContacto !== null && (
                      <span className={`ml-1 ${lead.diasSinContacto < 7 ? "text-success" : ""}`}>
                        · {lead.diasSinContacto}d
                      </span>
                    )}
                  </div>
                </div>
                {!lead.tieneAgente && (
                  <span className="text-xs text-warning bg-warning/10 px-2 py-1 rounded shrink-0">
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
          to="/bandeja"
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
                to="/contactos"
                search={{ id: lead.id }}
                className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40 transition-colors"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive text-xs font-bold tabular-nums">
                  {lead.diasSinContacto === null ? "∞" : lead.diasSinContacto}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{lead.nombre}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {lead.telefono ?? "Sin tel."} · {lead.ciclo_vida}
                  </div>
                </div>
                {!lead.tieneAgente && (
                  <span className="text-xs text-warning bg-warning/10 px-2 py-1 rounded shrink-0">
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

// Leads recientes (últimos 120 por fecha de creación, ver getLeadInsightsFn)
// sin ningún agente asignado — para que se note uno nuevo en el día a día,
// no para triar el histórico (2.797 de los 2.808 Leads totales no tienen
// agente; decisión de David, 12 sep 2026: el histórico se queda fuera a
// propósito, sin panel ni vista dedicada). Sin "Ver todos": el enlace de
// los otros dos paneles lleva al Kanban de Leads, que es por agente y no
// mostraría nada aquí.
export function SinAsignarPanel({ leads }: { leads: LeadInsight[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <UserX className="size-4 text-warning" /> Leads recientes sin asignar
        </h3>
      </div>
      {leads.length === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground">
          Todos los leads recientes tienen agente asignado.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {leads.map((lead) => (
            <li key={lead.id}>
              <Link
                to="/contactos"
                search={{ id: lead.id }}
                className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40 transition-colors"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
                  <UserX className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{lead.nombre}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {lead.telefono ?? "Sin tel."} · {lead.ciclo_vida}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Rediseño de navegación (17 sep 2026): sustituye a la antigua ruta
// /operaciones como punto de entrada — resumen glanceable, sin filtros ni
// alta/cierre de operación (eso vive en OperacionesWorkspace, que "Ver
// todas" abre en un Dialog con el mismo detalle de siempre, no una fila más
// aquí). canSeeFinanciero llega ya resuelto desde el servidor
// (listOperaciones): sin ese permiso, precioOperacion/comisionTotal vienen
// en null — no se ocultan aquí, ya vienen ocultos.
export function OperacionesPanel({
  opsData,
  onVerTodas,
}: {
  opsData: { operaciones: OperacionRowData[]; permissions: { canSeeFinanciero: boolean } };
  onVerTodas: () => void;
}) {
  const ops = opsData.operaciones;
  const now = new Date();

  const cerradasMes = ops.filter(
    (o) =>
      o.estado === "Cerrada" &&
      o.fechaCierre &&
      new Date(o.fechaCierre).getMonth() === now.getMonth() &&
      new Date(o.fechaCierre).getFullYear() === now.getFullYear(),
  );
  const comisionMes = cerradasMes.reduce((s, o) => s + (o.comisionTotal ?? 0), 0);

  const enNegociacion = ops.filter((o) => o.estado === "En negociación");
  const valorNegociacion = enNegociacion.reduce((s, o) => s + (o.precioOperacion ?? 0), 0);

  const pipelineTotal = ops.filter(
    (o) => o.estado === "Abierta" || o.estado === "En negociación",
  ).length;

  const recientes = ops.slice(0, 3);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <HandCoins className="size-4 text-gold" /> Operaciones
        </h3>
        <button
          onClick={onVerTodas}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
        >
          Ver todas <ArrowRight className="size-3" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4">
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">Cerradas este mes</span>
            <span className="size-6 rounded-md flex items-center justify-center bg-success/10 text-success">
              <CheckCircle2 className="size-3.5" />
            </span>
          </div>
          <div className="text-xl font-display font-semibold mt-1.5 tabular-nums">
            {cerradasMes.length}
          </div>
          {opsData.permissions.canSeeFinanciero && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {fmtEur(comisionMes)} en comisión
            </div>
          )}
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">En negociación</span>
            <span className="size-6 rounded-md flex items-center justify-center bg-warning/10 text-warning">
              <Clock className="size-3.5" />
            </span>
          </div>
          <div className="text-xl font-display font-semibold mt-1.5 tabular-nums">
            {enNegociacion.length}
          </div>
          {opsData.permissions.canSeeFinanciero && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {fmtEur(valorNegociacion)} potencial
            </div>
          )}
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">Pipeline total</span>
            <span className="size-6 rounded-md flex items-center justify-center bg-gold/10 text-gold">
              <HandCoins className="size-3.5" />
            </span>
          </div>
          <div className="text-xl font-display font-semibold mt-1.5 tabular-nums">
            {pipelineTotal}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">Abiertas + en negociación</div>
        </div>
      </div>

      {recientes.length > 0 && (
        <div className="divide-y divide-border border-t border-border">
          {recientes.map((op) => (
            <div key={op.id} className="flex items-center gap-3 px-4 py-2.5">
              <span
                className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${ESTADO_STYLE[op.estado]}`}
              >
                {op.estado}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {op.propertyCalle ?? op.tipo}
              </span>
              {op.precioOperacion !== null && (
                <span className="shrink-0 text-xs font-medium tabular-nums">
                  {fmtEur(op.precioOperacion)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
