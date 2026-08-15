import { createLazyFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { type Inmueble } from "@/lib/inmuebles.functions";
import { allInmueblesQuery, agentesQuery, visitasQuery } from "@/lib/queries";
import {
  createVisita,
  createCliente,
  createProspectoManual,
  updateVisitaEstado,
} from "@/lib/mutations.functions";
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
  CalendarPlus,
  UserPlus,
  ChevronDown,
  CheckCheck,
  Ban,
  Clock,
  X,
} from "lucide-react";

export const Route = createLazyFileRoute("/comerciales/")({
  component: ComercialesPage,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const TODOS = "Todos";
const LS_KEY = "hub_agente";
const SIN_ASIGNAR = "Sin asignar";

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtTime(s: string | null): string {
  if (!s) return "--:--";
  const d = new Date(s);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtDateCompact(s: string | null): string {
  if (!s) return "";
  return new Date(s).toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function estadoColor(estado: string): string {
  if (estado === "Realizada") return "#10b981";
  if (estado === "Cancelada") return "#f43f5e";
  return "#6366f1";
}

function moneyShort(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M €`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}k €`;
  return `${v} €`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type AgenteHub = {
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

type VisitaRow = {
  id: string;
  fecha: string | null;
  estado: string;
  inmuebleCalles: string[];
  inmuebleNumeros: string[];
  inmuebleIds: string[];
  clientesNombres: string[];
  agentesMails: string[];
};

type ActividadEvt = {
  key: string;
  fecha: Date;
  tipo: "captacion" | "reserva" | "cierre" | "visita";
  titulo: string;
  sub: string;
  agentes: string[];
  to?: { id: string };
};

// ── Page ──────────────────────────────────────────────────────────────────────

function ComercialesPage() {
  const { data: all } = useSuspenseQuery(allInmueblesQuery);
  const { data: ag } = useSuspenseQuery(agentesQuery);
  const { data: vs } = useSuspenseQuery(visitasQuery);

  const inmuebles = all.inmuebles;
  const visitas = vs.visitas as VisitaRow[];
  const agentes = ag.agentes;

  // Agent selector — persisted in localStorage
  const [selectedAgente, setSelectedAgente] = useState<string>(() => {
    try {
      return localStorage.getItem(LS_KEY) ?? TODOS;
    } catch {
      return TODOS;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, selectedAgente);
    } catch {
      // localStorage may be unavailable in private browsing — ignore silently
    }
  }, [selectedAgente]);

  const mailToNombre = useMemo(() => {
    const m = new Map<string, string>();
    agentes.forEach((a) => {
      if (a.mail) m.set(a.mail.toLowerCase(), a.nombre);
    });
    return m;
  }, [agentes]);

  const selectedMail = useMemo(() => {
    if (selectedAgente === TODOS) return null;
    return agentes.find((a) => a.nombre === selectedAgente)?.mail?.toLowerCase() ?? null;
  }, [selectedAgente, agentes]);

  // Agenda hoy
  const agendaHoy = useMemo(() => {
    const today = localDateStr(new Date());
    return visitas
      .filter((v) => {
        if (!v.fecha) return false;
        if (localDateStr(new Date(v.fecha)) !== today) return false;
        if (selectedMail) return v.agentesMails.some((m) => m.toLowerCase() === selectedMail);
        return true;
      })
      .sort((a, b) => new Date(a.fecha!).getTime() - new Date(b.fecha!).getTime());
  }, [visitas, selectedMail]);

  // Directorio
  const directorio = useMemo<AgenteHub[]>(() => {
    const now = new Date();
    const byNombre = new Map<string, AgenteHub>();

    agentes.forEach((a) => {
      byNombre.set(a.nombre, {
        id: a.id,
        nombre: a.nombre,
        mail: a.mail,
        activos: 0,
        reservados: 0,
        inmuebles: [],
        proximaVisita: null,
      });
    });

    inmuebles.forEach((i) => {
      const nombres = i.agentesNombres.length > 0 ? i.agentesNombres : [SIN_ASIGNAR];
      nombres.forEach((n) => {
        const key = n.trim() || SIN_ASIGNAR;
        let card = byNombre.get(key);
        if (!card) {
          card = {
            id: null,
            nombre: key,
            mail: "",
            activos: 0,
            reservados: 0,
            inmuebles: [],
            proximaVisita: null,
          };
          byNombre.set(key, card);
        }
        card.inmuebles.push(i);
        if (i.estatus === "Activo") card.activos++;
        if (i.estatus === "Reservado") card.reservados++;
      });
    });

    // Próxima visita por agente
    visitas
      .filter((v) => v.fecha && new Date(v.fecha) >= now)
      .sort((a, b) => new Date(a.fecha!).getTime() - new Date(b.fecha!).getTime())
      .forEach((v) => {
        v.agentesMails.forEach((mail) => {
          const nombre = mailToNombre.get(mail.toLowerCase());
          if (!nombre) return;
          const card = byNombre.get(nombre);
          if (card && !card.proximaVisita) {
            card.proximaVisita = {
              fecha: v.fecha!,
              calle: v.inmuebleCalles[0] ?? "Inmueble",
              numero: v.inmuebleNumeros[0] ?? "",
              clienteNombre: v.clientesNombres[0] ?? "",
            };
          }
        });
      });

    return Array.from(byNombre.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [agentes, inmuebles, visitas, mailToNombre]);

  // Actividad reciente
  const actividad = useMemo(() => {
    const evts: ActividadEvt[] = [];
    inmuebles.forEach((i) => {
      if (i.fechaInicio)
        evts.push({
          key: `c-${i.id}`,
          fecha: new Date(i.fechaInicio),
          tipo: "captacion",
          titulo: `Captación · ${i.calle} ${i.numero ?? ""}`.trim(),
          sub: i.localidad || "",
          agentes: i.agentesNombres,
          to: { id: i.id },
        });
      if (i.fechaReserva)
        evts.push({
          key: `r-${i.id}`,
          fecha: new Date(i.fechaReserva),
          tipo: "reserva",
          titulo: `Reserva · ${i.calle} ${i.numero ?? ""}`.trim(),
          sub: i.localidad || "",
          agentes: i.agentesNombres,
          to: { id: i.id },
        });
      if (i.fechaEscritura)
        evts.push({
          key: `e-${i.id}`,
          fecha: new Date(i.fechaEscritura),
          tipo: "cierre",
          titulo:
            `${i.estatus === "Alquilado" ? "Alquiler firmado" : "Escritura"} · ${i.calle} ${i.numero ?? ""}`.trim(),
          sub: i.localidad || "",
          agentes: i.agentesNombres,
          to: { id: i.id },
        });
    });
    visitas.forEach((v) => {
      if (!v.fecha) return;
      const nombres = v.agentesMails
        .map((m) => mailToNombre.get(m.toLowerCase()))
        .filter((n): n is string => !!n);
      evts.push({
        key: `v-${v.id}`,
        fecha: new Date(v.fecha),
        tipo: "visita",
        titulo:
          `Visita · ${v.inmuebleCalles[0] ?? "Inmueble"} ${v.inmuebleNumeros[0] ?? ""}`.trim(),
        sub: v.clientesNombres.join(", ") || v.estado,
        agentes: nombres,
        to: v.inmuebleIds[0] ? { id: v.inmuebleIds[0] } : undefined,
      });
    });
    evts.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
    return evts.slice(0, 30);
  }, [inmuebles, visitas, mailToNombre]);

  // Workspace del agente seleccionado
  const agenteCard =
    selectedAgente !== TODOS ? (directorio.find((c) => c.nombre === selectedAgente) ?? null) : null;

  const proxVisitas = useMemo(() => {
    if (!selectedMail) return [];
    const now = new Date();
    return visitas
      .filter((v) => {
        if (!v.fecha) return false;
        const d = new Date(v.fecha);
        return d >= now && v.agentesMails.some((m) => m.toLowerCase() === selectedMail);
      })
      .sort((a, b) => new Date(a.fecha!).getTime() - new Date(b.fecha!).getTime())
      .slice(0, 12);
  }, [visitas, selectedMail]);

  const actividadAgente = useMemo(() => {
    if (selectedAgente === TODOS) return actividad;
    return actividad.filter((e) => e.agentes.includes(selectedAgente));
  }, [actividad, selectedAgente]);

  // Búsqueda global
  const [searchQ, setSearchQ] = useState("");
  const searchResults = useMemo(() => {
    if (searchQ.trim().length < 2) return [];
    const needle = searchQ.toLowerCase();
    const results: Array<{ type: "inmueble" | "visita"; id: string; label: string; sub: string }> =
      [];
    for (const i of inmuebles) {
      const text = `${i.calle} ${i.numero ?? ""} ${i.localidad ?? ""} ${i.ref ?? ""}`.toLowerCase();
      if (text.includes(needle))
        results.push({
          type: "inmueble",
          id: i.id,
          label: `${i.calle} ${i.numero ?? ""}`.trim(),
          sub: `${i.localidad ?? ""} · ${i.estatus}`,
        });
      if (results.length >= 5) break;
    }
    for (const v of visitas) {
      if (!v.fecha) continue;
      const text = `${v.inmuebleCalles.join(" ")} ${v.clientesNombres.join(" ")}`.toLowerCase();
      if (text.includes(needle))
        results.push({
          type: "visita",
          id: v.id,
          label: `Visita · ${v.inmuebleCalles[0] ?? "Inmueble"}`,
          sub: `${v.clientesNombres[0] ?? "Sin cliente"} · ${fmtDateCompact(v.fecha)}`,
        });
      if (results.length >= 8) break;
    }
    return results;
  }, [searchQ, inmuebles, visitas]);

  return (
    <AppShell title="Comerciales">
      {/* Barra de control: selector + búsqueda + acciones */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <AgenteSelector value={selectedAgente} onChange={setSelectedAgente} agentes={agentes} />
        <GlobalSearch q={searchQ} setQ={setSearchQ} results={searchResults} />
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <NuevaVisitaDialog inmuebles={inmuebles} agentes={agentes} />
          <NuevoClienteDialog agentes={agentes} />
          <NuevaCaptacionDialog agentes={agentes} />
        </div>
      </div>

      {/* Agenda hoy */}
      <AgendaHoy visitas={agendaHoy} selectedAgente={selectedAgente} />

      {/* Directorio (Todos) o Workspace (agente seleccionado) */}
      {selectedAgente === TODOS ? (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
          <div className="xl:col-span-3 rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Users className="size-4 text-muted-foreground" /> Directorio del equipo
                <span className="text-xs text-muted-foreground font-normal">
                  · {directorio.length} comerciales
                </span>
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
              {directorio.map((c) => (
                <AgenteCardHub key={c.nombre} card={c} />
              ))}
            </div>
          </div>
          <ActividadPanel actividad={actividad} label="Grupo" />
        </div>
      ) : agenteCard ? (
        <AgenteWorkspace card={agenteCard} proxVisitas={proxVisitas} actividad={actividadAgente} />
      ) : null}
    </AppShell>
  );
}

// ── AgenteSelector ────────────────────────────────────────────────────────────

function AgenteSelector({
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

function GlobalSearch({
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
                className={`size-5 rounded flex items-center justify-center shrink-0 ${r.type === "inmueble" ? "bg-primary/10 text-primary" : "bg-violet-500/10 text-violet-600 dark:text-violet-400"}`}
              >
                {r.type === "inmueble" ? (
                  <Building2 className="size-3" />
                ) : (
                  <CalendarCheck className="size-3" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium truncate">{r.label}</div>
                <div className="text-[11px] text-muted-foreground truncate">{r.sub}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── NuevaVisitaDialog ─────────────────────────────────────────────────────────

function NuevaVisitaDialog({
  inmuebles,
  agentes,
}: {
  inmuebles: Inmueble[];
  agentes: Array<{ id: string; nombre: string; mail: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [fecha, setFecha] = useState(() => localDateStr(new Date()));
  const [hora, setHora] = useState("10:00");
  const [inmuebleId, setInmuebleId] = useState("");
  const [inmuebleQ, setInmuebleQ] = useState("");
  const [inmuebleOpen, setInmuebleOpen] = useState(false);
  const [agenteId, setAgenteId] = useState("");
  const inmuebleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (inmuebleRef.current && !inmuebleRef.current.contains(e.target as Node))
        setInmuebleOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const qc = useQueryClient();
  const createFn = useServerFn(createVisita);
  const { mutate, isPending } = useMutation({
    mutationFn: createFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["visitas-all"] });
      setOpen(false);
      reset();
      toast.success("Visita agendada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function reset() {
    setFecha(localDateStr(new Date()));
    setHora("10:00");
    setInmuebleId("");
    setInmuebleQ("");
    setAgenteId("");
  }

  const filteredInmuebles = useMemo(() => {
    const q = inmuebleQ.toLowerCase();
    const base = inmuebles.filter((i) => i.estatus === "Activo" || i.estatus === "Reservado");
    if (!q) return base.slice(0, 6);
    return base
      .filter((i) => `${i.calle} ${i.numero ?? ""} ${i.localidad ?? ""}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [inmuebles, inmuebleQ]);

  const selectedInm = inmuebles.find((i) => i.id === inmuebleId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inmuebleId) {
      toast.error("Selecciona un inmueble");
      return;
    }
    mutate({
      data: {
        fecha: `${fecha}T${hora}:00`,
        inmueblesIds: [inmuebleId],
        agentesIds: agenteId ? [agenteId] : [],
        estado: "Programada",
      },
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors shrink-0"
      >
        <CalendarPlus className="size-3.5" /> Visita
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold">Nueva visita</h2>
              <button
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    Fecha
                  </label>
                  <input
                    type="date"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    required
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    Hora
                  </label>
                  <input
                    type="time"
                    value={hora}
                    onChange={(e) => setHora(e.target.value)}
                    required
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30"
                  />
                </div>
              </div>

              <div ref={inmuebleRef} className="relative">
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Inmueble *
                </label>
                {selectedInm ? (
                  <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-background text-sm">
                    <span className="flex-1 truncate text-xs">
                      {selectedInm.calle} {selectedInm.numero ?? ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setInmuebleId("");
                        setInmuebleQ("");
                      }}
                      className="text-muted-foreground hover:text-foreground shrink-0"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                      <input
                        value={inmuebleQ}
                        onChange={(e) => {
                          setInmuebleQ(e.target.value);
                          setInmuebleOpen(true);
                        }}
                        onFocus={() => setInmuebleOpen(true)}
                        placeholder="Buscar por dirección..."
                        className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm outline-none focus:border-foreground/30"
                      />
                    </div>
                    {inmuebleOpen && filteredInmuebles.length > 0 && (
                      <div className="absolute left-0 right-0 z-50 bg-card border border-border rounded-md shadow-lg mt-1 max-h-44 overflow-y-auto">
                        {filteredInmuebles.map((i) => (
                          <button
                            key={i.id}
                            type="button"
                            onMouseDown={() => {
                              setInmuebleId(i.id);
                              setInmuebleOpen(false);
                            }}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-accent/60 transition-colors"
                          >
                            {i.calle} {i.numero ?? ""}
                            {i.localidad && (
                              <span className="text-muted-foreground"> · {i.localidad}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Agente
                </label>
                <select
                  value={agenteId}
                  onChange={(e) => setAgenteId(e.target.value)}
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30"
                >
                  <option value="">Sin asignar</option>
                  {agentes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={isPending || !inmuebleId}
                className="w-full h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isPending ? "Guardando..." : "Agendar visita"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// ── NuevoClienteDialog ────────────────────────────────────────────────────────

function NuevoClienteDialog({
  agentes,
}: {
  agentes: Array<{ id: string; nombre: string; mail: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [tipo, setTipo] = useState("Comprador");
  const [agenteId, setAgenteId] = useState("");

  const qc = useQueryClient();
  const createFn = useServerFn(createCliente);
  const { mutate, isPending } = useMutation({
    mutationFn: createFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clientes"] });
      setOpen(false);
      setNombre("");
      setTelefono("");
      setEmail("");
      setTipo("Comprador");
      setAgenteId("");
      toast.success("Cliente creado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutate({
      data: {
        nombre,
        telefono: telefono || undefined,
        email: email || undefined,
        tipo,
        agentesIds: agenteId ? [agenteId] : [],
      },
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-background text-xs font-medium hover:bg-accent transition-colors shrink-0"
      >
        <UserPlus className="size-3.5" /> Cliente
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold">Nuevo cliente</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Nombre *
                </label>
                <input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Nombre completo"
                  required
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    Teléfono
                  </label>
                  <input
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    placeholder="600 000 000"
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@..."
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Tipo</label>
                <select
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value)}
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30"
                >
                  <option>Comprador</option>
                  <option>Inquilino</option>
                  <option>Propietario</option>
                  <option>Interesado Propiedades</option>
                  <option>Interesado Alquiler</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Agente
                </label>
                <select
                  value={agenteId}
                  onChange={(e) => setAgenteId(e.target.value)}
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30"
                >
                  <option value="">Sin asignar</option>
                  {agentes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={isPending}
                className="w-full h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors mt-1"
              >
                {isPending ? "Guardando..." : "Crear cliente"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// ── NuevaCaptacionDialog ──────────────────────────────────────────────────────

const TIPOS_INMUEBLE = [
  "Casa · Venta",
  "Piso · Venta",
  "Terreno · Venta",
  "Local · Venta",
  "Garaje · Venta",
  "Casa · Alquiler",
  "Piso · Alquiler",
  "Local · Alquiler",
];

function NuevaCaptacionDialog({
  agentes,
}: {
  agentes: Array<{ id: string; nombre: string; mail: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    nombre: "",
    telefono: "",
    email: "",
    tipo: "Casa · Venta",
    calle: "",
    numero: "",
    localidad: "",
    precio: "",
    superficie: "",
    habitaciones: "",
    agenteId: "",
  });

  const qc = useQueryClient();
  const createFn = useServerFn(createProspectoManual);
  const { mutate, isPending } = useMutation({
    mutationFn: createFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prospectos"] });
      qc.invalidateQueries({ queryKey: ["all-inmuebles"] });
      setOpen(false);
      setForm({
        nombre: "",
        telefono: "",
        email: "",
        tipo: "Casa · Venta",
        calle: "",
        numero: "",
        localidad: "",
        precio: "",
        superficie: "",
        habitaciones: "",
        agenteId: "",
      });
      toast.success("Captación registrada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutate({
      data: {
        nombre: form.nombre,
        telefono: form.telefono || undefined,
        email: form.email || undefined,
        tipo: form.tipo,
        calle: form.calle,
        numero: form.numero || undefined,
        localidad: form.localidad || undefined,
        precio: form.precio ? Number(form.precio) : undefined,
        superficie: form.superficie ? Number(form.superficie) : undefined,
        habitaciones: form.habitaciones ? Number(form.habitaciones) : undefined,
        agentesIds: form.agenteId ? [form.agenteId] : [],
      },
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-background text-xs font-medium hover:bg-accent transition-colors shrink-0"
      >
        <KeyRound className="size-3.5" /> Captación
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold">Nueva captación directa</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Propietario
                </p>
                <div className="space-y-2">
                  <input
                    value={form.nombre}
                    onChange={set("nombre")}
                    placeholder="Nombre *"
                    required
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={form.telefono}
                      onChange={set("telefono")}
                      placeholder="Teléfono"
                      className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30"
                    />
                    <input
                      type="email"
                      value={form.email}
                      onChange={set("email")}
                      placeholder="Email"
                      className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30"
                    />
                  </div>
                </div>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Inmueble
                </p>
                <div className="space-y-2">
                  <select
                    value={form.tipo}
                    onChange={set("tipo")}
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30"
                  >
                    {TIPOS_INMUEBLE.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <input
                        value={form.calle}
                        onChange={set("calle")}
                        placeholder="Calle *"
                        required
                        className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30"
                      />
                    </div>
                    <input
                      value={form.numero}
                      onChange={set("numero")}
                      placeholder="Nº"
                      className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30"
                    />
                  </div>
                  <input
                    value={form.localidad}
                    onChange={set("localidad")}
                    placeholder="Localidad"
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      value={form.precio}
                      onChange={set("precio")}
                      placeholder="Precio"
                      type="number"
                      min="0"
                      className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30"
                    />
                    <input
                      value={form.superficie}
                      onChange={set("superficie")}
                      placeholder="m²"
                      type="number"
                      min="0"
                      className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30"
                    />
                    <input
                      value={form.habitaciones}
                      onChange={set("habitaciones")}
                      placeholder="Hab."
                      type="number"
                      min="0"
                      className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30"
                    />
                  </div>
                  <select
                    value={form.agenteId}
                    onChange={set("agenteId")}
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30"
                  >
                    <option value="">Agente responsable</option>
                    {agentes.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                type="submit"
                disabled={isPending}
                className="w-full h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isPending ? "Guardando..." : "Registrar captación"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// ── AgendaHoy ─────────────────────────────────────────────────────────────────

function AgendaHoy({ visitas, selectedAgente }: { visitas: VisitaRow[]; selectedAgente: string }) {
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
        <span className="text-[11px] text-muted-foreground truncate hidden sm:block max-w-[140px]">
          {cliente}
        </span>
      )}
      {!isActive && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0 capitalize">
          {v.estado === "Realizada" ? "Completada" : "Anulada"}
        </span>
      )}
      {isActive && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            disabled={isPending}
            onClick={() => mutate({ data: { visitaId: v.id, estado: "Realizada" } })}
            title="Marcar completada"
            className="size-7 rounded flex items-center justify-center text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors disabled:opacity-40"
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

function AgenteCardHub({ card }: { card: AgenteHub }) {
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
              className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 truncate"
            >
              <Mail className="size-3" /> {card.mail}
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md border border-border bg-card px-2 py-1.5 text-center">
          <div className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
            {card.activos}
          </div>
          <div className="text-[10px] text-muted-foreground leading-none mt-0.5">Activos</div>
        </div>
        <div className="rounded-md border border-border bg-card px-2 py-1.5 text-center">
          <div className="text-sm font-semibold tabular-nums text-amber-700 dark:text-amber-400">
            {card.reservados}
          </div>
          <div className="text-[10px] text-muted-foreground leading-none mt-0.5">Reservados</div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-[11px] min-h-[18px]">
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
            className="flex items-center justify-center gap-1 h-7 rounded-md border border-border text-[11px] font-medium hover:bg-accent transition-colors"
          >
            <Building2 className="size-3" /> Inmuebles
          </Link>
          <Link
            to="/mis-leads"
            search={{ agente: card.id }}
            className="flex items-center justify-center gap-1 h-7 rounded-md border border-border text-[11px] font-medium hover:bg-accent transition-colors"
          >
            <Users className="size-3" /> Leads
          </Link>
          <Link
            to="/visitas"
            className="flex items-center justify-center gap-1 h-7 rounded-md border border-border text-[11px] font-medium hover:bg-accent transition-colors"
          >
            <CalendarCheck className="size-3" /> Visitas
          </Link>
        </div>
      )}
    </div>
  );
}

// ── ActividadPanel ────────────────────────────────────────────────────────────

function ActividadPanel({ actividad, label }: { actividad: ActividadEvt[]; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Activity className="size-4 text-muted-foreground" /> Actividad reciente
        </h3>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>
      <ol className="divide-y divide-border max-h-[640px] overflow-y-auto">
        {actividad.map((e) => (
          <li key={e.key} className="px-4 py-3 hover:bg-accent/40 transition-colors">
            <div className="flex items-start gap-3">
              <ActividadIcon tipo={e.tipo} />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium truncate">{e.titulo}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {e.sub}
                  {e.agentes.length > 0 && <> · {e.agentes.join(", ")}</>}
                </div>
                <div className="text-[10px] text-muted-foreground/80 mt-0.5">
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

function AgenteWorkspace({
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
            <span className="text-emerald-700 dark:text-emerald-400 font-medium">
              {activos.length} activos
            </span>
            {reservados.length > 0 && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="text-amber-700 dark:text-amber-400 font-medium">
                  {reservados.length} reserv.
                </span>
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
        <div className="text-[11px] text-muted-foreground">
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
        <div className="text-[11px] text-muted-foreground truncate">
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
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 shrink-0">
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
    reserva: { Icon: HandCoins, cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
    cierre: { Icon: FileSignature, cls: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
    visita: { Icon: CalendarCheck, cls: "bg-primary/10 text-primary" },
  } as const;
  const { Icon, cls } = map[tipo];
  return (
    <div className={`size-7 rounded-md flex items-center justify-center shrink-0 ${cls}`}>
      <Icon className="size-3.5" />
    </div>
  );
}
