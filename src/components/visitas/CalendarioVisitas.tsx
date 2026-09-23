// Vista de calendario mensual para la Agenda (punto 8 de la reunión de
// comerciales, sep 2026). Cuadrícula real de mes en vez de solo lista
// agrupada por día -- reutiliza el mismo array ya filtrado por
// estado/agente/búsqueda que la vista de lista, así ambas vistas muestran
// siempre lo mismo.
import { EditVisitaDialog } from "@/components/visitas/EditVisitaDialog";
import type { VisitaFull } from "@/lib/visitas.functions";
import type { CitaGoogle } from "@/lib/google-calendar.functions";
import { CitaGoogleChip, RechazoIcono } from "@/components/visitas/CitaGoogle";

const ESTADO_DOT: Record<string, string> = {
  Programada: "bg-warning",
  Realizada: "bg-success",
  Cancelada: "bg-slate-400",
};

const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const MAX_VISIBLE = 3;

function horaCorta(fecha: string | null): string {
  if (!fecha) return "";
  try {
    return new Date(fecha).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function tituloVisita(v: VisitaFull): string {
  return v.clientesNombres[0] || v.inmuebleCalles[0] || "Visita";
}

type Celda = { fecha: string; dia: number; esDelMes: boolean };

function construirCeldas(mesActual: string): Celda[] {
  const [y, m] = mesActual.split("-").map(Number);
  const primerDia = new Date(y, m - 1, 1);
  // getDay(): 0=domingo..6=sábado -> desplazamos para que la semana empiece en lunes.
  const offset = (primerDia.getDay() + 6) % 7;
  const diasEnMes = new Date(y, m, 0).getDate();
  const diasMesAnterior = new Date(y, m - 1, 0).getDate();

  const celdas: Celda[] = [];
  for (let i = offset - 1; i >= 0; i--) {
    const dia = diasMesAnterior - i;
    celdas.push({ fecha: "", dia, esDelMes: false });
  }
  for (let dia = 1; dia <= diasEnMes; dia++) {
    const fecha = `${y}-${String(m).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    celdas.push({ fecha, dia, esDelMes: true });
  }
  while (celdas.length % 7 !== 0) {
    celdas.push({ fecha: "", dia: celdas.length, esDelMes: false });
  }
  return celdas;
}

type ItemDia =
  | { tipo: "visita"; v: VisitaFull; orden: string }
  | { tipo: "google"; c: CitaGoogle; orden: string };

export function CalendarioVisitas({
  mesActual,
  visitas,
  citasGoogle = [],
  rechazosVisitas = {},
}: {
  mesActual: string;
  visitas: VisitaFull[];
  // Citas que solo existen en Google Calendar -- se pintan en la misma
  // cuadrícula, con estilo distinto (ver CitaGoogleChip).
  citasGoogle?: CitaGoogle[];
  // google_event_id -> invitados que han rechazado (ver listCitasGoogleMes).
  rechazosVisitas?: Record<string, string[]>;
}) {
  const porDia = new Map<string, ItemDia[]>();
  const push = (dia: string, item: ItemDia) => {
    if (!porDia.has(dia)) porDia.set(dia, []);
    porDia.get(dia)!.push(item);
  };
  for (const v of visitas) {
    const dia = (v.fecha ?? "").slice(0, 10);
    if (!dia) continue;
    push(dia, { tipo: "visita", v, orden: v.fecha ?? "" });
  }
  for (const c of citasGoogle) {
    // Día completo primero, antes que cualquier cita con hora.
    push(c.dia, { tipo: "google", c, orden: c.todoElDia ? "" : new Date(c.inicio).toISOString() });
  }
  for (const lista of porDia.values()) {
    lista.sort((a, b) => a.orden.localeCompare(b.orden));
  }

  const celdas = construirCeldas(mesActual);
  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border bg-muted/30">
        {DIAS_SEMANA.map((d) => (
          <div
            key={d}
            className="py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {celdas.map((c, i) => {
          const visitasDia = c.fecha ? (porDia.get(c.fecha) ?? []) : [];
          const esHoy = c.fecha === hoy;
          return (
            <div
              key={i}
              className={`min-h-[104px] border-b border-r border-border p-1.5 last:border-r-0 [&:nth-child(7n)]:border-r-0 ${
                c.esDelMes ? "bg-card" : "bg-muted/20"
              }`}
            >
              <div
                className={`text-xs mb-1 inline-flex size-5 items-center justify-center rounded-full font-medium ${
                  esHoy
                    ? "bg-primary text-primary-foreground"
                    : c.esDelMes
                      ? "text-foreground"
                      : "text-muted-foreground/50"
                }`}
              >
                {c.dia}
              </div>
              <div className="space-y-1">
                {visitasDia.slice(0, MAX_VISIBLE).map((item) => {
                  if (item.tipo === "google") {
                    return (
                      <CitaGoogleChip key={`g-${item.c.agenteId}-${item.c.id}`} cita={item.c} />
                    );
                  }
                  const v = item.v;
                  return (
                    <EditVisitaDialog
                      key={v.id}
                      visita={v}
                      trigger={
                        <button
                          type="button"
                          className="w-full flex items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] leading-tight hover:bg-accent transition-colors"
                          title={tituloVisita(v)}
                        >
                          <span
                            className={`size-1.5 rounded-full shrink-0 ${ESTADO_DOT[v.estado] ?? "bg-muted-foreground"}`}
                          />
                          <span className="text-muted-foreground tabular-nums shrink-0">
                            {horaCorta(v.fecha)}
                          </span>
                          <span className="truncate">{tituloVisita(v)}</span>
                          {v.estado !== "Cancelada" && (
                            <RechazoIcono
                              nombres={(v.googleEventId && rechazosVisitas[v.googleEventId]) || []}
                            />
                          )}
                        </button>
                      }
                    />
                  );
                })}
                {visitasDia.length > MAX_VISIBLE && (
                  <div className="px-1 text-[11px] text-muted-foreground">
                    +{visitasDia.length - MAX_VISIBLE} más
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
