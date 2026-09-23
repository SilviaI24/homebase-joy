// M-03: extraído de src/components/CreateDialogs.tsx.
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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
import { createVisita, type CreateVisitaPayload } from "@/lib/mutations.functions";
import { agentesQuery, searchInmueblesQuery, searchClientesPickerQuery } from "@/lib/queries";
import { Field, MoreSection, MultiSelect, NewButton } from "@/components/create-dialogs/shared";

// Fecha ISO -> valor de <input type="datetime-local"> (hora local, sin zona).
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function NewVisitaDialog({
  defaultInmuebleId,
  defaultClienteId,
  defaultFecha,
  defaultAgenteId,
  defaultComentarios,
  googleEvento,
  trigger,
}: {
  defaultInmuebleId?: string;
  defaultClienteId?: string;
  // Prefill desde una cita de Google ("Registrar como visita" en la Agenda).
  defaultFecha?: string;
  defaultAgenteId?: string;
  defaultComentarios?: string;
  googleEvento?: { agenteId: string; eventId: string };
  trigger?: ReactNode;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(createVisita);
  const [open, setOpen] = useState(false);
  const agentes = useQuery({ ...agentesQuery, enabled: open });
  const [form, setForm] = useState<CreateVisitaPayload>({
    fecha: defaultFecha
      ? toDatetimeLocal(defaultFecha)
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
    estado: "Programada",
    inmueblesIds: defaultInmuebleId ? [defaultInmuebleId] : [],
    clientesIds: defaultClienteId ? [defaultClienteId] : [],
    agentesIds: defaultAgenteId ? [defaultAgenteId] : undefined,
    comentarios: defaultComentarios,
    googleEvento,
  });
  const [inmFilter, setInmFilter] = useState("");
  const [cliFilter, setCliFilter] = useState("");

  const mut = useMutation({
    mutationFn: (payload: CreateVisitaPayload) =>
      fn({ data: { ...payload, fecha: new Date(payload.fecha).toISOString() } }),
    onSuccess: () => {
      toast.success(googleEvento ? "Cita registrada como visita" : "Visita creada");
      qc.invalidateQueries({ queryKey: ["visitas-all"] });
      qc.invalidateQueries({ queryKey: ["citas-google"] });
      qc.invalidateQueries({ queryKey: ["visitas-by-inmueble"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo crear"),
  });

  // Búsqueda server-side con límite — antes cargaba las 5.817 filas de
  // allInmueblesQuery al navegador y filtraba/recortaba a 80 en memoria.
  const inmuebles = useQuery({
    ...searchInmueblesQuery({ q: inmFilter, limit: 80 }),
    enabled: open,
  });
  const inmList = (inmuebles.data?.inmuebles ?? []).map((i) => ({
    id: i.id,
    label: `${i.ref || "—"} · ${i.calle} ${i.numero || ""}`,
  }));

  // Búsqueda server-side con límite — antes cargaba clientesQueryOpts
  // completo (todos los Cliente/Prospecto, con el motor de matching
  // corriendo fila por fila) y filtraba/recortaba a 80 en memoria (auditoría
  // 12 sep 2026).
  const clientes = useQuery({
    ...searchClientesPickerQuery({ q: cliFilter, limit: 80 }),
    enabled: open,
  });
  const cliList = (clientes.data?.clientes ?? []).map((c) => ({
    id: c.id,
    label: `${c.nombre}${c.telefono ? ` · ${c.telefono}` : ""}`,
  }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : (
        <NewButton>Nueva visita</NewButton>
      )}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{googleEvento ? "Registrar como visita" : "Nueva visita"}</DialogTitle>
          <DialogDescription>
            {googleEvento
              ? "Vincula esta cita de Google Calendar a un inmueble y un cliente. La cita no se duplica en Google."
              : "Se guardará y aparecerá en el calendario."}
          </DialogDescription>
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
              value={form.estado ?? "Programada"}
              onChange={(e) => setForm({ ...form, estado: e.target.value })}
              className="h-9 px-3 rounded-md border border-input bg-background text-sm w-full"
            >
              {["Programada", "Realizada", "Cancelada"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
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
              {googleEvento ? "Registrar visita" : "Crear visita"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
