// Helpers y metadatos de formato puros de Contactos (M-03: extraídos de
// src/routes/contactos.index.tsx). Sin estado, sin JSX — solo referencias a
// componentes de icono como valores (Record<..., { icon: typeof X }>), no
// se renderiza nada aquí.

import {
  Clock,
  CheckCircle2,
  XCircle,
  Home,
  ShoppingCart,
  KeyRound,
  HelpCircle,
  Ban,
  Search as SearchIcon,
} from "lucide-react";
import type { Cliente, Segmento } from "@/lib/clientes.functions";
import type { EstadoSeguimiento } from "@/lib/mutations.functions";
import type { GrupoDuplicado } from "@/lib/clientes-duplicados.functions";

// ── Leads tab ─────────────────────────────────────────────────────────────────

export const ESTADO_META: Record<
  EstadoSeguimiento,
  { cls: string; icon: typeof Clock; label: string }
> = {
  Pendiente: {
    cls: "bg-warning/10 text-warning border-warning/30",
    icon: Clock,
    label: "Pendiente",
  },
  Contactado: {
    cls: "bg-success/10 text-success border-success/30",
    icon: CheckCircle2,
    label: "Contactado",
  },
  Descartado: {
    cls: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30",
    icon: XCircle,
    label: "Descartado",
  },
};

export const ORIGEN_META: Record<
  string,
  { cls: string; icon: typeof Clock; label: string; descripcion: string }
> = {
  Propietario: {
    cls: "bg-info/10 text-info border-info/30",
    icon: Home,
    label: "Propietario",
    descripcion: "Dueño de un inmueble que quiere vender o alquilar con nosotros",
  },
  Comprador: {
    cls: "bg-accent/20 text-accent-foreground border-accent/40",
    icon: ShoppingCart,
    label: "Comprador",
    descripcion: "Ha cerrado una compra con nosotros",
  },
  "Busca compra": {
    cls: "bg-warning/10 text-warning border-warning/30",
    icon: ShoppingCart,
    label: "Busca compra",
    descripcion: "Lead interesado en comprar — operación aún no cerrada",
  },
  Inquilino: {
    cls: "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/30",
    icon: KeyRound,
    label: "Inquilino",
    descripcion: "Arrendatario con contrato firmado",
  },
  "Busca alquiler": {
    cls: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/30",
    icon: KeyRound,
    label: "Busca alquiler",
    descripcion: "Lead interesado en alquilar — sin contrato firmado",
  },
  Prospecto: {
    cls: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30",
    icon: SearchIcon,
    label: "Prospección",
    descripcion: "Captación: posible propietario a contactar para incorporar a cartera",
  },
  Lead: {
    cls: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30",
    icon: HelpCircle,
    label: "Lead sin clasificar",
    descripcion: "Contacto entrante sin tipo definido todavía",
  },
  Descartado: {
    cls: "bg-destructive/10 text-destructive border-destructive/30",
    icon: Ban,
    label: "Descartado",
    descripcion: "Contacto descartado o anulado",
  },
};

export function inferEstado(c: Cliente): EstadoSeguimiento {
  const t = c.trabajado.toLowerCase();
  if (t.includes("descart")) return "Descartado";
  if (t.includes("contact")) return "Contactado";
  if (c.observaciones && c.observaciones.trim().length > 0) return "Contactado";
  return "Pendiente";
}

export function extraerUltimaNota(obs: string): { fecha: string; texto: string } | null {
  if (!obs || !obs.trim()) return null;
  const lines = obs.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].trim().match(/^\[([^\]]+)\]\s*(.+)$/);
    if (m) return { fecha: m[1], texto: m[2] };
  }
  return null;
}

export function diasDesde(iso: string | null): number | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  return Math.floor(diff / 86400000);
}

export const PIPELINE_STAGES: Array<{
  id: EstadoSeguimiento;
  label: string;
  dot: string;
  headerCls: string;
}> = [
  { id: "Pendiente", label: "Nuevos", dot: "bg-warning", headerCls: "border-warning/40" },
  {
    id: "Contactado",
    label: "En seguimiento",
    dot: "bg-info",
    headerCls: "border-info/40",
  },
  { id: "Descartado", label: "Archivados", dot: "bg-slate-400", headerCls: "border-slate-400/40" },
];

export function filterLeadsFn(
  leads: Array<{ cliente: Cliente; estado: EstadoSeguimiento }>,
  q: string,
  origenFilter: string,
) {
  const ql = q.trim().toLowerCase();
  return leads.filter(({ cliente: c }) => {
    if (origenFilter !== "Todos") {
      const seg = ORIGEN_META[c.segmento] ? c.segmento : "Lead";
      if (seg !== origenFilter) return false;
    }
    if (!ql) return true;
    return (
      c.nombre.toLowerCase().includes(ql) ||
      c.telefono.toLowerCase().includes(ql) ||
      c.email.toLowerCase().includes(ql) ||
      c.motivo.toLowerCase().includes(ql)
    );
  });
}

// ── Clientes / Histórico / Descartado tabs ─────────────────────────────────────

export const SEG_META: Record<Segmento, { label: string; icon: typeof Home; chip: string }> = {
  Propietario: {
    label: "Propietarios",
    icon: Home,
    chip: "bg-success/15 text-success border-success/20",
  },
  Comprador: {
    label: "Compradores",
    icon: ShoppingCart,
    chip: "bg-info/15 text-info border-info/20",
  },
  Inquilino: {
    label: "Inquilinos",
    icon: KeyRound,
    chip: "bg-brand-green/15 text-brand-green border-brand-green/20",
  },
  Lead: {
    label: "Leads",
    icon: HelpCircle,
    chip: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/20",
  },
};

export const CLIENTE_SEGS = ["Todos", "Propietario", "Comprador", "Inquilino"] as const;

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

// ── Duplicados tab (M-05) ───────────────────────────────────────────────────────

export function eligeSupervivientePorDefecto(grupo: GrupoDuplicado): string {
  const conActividad = grupo.contactos.find((c) => c.tieneActividad);
  if (conActividad) return conActividad.id;
  // Sin actividad en ninguno: el más reciente suele tener los datos más al día.
  return [...grupo.contactos].sort((a, b) =>
    (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
  )[0].id;
}
