// M-03: extraído de src/routes/bandeja.index.tsx. Tarjeta de una
// conversación en el feed de la Bandeja. Recibe todo por props — el estado
// compartido entre tarjetas (expandido, archivado, cualificado, routing,
// respuesta WhatsApp) vive en BandejaPage.
import {
  Phone,
  Mail,
  CalendarDays,
  Tag,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Building2,
  MapPin,
  Euro,
  ArrowRight,
  UserCheck,
  Archive,
  Home,
  KeyRound,
  Search,
  Send,
  Loader2,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { CanalChip, Transcripcion, type Canal } from "@/components/silvia/conversation";
import { AsignarLeadButton } from "@/components/AsignarLeadButton";
import { MencionadoCard } from "@/components/bandeja/MencionadoCard";
import type { Inmueble } from "@/lib/inmuebles.functions";
import type { ConversacionIa } from "@/lib/clientes-conversaciones.functions";
import { cleanRef } from "@/lib/format";
import { formatFecha, moneyShort } from "@/lib/bandeja-format";

export function ConversationCard({
  cliente: c,
  canal,
  mencionados,
  isOpen,
  isArchived,
  isCualified,
  routingActive,
  replyOpenActive,
  replyText,
  replySendingActive,
  onToggleExpand,
  onArchivar,
  onStartRouting,
  onCancelRouting,
  onRoute,
  onToggleReply,
  onReplyTextChange,
  onSendReply,
  onVinculado,
}: {
  cliente: ConversacionIa;
  canal: Canal;
  mencionados: Inmueble[];
  isOpen: boolean;
  isArchived: boolean;
  isCualified: boolean;
  routingActive: boolean;
  replyOpenActive: boolean;
  replyText: string;
  replySendingActive: boolean;
  onToggleExpand: () => void;
  onArchivar: () => void;
  onStartRouting: () => void;
  onCancelRouting: () => void;
  onRoute: (tipo: "captacion" | "compra" | "alquiler") => void;
  onToggleReply: () => void;
  onReplyTextChange: (v: string) => void;
  onSendReply: () => void;
  onVinculado: () => void;
}) {
  return (
    <article
      className={`rounded-lg border bg-card transition-colors ${
        isArchived
          ? "border-border opacity-60"
          : isCualified
            ? "border-success/40"
            : "border-border hover:border-foreground/20"
      }`}
    >
      {/* Header tarjeta */}
      <header className="flex items-start justify-between gap-3 p-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/30 text-primary text-sm font-semibold">
            {c.nombre.charAt(0).toUpperCase() || "?"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-sm truncate">{c.nombre || "Sin nombre"}</span>
              <CanalChip canal={canal} />
              {isCualified && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-success bg-success/10 px-1.5 py-0.5 rounded">
                  <UserCheck className="size-3" /> Cualificado
                </span>
              )}
              {isArchived && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  <Archive className="size-3" /> Archivado
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {c.telefono && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="size-3" />
                  {c.telefono}
                </span>
              )}
              {c.email && (
                <span className="inline-flex items-center gap-1 truncate max-w-[200px]">
                  <Mail className="size-3" />
                  <span>{c.email.trim()}</span>
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3" />
                {formatFecha(c.fecha)}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Motivo (siempre visible, resumen) */}
      {c.motivo && (
        <div className="px-4 pb-3">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            Motivo
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">{c.motivo}</p>
        </div>
      )}

      {/* Datos extraídos */}
      {(c.categoria.length > 0 || c.solicitud) && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {c.categoria.map((cat) => (
            <span
              key={cat}
              className="inline-flex items-center gap-1 text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded-full"
            >
              <Tag className="size-3" />
              {cat}
            </span>
          ))}
          {c.solicitud && (
            <span className="text-xs text-muted-foreground italic">
              “{c.solicitud.slice(0, 100)}
              {c.solicitud.length > 100 ? "…" : ""}”
            </span>
          )}
        </div>
      )}

      {/* Transcripción colapsable */}
      {c.conversaciones && (
        <div className="px-4 pb-3">
          <button
            onClick={onToggleExpand}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            {isOpen ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            {isOpen ? "Ocultar transcripción" : "Ver transcripción"}
          </button>
          {isOpen && (
            <div className="mt-2 rounded-md bg-muted/40 border border-border p-3 max-h-96 overflow-auto">
              <Transcripcion text={c.conversaciones} />
            </div>
          )}
        </div>
      )}

      {/* Inmuebles mencionados en la conversación */}
      {mencionados.length > 0 && (
        <div className="px-4 pb-3 border-t border-border pt-3">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
            <MessageSquare className="size-3 text-primary" />
            Inmuebles mencionados ({mencionados.length})
            <span className="ml-auto text-xs text-muted-foreground font-normal">
              {c.etapa === "Lead"
                ? "Confirma el vínculo para mover a Clientes"
                : "Referencias detectadas en la conversación"}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {mencionados.map((inm) => (
              <MencionadoCard
                key={inm.id}
                inm={inm}
                contactId={c.id}
                clienteNombre={c.nombre}
                readOnly={c.etapa !== "Lead"}
                onVinculado={onVinculado}
              />
            ))}
          </div>
        </div>
      )}

      {/* Matches de propiedades */}
      {c.matches.length > 0 && (
        <div className="px-4 pb-3 border-t border-border pt-3">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
            <MessageSquare className="size-3 text-primary" />
            Posibles matches ({c.matches.length})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {c.matches.slice(0, 4).map((m) => (
              <Link
                key={m.inmueble.id}
                to="/inmuebles/$id"
                params={{ id: m.inmueble.id }}
                className="group flex items-start gap-2 rounded-md border border-border bg-background p-2 hover:border-foreground/30 transition-colors"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded bg-muted">
                  <Building2 className="size-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">
                    {cleanRef(m.inmueble.ref)} · {m.inmueble.calle} {m.inmueble.numero}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <MapPin className="size-3" /> {m.inmueble.barrio || m.inmueble.localidad}
                    <Euro className="size-3 ml-1" />
                    {moneyShort(m.inmueble.precioFinal ?? m.inmueble.precio)}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {m.razones.slice(0, 2).map((r, i) => (
                      <span
                        key={i}
                        className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
                <ArrowRight className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity self-center" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Panel respuesta WhatsApp */}
      {canal === "WhatsApp" && c.telefono && replyOpenActive && (
        <div className="px-4 py-3 border-t border-border">
          <div className="flex gap-2 items-start">
            <textarea
              value={replyText}
              onChange={(e) => onReplyTextChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  onSendReply();
                }
              }}
              placeholder={`Responder a ${c.nombre || c.telefono}…`}
              rows={2}
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
            <button
              type="button"
              disabled={!replyText.trim() || replySendingActive}
              onClick={onSendReply}
              className="h-9 px-3 rounded-lg text-white text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50 transition-opacity shrink-0"
              style={{ backgroundColor: "#25D366" }}
            >
              {replySendingActive ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
              Enviar
            </button>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            ⌘↵ para enviar · Solo disponible dentro de la ventana de 24 h de WhatsApp
          </p>
        </div>
      )}

      {/* Acciones */}
      <footer className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-t border-border bg-muted/20 rounded-b-lg">
        <span className="text-xs text-muted-foreground">
          {c.etapa === "Lead" ? "Gestión manual del lead" : `Contacto · ${c.etapa}`}
        </span>
        <div className="flex items-center gap-1.5">
          {routingActive ? (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-xs text-muted-foreground mr-0.5">¿Tipo?</span>
              <button
                onClick={() => onRoute("captacion")}
                className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-info/10 text-info hover:bg-info/20 cursor-pointer transition-colors"
              >
                <Home className="size-3" /> Vende / valora
              </button>
              <button
                onClick={() => onRoute("compra")}
                className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-warning/10 text-warning hover:bg-warning/20 cursor-pointer transition-colors"
              >
                <Search className="size-3" /> Busca comprar
              </button>
              <button
                onClick={() => onRoute("alquiler")}
                className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-brand-green/10 text-brand-green hover:bg-brand-green/20 cursor-pointer transition-colors"
              >
                <KeyRound className="size-3" /> Busca alquilar
              </button>
              <button
                onClick={onCancelRouting}
                className="text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
          ) : (
            c.etapa === "Lead" &&
            !isCualified && (
              <button
                onClick={onStartRouting}
                className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md bg-success/10 text-success hover:bg-success/20 cursor-pointer transition-colors"
              >
                <UserCheck className="size-3" /> Cualificar
              </button>
            )
          )}
          {c.etapa === "Lead" && (
            <AsignarLeadButton clienteId={c.id} agentesActuales={c.agentesIds} />
          )}

          {canal === "WhatsApp" && c.telefono && (
            <button
              onClick={onToggleReply}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer shadow-sm active:scale-95"
              style={
                replyOpenActive
                  ? {
                      background: "transparent",
                      color: "#128C7E",
                      border: "1.5px solid #25D36640",
                    }
                  : {
                      background: "#25D366",
                      color: "#fff",
                      border: "1.5px solid #20bc5a",
                    }
              }
            >
              <MessageSquare className="size-3.5" />
              {replyOpenActive ? "Cerrar respuesta" : "Responder por WhatsApp"}
            </button>
          )}
          {c.etapa === "Lead" && !isArchived && (
            <button
              onClick={onArchivar}
              className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
            >
              <Archive className="size-3" /> Archivar
            </button>
          )}
        </div>
      </footer>
    </article>
  );
}
