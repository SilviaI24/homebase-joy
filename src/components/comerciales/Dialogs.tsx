// M-03: extraído de src/routes/comerciales.index.lazy.tsx.
import { useMemo, useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { type Inmueble } from "@/lib/inmuebles.functions";
import { createVisita, createCliente, createProspectoManual } from "@/lib/mutations.functions";
import { CalendarPlus, UserPlus, KeyRound, Search, X } from "lucide-react";
import { localDateStr } from "@/lib/comerciales-format";

// ── NuevaVisitaDialog ─────────────────────────────────────────────────────────

export function NuevaVisitaDialog({
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
                  <label
                    htmlFor="nva-visita-fecha"
                    className="text-xs font-medium text-muted-foreground block mb-1"
                  >
                    Fecha
                  </label>
                  <input
                    id="nva-visita-fecha"
                    type="date"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    required
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30"
                  />
                </div>
                <div>
                  <label
                    htmlFor="nva-visita-hora"
                    className="text-xs font-medium text-muted-foreground block mb-1"
                  >
                    Hora
                  </label>
                  <input
                    id="nva-visita-hora"
                    type="time"
                    value={hora}
                    onChange={(e) => setHora(e.target.value)}
                    required
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30"
                  />
                </div>
              </div>

              <div ref={inmuebleRef} className="relative">
                <label
                  htmlFor={selectedInm ? undefined : "nva-visita-inmueble"}
                  className="text-xs font-medium text-muted-foreground block mb-1"
                >
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
                        id="nva-visita-inmueble"
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
                <label
                  htmlFor="nva-visita-agente"
                  className="text-xs font-medium text-muted-foreground block mb-1"
                >
                  Agente
                </label>
                <select
                  id="nva-visita-agente"
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

export function NuevoClienteDialog({
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
                <label
                  htmlFor="nvo-cliente-nombre"
                  className="text-xs font-medium text-muted-foreground block mb-1"
                >
                  Nombre *
                </label>
                <input
                  id="nvo-cliente-nombre"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Nombre completo"
                  required
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="nvo-cliente-telefono"
                    className="text-xs font-medium text-muted-foreground block mb-1"
                  >
                    Teléfono
                  </label>
                  <input
                    id="nvo-cliente-telefono"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    placeholder="600 000 000"
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30"
                  />
                </div>
                <div>
                  <label
                    htmlFor="nvo-cliente-email"
                    className="text-xs font-medium text-muted-foreground block mb-1"
                  >
                    Email
                  </label>
                  <input
                    id="nvo-cliente-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@..."
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30"
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="nvo-cliente-tipo"
                  className="text-xs font-medium text-muted-foreground block mb-1"
                >
                  Tipo
                </label>
                <select
                  id="nvo-cliente-tipo"
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
                <label
                  htmlFor="nvo-cliente-agente"
                  className="text-xs font-medium text-muted-foreground block mb-1"
                >
                  Agente
                </label>
                <select
                  id="nvo-cliente-agente"
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

export function NuevaCaptacionDialog({
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
      // Nota: ["all-inmuebles"] no es (ni era) la query real que alimenta esta
      // pantalla — corregido a las dos que sí usa el hub de Comerciales.
      qc.invalidateQueries({ queryKey: ["comerciables-inmuebles"] });
      qc.invalidateQueries({ queryKey: ["actividad-inmuebles"] });
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
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Propietario
                </p>
                <div className="space-y-2">
                  <input
                    value={form.nombre}
                    onChange={set("nombre")}
                    placeholder="Nombre *"
                    aria-label="Nombre del propietario"
                    required
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={form.telefono}
                      onChange={set("telefono")}
                      placeholder="Teléfono"
                      aria-label="Teléfono del propietario"
                      className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30"
                    />
                    <input
                      type="email"
                      value={form.email}
                      onChange={set("email")}
                      placeholder="Email"
                      aria-label="Email del propietario"
                      className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30"
                    />
                  </div>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Inmueble
                </p>
                <div className="space-y-2">
                  <select
                    value={form.tipo}
                    onChange={set("tipo")}
                    aria-label="Tipo de inmueble"
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
                        aria-label="Calle"
                        required
                        className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30"
                      />
                    </div>
                    <input
                      value={form.numero}
                      onChange={set("numero")}
                      placeholder="Nº"
                      aria-label="Número"
                      className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30"
                    />
                  </div>
                  <input
                    value={form.localidad}
                    onChange={set("localidad")}
                    placeholder="Localidad"
                    aria-label="Localidad"
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      value={form.precio}
                      onChange={set("precio")}
                      placeholder="Precio"
                      aria-label="Precio"
                      type="number"
                      min="0"
                      className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30"
                    />
                    <input
                      value={form.superficie}
                      onChange={set("superficie")}
                      placeholder="m²"
                      aria-label="Superficie en metros cuadrados"
                      type="number"
                      min="0"
                      className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30"
                    />
                    <input
                      value={form.habitaciones}
                      onChange={set("habitaciones")}
                      placeholder="Hab."
                      aria-label="Habitaciones"
                      type="number"
                      min="0"
                      className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30"
                    />
                  </div>
                  <select
                    value={form.agenteId}
                    onChange={set("agenteId")}
                    aria-label="Agente responsable"
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
