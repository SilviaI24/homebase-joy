import { createServerFn } from "@tanstack/react-start";
import { getSupa } from "./supabase.server";
import { toTitleCase } from "./format";
import { cleanRef } from "./format";
import { requireAuth } from "@/lib/auth.server";

export type Notif = {
  id: string;
  tipo: "visita_hoy" | "propiedad_estancada" | "reserva_larga" | "lead_nuevo";
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

export const getNotifications = createServerFn({ method: "GET" }).handler(async (): Promise<NotificationsResult> => {
  await requireAuth();
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

  const [visitasRes, estancadasRes, reservasRes, leadsRes] = await Promise.all([
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
  ]);

  const notifs: Notif[] = [];

  // ── Visitas hoy (urgente) ─────────────────────────────────────────────────
  for (const v of visitasRes.data ?? []) {
    const prop = (v as any).properties;
    const contact = (v as any).contacts;
    const calle = prop ? toTitleCase(prop.calle ?? "") : "Inmueble";
    const cliente = contact ? toTitleCase(contact.nombre ?? "") : "Cliente";
    const estado = (v as any).estado === "Confirmada" ? "Confirmada" : "Pendiente";
    notifs.push({
      id: `visita-${(v as any).id}`,
      tipo: "visita_hoy",
      prioridad: "urgente",
      titulo: `Visita hoy — ${calle}`,
      detalle: `${cliente} · ${estado}`,
      href: "/visitas",
    });
  }

  // ── Propiedades estancadas (atención) ────────────────────────────────────
  for (const p of estancadasRes.data ?? []) {
    const ref = cleanRef((p as any).ref ?? "");
    const calle = toTitleCase((p as any).calle ?? "");
    const inicio = (p as any).fecha_inicio ?? (p as any).created_at?.slice(0, 10);
    const dias = inicio
      ? Math.floor((Date.now() - new Date(inicio).getTime()) / 86_400_000)
      : 0;
    notifs.push({
      id: `estancada-${(p as any).id}`,
      tipo: "propiedad_estancada",
      prioridad: "atencion",
      titulo: `${ref} — ${calle}`,
      detalle: `${dias} días sin movimiento`,
      href: "/inmuebles",
    });
  }

  // ── Reservas largas (atención) ───────────────────────────────────────────
  for (const p of reservasRes.data ?? []) {
    const ref = cleanRef((p as any).ref ?? "");
    const calle = toTitleCase((p as any).calle ?? "");
    const desde = (p as any).fecha_reserva;
    const dias = desde
      ? Math.floor((Date.now() - new Date(desde).getTime()) / 86_400_000)
      : 0;
    notifs.push({
      id: `reserva-${(p as any).id}`,
      tipo: "reserva_larga",
      prioridad: "atencion",
      titulo: `${ref} — Reservado ${dias}d`,
      detalle: `${calle} · Pendiente escritura`,
      href: "/inmuebles",
    });
  }

  // ── Nuevos leads/prospectos (info) ────────────────────────────────────────
  for (const c of leadsRes.data ?? []) {
    const nombre = toTitleCase((c as any).nombre ?? "Contacto");
    const canal = (c as any).canal_origen ?? "Desconocido";
    notifs.push({
      id: `lead-${(c as any).id}`,
      tipo: "lead_nuevo",
      prioridad: "info",
      titulo: nombre,
      detalle: `Nuevo lead · ${canal}`,
      href: "/mis-leads",
    });
  }

  const urgente = notifs.filter((n) => n.prioridad === "urgente").length;
  const atencion = notifs.filter((n) => n.prioridad === "atencion").length;
  const info = notifs.filter((n) => n.prioridad === "info").length;

  return { notifs, urgente, atencion, info, total: notifs.length };
});
