// Helpers de formato y agrupación puros de Visitas (M-03: extraídos de
// src/routes/visitas.index.tsx). Sin estado, sin JSX.

import type { VisitaFull } from "@/lib/visitas.functions";

export function fmtDate(s: string | null, opts?: Intl.DateTimeFormatOptions): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString(
      "es-ES",
      opts ?? { day: "2-digit", month: "short", year: "numeric" },
    );
  } catch {
    return s;
  }
}

export function fmtTime(s: string | null): string {
  if (!s) return "";
  try {
    return new Date(s).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function getMonday(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return d.getTime();
}

export type DayGroup = {
  key: string;
  label: string;
  isToday: boolean;
  isFuture: boolean;
  items: VisitaFull[];
};

export function buildDayGroups(visitas: VisitaFull[], now: number): DayGroup[] {
  const todayStr = new Date(now).toISOString().slice(0, 10);
  const tomorrowStr = new Date(now + 86400000).toISOString().slice(0, 10);
  const in7 = new Date(now + 7 * 86400000).toISOString().slice(0, 10);

  const byDay = new Map<string, VisitaFull[]>();
  visitas.forEach((v) => {
    const k = (v.fecha ?? "sin-fecha").slice(0, 10);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(v);
  });

  const keys = Array.from(byDay.keys()).sort();
  return keys.map((k) => {
    const isFuture = k >= todayStr;
    let label: string;
    if (k === "sin-fecha") label = "Sin fecha";
    else if (k === todayStr) label = "Hoy";
    else if (k === tomorrowStr) label = "Mañana";
    else {
      const d = new Date(k + "T12:00:00");
      const dow = d.toLocaleDateString("es-ES", { weekday: "long" });
      const fecha = d.toLocaleDateString("es-ES", { day: "numeric", month: "long" });
      if (k <= in7 && isFuture) label = `${dow.charAt(0).toUpperCase() + dow.slice(1)}, ${fecha}`;
      else label = `${dow.charAt(0).toUpperCase() + dow.slice(1)} ${fecha}`;
    }
    return { key: k, label, isToday: k === todayStr, isFuture, items: byDay.get(k)! };
  });
}
