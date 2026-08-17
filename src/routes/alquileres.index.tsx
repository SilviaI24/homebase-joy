import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/alquileres/")({
  loader: () => {
    throw redirect({ to: "/cartera/" as never, search: { tab: "alquiler" } as never });
  },
});
