import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/inmuebles/")({
  loader: () => {
    throw redirect({ to: "/cartera/" as never, search: { tab: "venta" } as never });
  },
});
