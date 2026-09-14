// M-03: extraído de src/routes/operaciones.index.tsx.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Building2, User, Users, Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  getOperationCloseBlockers,
  type OperacionEstado,
  type OperacionRow as OperacionRowType,
} from "@/lib/operaciones.functions";
import { ESTADO_STYLE, ESTADOS, fmtEur, fmtDate } from "@/lib/operaciones-format";

export function ContactPicker({
  label,
  value,
  query,
  results,
  onQuery,
  onSelect,
  onClear,
}: {
  label: string;
  value: { id: string; nombre: string } | null;
  query: string;
  results: { id: string; nombre: string }[];
  onQuery: (q: string) => void;
  onSelect: (c: { id: string; nombre: string }) => void;
  onClear: () => void;
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground uppercase tracking-wide font-medium block mb-1.5">
        {label}
      </label>
      {value ? (
        <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
          <span className="text-sm font-medium">{value.nombre}</span>
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            cambiar
          </button>
        </div>
      ) : (
        <div className="relative">
          <Input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Buscar contacto…"
            className="text-sm"
          />
          {query.length >= 2 && results.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-md overflow-hidden z-20 shadow-xl">
              {results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelect(c)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors border-b border-border last:border-0"
                >
                  {c.nombre}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function OperacionRow({
  op,
  onEstadoChange,
  onClose,
  isPending,
  canClose,
}: {
  op: OperacionRowType;
  onEstadoChange: (e: OperacionEstado) => void;
  onClose: () => void;
  isPending: boolean;
  canClose: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const closeBlockers = getOperationCloseBlockers(op);

  return (
    <div className="px-4 py-3.5 hover:bg-accent/20 transition-colors">
      <div className="flex items-start gap-3">
        {/* Estado + tipo */}
        <div className="flex flex-col items-start gap-1.5 shrink-0 min-w-[100px]">
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${ESTADO_STYLE[op.estado]}`}
          >
            {op.estado}
          </span>
          <span className="text-xs text-muted-foreground">{op.tipo}</span>
        </div>

        {/* Detalles */}
        <div className="flex-1 min-w-0">
          {/* Inmueble */}
          {op.propertyCalle && (
            <div className="flex items-center gap-1.5 text-xs font-medium mb-1">
              <Building2 className="size-3 text-muted-foreground shrink-0" />
              {op.propertyId ? (
                <Link
                  to="/inmuebles/$id"
                  params={{ id: op.propertyId }}
                  className="hover:text-primary transition-colors truncate"
                >
                  {op.propertyCalle}
                  {op.propertyBarrio ? ` · ${op.propertyBarrio}` : ""}
                  {op.propertyRef ? (
                    <span className="text-muted-foreground ml-1">({op.propertyRef})</span>
                  ) : null}
                </Link>
              ) : (
                <span className="truncate">{op.propertyCalle}</span>
              )}
            </div>
          )}

          {/* Partes */}
          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
            {op.vendedorNombre && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <User className="size-3 shrink-0" /> {op.vendedorNombre}
              </span>
            )}
            {op.compradorNombre && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Users className="size-3 shrink-0" /> {op.compradorNombre}
              </span>
            )}
            {op.agenteNombre && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <User className="size-3 shrink-0 text-primary/60" />
                <span className="text-primary/70">{op.agenteNombre}</span>
              </span>
            )}
          </div>

          {op.notas && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-1 italic">{op.notas}</p>
          )}
        </div>

        {/* Financiero */}
        <div className="text-right shrink-0 flex flex-col gap-0.5">
          {op.precioOperacion !== null && (
            <span className="text-sm font-semibold tabular-nums">{fmtEur(op.precioOperacion)}</span>
          )}
          {op.comisionTotal !== null && (
            <span className="text-xs text-success font-medium tabular-nums">
              {fmtEur(op.comisionTotal)} ({op.comisionPct}%)
            </span>
          )}
          {op.fechaApertura && (
            <span className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
              <Calendar className="size-2.5" />
              {fmtDate(op.fechaApertura)}
            </span>
          )}
        </div>
      </div>

      {/* Estado inline change */}
      {op.estado !== "Cerrada" && (
        <div className="mt-2.5 pt-2 border-t border-border/50 relative">
          <button
            onClick={() => setOpen((v) => !v)}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Cambiar estado <ChevronDown className="size-3" />
          </button>
          {open && (
            <div className="absolute bottom-full left-0 mb-1 bg-card border border-border rounded-md overflow-hidden z-10 shadow-lg flex">
              {ESTADOS.filter((e) => e !== op.estado && (canClose || e !== "Cerrada")).map((e) => (
                <button
                  key={e}
                  onClick={() => {
                    if (e === "Cerrada") setConfirmClose(true);
                    else onEstadoChange(e);
                    setOpen(false);
                  }}
                  className={`px-3 py-2 text-[11px] font-medium hover:bg-accent transition-colors border-r border-border last:border-0 ${ESTADO_STYLE[e]}`}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
          {confirmClose && (
            <div className="mt-3 rounded-md border border-warning/20 bg-warning/10 p-3">
              <p className="text-xs font-semibold text-foreground">
                {closeBlockers.length > 0
                  ? "La operación todavía no puede cerrarse"
                  : "Confirmar cierre definitivo"}
              </p>
              {closeBlockers.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs text-warning">
                  {closeBlockers.map((blocker) => (
                    <li key={blocker} className="flex gap-1.5">
                      <span aria-hidden="true">•</span>
                      <span>{blocker}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Se actualizarán conjuntamente la operación, el inmueble, las partes, el pipeline y
                  el seguimiento. Una operación cerrada no podrá reabrirse desde el CRM.
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmClose(false)}
                  disabled={isPending}
                  className="h-8 rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent disabled:opacity-40"
                >
                  {closeBlockers.length > 0 ? "Revisar operación" : "Volver"}
                </button>
                {closeBlockers.length === 0 && (
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isPending}
                    className="h-8 rounded-md bg-success px-3 text-xs font-semibold text-white hover:bg-success disabled:opacity-40"
                  >
                    {isPending ? "Cerrando…" : "Cerrar operación"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
