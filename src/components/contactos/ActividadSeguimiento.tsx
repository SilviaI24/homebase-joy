// Rediseño de navegación (17 sep 2026): sustituye a la antigua ruta
// /seguimiento como vista de historial — el registro de un contacto vive
// ahora junto a su ficha, no en una lista global aparte. Mismo dato
// (tabla seguimiento, createSeguimiento), nuevo sitio.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Phone, MessageSquare, Mail, Users, FileText, Bot, Send } from "lucide-react";
import { seguimientosByContactoQuery, myRoleQuery } from "@/lib/queries";
import { createSeguimiento, type SeguimientoTipo } from "@/lib/seguimiento.functions";

const TIPOS_REGISTRABLES: SeguimientoTipo[] = ["Llamada", "WhatsApp", "Email", "Visita", "Nota"];

const TIPO_ICONS: Record<SeguimientoTipo, typeof Phone> = {
  Llamada: Phone,
  WhatsApp: MessageSquare,
  Email: Mail,
  Visita: Users,
  Nota: FileText,
  SilvIA: Bot,
};

const TIPO_COLORS: Record<SeguimientoTipo, string> = {
  Llamada: "bg-info/10 text-info",
  WhatsApp: "bg-success/10 text-success",
  Email: "bg-info/10 text-info",
  Visita: "bg-warning/10 text-warning",
  Nota: "bg-zinc-500/10 text-zinc-500",
  SilvIA: "bg-primary/10 text-primary",
};

function fmtDate(s: string) {
  try {
    return new Date(s).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return s.slice(0, 10);
  }
}

export function ActividadSeguimiento({ contactId }: { contactId: string }) {
  const qc = useQueryClient();
  const { data: access } = useQuery(myRoleQuery);
  const allowed = new Set(access?.allowedCapabilities ?? []);
  const { data, isLoading } = useQuery(seguimientosByContactoQuery(contactId));

  const [tipo, setTipo] = useState<SeguimientoTipo>("Llamada");
  const [texto, setTexto] = useState("");

  const createFn = useServerFn(createSeguimiento);
  const mut = useMutation({
    mutationFn: () => createFn({ data: { contactId, tipo, texto: texto.trim() } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["seguimiento-contacto", contactId] });
      qc.invalidateQueries({ queryKey: ["seguimientos"] });
      toast.success("Seguimiento registrado");
      setTexto("");
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo registrar"),
  });

  if (!allowed.has("seguimiento.read")) return null;

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        Actividad
      </div>

      {allowed.has("seguimiento.create") && (
        <div className="rounded-lg border border-border bg-card p-3 mb-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {TIPOS_REGISTRABLES.map((t) => {
              const Icon = TIPO_ICONS[t];
              const active = tipo === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipo(t)}
                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md border transition-all ${
                    active
                      ? TIPO_COLORS[t] + " border-transparent"
                      : "bg-background border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="size-3" />
                  {t}
                </button>
              );
            })}
          </div>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Notas de la acción…"
            rows={2}
            className="w-full text-sm rounded-md border border-input bg-background px-2.5 py-2 resize-none outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            type="button"
            onClick={() => mut.mutate()}
            disabled={!texto.trim() || mut.isPending}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-40 transition-opacity"
          >
            <Send className="size-3.5" />
            {mut.isPending ? "Registrando…" : "Registrar"}
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="text-xs text-muted-foreground py-4 text-center">Cargando…</div>
      ) : !data || data.seguimientos.length === 0 ? (
        <div className="text-xs text-muted-foreground py-4 text-center">
          Sin seguimientos registrados.
        </div>
      ) : (
        <div className="space-y-0 divide-y divide-border rounded-lg border border-border overflow-hidden">
          {data.seguimientos.map((s) => {
            const Icon = TIPO_ICONS[s.tipo] ?? FileText;
            const color = TIPO_COLORS[s.tipo] ?? "bg-zinc-500/10 text-zinc-500";
            return (
              <div key={s.id} className="flex items-start gap-2.5 px-3 py-2.5 bg-card">
                <div
                  className={`size-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${color}`}
                >
                  <Icon className="size-3" strokeWidth={1.5} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-semibold">{s.tipo}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {fmtDate(s.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{s.texto}</p>
                  {s.agenteNombre && (
                    <p className="text-xs text-muted-foreground/70 mt-0.5">{s.agenteNombre}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
