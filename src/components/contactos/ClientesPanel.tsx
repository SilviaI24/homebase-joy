// M-03: extraído de src/routes/contactos.index.tsx.
import { useEffect, useState } from "react";
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
  KeyRound,
} from "lucide-react";
import { SafeImage } from "@/components/SafeImage";
import {
  CanalChip,
  Transcripcion,
  inferCanal,
  hasSilviaConversation,
} from "@/components/silvia/conversation";
import { clienteDetailQuery } from "@/lib/queries";
import type {
  ClienteRow as ClienteRowType,
  MiniInmueble,
  Segmento,
} from "@/lib/clientes.functions";
import { actualizarCicloVida } from "@/lib/clientes-ciclo-vida.functions";
import {
  invitarPropietarioPortal,
  getRevisionPropietario,
  guardarDatosFirmaPropietario,
  actualizarEstadoDocumentoPropietario,
  activarPropietarioCrm,
} from "@/lib/mutations-cliente.functions";
import { SEG_META, formatFechaCorta, initials } from "@/lib/contactos-format";

// Botón "Dar acceso al portal": solo tiene sentido si el contacto es
// Propietario/Arrendador de al menos un inmueble (única forma de vincular
// propietario_inmueble hoy). Reusa el mismo patrón de mutación+confirm que
// "Archivar", más abajo en este archivo.
function DarAccesoPortalButton({
  contactId,
  propiedades,
}: {
  contactId: string;
  propiedades: MiniInmueble[];
}) {
  const invitarFn = useServerFn(invitarPropietarioPortal);
  const [propertyId, setPropertyId] = useState(propiedades[0]?.id ?? "");

  const mutation = useMutation({
    mutationFn: () => invitarFn({ data: { contactId, propertyId } }),
    onSuccess: (res) => {
      if (res.inviteSent) {
        toast.success("Invitación enviada — recibirá un email para activar su acceso al portal");
      } else if (res.yaExistia) {
        toast.success("Ya tenía acceso al portal — vinculado a este inmueble");
      } else {
        toast.error("Acceso creado, pero no se pudo enviar el email — compártelo manualmente");
      }
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo dar acceso al portal"),
  });

  return (
    <div className="border-t border-border pt-4 flex items-center gap-2">
      {propiedades.length > 1 && (
        <select
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value)}
          className="text-xs border border-border rounded-md px-2 py-1.5 bg-background text-foreground"
        >
          {propiedades.map((p) => (
            <option key={p.id} value={p.id}>
              {p.calle} {p.numero}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        disabled={mutation.isPending || !propertyId}
        onClick={() => mutation.mutate()}
        className="inline-flex items-center gap-1.5 text-xs text-foreground hover:text-primary border border-dashed border-border rounded-md px-2.5 py-1.5 transition-colors disabled:opacity-50"
      >
        {mutation.isPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <KeyRound className="size-3.5" />
        )}
        Dar acceso al portal
      </button>
    </div>
  );
}

// Revisión de documentación + activación — 17 sep 2026. Los comerciales
// trabajan siempre desde el CRM: esto reemplaza (para su uso diario) al
// panel admin del propio Portal (AdminPropietarios.tsx), que se deja
// intacto como camino secundario. Solo aparece si el contacto ya tiene
// acceso al portal (fila en `propietarios`) — antes de eso no hay nada
// que revisar.
function RevisionPropietarioPanel({ contactId }: { contactId: string }) {
  const qc = useQueryClient();
  const getRevisionFn = useServerFn(getRevisionPropietario);
  const guardarDatosFn = useServerFn(guardarDatosFirmaPropietario);
  const actualizarDocFn = useServerFn(actualizarEstadoDocumentoPropietario);
  const activarFn = useServerFn(activarPropietarioCrm);

  const { data, isLoading } = useQuery({
    queryKey: ["revision-propietario", contactId],
    queryFn: () => getRevisionFn({ data: { contactId } }),
  });

  const [dni, setDni] = useState("");
  const [domicilio, setDomicilio] = useState("");
  useEffect(() => {
    setDni(data?.dni ?? "");
    setDomicilio(data?.domicilio ?? "");
  }, [data]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["revision-propietario", contactId] });

  const guardarMutation = useMutation({
    mutationFn: () =>
      guardarDatosFn({ data: { propietarioId: data!.propietarioId, dni, domicilio } }),
    onSuccess: () => {
      toast.success("Datos guardados");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo guardar"),
  });

  const docMutation = useMutation({
    mutationFn: (vars: { documentoId: string; estado: "aprobado" | "rechazado" }) =>
      actualizarDocFn({ data: vars }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message || "No se pudo actualizar el documento"),
  });

  const activarMutation = useMutation({
    mutationFn: () => activarFn({ data: { propietarioId: data!.propietarioId } }),
    onSuccess: (res) => {
      toast.success(
        res.emailEnviado
          ? "Portal activado"
          : "Portal activado — el aviso por email falló, contacta manualmente",
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo activar"),
  });

  if (isLoading || !data) return null;

  const contratoLabel =
    data.contrato?.estado === "signed"
      ? "Firmado"
      : data.contrato
        ? "Pendiente de firma"
        : "No iniciado";

  return (
    <div className="border-t border-border pt-4 space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Revisión de documentación
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input
          value={dni}
          onChange={(e) => setDni(e.target.value)}
          placeholder="DNI del propietario"
          className="text-xs border border-border rounded-md px-2 py-1.5 bg-background text-foreground"
        />
        <input
          value={domicilio}
          onChange={(e) => setDomicilio(e.target.value)}
          placeholder="Domicilio"
          className="text-xs border border-border rounded-md px-2 py-1.5 bg-background text-foreground"
        />
      </div>
      <button
        type="button"
        disabled={guardarMutation.isPending}
        onClick={() => guardarMutation.mutate()}
        className="text-xs text-foreground hover:text-primary border border-dashed border-border rounded-md px-2.5 py-1.5 disabled:opacity-50"
      >
        Guardar DNI / domicilio
      </button>

      {data.docs.length > 0 && (
        <div className="space-y-1.5">
          {data.docs.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between gap-2 text-xs border border-border rounded-md px-2.5 py-1.5"
            >
              <span className="truncate">{doc.nombre}</span>
              {doc.estado === "aprobado" ? (
                <span className="text-success shrink-0">Aprobado</span>
              ) : doc.estado === "rechazado" ? (
                <span className="text-destructive shrink-0">Rechazado</span>
              ) : (
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => docMutation.mutate({ documentoId: doc.id, estado: "aprobado" })}
                    className="text-success hover:underline"
                  >
                    Aprobar
                  </button>
                  <button
                    type="button"
                    onClick={() => docMutation.mutate({ documentoId: doc.id, estado: "rechazado" })}
                    className="text-destructive hover:underline"
                  >
                    Rechazar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-xs border border-border rounded-md px-2.5 py-1.5">
        <span>Contrato de exclusividad</span>
        <span
          className={data.contrato?.estado === "signed" ? "text-success" : "text-muted-foreground"}
        >
          {contratoLabel}
        </span>
      </div>

      {data.estadoOnboarding === "activo" ? (
        <div className="text-xs text-success font-medium text-center py-1.5">Portal activo</div>
      ) : (
        <button
          type="button"
          disabled={activarMutation.isPending}
          onClick={() => activarMutation.mutate()}
          className="w-full text-xs font-semibold text-center rounded-md px-2.5 py-2 bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {activarMutation.isPending ? "Activando…" : "Activar acceso completo"}
        </button>
      )}
    </div>
  );
}

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
          className={`inline-flex items-center gap-1 text-xs border rounded-full px-2.5 py-1 font-medium ${segCfg.chip}`}
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
            <span className="inline-flex items-center gap-0.5 text-xs bg-primary/10 text-primary px-2 py-1 rounded">
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
  const propiedadesEnPropiedad = cliente.inmueblesVinculados.filter(
    (i) => i.rolTipo === "Propietario" || i.rolTipo === "Arrendador",
  );

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
              className={`inline-flex items-center gap-1 text-xs border rounded-full px-2.5 py-1 font-medium ${segCfg.chip}`}
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

      {cliente.email && propiedadesEnPropiedad.length > 0 && (
        <DarAccesoPortalButton contactId={cliente.id} propiedades={propiedadesEnPropiedad} />
      )}
      {propiedadesEnPropiedad.length > 0 && <RevisionPropietarioPanel contactId={cliente.id} />}

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
