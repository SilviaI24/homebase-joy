import { createLazyFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import {
  comerciablesInmueblesQuery,
  actividadInmueblesQuery,
  searchInmueblesQuery,
  agentesQuery,
  visitasQuery,
} from "@/lib/queries";
import { Users } from "lucide-react";
import { localDateStr, fmtDateCompact } from "@/lib/comerciales-format";
import {
  TODOS,
  SIN_ASIGNAR,
  AgenteSelector,
  GlobalSearch,
  AgendaHoy,
  AgenteCardHub,
  ActividadPanel,
  AgenteWorkspace,
  type AgenteHub,
  type VisitaRow,
  type ActividadEvt,
} from "@/components/comerciales/AgendaWorkspace";
import {
  NuevaVisitaDialog,
  NuevoClienteDialog,
  NuevaCaptacionDialog,
} from "@/components/comerciales/Dialogs";

export const Route = createLazyFileRoute("/comerciales/")({
  component: ComercialesPage,
});

const LS_KEY = "hub_agente";

// ── Page ──────────────────────────────────────────────────────────────────────

function ComercialesPage() {
  // Solo inmuebles Activo/Reservado (97 filas en producción, no las 5.817 de
  // la tabla): es lo único que consumen el directorio por agente (conteos +
  // listado) y el selector de "Nueva visita" — ver listComerciablesInmuebles.
  const { data: all } = useSuspenseQuery(comerciablesInmueblesQuery);
  // Feed aparte para "Actividad reciente": necesita captaciones/reservas/
  // cierres de CUALQUIER estatus (p. ej. una venta ya cerrada), así que no
  // puede salir del mismo universo Activo/Reservado — ver
  // listInmueblesActividadReciente.
  const { data: actividadData } = useSuspenseQuery(actividadInmueblesQuery);
  const { data: ag } = useSuspenseQuery(agentesQuery);
  const { data: vs } = useSuspenseQuery(visitasQuery);

  const inmuebles = all.inmuebles;
  const actividadInmuebles = actividadData.inmuebles;
  const visitas = vs.visitas as VisitaRow[];
  const agentes = ag.agentes;

  // Agent selector — persisted in localStorage
  const [selectedAgente, setSelectedAgente] = useState<string>(() => {
    try {
      return localStorage.getItem(LS_KEY) ?? TODOS;
    } catch {
      return TODOS;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, selectedAgente);
    } catch {
      // localStorage may be unavailable in private browsing — ignore silently
    }
  }, [selectedAgente]);

  const mailToNombre = useMemo(() => {
    const m = new Map<string, string>();
    agentes.forEach((a) => {
      if (a.mail) m.set(a.mail.toLowerCase(), a.nombre);
    });
    return m;
  }, [agentes]);

  const selectedMail = useMemo(() => {
    if (selectedAgente === TODOS) return null;
    return agentes.find((a) => a.nombre === selectedAgente)?.mail?.toLowerCase() ?? null;
  }, [selectedAgente, agentes]);

  // Agenda hoy
  const agendaHoy = useMemo(() => {
    const today = localDateStr(new Date());
    return visitas
      .filter((v) => {
        if (!v.fecha) return false;
        if (localDateStr(new Date(v.fecha)) !== today) return false;
        if (selectedMail) return v.agentesMails.some((m) => m.toLowerCase() === selectedMail);
        return true;
      })
      .sort((a, b) => new Date(a.fecha!).getTime() - new Date(b.fecha!).getTime());
  }, [visitas, selectedMail]);

  // Directorio
  const directorio = useMemo<AgenteHub[]>(() => {
    const now = new Date();
    const byNombre = new Map<string, AgenteHub>();

    agentes.forEach((a) => {
      byNombre.set(a.nombre, {
        id: a.id,
        nombre: a.nombre,
        mail: a.mail,
        activos: 0,
        reservados: 0,
        inmuebles: [],
        proximaVisita: null,
      });
    });

    inmuebles.forEach((i) => {
      const nombres = i.agentesNombres.length > 0 ? i.agentesNombres : [SIN_ASIGNAR];
      nombres.forEach((n) => {
        const key = n.trim() || SIN_ASIGNAR;
        let card = byNombre.get(key);
        if (!card) {
          card = {
            id: null,
            nombre: key,
            mail: "",
            activos: 0,
            reservados: 0,
            inmuebles: [],
            proximaVisita: null,
          };
          byNombre.set(key, card);
        }
        card.inmuebles.push(i);
        if (i.estatus === "Activo") card.activos++;
        if (i.estatus === "Reservado") card.reservados++;
      });
    });

    // Próxima visita por agente
    visitas
      .filter((v) => v.fecha && new Date(v.fecha) >= now)
      .sort((a, b) => new Date(a.fecha!).getTime() - new Date(b.fecha!).getTime())
      .forEach((v) => {
        v.agentesMails.forEach((mail) => {
          const nombre = mailToNombre.get(mail.toLowerCase());
          if (!nombre) return;
          const card = byNombre.get(nombre);
          if (card && !card.proximaVisita) {
            card.proximaVisita = {
              fecha: v.fecha!,
              calle: v.inmuebleCalles[0] ?? "Inmueble",
              numero: v.inmuebleNumeros[0] ?? "",
              clienteNombre: v.clientesNombres[0] ?? "",
            };
          }
        });
      });

    return Array.from(byNombre.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [agentes, inmuebles, visitas, mailToNombre]);

  // Actividad reciente — fuente acotada (ver actividadInmueblesQuery), no el
  // universo Activo/Reservado de arriba: un cierre reciente, por ejemplo,
  // corresponde a un inmueble ya Vendido/Alquilado.
  const actividad = useMemo(() => {
    const evts: ActividadEvt[] = [];
    actividadInmuebles.forEach((i) => {
      if (i.fechaInicio)
        evts.push({
          key: `c-${i.id}`,
          fecha: new Date(i.fechaInicio),
          tipo: "captacion",
          titulo: `Captación · ${i.calle} ${i.numero ?? ""}`.trim(),
          sub: i.localidad || "",
          agentes: i.agentesNombres,
          to: { id: i.id },
        });
      if (i.fechaReserva)
        evts.push({
          key: `r-${i.id}`,
          fecha: new Date(i.fechaReserva),
          tipo: "reserva",
          titulo: `Reserva · ${i.calle} ${i.numero ?? ""}`.trim(),
          sub: i.localidad || "",
          agentes: i.agentesNombres,
          to: { id: i.id },
        });
      if (i.fechaEscritura)
        evts.push({
          key: `e-${i.id}`,
          fecha: new Date(i.fechaEscritura),
          tipo: "cierre",
          titulo:
            `${i.estatus === "Alquilado" ? "Alquiler firmado" : "Escritura"} · ${i.calle} ${i.numero ?? ""}`.trim(),
          sub: i.localidad || "",
          agentes: i.agentesNombres,
          to: { id: i.id },
        });
    });
    visitas.forEach((v) => {
      if (!v.fecha) return;
      const nombres = v.agentesMails
        .map((m) => mailToNombre.get(m.toLowerCase()))
        .filter((n): n is string => !!n);
      evts.push({
        key: `v-${v.id}`,
        fecha: new Date(v.fecha),
        tipo: "visita",
        titulo:
          `Visita · ${v.inmuebleCalles[0] ?? "Inmueble"} ${v.inmuebleNumeros[0] ?? ""}`.trim(),
        sub: v.clientesNombres.join(", ") || v.estado,
        agentes: nombres,
        to: v.inmuebleIds[0] ? { id: v.inmuebleIds[0] } : undefined,
      });
    });
    evts.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
    return evts.slice(0, 30);
  }, [actividadInmuebles, visitas, mailToNombre]);

  // Workspace del agente seleccionado
  const agenteCard =
    selectedAgente !== TODOS ? (directorio.find((c) => c.nombre === selectedAgente) ?? null) : null;

  const proxVisitas = useMemo(() => {
    if (!selectedMail) return [];
    const now = new Date();
    return visitas
      .filter((v) => {
        if (!v.fecha) return false;
        const d = new Date(v.fecha);
        return d >= now && v.agentesMails.some((m) => m.toLowerCase() === selectedMail);
      })
      .sort((a, b) => new Date(a.fecha!).getTime() - new Date(b.fecha!).getTime())
      .slice(0, 12);
  }, [visitas, selectedMail]);

  const actividadAgente = useMemo(() => {
    if (selectedAgente === TODOS) return actividad;
    return actividad.filter((e) => e.agentes.includes(selectedAgente));
  }, [actividad, selectedAgente]);

  // Búsqueda global — inmuebles vía searchInmuebles (server-side, cualquier
  // estatus, mismo alcance de "solo venta" que tenía antes al leer de
  // all.inmuebles) en vez de escanear las 5.817 filas en memoria; mismo
  // patrón que AsociarInmuebleButton/NewVisitaDialog/Operaciones. Visitas
  // sigue siendo el array ya cargado (acotado a 6 meses, ver listVisitas).
  const [searchQ, setSearchQ] = useState("");
  const { data: searchInmData } = useQuery({
    ...searchInmueblesQuery({ q: searchQ, limit: 5, esAlquiler: false }),
    enabled: searchQ.trim().length >= 2,
  });
  const searchResults = useMemo(() => {
    if (searchQ.trim().length < 2) return [];
    const needle = searchQ.toLowerCase();
    const results: Array<{ type: "inmueble" | "visita"; id: string; label: string; sub: string }> =
      [];
    for (const i of searchInmData?.inmuebles ?? []) {
      results.push({
        type: "inmueble",
        id: i.id,
        label: `${i.calle} ${i.numero ?? ""}`.trim(),
        sub: `${i.localidad ?? ""} · ${i.estatus}`,
      });
      if (results.length >= 5) break;
    }
    for (const v of visitas) {
      if (!v.fecha) continue;
      const text = `${v.inmuebleCalles.join(" ")} ${v.clientesNombres.join(" ")}`.toLowerCase();
      if (text.includes(needle))
        results.push({
          type: "visita",
          id: v.id,
          label: `Visita · ${v.inmuebleCalles[0] ?? "Inmueble"}`,
          sub: `${v.clientesNombres[0] ?? "Sin cliente"} · ${fmtDateCompact(v.fecha)}`,
        });
      if (results.length >= 8) break;
    }
    return results;
  }, [searchQ, searchInmData, visitas]);

  return (
    <AppShell title="Gestión">
      {/* Barra de control: selector + búsqueda + acciones */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <AgenteSelector value={selectedAgente} onChange={setSelectedAgente} agentes={agentes} />
        <GlobalSearch q={searchQ} setQ={setSearchQ} results={searchResults} />
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <NuevaVisitaDialog inmuebles={inmuebles} agentes={agentes} />
          <NuevoClienteDialog agentes={agentes} />
          <NuevaCaptacionDialog agentes={agentes} />
        </div>
      </div>

      {/* Agenda hoy */}
      <AgendaHoy visitas={agendaHoy} selectedAgente={selectedAgente} />

      {/* Directorio (Todos) o Workspace (agente seleccionado) */}
      {selectedAgente === TODOS ? (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
          <div className="xl:col-span-3 rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Users className="size-4 text-muted-foreground" /> Directorio del equipo
                <span className="text-xs text-muted-foreground font-normal">
                  · {directorio.length} comerciales
                </span>
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
              {directorio.map((c) => (
                <AgenteCardHub key={c.nombre} card={c} />
              ))}
            </div>
          </div>
          <ActividadPanel actividad={actividad} label="Grupo" />
        </div>
      ) : agenteCard ? (
        <AgenteWorkspace card={agenteCard} proxVisitas={proxVisitas} actividad={actividadAgente} />
      ) : null}
    </AppShell>
  );
}
