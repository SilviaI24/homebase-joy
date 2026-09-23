import { createServerFn } from "@tanstack/react-start";
import { getSupa } from "./supabase.server";
import { toTitleCase } from "./format";
import { requireCrmUser, requirePermission } from "@/lib/crm-auth.server";
import { listarEventosGoogle, type EventoGoogle } from "./google-calendar.server";

export type GoogleCalendarStatus = {
  connected: boolean;
  email: string | null;
};

export const getGoogleCalendarStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<GoogleCalendarStatus> => {
    const crm = await requireCrmUser();
    if (!crm.agentId) return { connected: false, email: null };

    const supa = getSupa();
    const { data } = await supa
      .from("agent_google_tokens")
      .select("google_email")
      .eq("agent_id", crm.agentId)
      .maybeSingle();

    return { connected: !!data, email: data?.google_email ?? null };
  },
);

export const disconnectGoogleCalendar = createServerFn({ method: "POST" }).handler(async () => {
  const crm = await requireCrmUser();
  if (!crm.agentId) throw new Error("Tu usuario no tiene un agente asociado");

  const supa = getSupa();
  const { error } = await supa.from("agent_google_tokens").delete().eq("agent_id", crm.agentId);
  if (error) throw new Error(error.message);
  return { ok: true };
});

// ── Citas de Google en la Agenda del CRM (lectura Google -> CRM) ─────────────

export type CitaGoogle = EventoGoogle & {
  agenteId: string;
  agenteNombre: string;
  // Día en hora de Madrid (YYYY-MM-DD), para agrupar en el calendario sin
  // que una cita a las 00:30 caiga en el día anterior por estar en UTC.
  dia: string;
};

export type CitasGoogleMes = {
  citas: CitaGoogle[];
  agentesConectados: number;
  // Agentes con cuenta conectada cuya lectura falló (token revocado, API
  // caída) -- se avisa en la Agenda en vez de mostrar el mes "vacío".
  agentesConError: string[];
  // Visitas del CRM cuyo evento de Google tiene algún invitado que ha
  // rechazado: google_event_id -> quién. Esas citas no salen en `citas`
  // (ya son visita), pero el aviso de rechazo no se puede perder al
  // registrarlas.
  rechazosVisitas: Record<string, string[]>;
};

const TZ_OFICINA = "Europe/Madrid";

function diaEnMadrid(inicio: string, todoElDia: boolean): string {
  if (todoElDia) return inicio.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_OFICINA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(inicio));
}

export const listCitasGoogleMes = createServerFn({ method: "GET" })
  .validator((d: { mes: string }) => {
    if (!/^\d{4}-\d{2}$/.test(d?.mes ?? "")) throw new Error("mes inválido (YYYY-MM)");
    return d;
  })
  .handler(async ({ data }): Promise<CitasGoogleMes> => {
    await requirePermission("visits.read");
    const supa = getSupa();

    const { data: conexiones, error } = await supa
      .from("agent_google_tokens")
      .select("agent_id, agents(nombre)");
    if (error) throw new Error(error.message);
    // Supabase-js sin tipos generados infiere la relación como array; en
    // runtime PostgREST devuelve un objeto único (FK many-to-one).
    const filas = (conexiones ?? []) as unknown as Array<{
      agent_id: string;
      agents: { nombre: string | null } | null;
    }>;
    if (filas.length === 0)
      return { citas: [], agentesConectados: 0, agentesConError: [], rechazosVisitas: {} };

    // Margen de un día a cada lado del mes en UTC; el filtro fino por día se
    // hace después con la fecha ya pasada a hora de Madrid.
    const [y, m] = data.mes.split("-").map(Number);
    const timeMin = new Date(Date.UTC(y, m - 1, 1) - 86_400_000).toISOString();
    const timeMax = new Date(Date.UTC(y, m, 1) + 86_400_000).toISOString();

    const resultados = await Promise.all(
      filas.map(async (f) => ({
        fila: f,
        eventos: await listarEventosGoogle(f.agent_id, timeMin, timeMax),
      })),
    );

    const agentesConError: string[] = [];
    let citas: CitaGoogle[] = [];
    const rechazosVisitas: Record<string, string[]> = {};
    for (const { fila, eventos } of resultados) {
      const agenteNombre = toTitleCase(fila.agents?.nombre?.trim() ?? "") || "Agente";
      if (!eventos) {
        agentesConError.push(agenteNombre);
        continue;
      }
      for (const e of eventos) {
        const dia = diaEnMadrid(e.inicio, e.todoElDia);
        if (!dia.startsWith(data.mes)) continue;
        citas.push({ ...e, agenteId: fila.agent_id, agenteNombre, dia });
      }
    }

    // Fuera las que ya son una visita del CRM (creadas desde el CRM, o
    // registradas como visita desde la propia Agenda): ya se muestran como
    // visita, no se duplican.
    if (citas.length > 0) {
      const ids = [...new Set(citas.map((c) => c.id))];
      // Por tandas: .in() viaja en la URL de PostgREST y un mes con cientos
      // de eventos entre varios agentes la haría demasiado larga.
      const TANDA = 100;
      const yaVisita = new Set<string>();
      for (let i = 0; i < ids.length; i += TANDA) {
        const { data: enlazadas, error: errVis } = await supa
          .from("visits")
          .select("google_event_id")
          .in("google_event_id", ids.slice(i, i + TANDA));
        if (errVis) throw new Error(errVis.message);
        for (const v of enlazadas ?? []) yaVisita.add(v.google_event_id as string);
      }
      for (const c of citas) {
        if (yaVisita.has(c.id) && c.rechazadoPor.length > 0) rechazosVisitas[c.id] = c.rechazadoPor;
      }
      citas = citas.filter((c) => !yaVisita.has(c.id));
    }

    citas.sort((a, b) => a.inicio.localeCompare(b.inicio));
    return { citas, agentesConectados: filas.length, agentesConError, rechazosVisitas };
  });
