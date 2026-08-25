// M-03: extraído de src/routes/comerciales.index.lazy.tsx.
// Nota: moneyShort ya está duplicada en otros 2 archivos de este proyecto con
// redondeos distintos — no se unifica aquí, solo se mueve tal cual estaba.

export function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fmtTime(s: string | null): string {
  if (!s) return "--:--";
  const d = new Date(s);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function fmtDateCompact(s: string | null): string {
  if (!s) return "";
  return new Date(s).toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function estadoColor(estado: string): string {
  if (estado === "Realizada") return "#10b981";
  if (estado === "Cancelada") return "#f43f5e";
  return "#6366f1";
}

export function moneyShort(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M €`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}k €`;
  return `${v} €`;
}
