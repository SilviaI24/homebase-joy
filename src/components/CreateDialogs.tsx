import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import {
  createCliente,
  createInmueble,
  createVisita,
  type CreateClientePayload,
  type CreateInmueblePayload,
  type CreateVisitaPayload,
} from "@/lib/mutations.functions";
import { TIPOS_CLIENTE } from "@/lib/clientes.functions";
import { CATEGORIAS } from "@/lib/inmuebles.functions";
import { agentesQuery, allInmueblesQuery, clientesQueryOpts } from "@/lib/queries";

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-foreground/80">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function MoreSection({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t border-border pt-3">
      <CollapsibleTrigger className="text-xs font-medium text-primary hover:underline">
        {open ? "Ocultar opcionales" : "Mostrar campos opcionales"}
      </CollapsibleTrigger>
      <CollapsibleContent className="grid gap-3 sm:grid-cols-2 pt-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function MultiSelect({
  options,
  value,
  onChange,
}: {
  options: Array<{ id: string; label: string }>;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="max-h-32 overflow-auto rounded-md border border-input bg-background p-2 space-y-1">
      {options.length === 0 && (
        <div className="text-xs text-muted-foreground py-1">Sin opciones</div>
      )}
      {options.map((o) => {
        const checked = value.includes(o.id);
        return (
          <label key={o.id} className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) =>
                onChange(e.target.checked ? [...value, o.id] : value.filter((v) => v !== o.id))
              }
            />
            <span className="truncate">{o.label}</span>
          </label>
        );
      })}
    </div>
  );
}

function NewButton({ children = "Nuevo", onClick }: { children?: ReactNode; onClick?: () => void }) {
  return (
    <DialogTrigger asChild>
      <Button size="sm" className="h-9 gap-1.5" onClick={onClick}>
        <Plus className="size-4" />
        {children}
      </Button>
    </DialogTrigger>
  );
}

// ============= NEW CLIENTE =============
export function NewClienteDialog({ trigger }: { trigger?: ReactNode }) {
  const qc = useQueryClient();
  const fn = useServerFn(createCliente);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateClientePayload>({
    nombre: "",
    fecha: new Date().toISOString().slice(0, 10),
  });
  const [catSel, setCatSel] = useState<string[]>([]);

  const mut = useMutation({
    mutationFn: (payload: CreateClientePayload) => fn({ data: payload }),
    onSuccess: () => {
      toast.success("Cliente creado en Airtable");
      qc.invalidateQueries({ queryKey: ["clientes"] });
      setOpen(false);
      setForm({ nombre: "", fecha: new Date().toISOString().slice(0, 10) });
      setCatSel([]);
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo crear"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ?? <NewButton>Nuevo cliente</NewButton>}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo cliente</DialogTitle>
          <DialogDescription>Se guardará en la base de Airtable.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate({ ...form, categoria: catSel });
          }}
          className="grid gap-3 sm:grid-cols-2"
        >
          <div className="sm:col-span-2">
            <Field label="Nombre *">
              <Input
                required
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Teléfono">
            <Input
              value={form.telefono ?? ""}
              onChange={(e) => setForm({ ...form, telefono: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={form.email ?? ""}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="Tipo de cliente">
            <select
              value={form.tipo ?? ""}
              onChange={(e) => setForm({ ...form, tipo: e.target.value })}
              className="h-9 px-3 rounded-md border border-input bg-background text-sm w-full"
            >
              <option value="">—</option>
              {TIPOS_CLIENTE.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Fecha">
            <Input
              type="date"
              value={form.fecha ?? ""}
              onChange={(e) => setForm({ ...form, fecha: e.target.value })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Motivo de la llamada">
              <Textarea
                rows={2}
                value={form.motivo ?? ""}
                onChange={(e) => setForm({ ...form, motivo: e.target.value })}
              />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <MoreSection>
              <Field label="DNI">
                <Input
                  value={form.dni ?? ""}
                  onChange={(e) => setForm({ ...form, dni: e.target.value })}
                />
              </Field>
              <Field label="Profesión">
                <Input
                  value={form.profesion ?? ""}
                  onChange={(e) => setForm({ ...form, profesion: e.target.value })}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Categorías de interés">
                  <div className="flex flex-wrap gap-1.5">
                    {CATEGORIAS.map((c) => {
                      const sel = catSel.includes(c);
                      return (
                        <button
                          type="button"
                          key={c}
                          onClick={() =>
                            setCatSel(sel ? catSel.filter((x) => x !== c) : [...catSel, c])
                          }
                          className={`px-2.5 h-7 rounded-full text-xs border transition-colors ${
                            sel
                              ? "bg-primary text-primary-foreground border-primary"
                              : "border-input bg-background hover:bg-accent"
                          }`}
                        >
                          {c}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Solicitud">
                  <Textarea
                    rows={2}
                    value={form.solicitud ?? ""}
                    onChange={(e) => setForm({ ...form, solicitud: e.target.value })}
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Observaciones">
                  <Textarea
                    rows={2}
                    value={form.observaciones ?? ""}
                    onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
                  />
                </Field>
              </div>
            </MoreSection>
          </div>

          <DialogFooter className="sm:col-span-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mut.isPending}>
              {mut.isPending && <Loader2 className="size-4 animate-spin mr-1.5" />}
              Crear cliente
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============= NEW INMUEBLE / ALQUILER (wizard por tipo) =============
const TIPOS_VENTA = [
  "Piso", "Chalet", "Casa", "Terreno", "Garaje", "Trastero",
  "Local", "Nave", "Oficina", "Edificio",
] as const;
const TIPOS_ALQUILER = [
  "Alquiler Piso", "Alquiler Garaje", "Alquiler Oficina", "Alquiler Local", "Alquiler Trastero",
] as const;
type TipoInmueble = (typeof TIPOS_VENTA)[number] | (typeof TIPOS_ALQUILER)[number];

const ALL_TIPOS: TipoInmueble[] = [...TIPOS_VENTA, ...TIPOS_ALQUILER];

const ICONOS_TIPO: Record<string, string> = {
  Piso: "🏢", Chalet: "🏡", Casa: "🏠", Terreno: "🌳",
  Garaje: "🚗", Trastero: "📦", Local: "🏪", Nave: "🏭",
  Oficina: "💼", Edificio: "🏬",
};

type FieldDef = {
  key: keyof CreateInmueblePayload;
  label: string;
  kind?: "input" | "number" | "textarea" | "select" | "date";
  options?: readonly string[];
  required?: boolean;
  full?: boolean;
};

const F = {
  ref: { key: "ref", label: "Ref" } satisfies FieldDef,
  estatus: {
    key: "estatus", label: "Estatus", kind: "select",
    options: ["Activo", "Reservado", "Vendido", "Alquilado", "Baja", "Prospección"],
  } satisfies FieldDef,
  estado: {
    key: "estado", label: "Estado", kind: "select",
    options: ["Nuevo", "A reformar", "Reformado", "Buen estado", "Para entrar", "Obra nueva"],
    required: true,
  } satisfies FieldDef,
  precio: { key: "precio", label: "Precio (€)", kind: "number" } satisfies FieldDef,
  localidad: { key: "localidad", label: "Localidad" } satisfies FieldDef,
  barrio: { key: "barrio", label: "Barrio" } satisfies FieldDef,
  calle: { key: "calle", label: "Calle", required: true, full: true } satisfies FieldDef,
  numero: { key: "numero", label: "Número" } satisfies FieldDef,
  superficie: { key: "superficie", label: "Superficie (m²)" } satisfies FieldDef,
  habitaciones: { key: "habitaciones", label: "Habitaciones / dormitorios" } satisfies FieldDef,
  banos: { key: "banos", label: "Baños" } satisfies FieldDef,
  tipoSuelo: { key: "tipoSuelo", label: "Tipo de suelo" } satisfies FieldDef,
  calefaccion: { key: "calefaccion", label: "Calefacción" } satisfies FieldDef,
  orientacion: { key: "orientacion", label: "Orientación" } satisfies FieldDef,
  terraza: { key: "terraza", label: "Terraza" } satisfies FieldDef,
  balcon: { key: "balcon", label: "Balcón" } satisfies FieldDef,
  garaje: { key: "garaje", label: "Garaje", kind: "select", options: ["Sí", "No", "Opcional"] } satisfies FieldDef,
  trastero: { key: "trastero", label: "Trastero", kind: "select", options: ["Sí", "No"] } satisfies FieldDef,
  ascensor: { key: "ascensor", label: "Ascensor", kind: "select", options: ["Sí", "No"] } satisfies FieldDef,
  armariosEmpotrados: { key: "armariosEmpotrados", label: "Armarios empotrados", kind: "select", options: ["Sí", "No"] } satisfies FieldDef,
  anoConstruccion: { key: "anoConstruccion", label: "Año de construcción" } satisfies FieldDef,
  certificacionEnergetica: { key: "certificacionEnergetica", label: "Certificación energética" } satisfies FieldDef,
  llaves: { key: "llaves", label: "Llaves" } satisfies FieldDef,
  plantas: { key: "plantas", label: "Plantas" } satisfies FieldDef,
  planta: { key: "planta", label: "Planta interior/exterior" } satisfies FieldDef,
  gastosComunidad: { key: "gastosComunidad", label: "Gastos de comunidad" } satisfies FieldDef,
  inquilinos: { key: "inquilinos", label: "Inquilinos", kind: "select", options: ["Sí", "No"] } satisfies FieldDef,
  publicacion: { key: "publicacion", label: "Publicación", kind: "select", options: ["SUBIR", "PUBLICADO"] } satisfies FieldDef,
  enlaceTours: { key: "enlaceTours", label: "Enlace tours", kind: "textarea", full: true } satisfies FieldDef,
  descripcion: { key: "descripcion", label: "Descripción", kind: "textarea", full: true } satisfies FieldDef,
  observaciones: { key: "observaciones", label: "Observaciones", kind: "textarea", full: true } satisfies FieldDef,
  tipoChalet: { key: "tipoChalet", label: "Tipo de chalet" } satisfies FieldDef,
  superficieEdificable: { key: "superficieEdificable", label: "Superficie edificable" } satisfies FieldDef,
  viaUrbana: { key: "viaUrbana", label: "Vía urbana", kind: "select", options: ["Sí", "No"] } satisfies FieldDef,
  salidaHumos: { key: "salidaHumos", label: "Salida de humos", kind: "select", options: ["Sí", "No"] } satisfies FieldDef,
  almacen: { key: "almacen", label: "Almacén", kind: "select", options: ["Sí", "No"] } satisfies FieldDef,
  estancias: { key: "estancias", label: "Estancias" } satisfies FieldDef,
} as const;

// Image / documentation URL pseudo-fields are kept out of the schema for now
// (subida real por URL → ver "Mantener por URL" en plan).

function getSchemaForTipo(t: TipoInmueble): FieldDef[] {
  const base = t.replace(/^Alquiler\s+/, "") as TipoInmueble;
  switch (base) {
    case "Chalet":
    case "Casa":
      return [
        F.ref, F.estatus, F.precio, F.tipoChalet, F.localidad, F.barrio,
        F.calle, F.numero, F.plantas, F.superficie, F.habitaciones, F.banos,
        F.tipoSuelo, F.calefaccion, F.orientacion, F.terraza, F.garaje, F.trastero,
        F.armariosEmpotrados, F.estado, F.anoConstruccion, F.certificacionEnergetica,
        F.llaves, F.enlaceTours, F.descripcion,
      ];
    case "Terreno":
      return [
        F.ref, F.precio, F.estatus, F.barrio, F.localidad, F.calle, F.numero,
        F.superficie, F.superficieEdificable, F.viaUrbana, F.descripcion,
        F.observaciones, F.enlaceTours,
      ];
    case "Piso":
      return [
        F.ref, F.estado, F.precio, F.localidad, F.barrio, F.calle, F.numero,
        F.planta, F.superficie, F.habitaciones, F.banos, F.orientacion,
        F.calefaccion, F.terraza, F.ascensor, F.garaje, F.trastero, F.balcon,
        F.armariosEmpotrados, F.tipoSuelo, F.certificacionEnergetica,
        F.anoConstruccion, F.gastosComunidad, F.llaves, F.inquilinos,
        F.enlaceTours, F.observaciones, F.publicacion,
      ];
    case "Garaje":
      return [
        F.ref, F.estatus, F.precio, F.localidad, F.barrio, F.calle, F.numero,
        F.superficie, F.gastosComunidad, F.ascensor, F.enlaceTours,
        F.observaciones, F.publicacion,
      ];
    case "Local":
    case "Oficina":
    case "Nave":
      return [
        F.ref, F.estado, F.precio, F.localidad, F.barrio, F.calle, F.numero,
        F.superficie, F.salidaHumos, F.almacen, F.estancias, F.plantas,
        F.ascensor, F.garaje, F.trastero, F.certificacionEnergetica,
        F.anoConstruccion, F.tipoSuelo, F.habitaciones, F.banos, F.inquilinos,
        F.observaciones, F.enlaceTours, F.publicacion,
      ];
    case "Trastero":
      return [
        F.ref, F.precio, F.estado, F.calle, F.numero, F.barrio, F.localidad,
        F.superficie, F.tipoSuelo, F.enlaceTours, F.observaciones, F.publicacion,
      ];
    default:
      return [
        F.ref, F.estatus, F.precio, F.localidad, F.barrio, F.calle, F.numero,
        F.superficie, F.descripcion, F.observaciones,
      ];
  }
}

// Combobox of existing clients + inline "+ Añadir cliente"
function PropietarioBlock({
  selected,
  onChange,
  fechaInicio,
  setFechaInicio,
  fechaExclusiva,
  setFechaExclusiva,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
  fechaInicio: string;
  setFechaInicio: (v: string) => void;
  fechaExclusiva: string;
  setFechaExclusiva: (v: string) => void;
}) {
  const clientes = useQuery(clientesQueryOpts);
  const [filter, setFilter] = useState("");
  const list = (clientes.data?.clientes ?? [])
    .filter((c) =>
      filter ? `${c.nombre} ${c.telefono}`.toLowerCase().includes(filter.toLowerCase()) : true,
    )
    .slice(0, 80)
    .map((c) => ({ id: c.id, label: `${c.nombre}${c.telefono ? ` · ${c.telefono}` : ""}` }));

  return (
    <div className="sm:col-span-2 mt-3 rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Propietario</h4>
        <NewClienteDialog
          trigger={
            <Button type="button" size="sm" variant="outline" className="h-7 gap-1">
              <Plus className="size-3.5" /> Añadir cliente
            </Button>
          }
        />
      </div>
      <Field label="Seleccionar propietario" hint={`Seleccionados: ${selected.length}`}>
        <Input
          placeholder="Filtrar por nombre/teléfono…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="mb-2"
        />
        <MultiSelect options={list} value={selected} onChange={onChange} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Fecha de inicio">
          <Input
            type="date"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
          />
        </Field>
        <Field label="Fecha de autorización de venta (exclusiva)">
          <Input
            type="date"
            value={fechaExclusiva}
            onChange={(e) => setFechaExclusiva(e.target.value)}
          />
        </Field>
      </div>
    </div>
  );
}

function FormField({
  def,
  value,
  onChange,
}: {
  def: FieldDef;
  value: string;
  onChange: (v: string) => void;
}) {
  const inner = (() => {
    if (def.kind === "select") {
      return (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={def.required}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm w-full"
        >
          <option value="">—</option>
          {def.options?.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      );
    }
    if (def.kind === "textarea") {
      return (
        <Textarea
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={def.required}
        />
      );
    }
    if (def.kind === "number") {
      return (
        <Input
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={def.required}
        />
      );
    }
    if (def.kind === "date") {
      return (
        <Input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={def.required}
        />
      );
    }
    return (
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={def.required}
      />
    );
  })();
  return (
    <div className={def.full ? "sm:col-span-2" : ""}>
      <Field label={def.required ? `${def.label} *` : def.label}>{inner}</Field>
    </div>
  );
}

export function NewInmuebleDialog({
  defaultAlquiler = false,
  trigger,
}: {
  defaultAlquiler?: boolean;
  trigger?: ReactNode;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(createInmueble);
  const agentes = useQuery(agentesQuery);
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState<TipoInmueble | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [ag, setAg] = useState<string[]>([]);
  const [propietarios, setPropietarios] = useState<string[]>([]);
  const [fechaInicio, setFechaInicio] = useState<string>(new Date().toISOString().slice(0, 10));
  const [fechaExclusiva, setFechaExclusiva] = useState<string>("");

  const reset = () => {
    setTipo(null);
    setValues({});
    setAg([]);
    setPropietarios([]);
    setFechaInicio(new Date().toISOString().slice(0, 10));
    setFechaExclusiva("");
  };

  const mut = useMutation({
    mutationFn: (payload: CreateInmueblePayload) => fn({ data: payload }),
    onSuccess: () => {
      toast.success("Inmueble creado en Airtable");
      qc.invalidateQueries({ queryKey: ["all-inmuebles"] });
      setOpen(false);
      reset();
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo crear"),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tipo) return;
    const payload: CreateInmueblePayload = {
      calle: values.calle ?? "",
      tipo,
      estatus: values.estatus || "Activo",
      fechaInicio: fechaInicio || null,
      fechaExclusiva: fechaExclusiva || null,
      agentesIds: ag.length ? ag : undefined,
      propietariosIds: propietarios.length ? propietarios : undefined,
    };
    // Copy all string fields
    (Object.keys(values) as Array<keyof CreateInmueblePayload>).forEach((k) => {
      const v = values[k as string];
      if (v == null || v === "") return;
      if (k === "precio") {
        const n = Number(v);
        if (Number.isFinite(n)) (payload as Record<string, unknown>).precio = n;
      } else {
        (payload as Record<string, unknown>)[k as string] = v;
      }
    });
    mut.mutate(payload);
  };

  const schema = tipo ? getSchemaForTipo(tipo) : [];
  const esAlquiler = tipo?.startsWith("Alquiler");

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      {trigger ?? <NewButton>{defaultAlquiler ? "Nuevo alquiler" : "Nuevo inmueble"}</NewButton>}
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {tipo ? `Nuevo ${tipo.toLowerCase()}` : "Nuevo inmueble — Selecciona tipo"}
          </DialogTitle>
          <DialogDescription>
            {tipo
              ? "Rellena los campos y se guardará en la base de Airtable."
              : "Primero selecciona el tipo de inmueble que quieres dar de alta."}
          </DialogDescription>
        </DialogHeader>

        {!tipo ? (
          <div className="space-y-4">
            <div>
              <div className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground mb-2">
                Venta
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {TIPOS_VENTA.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipo(t)}
                    className="flex flex-col items-center gap-1 py-3 px-2 rounded-lg border border-input hover:border-primary hover:bg-accent transition-colors text-sm font-medium"
                  >
                    <span className="text-2xl">{ICONOS_TIPO[t] ?? "🏷️"}</span>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground mb-2">
                Alquiler
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {TIPOS_ALQUILER.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipo(t)}
                    className="flex flex-col items-center gap-1 py-3 px-2 rounded-lg border border-input hover:border-primary hover:bg-accent transition-colors text-sm font-medium"
                  >
                    <span className="text-2xl">
                      {ICONOS_TIPO[t.replace(/^Alquiler\s+/, "")] ?? "🏷️"}
                    </span>
                    <span className="text-xs">{t.replace(/^Alquiler\s+/, "")}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2 flex items-center justify-between text-xs text-muted-foreground -mb-1">
              <button
                type="button"
                onClick={() => setTipo(null)}
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                ← Cambiar tipo
              </button>
              <span className="font-medium text-foreground">
                {ICONOS_TIPO[tipo.replace(/^Alquiler\s+/, "")]} {tipo}
                {esAlquiler && " (alquiler)"}
              </span>
            </div>

            {schema.map((def) => (
              <FormField
                key={def.key as string}
                def={def}
                value={values[def.key as string] ?? ""}
                onChange={(v) => setValues((s) => ({ ...s, [def.key as string]: v }))}
              />
            ))}

            <div className="sm:col-span-2">
              <Field label="Agentes asignados">
                <MultiSelect
                  options={(agentes.data?.agentes ?? []).map((a) => ({
                    id: a.id,
                    label: a.nombre,
                  }))}
                  value={ag}
                  onChange={setAg}
                />
              </Field>
            </div>

            <PropietarioBlock
              selected={propietarios}
              onChange={setPropietarios}
              fechaInicio={fechaInicio}
              setFechaInicio={setFechaInicio}
              fechaExclusiva={fechaExclusiva}
              setFechaExclusiva={setFechaExclusiva}
            />

            <DialogFooter className="sm:col-span-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={mut.isPending}>
                {mut.isPending && <Loader2 className="size-4 animate-spin mr-1.5" />}
                Crear
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============= NEW VISITA =============
export function NewVisitaDialog({
  defaultInmuebleId,
  defaultClienteId,
  trigger,
}: {
  defaultInmuebleId?: string;
  defaultClienteId?: string;
  trigger?: ReactNode;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(createVisita);
  const agentes = useQuery(agentesQuery);
  const inmuebles = useQuery(allInmueblesQuery);
  const clientes = useQuery(clientesQueryOpts);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateVisitaPayload>({
    fecha: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
    estado: "Pendiente",
    inmueblesIds: defaultInmuebleId ? [defaultInmuebleId] : [],
    clientesIds: defaultClienteId ? [defaultClienteId] : [],
  });
  const [inmFilter, setInmFilter] = useState("");
  const [cliFilter, setCliFilter] = useState("");

  const mut = useMutation({
    mutationFn: (payload: CreateVisitaPayload) =>
      fn({ data: { ...payload, fecha: new Date(payload.fecha).toISOString() } }),
    onSuccess: () => {
      toast.success("Visita creada");
      qc.invalidateQueries({ queryKey: ["visitas-all"] });
      qc.invalidateQueries({ queryKey: ["visitas-by-inmueble"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo crear"),
  });

  const inmList = (inmuebles.data
    ? [...inmuebles.data.inmuebles, ...inmuebles.data.alquileres]
    : []
  )
    .filter((i) =>
      inmFilter
        ? `${i.ref} ${i.calle} ${i.barrio}`.toLowerCase().includes(inmFilter.toLowerCase())
        : true,
    )
    .slice(0, 80)
    .map((i) => ({ id: i.id, label: `${i.ref || "—"} · ${i.calle} ${i.numero || ""}` }));

  const cliList = (clientes.data?.clientes ?? [])
    .filter((c) =>
      cliFilter ? `${c.nombre} ${c.telefono}`.toLowerCase().includes(cliFilter.toLowerCase()) : true,
    )
    .slice(0, 80)
    .map((c) => ({ id: c.id, label: `${c.nombre}${c.telefono ? ` · ${c.telefono}` : ""}` }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : <NewButton>Nueva visita</NewButton>}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva visita</DialogTitle>
          <DialogDescription>Se guardará en Airtable y aparecerá en el calendario.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate(form);
          }}
          className="grid gap-3 sm:grid-cols-2"
        >
          <Field label="Fecha y hora *">
            <Input
              type="datetime-local"
              required
              value={form.fecha}
              onChange={(e) => setForm({ ...form, fecha: e.target.value })}
            />
          </Field>
          <Field label="Estado">
            <select
              value={form.estado ?? "Pendiente"}
              onChange={(e) => setForm({ ...form, estado: e.target.value })}
              className="h-9 px-3 rounded-md border border-input bg-background text-sm w-full"
            >
              {["Pendiente", "Confirmada", "Realizada", "Cancelada", "No realizada"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>

          <div className="sm:col-span-2">
            <Field label="Inmuebles *" hint={`Seleccionados: ${form.inmueblesIds.length}`}>
              <Input
                placeholder="Filtrar por ref/calle…"
                value={inmFilter}
                onChange={(e) => setInmFilter(e.target.value)}
                className="mb-2"
              />
              <MultiSelect
                options={inmList}
                value={form.inmueblesIds}
                onChange={(v) => setForm({ ...form, inmueblesIds: v })}
              />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field label="Clientes" hint={`Seleccionados: ${(form.clientesIds ?? []).length}`}>
              <Input
                placeholder="Filtrar por nombre/teléfono…"
                value={cliFilter}
                onChange={(e) => setCliFilter(e.target.value)}
                className="mb-2"
              />
              <MultiSelect
                options={cliList}
                value={form.clientesIds ?? []}
                onChange={(v) => setForm({ ...form, clientesIds: v })}
              />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <MoreSection>
              <div className="sm:col-span-2">
                <Field label="Agentes">
                  <MultiSelect
                    options={(agentes.data?.agentes ?? []).map((a) => ({
                      id: a.id,
                      label: a.nombre,
                    }))}
                    value={form.agentesIds ?? []}
                    onChange={(v) => setForm({ ...form, agentesIds: v })}
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Comentarios">
                  <Textarea
                    rows={2}
                    value={form.comentarios ?? ""}
                    onChange={(e) => setForm({ ...form, comentarios: e.target.value })}
                  />
                </Field>
              </div>
            </MoreSection>
          </div>

          <DialogFooter className="sm:col-span-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mut.isPending}>
              {mut.isPending && <Loader2 className="size-4 animate-spin mr-1.5" />}
              Crear visita
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
