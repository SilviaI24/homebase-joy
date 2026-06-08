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

// ============= NEW INMUEBLE / ALQUILER =============
const TIPOS_VENTA = ["Piso", "Chalet", "Casa", "Terreno", "Garaje", "Trastero", "Local", "Nave", "Oficina", "Edificio"];
const TIPOS_ALQUILER = TIPOS_VENTA.map((t) => `Alquiler ${t}`);

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
  const [esAlquiler, setEsAlquiler] = useState(defaultAlquiler);
  const tipoList = esAlquiler ? TIPOS_ALQUILER : TIPOS_VENTA;
  const [form, setForm] = useState<CreateInmueblePayload>({
    calle: "",
    tipo: tipoList[0],
    estatus: "Activo",
    fechaInicio: new Date().toISOString().slice(0, 10),
  });
  const [ag, setAg] = useState<string[]>([]);

  const mut = useMutation({
    mutationFn: (payload: CreateInmueblePayload) => fn({ data: payload }),
    onSuccess: () => {
      toast.success(esAlquiler ? "Alquiler creado" : "Inmueble creado");
      qc.invalidateQueries({ queryKey: ["all-inmuebles"] });
      setOpen(false);
      setForm({
        calle: "",
        tipo: tipoList[0],
        estatus: "Activo",
        fechaInicio: new Date().toISOString().slice(0, 10),
      });
      setAg([]);
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo crear"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ?? <NewButton>{defaultAlquiler ? "Nuevo alquiler" : "Nuevo inmueble"}</NewButton>}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{esAlquiler ? "Nuevo alquiler" : "Nuevo inmueble"}</DialogTitle>
          <DialogDescription>Se guardará en la base de Airtable.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate({ ...form, agentesIds: ag.length ? ag : undefined });
          }}
          className="grid gap-3 sm:grid-cols-2"
        >
          <div className="sm:col-span-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setEsAlquiler(false);
                setForm((f) => ({ ...f, tipo: TIPOS_VENTA[0] }));
              }}
              className={`flex-1 h-8 rounded-md text-xs font-medium ${
                !esAlquiler ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/70"
              }`}
            >
              Venta
            </button>
            <button
              type="button"
              onClick={() => {
                setEsAlquiler(true);
                setForm((f) => ({ ...f, tipo: TIPOS_ALQUILER[0] }));
              }}
              className={`flex-1 h-8 rounded-md text-xs font-medium ${
                esAlquiler ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/70"
              }`}
            >
              Alquiler
            </button>
          </div>

          <div className="sm:col-span-2">
            <Field label="Calle *">
              <Input
                required
                value={form.calle}
                onChange={(e) => setForm({ ...form, calle: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Número">
            <Input
              value={form.numero ?? ""}
              onChange={(e) => setForm({ ...form, numero: e.target.value })}
            />
          </Field>
          <Field label="Barrio">
            <Input
              value={form.barrio ?? ""}
              onChange={(e) => setForm({ ...form, barrio: e.target.value })}
            />
          </Field>
          <Field label="Localidad">
            <Input
              value={form.localidad ?? ""}
              onChange={(e) => setForm({ ...form, localidad: e.target.value })}
            />
          </Field>
          <Field label="Tipo *">
            <select
              required
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value })}
              className="h-9 px-3 rounded-md border border-input bg-background text-sm w-full"
            >
              {tipoList.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Precio (€)">
            <Input
              type="number"
              min={0}
              value={form.precio ?? ""}
              onChange={(e) =>
                setForm({ ...form, precio: e.target.value === "" ? null : Number(e.target.value) })
              }
            />
          </Field>
          <Field label="Fecha de inicio">
            <Input
              type="date"
              value={form.fechaInicio ?? ""}
              onChange={(e) => setForm({ ...form, fechaInicio: e.target.value })}
            />
          </Field>

          <div className="sm:col-span-2">
            <MoreSection>
              <Field label="Habitaciones">
                <Input
                  value={form.habitaciones ?? ""}
                  onChange={(e) => setForm({ ...form, habitaciones: e.target.value })}
                />
              </Field>
              <Field label="Baños">
                <Input
                  value={form.banos ?? ""}
                  onChange={(e) => setForm({ ...form, banos: e.target.value })}
                />
              </Field>
              <Field label="Superficie">
                <Input
                  value={form.superficie ?? ""}
                  onChange={(e) => setForm({ ...form, superficie: e.target.value })}
                />
              </Field>
              <Field label="Estatus">
                <select
                  value={form.estatus ?? "Activo"}
                  onChange={(e) => setForm({ ...form, estatus: e.target.value })}
                  className="h-9 px-3 rounded-md border border-input bg-background text-sm w-full"
                >
                  {["Activo", "Reservado", "Vendido", "Alquilado", "Baja", "Prospección"].map(
                    (s) => (
                      <option key={s} value={s}>{s}</option>
                    ),
                  )}
                </select>
              </Field>
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
              <div className="sm:col-span-2">
                <Field label="Descripción">
                  <Textarea
                    rows={2}
                    value={form.descripcion ?? ""}
                    onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
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
              Crear
            </Button>
          </DialogFooter>
        </form>
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
      {trigger ?? <NewButton>Nueva visita</NewButton>}
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
