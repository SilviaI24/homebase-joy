// Helpers puros compartidos entre los módulos `clientes*.functions.ts`
// (clientes.functions, clientes-conversaciones.functions). Sin JSX, sin
// estado — mismo patrón que dashboard-format.ts / visitas-format.ts /
// bandeja-format.ts / inmueble-detail-format.ts.

export function s(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.filter(Boolean).join(", ");
  return String(v);
}

export function escapeLikeCliente(str: string): string {
  return str.replace(/%/g, "\\%").replace(/_/g, "\\_");
}
