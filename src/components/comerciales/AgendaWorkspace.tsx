// M-03: extraído de src/routes/comerciales.index.lazy.tsx.
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { type Inmueble } from "@/lib/inmuebles.functions";
import { updateVisitaEstado } from "@/lib/mutations.functions";
import {
  Users,
  Building2,
  CalendarCheck,
  Mail,
  Search,
  Activity,
  KeyRound,
  HandCoins,
  FileSignature,
  ArrowRight,
  ChevronDown,
  CheckCheck,
  Ban,
  Clock,
} from "lucide-react";
import { fmtTime, fmtDateCompact, estadoColor, moneyShort } from "@/lib/comerciales-format";

// ── Constantes compartidas ──────────────────────────────────────────────────

export const TODOS = "Todos";
export const SIN_ASIGNAR = "Sin asignar";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AgenteHub = {
  id: string | null;
  nombre: string;
  mail: string;
  activos: number;
  reservados: number;
  inmuebles: Inmueble[];
  proximaVisita: {
    fecha: string;
    calle: string;
    numero: string;
    clienteNombre: string;
  } | null;
};

export type VisitaRow = {
  id: string;
  fecha: string | null;
  estado: string;
  inmuebleCalles: string[];
  inmuebleNumeros: string[];
  inmuebleIds: string[];
  clientesNombres: string[];
  agentesMails: string[];
};

export type ActividadEvt = {
  key: string;
  fecha: Date;
  tipo: "captacion" | "reserva" | "cierre" | "visita";
  titulo: string;
  sub: string;
  agentes: string[];
  to?: { id: string };
};

// ── AgenteSelector ────────────────────────────────────────────────────────────

export function AgenteSelector({
  value,
  onChange,
  agentes,
}: {
  value: string;
  onChange: (v: string) => void;
  agentes: Array<{ id: string; nombre: string; mail: string }>;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground hidden sm:block shrink-0">
        Trabajando como
      </span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 pl-3 pr-7 rounded-md border border-border bg-background text-xs font-medium appearance-none outline-none focus:border-foreground/30 cursor-pointer"
        >
          <option value={TODOS}>Todos</option>
          {agentes.map((a) => (
            <option key={a.id} value={a.nombre}>
              {a.nombre}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
      </div>
    </div>
  );
}

// ── GlobalSearch ──────────────────────────────────────────────────────────────

export function GlobalSearch({
  q,
  setQ,
  results,
}: {
  q: string;
  setQ: (v: string) => void;
  results: Array<{ type: "inmueble" | "visita"; id: string; label: string; sub: string }>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function handleSelect(r: (typeof results)[0]) {
    if (r.type === "inmueble") {
      navigate({ to: "/inmuebles/$id", params: { id: r.id } });
    } else {
      navigate({ to: "/visitas" });
    }
    setQ("");
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative flex-1 min-w-[200px] max-w-sm">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Buscar inmueble, visita..."
        className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-3 text-xs outline-none focus:border-foreground/30"
      />
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 bg-card border border-border rounded-md shadow-lg mt-1 overflow-hidden">
          {results.map((r) => (
            <button
              key={`${r.type}-${r.id}`}
              onMouseDown={() => handleSelect(r)}
              className="flex items-center gap-3 w-full px-3 py-2 hover:bg-accent/60 transition-colors text-left"
            >
              <div
                className={`size-5 rounded flex items-center justify-center shrink-0 ${r.type === "inmueble" ? "bg-primary/10 text-primary" : "bg-info/10 text-info"}`}
              >
                {r.type === "inmueble" ? (
                  <Building2 className="size-3" />
                ) : (
                  <CalendarCheck className="size-3" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium truncate">{r.label}</div>
                <div className="text-xs text-muted-foreground truncate">{r.sub}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── AgendaHoy ─────────────────────────────────────────────────────────────────

export function AgendaHoy({
  visitas,
  selectedAgente,
}: {
  visitas: VisitaRow[];
  selectedAgente: string;
}) {
  const labelDia = new Date().toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden mb-6">
      <div className="px-5 py-3 border-b border-border flex items-center gap-3">
        <CalendarCheck className="size-4 text-muted-foreground shrink-0" />
        <h3 className="text-sm font-semibold capitalize">{labelDia}</h3>
        <span className="text-xs text-muted-foreground">
          · {visitas.length} {visitas.length === 1 ? "visita" : "visitas"}
        </span>
        {selectedAgente !== TODOS && (
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
            {selectedAgente}
          </span>
        )}
      </div>
      {visitas.length === 0 ? (
        <div className="px-5 py-4 text-xs text-muted-foreground">
          Sin visitas agendadas para hoy.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {visitas.map((v) => (
            <VisitaRowHoy key={v.id} visita={v} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── VisitaRowHoy ──────────────────────────────────────────────────────────────

function VisitaRowHoy({ visita: v }: { visita: VisitaRow }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateVisitaEstado);
  const { mutate, isPending } = useMutation({
    mutationFn: updateFn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["visitas-all"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const color = estadoColor(v.estado);
  const address = `${v.inmuebleCalles[0] ?? "Inmueble"} ${v.inmuebleNumeros[0] ?? ""}`.trim();
  const cliente = v.clientesNombres[0] ?? "";
  const isActive = v.estado !== "Realizada" && v.estado !== "Cancelada";

  return (
    <div className="flex items-center gap-3 px-5 h-11 hover:bg-accent/30 transition-colors">
      <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground font-medium">
        {fmtTime(v.fecha)}
      </span>
      <span className="size-2 rounded-full shrink-0" style={{ background: color }} />
      <span className="flex-1 min-w-0 text-xs font-medium truncate">{address}</span>
      {cliente && (
        <span className="text-xs text-muted-foreground truncate hidden sm:block max-w-[140px]">
          {cliente}
        </span>
      )}
      {!isActive && (
        <span className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground shrink-0 capitalize">
          {v.estado === "Realizada" ? "Completada" : "Anulada"}
        </span>
      )}
      {isActive && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            disabled={isPending}
            onClick={() => mutate({ data: { visitaId: v.id, estado: "Realizada" } })}
            title="Marcar completada"
            className="size-7 rounded flex items-center justify-center text-muted-foreground hover:bg-success/10 hover:text-success dark:hover:text-success transition-colors disabled:opacity-40"
          >
            <CheckCheck className="size-3.5" />
          </button>
          <button
            disabled={isPending}
            onClick={() => mutate({ data: { visitaId: v.id, estado: "Cancelada" } })}
            title="Anular visita"
            className="size-7 rounded flex items-center justify-center text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 transition-colors disabled:opacity-40"
          >
            <Ban className="size-3.5" />
          </button>
        </div>
      )}
      {v.inmuebleIds[0] && (
        <Link
          to="/inmuebles/$id"
          params={{ id: v.inmuebleIds[0] }}
          className="text-muted-foreground hover:text-foreground shrink-0"
        >
          <ArrowRight className="size-3.5" />
        </Link>
      )}
    </div>
  );
}

// ── AgenteCardHub ─────────────────────────────────────────────────────────────

export function AgenteCardHub({ card }: { card: AgenteHub }) {
  const isSinAsignar = card.nombre === SIN_ASIGNAR;
  const initials = card.nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  return (
    <div className="rounded-lg border border-border bg-background p-4 hover:border-foreground/30 transition-colors flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div
          className={`size-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${isSinAsignar ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}
        >
          {initials || "—"}
        </div>
        <div className="min-w-0">
          <div
            className={`text-sm font-semibold truncate ${isSinAsignar ? "italic text-muted-foreground" : ""}`}
          >
            {card.nombre}
          </div>
          {card.mail && (
            <a
              href={`mailto:${card.mail}`}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 truncate"
            >
              <Mail className="size-3" /> {card.mail}
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md border border-border bg-card px-2 py-1.5 text-center">
          <div className="text-sm font-semibold tabular-nums text-success">{card.activos}</div>
          <div className="text-xs text-muted-foreground leading-none mt-0.5">Activos</div>
        </div>
        <div className="rounded-md border border-border bg-card px-2 py-1.5 text-center">
          <div className="text-sm font-semibold tabular-nums text-warning">{card.reservados}</div>
          <div className="text-xs text-muted-foreground leading-none mt-0.5">Reservados</div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-xs min-h-[18px]">
        {card.proximaVisita ? (
          <>
            <Clock className="size-3 text-primary shrink-0" />
            <span className="text-muted-foreground truncate">
              {fmtDateCompact(card.proximaVisita.fecha)} · {card.proximaVisita.calle}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground/50">Sin visitas agendadas</span>
        )}
      </div>

      {card.id && (
        <div className="grid grid-cols-3 gap-1">
          <Link
            to="/inmuebles"
            className="flex items-center justify-center gap-1 h-8 rounded-md border border-border text-xs font-medium hover:bg-accent transition-colors"
          >
            <Building2 className="size-3" /> Inmuebles
          </Link>
          <Link
            to="/contactos"
            search={{ tab: "leads", agente: card.id }}
            className="flex items-center justify-center gap-1 h-8 rounded-md border border-border text-xs font-medium hover:bg-accent transition-colors"
          >
            <Users className="size-3" /> Leads
          </Link>
          <Link
            to="/visitas"
            className="flex items-center justify-center gap-1 h-8 rounded-md border border-border text-xs font-medium hover:bg-accent transition-colors"
          >
            <CalendarCheck className="size-3" /> Visitas
          </Link>
        </div>
      )}
    </div>
  );
}

// ── ActividadPanel ────────────────────────────────────────────────────────────

export function ActividadPanel({ actividad, label }: { actividad: ActividadEvt[]; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Activity className="size-4 text-muted-foreground" /> Actividad reciente
        </h3>
        <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>
      <ol className="divide-y divide-border max-h-[640px] overflow-y-auto">
        {actividad.map((e) => (
          <li key={e.key} className="px-4 py-3 hover:bg-accent/40 transition-colors">
            <div className="flex items-start gap-3">
              <ActividadIcon tipo={e.tipo} />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium truncate">{e.titulo}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {e.sub}
                  {e.agentes.length > 0 && <> · {e.agentes.join(", ")}</>}
                </div>
                <div className="text-xs text-muted-foreground/80 mt-0.5">
                  {e.fecha.toLocaleDateString("es-ES", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </div>
              </div>
              {e.to && (
                <Link
                  to="/inmuebles/$id"
                  params={{ id: e.to.id }}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                >
                  <ArrowRight className="size-3.5" />
                </Link>
              )}
            </div>
          </li>
        ))}
        {actividad.length === 0 && (
          <li className="px-4 py-8 text-center text-xs text-muted-foreground">
            Sin actividad reciente.
          </li>
        )}
      </ol>
    </div>
  );
}

// ── AgenteWorkspace ───────────────────────────────────────────────────────────

export function AgenteWorkspace({
  card,
  proxVisitas,
  actividad,
}: {
  card: AgenteHub;
  proxVisitas: VisitaRow[];
  actividad: ActividadEvt[];
}) {
  const activos = card.inmuebles.filter((i) => i.estatus === "Activo");
  const reservados = card.inmuebles.filter((i) => i.estatus === "Reservado");

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      {/* Próximas visitas */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center gap-2">
          <CalendarCheck className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Próximas visitas</h3>
          <span className="text-xs text-muted-foreground font-normal">· {proxVisitas.length}</span>
        </div>
        {proxVisitas.length === 0 ? (
          <div className="px-5 py-4 text-xs text-muted-foreground">Sin visitas programadas.</div>
        ) : (
          <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
            {proxVisitas.map((v) => (
              <ProximaVisitaRow key={v.id} visita={v} />
            ))}
          </div>
        )}
      </div>

      {/* Inmuebles */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Building2 className="size-4 text-muted-foreground" /> Inmuebles
          </h3>
          <div className="flex gap-2 text-xs">
            <span className="text-success font-medium">{activos.length} activos</span>
            {reservados.length > 0 && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="text-warning font-medium">{reservados.length} reserv.</span>
              </>
            )}
          </div>
        </div>
        {activos.length === 0 && reservados.length === 0 ? (
          <div className="px-5 py-4 text-xs text-muted-foreground">Sin inmuebles asignados.</div>
        ) : (
          <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
            {[...activos, ...reservados].slice(0, 15).map((i) => (
              <InmuebleRowAgente key={i.id} inmueble={i} />
            ))}
          </div>
        )}
      </div>

      {/* Actividad */}
      <ActividadPanel actividad={actividad} label={card.nombre} />
    </div>
  );
}

// ── ProximaVisitaRow ──────────────────────────────────────────────────────────

function ProximaVisitaRow({ visita: v }: { visita: VisitaRow }) {
  const address = `${v.inmuebleCalles[0] ?? "Inmueble"} ${v.inmuebleNumeros[0] ?? ""}`.trim();
  const cliente = v.clientesNombres[0] ?? "";
  const color = estadoColor(v.estado);

  return (
    <div className="flex items-center gap-3 px-5 py-3 hover:bg-accent/30 transition-colors">
      <span className="size-2 rounded-full shrink-0 mt-0.5" style={{ background: color }} />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">{address}</div>
        <div className="text-xs text-muted-foreground">
          {fmtDateCompact(v.fecha)} · {fmtTime(v.fecha)}
          {cliente && <> · {cliente}</>}
        </div>
      </div>
      {v.inmuebleIds[0] && (
        <Link
          to="/inmuebles/$id"
          params={{ id: v.inmuebleIds[0] }}
          className="text-muted-foreground hover:text-foreground shrink-0"
        >
          <ArrowRight className="size-3.5" />
        </Link>
      )}
    </div>
  );
}

// ── InmuebleRowAgente ─────────────────────────────────────────────────────────

function InmuebleRowAgente({ inmueble: i }: { inmueble: Inmueble }) {
  const isReservado = i.estatus === "Reservado";
  return (
    <Link
      to="/inmuebles/$id"
      params={{ id: i.id }}
      className="flex items-center gap-3 px-5 h-12 hover:bg-accent/30 transition-colors group"
    >
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">
          {i.calle} {i.numero ?? ""}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {i.localidad ?? ""}
          {i.tipo && ` · ${i.tipo}`}
        </div>
      </div>
      {i.precio ? (
        <span className="text-xs tabular-nums shrink-0 text-muted-foreground">
          {moneyShort(i.precio)}
        </span>
      ) : null}
      {isReservado && (
        <span className="text-xs px-2 py-1 rounded bg-warning/10 text-warning shrink-0">
          Reservado
        </span>
      )}
      <ArrowRight className="size-3.5 text-muted-foreground/40 group-hover:text-foreground shrink-0 transition-colors" />
    </Link>
  );
}

// ── ActividadIcon ─────────────────────────────────────────────────────────────

function ActividadIcon({ tipo }: { tipo: "captacion" | "reserva" | "cierre" | "visita" }) {
  const map = {
    captacion: { Icon: KeyRound, cls: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400" },
    reserva: { Icon: HandCoins, cls: "bg-warning/10 text-warning" },
    cierre: { Icon: FileSignature, cls: "bg-info/10 text-info" },
    visita: { Icon: CalendarCheck, cls: "bg-primary/10 text-primary" },
  } as const;
  const { Icon, cls } = map[tipo];
  return (
    <div className={`size-7 rounded-md flex items-center justify-center shrink-0 ${cls}`}>
      <Icon className="size-3.5" />
    </div>
  );
}
