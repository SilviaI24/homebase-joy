import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { allInmueblesQuery, agentesQuery, visitasQuery } from "@/lib/queries";

export const Route = createFileRoute("/comerciales/")({
  head: () => ({
    meta: [
      { title: "Hub · El Sol Grupo CRM" },
      { name: "description", content: "Centro de operaciones del equipo comercial." },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(allInmueblesQuery),
      context.queryClient.ensureQueryData(agentesQuery),
      context.queryClient.ensureQueryData(visitasQuery),
    ]),
  errorComponent: ({ error }) => (
    <AppShell title="Comerciales">
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Error cargando datos: {error.message}
      </div>
    </AppShell>
  ),
});
