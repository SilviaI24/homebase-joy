type CicloVida = "Lead" | "Prospecto" | "Cliente" | "Histórico" | "Descartado";
type EstatusInmueble = "Activo" | "Reservado" | "Vendido" | "Alquilado" | "Baja" | "Prospección";
type CanalType = "WhatsApp" | "Email" | "Tel" | "Presencial" | string;

const CICLO_VIDA_CLS: Record<CicloVida, string> = {
  Lead: "bg-muted text-muted-foreground",
  Prospecto: "bg-info/10 text-info",
  Cliente: "bg-gold/15 text-[var(--gold)]",
  Histórico: "bg-success/10 text-success",
  Descartado: "bg-destructive/10 text-destructive",
};

const ESTATUS_CLS: Record<EstatusInmueble, string> = {
  Activo: "bg-success/10 text-success",
  Reservado: "bg-warning/10 text-warning",
  Vendido: "bg-info/10 text-info",
  Alquilado: "bg-brand-green/10 text-brand-green",
  Baja: "bg-destructive/10 text-destructive",
  Prospección: "bg-muted text-muted-foreground",
};

const CANAL_CLS: Record<string, string> = {
  WhatsApp: "bg-[#25D366]/10 text-[#128C7E]",
  Email: "bg-info/10 text-info",
  Tel: "bg-warning/10 text-warning",
  Presencial: "bg-success/10 text-success",
};

export function StatusBadge({
  cicloVida,
  className = "",
}: {
  cicloVida: CicloVida | string;
  className?: string;
}) {
  const cls =
    CICLO_VIDA_CLS[cicloVida as CicloVida] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium leading-none ${cls} ${className}`}
    >
      {cicloVida}
    </span>
  );
}

export function EstatusInmuebleBadge({
  estatus,
  className = "",
}: {
  estatus: EstatusInmueble | string;
  className?: string;
}) {
  const cls =
    ESTATUS_CLS[estatus as EstatusInmueble] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium leading-none ${cls} ${className}`}
    >
      {estatus}
    </span>
  );
}

export function CanalBadge({
  canal,
  className = "",
}: {
  canal: CanalType;
  className?: string;
}) {
  const cls = CANAL_CLS[canal] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium leading-none ${cls} ${className}`}
    >
      {canal}
    </span>
  );
}
