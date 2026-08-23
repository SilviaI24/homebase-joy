import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/context/auth";
import { supabase } from "@/lib/supabase-browser";
import { KeyRound, Check, User } from "lucide-react";

export const Route = createFileRoute("/perfil/")({
  component: PerfilPage,
});

function PerfilPage() {
  const { user } = useAuth();
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
            <p className="text-[11px] text-muted-foreground">Administrador</p>
          </div>
        </div>

        {/* Change password */}
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound className="size-4 text-muted-foreground" strokeWidth={1.5} />
            <h2 className="text-[13px] font-semibold">Cambiar contraseña</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Contraseña actual</label>
              <input
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                className="w-full h-9 px-3 text-[13px] rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">
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
              <label className="text-[11px] text-muted-foreground">
                Confirmar nueva contraseña
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                className="w-full h-9 px-3 text-[13px] rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {newPass && confirm && newPass !== confirm && (
              <p className="text-[11px] text-destructive">Las contraseñas no coinciden.</p>
            )}
            {err && <p className="text-[11px] text-destructive">{err}</p>}
            {success && (
              <div className="flex items-center gap-1.5 text-[11px] text-success">
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
