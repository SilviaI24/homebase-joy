// Helpers puros compartidos entre los módulos `mutations-*.functions.ts`
// (M-03: extraídos de mutations.functions.ts). Sin estado, sin JSX.

export function strOpt(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length ? t : undefined;
}

export function numOpt(v: unknown): number | undefined {
  if (v === "" || v == null) return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function arrOpt(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const f = v.map(String).filter(Boolean);
  return f.length ? f : undefined;
}

// Map tipo/segmento values to Supabase ciclo_vida
export function tipoCicloVida(tipo: string): string {
  const t = tipo.toLowerCase();
  if (t.includes("anular")) return "Descartado";
  if (t.includes("prospecc")) return "Prospecto";
  if (
    ["propietario", "comprador", "inquilino", "interesado alquiler", "interesado propiedades"].some(
      (v) => t === v,
    )
  )
    return "Cliente";
  return "Lead";
}
