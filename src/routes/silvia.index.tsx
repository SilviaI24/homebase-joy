import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/silvia/")({
  loader: () => {
    throw redirect({ to: "/bandeja/" as never });
  },
});
