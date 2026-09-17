import { createServerFn } from "@tanstack/react-start";
import { getSupa } from "./supabase.server";
import { toTitleCase } from "./format";
import { cleanRef } from "./format";
import { requirePermissions } from "@/lib/crm-auth.server";

export type Notif = {
  id: string;
  tipo:
    | "visita_hoy"
    | "propiedad_estancada"
    | "reserva_larga"
    | "lead_nuevo"
    | "solicitud_portal"
    | "documento_portal"
    | "propietario_en_revision";
  prioridad: "urgente" | "atencion" | "info";
  titulo: string;
  detalle: string;
  href?: string;
};

export type NotificationsResult = {
  notifs: Notif[];
  urgente: number;
  atencion: number;
  info: number;
  total: number;
};

export const getNotifications = createServerFn({ method: "GET" }).handler(
  async (): Promise<NotificationsResult> => {
    await requirePermissions("contacts.read", "properties.read", "visits.read");
    const supa = getSupa();
    const today = new Date().toISOString().slice(0, 10);

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const d90 = ninetyDaysAgo.toISOString().slice(0, 10);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const d30 = thirtyDaysAgo.toISOString().slice(0, 10);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const d1 = yesterday.toISOString();

    const [
      visitasRes,
      estancadasRes,
      reservasRes,
      leadsRes,
      solicitudesRes,
      documentosRes,
      revisionRes,
    ] = await Promise.all([
      // Visitas confirmadas para hoy
      supa
        .from("visits")
        .select("id, fecha, estado, notas, properties(calle, ref), contacts(nombre)")
        .eq("fecha", today)
        .in("estado", ["Programada", "Confirmada"]),

      // Propiedades de venta activas >90 días sin cambio
      supa
        .from("properties")
        .select("id, ref, calle, barrio, fecha_inicio, created_at")
        .eq("estatus", "Activo")
        .not("es_alquiler", "eq", true)
        .lte("fecha_inicio", d90)
        .order("fecha_inicio", { ascending: true })
        .limit(10),

      // Reservas >30 días sin escritura
      supa
        .from("properties")
        .select("id, ref, calle, fecha_reserva")
        .eq("estatus", "Reservado")
        .lte("fecha_reserva", d30)
        .order("fecha_reserva", { ascending: true })
        .limit(10),

      // Nuevos leads/prospectos últimas 24h
      supa
        .from("contacts")
        .select("id, nombre, canal_origen, created_at")
        .in("ciclo_vida", ["Lead", "Prospecto"])
        .gte("created_at", d1)
        .order("created_at", { ascending: false })
        .limit(15),

      // Solicitudes de servicio nuevas desde el Portal del propietario
      supa
        .from("solicitudes_servicio")
        .select("id, tipo, contact_id, created_at, contacts(nombre)")
        .eq("estado", "nueva")
        .order("created_at", { ascending: false })
        .limit(10),

      // Documentos subidos por el propietario desde el Portal, pendientes de
      // revisión (los que sube el propio operario ya entran como
      // estado='aprobado', no aparecen aquí).
      supa
        .from("documentos")
        .select("id, nombre, categoria, contact_id, created_at, contacts(nombre)")
        .in("estado", ["pendiente", "revision"])
        .not("contact_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(10),

      // Propietarios que enviaron su onboarding a revisión — el comercial
      // activa el acceso completo desde la ficha del cliente (17 sep 2026).
      supa
        .from("propietarios")
        .select("id, nombre, contact_id, updated_at")
        .eq("estado_onboarding", "en_revision")
        .order("updated_at", { ascending: false })
        .limit(10),
    ]);

    const notifs: Notif[] = [];

    // Supabase-js sin tipos de Database generados infiere las relaciones
    // (properties/contacts) como array por defecto; en runtime PostgREST
    // devuelve un objeto único (FK many-to-one) — se corrige con el cast
    // explícito en cada bloque.

    // ── Visitas hoy (urgente) ─────────────────────────────────────────────────
    const visitasRows = (visitasRes.data ?? []) as unknown as Array<{
      id: string;
      estado: string | null;
      properties: { calle: string | null; ref: string | null } | null;
      contacts: { nombre: string | null } | null;
    }>;
    for (const v of visitasRows) {
      const calle = v.properties ? toTitleCase(v.properties.calle ?? "") : "Inmueble";
      const cliente = v.contacts ? toTitleCase(v.contacts.nombre ?? "") : "Cliente";
      const estado = v.estado === "Confirmada" ? "Confirmada" : "Pendiente";
      notifs.push({
        id: `visita-${v.id}`,
        tipo: "visita_hoy",
        prioridad: "urgente",
        titulo: `Visita hoy — ${calle}`,
        detalle: `${cliente} · ${estado}`,
        href: "/visitas",
      });
    }

    // ── Propiedades estancadas (atención) ────────────────────────────────────
    const estancadasRows = (estancadasRes.data ?? []) as Array<{
      id: string;
      ref: string | null;
      calle: string | null;
      fecha_inicio: string | null;
      created_at: string;
    }>;
    for (const p of estancadasRows) {
      const ref = cleanRef(p.ref ?? "");
      const calle = toTitleCase(p.calle ?? "");
      const inicio = p.fecha_inicio ?? p.created_at?.slice(0, 10);
      const dias = inicio ? Math.floor((Date.now() - new Date(inicio).getTime()) / 86_400_000) : 0;
      notifs.push({
        id: `estancada-${p.id}`,
        tipo: "propiedad_estancada",
        prioridad: "atencion",
        titulo: `${ref} — ${calle}`,
        detalle: `${dias} días sin movimiento`,
        href: "/inmuebles",
      });
    }

    // ── Reservas largas (atención) ───────────────────────────────────────────
    const reservasRows = (reservasRes.data ?? []) as Array<{
      id: string;
      ref: string | null;
      calle: string | null;
      fecha_reserva: string | null;
    }>;
    for (const p of reservasRows) {
      const ref = cleanRef(p.ref ?? "");
      const calle = toTitleCase(p.calle ?? "");
      const desde = p.fecha_reserva;
      const dias = desde ? Math.floor((Date.now() - new Date(desde).getTime()) / 86_400_000) : 0;
      notifs.push({
        id: `reserva-${p.id}`,
        tipo: "reserva_larga",
        prioridad: "atencion",
        titulo: `${ref} — Reservado ${dias}d`,
        detalle: `${calle} · Pendiente escritura`,
        href: "/inmuebles",
      });
    }

    // ── Nuevos leads/prospectos (info) ────────────────────────────────────────
    const leadsRows = (leadsRes.data ?? []) as Array<{
      id: string;
      nombre: string | null;
      canal_origen: string | null;
      created_at: string;
    }>;
    for (const c of leadsRows) {
      const nombre = toTitleCase(c.nombre ?? "Contacto");
      const canal = c.canal_origen ?? "Desconocido";
      notifs.push({
        id: `lead-${c.id}`,
        tipo: "lead_nuevo",
        prioridad: "info",
        titulo: nombre,
        detalle: `Nuevo lead · ${canal}`,
        href: "/mis-leads",
      });
    }

    // ── Solicitudes del portal del propietario (atención) ───────────────────
    const solicitudesRows = (solicitudesRes.data ?? []) as unknown as Array<{
      id: string;
      tipo: string | null;
      contact_id: string | null;
      created_at: string;
      contacts: { nombre: string | null } | null;
    }>;
    for (const s of solicitudesRows) {
      const cliente = s.contacts ? toTitleCase(s.contacts.nombre ?? "") : "Propietario";
      notifs.push({
        id: `solicitud-${s.id}`,
        tipo: "solicitud_portal",
        prioridad: "atencion",
        titulo: `Solicitud de servicio · ${toTitleCase(s.tipo ?? "")}`,
        detalle: `${cliente} · Portal del propietario`,
        href: s.contact_id ? `/contactos?id=${s.contact_id}` : "/contactos",
      });
    }

    // ── Documentos subidos por el propietario (atención) ────────────────────
    const documentosRows = (documentosRes.data ?? []) as unknown as Array<{
      id: string;
      nombre: string | null;
      categoria: string | null;
      contact_id: string | null;
      created_at: string;
      contacts: { nombre: string | null } | null;
    }>;
    for (const d of documentosRows) {
      const cliente = d.contacts ? toTitleCase(d.contacts.nombre ?? "") : "Propietario";
      notifs.push({
        id: `documento-${d.id}`,
        tipo: "documento_portal",
        prioridad: "atencion",
        titulo: `Documento pendiente de revisión`,
        detalle: `${cliente} · ${d.nombre ?? d.categoria ?? "Documento"}`,
        href: d.contact_id ? `/contactos?id=${d.contact_id}` : "/contactos",
      });
    }

    // ── Propietarios pendientes de revisión (atención) ──────────────────────
    const revisionRows = (revisionRes.data ?? []) as Array<{
      id: string;
      nombre: string | null;
      contact_id: string | null;
      updated_at: string;
    }>;
    for (const p of revisionRows) {
      notifs.push({
        id: `revision-propietario-${p.id}`,
        tipo: "propietario_en_revision",
        prioridad: "atencion",
        titulo: `${toTitleCase(p.nombre ?? "Propietario")} listo para revisar`,
        detalle: "Documentación del Portal enviada para revisión",
        href: p.contact_id ? `/contactos?id=${p.contact_id}` : "/contactos",
      });
    }

    const urgente = notifs.filter((n) => n.prioridad === "urgente").length;
    const atencion = notifs.filter((n) => n.prioridad === "atencion").length;
    const info = notifs.filter((n) => n.prioridad === "info").length;

    return { notifs, urgente, atencion, info, total: notifs.length };
  },
);
