// M-03: extraído de src/routes/contactos.index.tsx.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Phone,
  Mail,
  CalendarDays,
  Building2,
  ChevronRight,
  Loader2,
  ArrowUpRight,
  Archive,
} from "lucide-react";
import { SafeImage } from "@/components/SafeImage";
import {
  CanalChip,
  Transcripcion,
  inferCanal,
  hasSilviaConversation,
} from "@/components/silvia/conversation";
import { clienteDetailQuery } from "@/lib/queries";
import type { ClienteRow as ClienteRowType, Segmento } from "@/lib/clientes.functions";
import { actualizarCicloVida } from "@/lib/clientes-ciclo-vida.functions";
import { SEG_META, formatFechaCorta, initials } from "@/lib/contactos-format";

export function ClienteRow({ c, onClick }: { c: ClienteRowType; onClick: () => void }) {
  const segCfg = SEG_META[c.segmento as Segmento] ?? SEG_META.Lead;
  const Icon = segCfg.icon;
  return (
    <tr
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="border-b border-border hover:bg-muted/40 transition-colors cursor-pointer group"
    >
      <td className="py-3 pl-4 pr-2">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground group-hover:bg-background transition-colors">
            {initials(c.nombre) || "?"}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium truncate max-w-[200px]">{c.nombre || "—"}</div>
            {c.email && (
              <div className="text-xs text-muted-foreground truncate max-w-[180px]">{c.email}</div>
            )}
          </div>
        </div>
      </td>
      <td className="py-3 px-2 text-xs text-muted-foreground whitespace-nowrap">
        {c.telefono || "—"}
      </td>
      <td className="py-3 px-2">
        <span
          className={`inline-flex items-center gap-1 text-[10px] border rounded-full px-2 py-0.5 font-medium ${segCfg.chip}`}
        >
          <Icon className="size-3" />
          {segCfg.label.replace("s", "")}
        </span>
      </td>
      <td className="py-3 px-2 text-xs text-muted-foreground whitespace-nowrap">
        {formatFechaCorta(c.fecha)}
      </td>
      <td className="py-3 pl-2 pr-4 text-right">
        <div className="flex items-center justify-end gap-1.5">
          {c.inmueblesActivosCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
              <Building2 className="size-2.5" />
              {c.inmueblesActivosCount}
            </span>
          )}
          <ChevronRight className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </td>
    </tr>
  );
}

export function ClienteDetallePanel({ id }: { id: string }) {
  const qc = useQueryClient();
  const archivarFn = useServerFn(actualizarCicloVida);
  const { data: result, isFetching } = useQuery(clienteDetailQuery(id));

  const archivarMutation = useMutation({
    mutationFn: () => archivarFn({ data: { contactId: id, cicloVida: "Histórico" } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["cliente-detail", id] });
      await qc.invalidateQueries({ queryKey: ["contactos-page"] });
      toast.success("Contacto archivado — pásate a la pestaña Histórico para verlo o restaurarlo");
    },
    onError: () => toast.error("No se pudo archivar el contacto"),
  });

  if (isFetching) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const cliente = result?.cliente;
  if (!cliente) return <div className="text-sm text-muted-foreground p-4">No encontrado.</div>;

  const segCfg = SEG_META[cliente.segmento as keyof typeof SEG_META] ?? SEG_META.Lead;
  const canal = inferCanal(cliente);

  return (
    <div className="space-y-5 p-1">
      <div className="flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted text-base font-semibold">
          {initials(cliente.nombre) || "?"}
        </span>
        <div>
          <div className="text-base font-semibold">{cliente.nombre || "Sin nombre"}</div>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`inline-flex items-center gap-1 text-[11px] border rounded-full px-2 py-0.5 font-medium ${segCfg.chip}`}
            >
              <segCfg.icon className="size-3" />
              {segCfg.label.replace("s", "")}
            </span>
            {hasSilviaConversation(cliente) && <CanalChip canal={canal} />}
          </div>
        </div>
      </div>

      {/* Contacto */}
      <div className="space-y-1.5 text-sm">
        {cliente.telefono && (
          <a
            href={`tel:${cliente.telefono}`}
            className="flex items-center gap-2 text-foreground hover:text-primary"
          >
            <Phone className="size-4 text-muted-foreground" />
            {cliente.telefono}
          </a>
        )}
        {cliente.email && (
          <a
            href={`mailto:${cliente.email}`}
            className="flex items-center gap-2 text-foreground hover:text-primary"
          >
            <Mail className="size-4 text-muted-foreground" />
            {cliente.email}
          </a>
        )}
        {cliente.fecha && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <CalendarDays className="size-4" />
            Alta: {formatFechaCorta(cliente.fecha)}
          </div>
        )}
      </div>

      {/* Inmuebles vinculados */}
      {cliente.inmueblesVinculados.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Inmuebles
          </div>
          <div className="space-y-2">
            {cliente.inmueblesVinculados.map((inm) => (
              <Link
                key={inm.id}
                to="/inmuebles/$id"
                params={{ id: inm.id }}
                className="flex items-center gap-2 rounded-lg border border-border p-2 hover:border-foreground/30 transition-colors"
              >
                <div className="size-10 shrink-0 rounded bg-muted overflow-hidden">
                  <SafeImage src={inm.imagen} alt={inm.ref} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">
                    {inm.calle} {inm.numero}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {inm.rolTipo} · {inm.estatus}
                  </div>
                </div>
                <ArrowUpRight className="size-3.5 text-muted-foreground shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Motivo */}
      {cliente.motivo && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Motivo
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed">{cliente.motivo}</p>
        </div>
      )}

      {/* Transcripción SilvIA */}
      {cliente.conversaciones && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Conversación SilvIA
          </div>
          <div className="rounded-md bg-muted/40 border border-border p-3 max-h-60 overflow-auto">
            <Transcripcion text={cliente.conversaciones} />
          </div>
        </div>
      )}

      {/* M-05: archivar — no borra nada, solo saca al contacto de las vistas
          del día a día. Se restaura desde la pestaña Histórico. */}
      <div className="border-t border-border pt-4">
        <button
          type="button"
          disabled={archivarMutation.isPending}
          onClick={() => {
            if (
              confirm(
                `¿Archivar a ${cliente.nombre || "este contacto"}? Podrás restaurarlo después desde la pestaña Histórico.`,
              )
            ) {
              archivarMutation.mutate();
            }
          }}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-md px-2.5 py-1.5 transition-colors disabled:opacity-50"
        >
          <Archive className="size-3.5" />
          Archivar (mover a Histórico)
        </button>
      </div>
    </div>
  );
}
