import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { RouteError } from "@/components/RouteError";
import {
  comerciablesInmueblesQuery,
  actividadInmueblesQuery,
  agentesQuery,
  visitasQuery,
} from "@/lib/queries";

export const Route = createFileRoute("/comerciales/")({
  head: () => ({
    meta: [
      { title: "Hub · El Sol Grupo CRM" },
      { name: "description", content: "Centro de operaciones del equipo comercial." },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(comerciablesInmueblesQuery),
      context.queryClient.ensureQueryData(actividadInmueblesQuery),
      context.queryClient.ensureQueryData(agentesQuery),
      context.queryClient.ensureQueryData(visitasQuery),
    ]),
  errorComponent: ({ error }) => (
    <AppShell title="Comerciales">
      <RouteError error={error} />
    </AppShell>
  ),
});
