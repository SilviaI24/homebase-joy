import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/context/auth";
import { supabase } from "@/lib/supabase-browser";
import { KeyRound, Check, User, CalendarDays, Link2, Unlink } from "lucide-react";
import { googleCalendarStatusQuery } from "@/lib/queries";
import { disconnectGoogleCalendar } from "@/lib/google-calendar.functions";

const GOOGLE_CALENDAR_STATUS_MENSAJE: Record<string, { tono: "success" | "error"; texto: string }> =
  {
    ok: { tono: "success", texto: "Google Calendar conectado correctamente." },
    error: { tono: "error", texto: "No se pudo conectar con Google Calendar. Inténtalo de nuevo." },
    cancelado: { tono: "error", texto: "Conexión con Google Calendar cancelada." },
    "sin-agente": {
      tono: "error",
      texto: "Tu usuario no tiene un agente asociado, así que no se puede conectar un calendario.",
    },
  };

export const Route = createFileRoute("/perfil/")({
  validateSearch: z.object({ google_calendar: z.string().optional() }),
  component: PerfilPage,
});

function PerfilPage() {
  const { user } = useAuth();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const disconnectFn = useServerFn(disconnectGoogleCalendar);
  const { data: googleStatus, isLoading: googleLoading } = useQuery(googleCalendarStatusQuery);

  useEffect(() => {
    if (!search.google_calendar) return;
    const m = GOOGLE_CALENDAR_STATUS_MENSAJE[search.google_calendar];
    if (m) (m.tono === "success" ? toast.success : toast.error)(m.texto);
    qc.invalidateQueries({ queryKey: ["google-calendar-status"] });
    navigate({ search: {}, replace: true });
    // Solo debe dispararse una vez, al aterrizar de vuelta de Google -- no en
    // cada cambio de las dependencias que usa (navigate/qc son estables).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.google_calendar]);

  const disconnectMut = useMutation({
    mutationFn: () => disconnectFn(),
    onSuccess: () => {
      toast.success("Google Calendar desconectado");
      qc.invalidateQueries({ queryKey: ["google-calendar-status"] });
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo desconectar"),
  });

  const [current, setCurrent] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const valid = current.length >= 6 && newPass.length >= 8 && newPass === confirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setErr(null);
    setSuccess(false);
    setSaving(true);

    // Re-authenticate with current password first
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: user?.email ?? "",
      password: current,
    });
    if (signInErr) {
      setErr("Contraseña actual incorrecta.");
      setSaving(false);
      return;
    }

    const { error: updateErr } = await supabase.auth.updateUser({
      password: newPass,
    });
    setSaving(false);
    if (updateErr) {
      setErr(updateErr.message);
    } else {
      setSuccess(true);
      setCurrent("");
      setNewPass("");
      setConfirm("");
    }
  };

  return (
    <AppShell title="Mi perfil">
      <div className="max-w-md mx-auto space-y-6">
        {/* User info card */}
        <div className="rounded-2xl border border-border bg-card p-5 flex items-center gap-4">
          <div className="size-12 rounded-2xl bg-muted flex items-center justify-center shrink-0">
            <User className="size-5 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold truncate">{user?.email}</p>
            <p className="text-xs text-muted-foreground">Administrador</p>
          </div>
        </div>

        {/* Google Calendar */}
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 text-muted-foreground" strokeWidth={1.5} />
            <h2 className="text-[13px] font-semibold">Google Calendar</h2>
          </div>
          {googleLoading ? (
            <p className="text-xs text-muted-foreground">Comprobando…</p>
          ) : googleStatus?.connected ? (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-success flex items-center gap-1">
                  <Check className="size-3.5" strokeWidth={2.5} /> Conectado
                </p>
                {googleStatus.email && (
                  <p className="text-xs text-muted-foreground truncate">{googleStatus.email}</p>
                )}
                <p className="text-[11px] text-muted-foreground mt-1">
                  Tus visitas se crean automáticamente en este calendario.
                </p>
              </div>
              <button
                type="button"
                onClick={() => disconnectMut.mutate()}
                disabled={disconnectMut.isPending}
                className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md border border-border text-muted-foreground hover:bg-accent transition-colors disabled:opacity-60 shrink-0"
              >
                <Unlink className="size-3.5" />
                Desconectar
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Conecta tu calendario para que tus visitas aparezcan ahí automáticamente.
              </p>
              <a
                href="/api/google-calendar/connect"
                className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity shrink-0"
              >
                <Link2 className="size-3.5" />
                Conectar
              </a>
            </div>
          )}
        </div>

        {/* Change password */}
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound className="size-4 text-muted-foreground" strokeWidth={1.5} />
            <h2 className="text-[13px] font-semibold">Cambiar contraseña</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Contraseña actual</label>
              <input
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                className="w-full h-9 px-3 text-[13px] rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                Nueva contraseña (mín. 8 caracteres)
              </label>
              <input
                type="password"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                autoComplete="new-password"
                className="w-full h-9 px-3 text-[13px] rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Confirmar nueva contraseña</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                className="w-full h-9 px-3 text-[13px] rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {newPass && confirm && newPass !== confirm && (
              <p className="text-xs text-destructive">Las contraseñas no coinciden.</p>
            )}
            {err && <p className="text-xs text-destructive">{err}</p>}
            {success && (
              <div className="flex items-center gap-1.5 text-xs text-success">
                <Check className="size-3.5" strokeWidth={2.5} />
                Contraseña actualizada correctamente.
              </div>
            )}

            <button
              type="submit"
              disabled={!valid || saving}
              className="w-full h-9 rounded-lg bg-primary text-primary-foreground text-[13px] font-semibold disabled:opacity-40 transition-opacity hover:opacity-90"
            >
              {saving ? "Guardando…" : "Actualizar contraseña"}
            </button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
