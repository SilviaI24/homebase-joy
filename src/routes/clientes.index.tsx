import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/clientes/")({
  loader: () => {
    throw redirect({ to: "/contactos/" as never, search: { tab: "clientes" } as never });
  },
});
