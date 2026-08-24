import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RouteError } from "@/components/RouteError";
import type { RolBase } from "@/lib/crm-auth.server";
import { listPermissionAdmin, updateCrmUser } from "@/lib/permissions.functions";

const permissionAdminQuery = queryOptions({
  queryKey: ["permission-admin"],
  queryFn: () => listPermissionAdmin(),
  staleTime: 60_000,
});

export const Route = createFileRoute("/permisos/")({
  head: () => ({
    meta: [
      { title: "Permisos · El Sol Grupo CRM" },
      { name: "description", content: "Rol de acceso de cada persona del equipo." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(permissionAdminQuery),
  component: PermissionAdminPage,
  errorComponent: ({ error }) => (
    <AppShell title="Permisos">
      <RouteError error={error} />
    </AppShell>
  ),
});

// Solo dos roles asignables hoy en homebase-joy: ADMIN y OPERATIVO. FINANCIERO
// queda en el catálogo por si algún día este CRM necesita darle acceso, pero
// su acceso real vive fuera de este repositorio (command center, sin diseñar
// todavía) — no se asigna desde aquí.
const ROLE_LABEL: Record<RolBase, string> = {
  ADMIN: "Administrador",
  FINANCIERO: "Financiero (fuera de este CRM)",
  OPERATIVO: "Equipo de oficina",
};

const ASSIGNABLE_ROLES: RolBase[] = ["ADMIN", "OPERATIVO"];

function PermissionAdminPage() {
  const { data } = useSuspenseQuery(permissionAdminQuery);
  const qc = useQueryClient();
  const updateUserFn = useServerFn(updateCrmUser);
  const [selectedId, setSelectedId] = useState(data.users[0]?.userId ?? "");

  const selected = data.users.find((user) => user.userId === selectedId) ?? data.users[0] ?? null;
  const groupedCatalog = useMemo(() => {
    const groups = new Map<string, typeof data.catalog>();
    for (const permission of data.catalog) {
      const current = groups.get(permission.dominio) ?? [];
      current.push(permission);
      groups.set(permission.dominio, current);
    }
    return [...groups.entries()];
    // El genérico `typeof data.catalog` del Map es un tipo, no una referencia
    // en tiempo de ejecución, pero el linter no lo distingue y pide `data`
    // completo en vez de `data.catalog`.
  }, [data]);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["permission-admin"] });
    await qc.invalidateQueries({ queryKey: ["my-role"] });
  };

  const userMutation = useMutation({
    mutationFn: (value: { rolBase: RolBase; activo: boolean }) =>
      updateUserFn({
        data: { userId: selected!.userId, rolBase: value.rolBase, activo: value.activo },
      }),
    onSuccess: async () => {
      await refresh();
      toast.success("Usuario actualizado");
    },
    onError: (error: Error) => {
      console.error("No se pudo actualizar el usuario CRM", error);
      toast.error("No se pudo actualizar el usuario. Comprueba que quede un administrador activo.");
    },
  });

  if (!selected) {
    return (
      <AppShell title="Permisos">
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Todavía no hay usuarios vinculados al CRM.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Permisos"
      subtitle="Rol de acceso de cada persona. Todo el equipo de oficina ve y hace lo mismo — sin restricciones por departamento."
    >
      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-xl border border-border bg-card p-2 self-start">
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Equipo · {data.users.length}
          </div>
          <div className="space-y-1">
            {data.users.map((user) => (
              <button
                key={user.userId}
                type="button"
                onClick={() => setSelectedId(user.userId)}
                className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
                  selected.userId === user.userId
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`size-2 rounded-full ${user.activo ? "bg-success" : "bg-zinc-400"}`}
                  />
                  <span className="truncate text-xs font-semibold">{user.nombre}</span>
                </div>
                <div className="mt-1 truncate pl-4 text-[10px] opacity-70">{user.email}</div>
                <div className="mt-1 pl-4 text-[9px] uppercase tracking-wide opacity-55">
                  {ROLE_LABEL[user.rolBase]}
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="min-w-0 space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold">
                  <UserRound className="size-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold">{selected.nombre}</h2>
                  <p className="truncate text-[11px] text-muted-foreground">{selected.email}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <label className="space-y-1">
                  <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                    Rol
                  </span>
                  <select
                    value={selected.rolBase}
                    disabled={
                      userMutation.isPending || !ASSIGNABLE_ROLES.includes(selected.rolBase)
                    }
                    onChange={(event) =>
                      userMutation.mutate({
                        rolBase: event.target.value as RolBase,
                        activo: selected.activo,
                      })
                    }
                    className="h-9 rounded-lg border border-input bg-background px-3 text-xs"
                  >
                    {ASSIGNABLE_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABEL[role]}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={userMutation.isPending}
                  onClick={() =>
                    userMutation.mutate({ rolBase: selected.rolBase, activo: !selected.activo })
                  }
                  className={`h-9 rounded-lg border px-3 text-xs font-medium transition-colors ${
                    selected.activo
                      ? "border-success/20 bg-success/10 text-success"
                      : "border-border bg-muted text-muted-foreground"
                  }`}
                >
                  {selected.activo ? "Acceso activo" : "Acceso desactivado"}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 text-[11px] text-muted-foreground">
            Lo que puede hacer{" "}
            <strong className="text-foreground">{ROLE_LABEL[selected.rolBase]}</strong> — depende
            solo del rol, no hay excepciones por persona.
          </div>

          {groupedCatalog.map(([domain, permissions]) => (
            <div key={domain} className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
                <ShieldCheck className="size-3.5 text-gold" />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em]">{domain}</h3>
              </div>
              <div className="divide-y divide-border">
                {permissions.map((permission) => {
                  const effective = data.presets[selected.rolBase][permission.clave] === true;
                  return (
                    <div
                      key={permission.clave}
                      className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-medium">{permission.descripcion}</span>
                          {permission.sensible && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[9px] font-semibold text-warning">
                              <LockKeyhole className="size-2.5" /> Sensible
                            </span>
                          )}
                        </div>
                        <div className="mt-1 font-mono text-[9px] text-muted-foreground">
                          {permission.clave}
                        </div>
                      </div>
                      <span
                        className={`w-fit rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                          effective ? "bg-success/10 text-success" : "bg-red-500/10 text-red-600"
                        }`}
                      >
                        {effective ? "Activo" : "Bloqueado"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      </div>
    </AppShell>
  );
}
