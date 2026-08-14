import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/estadisticas/")({
  loader: () => { throw redirect({ to: "/" }); },
  component: () => null,
});
