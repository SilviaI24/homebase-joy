import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/mis-leads/")({
  loader: () => {
    throw redirect({ to: "/contactos/" as never, search: { tab: "leads" } as never });
  },
});
