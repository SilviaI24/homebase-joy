// M-03: extraído de src/components/CreateDialogs.tsx.
import { useState, useEffect, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, TriangleAlert } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  createCliente,
  checkDuplicates,
  type CreateClientePayload,
} from "@/lib/mutations.functions";
import { SEGMENTOS } from "@/lib/clientes.functions";
import { CATEGORIAS } from "@/lib/inmuebles.functions";
import { CANALES_ALTA_MANUAL, FUENTES } from "@/lib/contactos-format";
import { invalidarContactos } from "@/lib/queries";
import { Field, MoreSection, NewButton } from "@/components/create-dialogs/shared";

export function NewClienteDialog({
  trigger,
  defaultTipo = "Lead",
  onCreated,
}: {
  trigger?: ReactNode;
  // C1 (auditoría de altas, 26 sep 2026): antes el tipo empezaba vacío y el
  // contacto quedaba 'Cliente' sin rol, invisible en Contactos y en la
  // Bandeja. Por defecto es un Lead (entra por la Bandeja, circuito del
  // lead); desde el bloque Propietario del alta de inmueble, "Propietario".
  defaultTipo?: (typeof SEGMENTOS)[number];
  onCreated?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(createCliente);
  const checkDupFn = useServerFn(checkDuplicates);
  const [open, setOpen] = useState(false);
  const formInicial = (): CreateClientePayload => ({
    nombre: "",
    fecha: new Date().toISOString().slice(0, 10),
    tipo: defaultTipo,
    canalOrigen: "Presencial",
  });
  const [form, setForm] = useState<CreateClientePayload>(formInicial);
  const esLead = (form.tipo ?? "Lead") === "Lead";
  const [catSel, setCatSel] = useState<string[]>([]);

  // Debounced values for duplicate detection (400 ms)
  const [emailVal, setEmailVal] = useState("");
  const [telefonoVal, setTelefonoVal] = useState("");

  useEffect(() => {
    if (!open) {
      setEmailVal("");
      setTelefonoVal("");
      return;
    }
    const t = setTimeout(() => {
      setEmailVal(form.email?.trim() ?? "");
      setTelefonoVal(form.telefono?.trim() ?? "");
    }, 400);
    return () => clearTimeout(t);
  }, [form.email, form.telefono, open]);

  const dupQuery = useQuery({
    queryKey: ["dup-check", emailVal, telefonoVal],
    queryFn: () =>
      checkDupFn({ data: { email: emailVal || undefined, telefono: telefonoVal || undefined } }),
    enabled: open && (emailVal.length > 4 || telefonoVal.length > 7),
    staleTime: 5000,
  });

  const duplicates = dupQuery.data?.duplicates ?? [];

  const mut = useMutation({
    mutationFn: (payload: CreateClientePayload) => fn({ data: payload }),
    onSuccess: ({ id }) => {
      toast.success(esLead ? "Lead creado — lo verás en la Bandeja" : "Contacto creado");
      // P5/C4: antes solo ["clientes"]/["clientes-stats"]; Contactos pagina con
      // ["clientes-page"] y la Bandeja/pipeline tienen sus propias claves.
      invalidarContactos(qc);
      onCreated?.(id);
      setOpen(false);
      setForm(formInicial());
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
          <DialogDescription>Los datos se guardarán en la base de datos.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            // P1: este diálogo se usa dentro del <form> de NewInmuebleDialog.
            // El portal de Radix saca el DOM, pero el evento sintético de React
            // sigue burbujeando por el árbol de componentes hasta el onSubmit
            // del inmueble, que se enviaba a la vez.
            e.stopPropagation();
            mut.mutate({
              ...form,
              categoria: catSel,
              // Canal e interés solo tienen sentido para un Lead (ver
              // createCliente); con rol, el interés se deduce del rol.
              canalOrigen: esLead ? form.canalOrigen : undefined,
              tipoInteres: esLead ? form.tipoInteres : undefined,
            });
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
              value={form.tipo ?? "Lead"}
              onChange={(e) => setForm({ ...form, tipo: e.target.value })}
              className="h-9 px-3 rounded-md border border-input bg-background text-sm w-full"
            >
              {SEGMENTOS.map((t) => (
                <option key={t} value={t}>
                  {t === "Lead" ? "Lead (pasa por la Bandeja)" : t}
                </option>
              ))}
            </select>
          </Field>
          {esLead && (
            <Field label="Canal" hint="Por dónde ha contactado">
              <select
                value={form.canalOrigen ?? "Presencial"}
                onChange={(e) => setForm({ ...form, canalOrigen: e.target.value })}
                className="h-9 px-3 rounded-md border border-input bg-background text-sm w-full"
              >
                {CANALES_ALTA_MANUAL.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Fuente" hint="De dónde viene">
            <select
              value={form.fuente ?? ""}
              onChange={(e) => setForm({ ...form, fuente: e.target.value || undefined })}
              className="h-9 px-3 rounded-md border border-input bg-background text-sm w-full"
            >
              {/* Vacío: para un Lead presencial la BD pone "Oficina"
                  (trigger contacts_fuente_por_defecto); en otro caso queda
                  como desconocida, igual que en la Bandeja. */}
              <option value="">{esLead ? "Automática según canal" : "Desconocida"}</option>
              {FUENTES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Field>
          {esLead && (
            <Field label="Busca">
              <select
                value={form.tipoInteres ?? ""}
                onChange={(e) => setForm({ ...form, tipoInteres: e.target.value || undefined })}
                className="h-9 px-3 rounded-md border border-input bg-background text-sm w-full"
              >
                <option value="">Sin indicar</option>
                <option value="Compra">Comprar</option>
                <option value="Alquiler">Alquilar</option>
                <option value="Prospeccion">Vender / alquilar su inmueble</option>
              </select>
            </Field>
          )}
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

          {duplicates.length > 0 && (
            <div className="sm:col-span-2 rounded-md bg-amber-500/15 border border-amber-500/30 p-3 flex items-start gap-2">
              <TriangleAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="text-xs text-amber-800 dark:text-amber-300">
                <div className="font-semibold mb-1">Ya existe un contacto con este dato:</div>
                <ul className="space-y-0.5 mb-1.5">
                  {duplicates.map((d: { id: string; nombre: string }) => (
                    <li key={d.id}>{d.nombre || "Sin nombre"}</li>
                  ))}
                </ul>
                <Link to="/contactos" className="font-medium underline hover:no-underline">
                  Ver contactos
                </Link>
              </div>
            </div>
          )}

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
