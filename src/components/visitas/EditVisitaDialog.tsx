// Instrucciones de mejora del CRM (sep 2026), punto "Agenda": antes solo se
// podía pasar una visita a Cancelada -- no editar su fecha/inmueble/cliente/
// agente ni eliminarla. Mismo patrón de picker con búsqueda server-side que
// NewVisitaDialog, pero de selección única (una visita = un inmueble, un
// cliente, un agente) en vez de múltiple.
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { updateVisita, deleteVisita, type UpdateVisitaPayload } from "@/lib/mutations.functions";
import { agentesQuery, searchInmueblesQuery, searchClientesPickerQuery } from "@/lib/queries";
import { Field, MultiSelect } from "@/components/create-dialogs/shared";
import type { VisitaFull } from "@/lib/visitas.functions";

// MultiSelect es de casilla (multi); para selección única nos quedamos con el
// último id marcado -- MultiSelect siempre añade el nuevo al final del array.
function pickSingle(next: string[]): string {
  return next[next.length - 1] ?? "";
}

export function EditVisitaDialog({ visita, trigger }: { visita: VisitaFull; trigger: ReactNode }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateVisita);
  const deleteFn = useServerFn(deleteVisita);
  const [open, setOpen] = useState(false);

  const inmuebleActualId = visita.inmuebleIds[0] ?? "";
  const clienteActualId = visita.clientesIds[0] ?? "";

  const [form, setForm] = useState<UpdateVisitaPayload>({
    visitaId: visita.id,
    fecha: visita.fecha ? visita.fecha.slice(0, 16) : "",
    inmuebleId: inmuebleActualId,
    clienteId: clienteActualId || null,
    agenteId: visita.agentesIds[0] ?? null,
    notas: visita.comentarios,
  });
  const [inmFilter, setInmFilter] = useState("");
  const [cliFilter, setCliFilter] = useState("");

  const agentes = useQuery({ ...agentesQuery, enabled: open });
  const inmuebles = useQuery({
    ...searchInmueblesQuery({ q: inmFilter, limit: 80 }),
    enabled: open,
  });
  const clientes = useQuery({
    ...searchClientesPickerQuery({ q: cliFilter, limit: 80 }),
    enabled: open,
  });

  // El inmueble/cliente actual puede no estar en la primera página de
  // resultados de búsqueda -- se antepone a mano para que no "desaparezca"
  // del selector al abrir el diálogo sin haber filtrado nada todavía.
  const inmList = [
    ...(inmuebleActualId && form.inmuebleId === inmuebleActualId
      ? [
          {
            id: inmuebleActualId,
            label: `${visita.inmuebleCalles[0] ?? "—"} ${visita.inmuebleNumeros[0] ?? ""}`,
          },
        ]
      : []),
    ...(inmuebles.data?.inmuebles ?? [])
      .filter((i) => i.id !== inmuebleActualId)
      .map((i) => ({ id: i.id, label: `${i.ref || "—"} · ${i.calle} ${i.numero || ""}` })),
  ];
  const cliList = [
    ...(clienteActualId && form.clienteId === clienteActualId
      ? [{ id: clienteActualId, label: visita.clientesNombres[0] ?? "—" }]
      : []),
    ...(clientes.data?.clientes ?? [])
      .filter((c) => c.id !== clienteActualId)
      .map((c) => ({ id: c.id, label: `${c.nombre}${c.telefono ? ` · ${c.telefono}` : ""}` })),
  ];

  const saveMut = useMutation({
    mutationFn: (payload: UpdateVisitaPayload) =>
      updateFn({ data: { ...payload, fecha: new Date(payload.fecha).toISOString() } }),
    onSuccess: () => {
      toast.success("Visita actualizada");
      qc.invalidateQueries({ queryKey: ["visitas-all"] });
      qc.invalidateQueries({ queryKey: ["visitas-by-inmueble"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo guardar"),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteFn({ data: { visitaId: visita.id } }),
    onSuccess: () => {
      toast.success("Visita eliminada");
      qc.invalidateQueries({ queryKey: ["visitas-all"] });
      qc.invalidateQueries({ queryKey: ["visitas-by-inmueble"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo eliminar"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar visita</DialogTitle>
          <DialogDescription>
            Cambia la fecha, el inmueble, el cliente o el agente.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveMut.mutate(form);
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
          <Field label="Agente">
            <select
              value={form.agenteId ?? ""}
              onChange={(e) => setForm({ ...form, agenteId: e.target.value || null })}
              className="h-9 px-3 rounded-md border border-input bg-background text-sm w-full"
            >
              <option value="">Sin agente</option>
              {(agentes.data?.agentes ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </Field>

          <div className="sm:col-span-2">
            <Field label="Inmueble *">
              <Input
                placeholder="Filtrar por ref/calle…"
                value={inmFilter}
                onChange={(e) => setInmFilter(e.target.value)}
                className="mb-2"
              />
              <MultiSelect
                options={inmList}
                value={form.inmuebleId ? [form.inmuebleId] : []}
                onChange={(v) => setForm({ ...form, inmuebleId: pickSingle(v) })}
              />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field label="Cliente">
              <Input
                placeholder="Filtrar por nombre/teléfono…"
                value={cliFilter}
                onChange={(e) => setCliFilter(e.target.value)}
                className="mb-2"
              />
              <MultiSelect
                options={cliList}
                value={form.clienteId ? [form.clienteId] : []}
                onChange={(v) => setForm({ ...form, clienteId: pickSingle(v) || null })}
              />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field label="Notas">
              <Textarea
                rows={2}
                value={form.notas ?? ""}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
              />
            </Field>
          </div>

          <DialogFooter className="sm:col-span-2 pt-2 flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="mr-auto text-destructive hover:text-destructive"
              disabled={deleteMut.isPending}
              onClick={() => {
                if (window.confirm("¿Eliminar esta visita? No se puede deshacer.")) {
                  deleteMut.mutate();
                }
              }}
            >
              {deleteMut.isPending ? (
                <Loader2 className="size-4 animate-spin mr-1.5" />
              ) : (
                <Trash2 className="size-4 mr-1.5" />
              )}
              Eliminar
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saveMut.isPending || !form.inmuebleId}>
              {saveMut.isPending && <Loader2 className="size-4 animate-spin mr-1.5" />}
              Guardar cambios
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
