// Helpers y metadatos de formato puros de Contactos (M-03: extraídos de
// src/routes/contactos.index.tsx). Sin estado, sin JSX — solo referencias a
// componentes de icono como valores (Record<..., { icon: typeof X }>), no
// se renderiza nada aquí.

import { Home, ShoppingCart, KeyRound, HelpCircle } from "lucide-react";
import type { Segmento } from "@/lib/clientes.functions";
import type { GrupoDuplicado } from "@/lib/clientes-duplicados.functions";

// ── Descarte desde la Bandeja ───────────────────────────────────────────────────

// Códigos estables (no el texto de pantalla): son la etiqueta negativa que
// necesita un futuro modelo de conversión. Deben coincidir con
// contacts_motivo_descarte_check (migración 20260924080757).
export const MOTIVOS_DESCARTE = [
  { value: "no_responde", label: "No responde (3 intentos)" },
  { value: "no_interesado", label: "No le interesa ya" },
  { value: "ya_resuelto", label: "Ya compró o alquiló" },
  { value: "fuera_presupuesto", label: "Fuera de presupuesto" },
  { value: "fuera_zona", label: "Fuera de zona" },
  { value: "profesional", label: "Es agencia o profesional" },
  { value: "datos_erroneos", label: "Datos erróneos / spam" },
  { value: "duplicado", label: "Duplicado" },
] as const;
export type MotivoDescarte = (typeof MOTIVOS_DESCARTE)[number]["value"];

export function motivoDescarteLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return MOTIVOS_DESCARTE.find((m) => m.value === value)?.label ?? value;
}

// ── Fuente del lead ─────────────────────────────────────────────────────────────

// De dónde vino el lead (distinto del canal por el que se habla con él).
// Debe coincidir con contacts_fuente_check (migración 20260924084205).
export const FUENTES = [
  "Web",
  "Idealista",
  "Fotocasa",
  "Habitaclia",
  "Valorador",
  "Referido",
  "Oficina",
  "Otro",
] as const;
export type Fuente = (typeof FUENTES)[number];

// ── Pipeline de interesados ─────────────────────────────────────────────────────

export const PIPELINE_ETAPAS = ["Cualificado", "Contactado", "Visita", "Oferta", "Cierre"] as const;
export type PipelineEtapa = (typeof PIPELINE_ETAPAS)[number];

// ── Clientes / Histórico / Descartado tabs ─────────────────────────────────────

export const SEG_META: Record<
  Segmento,
  { label: string; singular: string; icon: typeof Home; chip: string }
> = {
  Propietario: {
    label: "Propietarios",
    singular: "Propietario",
    icon: Home,
    chip: "bg-success/15 text-success border-success/20",
  },
  Comprador: {
    label: "Interesados compra",
    singular: "Interesado compra",
    icon: ShoppingCart,
    chip: "bg-info/15 text-info border-info/20",
  },
  Inquilino: {
    label: "Interesados alquiler",
    singular: "Interesado alquiler",
    icon: KeyRound,
    chip: "bg-brand-green/15 text-brand-green border-brand-green/20",
  },
  Lead: {
    label: "Leads",
    singular: "Lead",
    icon: HelpCircle,
    chip: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/20",
  },
};

export function formatFechaCorta(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function initials(nombre: string): string {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

const AVATAR_COLORS = [
  "bg-avatar-1",
  "bg-avatar-2",
  "bg-avatar-3",
  "bg-avatar-4",
  "bg-avatar-5",
  "bg-avatar-6",
];

// Color determinista por nombre para avatares de iniciales (feedback de
// David, 23 sep 2026: todos los avatares eran el mismo gris `bg-muted`).
// Mismo nombre → siempre el mismo color, sin necesidad de ningún campo
// nuevo en base de datos.
export function avatarColorClass(nombre: string): string {
  let hash = 0;
  for (let i = 0; i < nombre.length; i++) {
    hash = (hash * 31 + nombre.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

// ── Duplicados tab (M-05) ───────────────────────────────────────────────────────

export function eligeSupervivientePorDefecto(grupo: GrupoDuplicado): string {
  const conActividad = grupo.contactos.find((c) => c.tieneActividad);
  if (conActividad) return conActividad.id;
  // Sin actividad en ninguno: el más reciente suele tener los datos más al día.
  return [...grupo.contactos].sort((a, b) =>
    (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
  )[0].id;
}

// ── Encaje de un interesado en alquiler ─────────────────────────────────────────

// Sustituye al filtrado que el comercial hacía leyendo el formulario de
// Airtable. Regla deliberadamente simple y visible: cumple si tiene contrato
// de trabajo o avalista. La mascota se muestra, pero no descarta: depende de
// cada propietario. Los valores vienen como texto libre ("Si", "Sí, es un
// pensionado", "no"...), por eso se mira solo cómo empiezan.
export type EncajeAlquiler = "cumple" | "no_cumple" | "faltan_datos";

// Sin \b: en JS no trata "í" como letra, y "Sí," no casaría.
const esSi = (v: string) => /^s[ií](?![\p{L}\d])/iu.test(v.trim());
const esNo = (v: string) => /^no(?![\p{L}\d])/iu.test(v.trim());

export function evaluarEncajeAlquiler(r: { contrato: string; avalista: string }): EncajeAlquiler {
  if (esSi(r.contrato) || esSi(r.avalista)) return "cumple";
  if (esNo(r.contrato) && esNo(r.avalista)) return "no_cumple";
  return "faltan_datos";
}

export function respuestaCorta(v: string): string {
  const t = v.trim();
  if (!t) return "—";
  if (esSi(t)) return t.length <= 3 ? "Sí" : t;
  if (esNo(t)) return "No";
  return t;
}
