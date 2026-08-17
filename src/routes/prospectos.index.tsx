import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/prospectos/")({
  loader: () => {
    throw redirect({ to: "/cartera/" as never, search: { tab: "captacion" } as never });
  },
});
