// Citas que existen solo en Google Calendar, mostradas en la Agenda junto a
// las visitas del CRM (lectura Google -> CRM, 23 sep 2026). El equipo sigue
// agendando en Google; cada cita lleva un "Registrar como visita" para
// pasarla al CRM con su inmueble y cliente -- el puente para que el trabajo
// acabe viviendo aquí sin obligar a nadie a cambiar de golpe.
import type { ReactNode } from "react";
import { CalendarPlus, ExternalLink, Lock, MapPin, User, UserX } from "lucide-react";
import { NewVisitaDialog } from "@/components/create-dialogs/NewVisitaDialog";
import type { CitaGoogle } from "@/lib/google-calendar.functions";

function horaCita(c: CitaGoogle): string {
  if (c.todoElDia) return "Todo el día";
  try {
    return new Date(c.inicio).toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function textoRechazo(nombres: string[]): string {
  return `Rechazada por ${nombres.join(", ")}`;
}

// Aviso de que un invitado (normalmente el cliente) ha rechazado la cita en
// Google -- información comercial que antes se perdía: el comercial debería
// llamarle o anular la cita. Se usa tanto en citas "Solo en Google" como en
// visitas del CRM enlazadas a un evento de Google.
export function RechazoBadge({ nombres }: { nombres: string[] }) {
  if (nombres.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded font-medium text-destructive bg-destructive/10">
      <UserX className="size-3" aria-hidden />
      {textoRechazo(nombres)}
    </span>
  );
}

// Versión mínima para la cuadrícula del calendario: solo icono, con el
// texto completo como etiqueta accesible.
export function RechazoIcono({ nombres }: { nombres: string[] }) {
  if (nombres.length === 0) return null;
  return (
    <UserX
      className="size-3 shrink-0 text-destructive"
      aria-label={textoRechazo(nombres)}
      role="img"
    />
  );
}

function RegistrarVisita({ cita, trigger }: { cita: CitaGoogle; trigger: ReactNode }) {
  const comentarios = cita.privado
    ? undefined
    : [cita.titulo, cita.ubicacion].filter(Boolean).join(" · ");
  return (
    <NewVisitaDialog
      trigger={trigger}
      // Una cita de día completo no tiene hora: se propone las 10:00 de ese día.
      defaultFecha={cita.todoElDia ? `${cita.dia}T10:00:00` : cita.inicio}
      defaultAgenteId={cita.agenteId}
      defaultComentarios={comentarios}
      googleEvento={{ agenteId: cita.agenteId, eventId: cita.id }}
    />
  );
}

// Entrada compacta para la cuadrícula del calendario mensual. Estilo
// discontinuo a propósito: se distingue de un vistazo de una visita real.
export function CitaGoogleChip({ cita }: { cita: CitaGoogle }) {
  return (
    <RegistrarVisita
      cita={cita}
      trigger={
        <button
          type="button"
          className="w-full flex items-center gap-1 rounded border border-dashed border-info/50 px-1 py-0.5 text-left text-[11px] leading-tight text-muted-foreground hover:bg-accent transition-colors"
          title={`Solo en Google Calendar (${cita.agenteNombre}): ${cita.titulo}.${cita.rechazadoPor.length ? ` ${textoRechazo(cita.rechazadoPor)}.` : ""} Pulsa para registrarla como visita.`}
        >
          {cita.privado ? (
            <Lock className="size-2.5 shrink-0" aria-hidden />
          ) : (
            <span className="size-1.5 rounded-full shrink-0 bg-info" aria-hidden />
          )}
          <span className="tabular-nums shrink-0">{cita.todoElDia ? "Día" : horaCita(cita)}</span>
          <span className="truncate">{cita.titulo}</span>
          <RechazoIcono nombres={cita.rechazadoPor} />
        </button>
      }
    />
  );
}

// Tarjeta para la vista de lista.
export function CitaGoogleCard({ cita }: { cita: CitaGoogle }) {
  return (
    <div className="rounded-xl border border-dashed border-info/50 bg-card p-4 flex flex-wrap items-start gap-4">
      <div className="pt-0.5 flex flex-col items-start gap-1">
        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded font-medium text-info bg-info/10">
          Solo en Google
        </span>
        <RechazoBadge nombres={cita.rechazadoPor} />
      </div>

      <div className="flex-1 min-w-[180px]">
        <div className="flex items-center gap-1 text-sm font-medium">
          {cita.privado && <Lock className="size-3 text-muted-foreground" aria-hidden />}
          <span className="tabular-nums text-muted-foreground mr-1">{horaCita(cita)}</span>
          {cita.titulo}
        </div>
        {cita.ubicacion && (
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3" aria-hidden />
            {cita.ubicacion}
          </p>
        )}
      </div>

      <div className="min-w-[120px] flex items-center gap-1 text-xs text-muted-foreground">
        <User className="size-3" aria-hidden />
        {cita.agenteNombre}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {cita.enlace && (
          <a
            href={cita.enlace}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1.5 rounded-md text-muted-foreground hover:bg-accent transition-colors"
            title="Abrir en Google Calendar"
            aria-label="Abrir en Google Calendar"
          >
            <ExternalLink className="size-3.5" />
          </a>
        )}
        <RegistrarVisita
          cita={cita}
          trigger={
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1.5 rounded-md border border-border hover:bg-accent transition-colors"
            >
              <CalendarPlus className="size-3.5" aria-hidden />
              Registrar como visita
            </button>
          }
        />
      </div>
    </div>
  );
}
